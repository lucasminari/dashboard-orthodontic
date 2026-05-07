import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { KommoClient, LeadMapeado } from '../kommo/kommo.client';

/**
 * Polling de leads do Kommo. Roda a cada 5 minutos com janela de 10 minutos
 * de sobreposicao (idempotencia garantida pelas chaves unicas do banco).
 *
 * Tarefas:
 *  1. Busca leads do pipeline 13518920 atualizados nos ultimos ~10min
 *  2. Detecta mudancas de etapa comparando com kommo_leads.etapa_atual atual
 *  3. Insere em tracking_stage_transitions (com ON CONFLICT DO NOTHING)
 *  4. UPSERT em kommo_leads (sem mexer em paciente_id / telefone_norm)
 *  5. Loga execucao em tracking_sync_runs pra diagnostico
 */
@Injectable()
export class LeadsPollingService {
  private readonly log = new Logger(LeadsPollingService.name);
  private rodando = false;

  constructor(
    private prisma: PrismaService,
    private kommo: KommoClient,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'polling_leads' })
  async cron() {
    if (this.rodando) {
      this.log.warn('Polling anterior ainda em curso, pulando.');
      return;
    }
    this.rodando = true;
    try {
      await this.executar({ janelaSegundos: 600 });
    } catch (e) {
      this.log.error('Falha no polling', e as Error);
    } finally {
      this.rodando = false;
    }
  }

  /**
   * Executa um sync. Exposto pra trigger manual (testes / endpoint admin).
   */
  async executar(opts: { janelaSegundos?: number; maxPaginas?: number } = {}) {
    const run = await this.prisma.trackingSyncRun.create({
      data: {
        tipo: 'polling_leads',
        iniciadoEm: new Date(),
      },
    });

    const erros: string[] = [];
    let leadsProcessados = 0;
    let novos = 0;
    let atualizados = 0;
    let transicoes = 0;

    try {
      const janela = opts.janelaSegundos ?? 600;
      const desde = janela > 0 ? Math.floor(Date.now() / 1000) - janela : undefined;

      const brutos = await this.kommo.buscarLeads({
        desdeUnixSeconds: desde,
        maxPaginas: opts.maxPaginas ?? 50,
      });
      const leads = brutos.map(b => this.kommo.mapearLead(b));
      leadsProcessados = leads.length;

      if (leads.length === 0) {
        this.log.log(`Polling: nenhum lead atualizado nos ultimos ${janela}s`);
      } else {
        const ids = leads.map(l => l.kommoId);

        const existentes = await this.prisma.$queryRaw<{ id: bigint; etapa_atual: string }[]>`
          SELECT id, etapa_atual FROM kommo_leads WHERE id = ANY(${ids}::bigint[])
        `;
        const statusAnterior = new Map<number, string>();
        for (const e of existentes) statusAnterior.set(Number(e.id), e.etapa_atual);

        for (const l of leads) {
          try {
            const anterior = statusAnterior.get(l.kommoId);
            const atualStr = String(l.statusId);

            if (anterior && anterior !== atualStr) {
              const inserido = await this.prisma.trackingStageTransition.createMany({
                data: {
                  kommoLeadId: BigInt(l.kommoId),
                  unidadeId: l.unidadeId,
                  deStatus: anterior,
                  paraStatus: atualStr,
                  ocorreuEm: l.atualizadoEm,
                  fonte: 'polling',
                },
                skipDuplicates: true,
              });
              transicoes += inserido.count;
            }

            const r = await this.upsertKommoLead(l);
            if (r === 'novo') novos++;
            else atualizados++;
          } catch (e) {
            erros.push(`lead ${l.kommoId}: ${(e as Error).message}`);
          }
        }
      }

      await this.prisma.trackingSyncRun.update({
        where: { id: run.id },
        data: {
          terminadoEm: new Date(),
          leadsProcessados,
          novos,
          atualizados,
          erros: erros.length ? (erros as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          status: erros.length === 0 ? 'ok' : 'parcial',
        },
      });

      this.log.log(
        `Polling ok: ${leadsProcessados} leads (${novos} novos, ${atualizados} atualizados, ${transicoes} transicoes, ${erros.length} erros)`,
      );
    } catch (e) {
      const msg = (e as Error).message;
      await this.prisma.trackingSyncRun.update({
        where: { id: run.id },
        data: {
          terminadoEm: new Date(),
          leadsProcessados,
          erros: [msg] as unknown as Prisma.InputJsonValue,
          status: 'falhou',
        },
      });
      throw e;
    }

    return { runId: run.id, leadsProcessados, novos, atualizados, transicoes, erros };
  }

  /**
   * UPSERT em kommo_leads (tabela legada do dashboard).
   * NUNCA sobrescreve paciente_id, telefone_norm, perdido_motivo (dominio do dashboard).
   */
  private async upsertKommoLead(l: LeadMapeado): Promise<'novo' | 'atualizado'> {
    const status = l.agendado ? 'agendado' : l.perdido ? 'perdido' : 'em_atendimento';
    const tagsArr = l.tags;
    const r = await this.prisma.$queryRaw<{ inserted: boolean }[]>`
      INSERT INTO kommo_leads (
        id, unidade_id, nome, origem, etapa_atual, status,
        data_avaliacao, tags, criado_em, atualizado_em, sincronizado_em
      ) VALUES (
        ${l.kommoId}::bigint, ${l.unidadeId}, ${l.nome}, ${l.origem},
        ${String(l.statusId)}, ${status},
        ${l.dataAvaliacao}, ${tagsArr}::text[],
        ${l.criadoEm}, ${l.atualizadoEm}, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        unidade_id      = COALESCE(EXCLUDED.unidade_id, kommo_leads.unidade_id),
        nome            = EXCLUDED.nome,
        origem          = COALESCE(EXCLUDED.origem, kommo_leads.origem),
        etapa_atual     = EXCLUDED.etapa_atual,
        status          = EXCLUDED.status,
        data_avaliacao  = EXCLUDED.data_avaliacao,
        tags            = EXCLUDED.tags,
        atualizado_em   = EXCLUDED.atualizado_em,
        sincronizado_em = NOW()
      RETURNING (xmax = 0) AS inserted
    `;
    return r[0]?.inserted ? 'novo' : 'atualizado';
  }
}
