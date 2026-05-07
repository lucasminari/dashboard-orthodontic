import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CriarAttentionItemInput, ListarFilaQuery } from './dto/atencao.dto';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@Injectable()
export class AttentionService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /**
   * Cria ou atualiza item de atencao para um lead. Idempotente:
   * se ja existe item com kommoLeadId e status != resolvido, atualiza
   * o motivo/prioridade caso o novo seja mais urgente; senao mantem.
   */
  async criarOuAtualizar(input: CriarAttentionItemInput) {
    const existente = await this.prisma.trackingAttentionItem.findUnique({
      where: { kommoLeadId: BigInt(input.kommoLeadId) },
    });

    if (existente && existente.status !== 'resolvido' && existente.status !== 'descartado') {
      // Se novo motivo eh mais urgente (prioridade menor), promove
      if (input.prioridade < existente.prioridade) {
        const atualizado = await this.prisma.trackingAttentionItem.update({
          where: { id: existente.id },
          data: {
            motivo: input.motivo,
            prioridade: input.prioridade,
            motivoDetalhe: (input.motivoDetalhe ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          },
        });
        await this.registrarEvento(existente.id, 'reaberto', null, {
          de: { motivo: existente.motivo, prioridade: existente.prioridade },
          para: { motivo: input.motivo, prioridade: input.prioridade },
        });
        return atualizado;
      }
      return existente;
    }

    // Reabertura ou criacao nova
    if (existente) {
      const reaberto = await this.prisma.trackingAttentionItem.update({
        where: { id: existente.id },
        data: {
          status: 'aberto',
          motivo: input.motivo,
          prioridade: input.prioridade,
          motivoDetalhe: (input.motivoDetalhe ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          detectadoEm: new Date(),
          vistoEm: null,
          vistoPorId: null,
          resolvidoEm: null,
          resolvidoPorId: null,
        },
      });
      await this.registrarEvento(existente.id, 'reaberto', null, { motivo: input.motivo });
      return reaberto;
    }

    const novo = await this.prisma.trackingAttentionItem.create({
      data: {
        kommoLeadId: BigInt(input.kommoLeadId),
        unidadeId: input.unidadeId,
        motivo: input.motivo,
        prioridade: input.prioridade,
        motivoDetalhe: (input.motivoDetalhe ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        detectadoEm: new Date(),
        status: 'aberto',
      },
    });
    await this.registrarEvento(novo.id, 'criado', null, { motivo: input.motivo });
    return novo;
  }

  async listarFila(user: AuthenticatedUser, query: ListarFilaQuery) {
    const where: Prisma.TrackingAttentionItemWhereInput = {
      status: query.status ?? 'aberto',
    };

    if (user.role === 'gerente') {
      // Gerente so ve da propria unidade
      if (user.unidadeId == null) {
        throw new ForbiddenException('Gerente sem unidade configurada');
      }
      where.unidadeId = user.unidadeId;
    } else if (query.unidadeId) {
      where.unidadeId = query.unidadeId;
    }

    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);

    return this.prisma.trackingAttentionItem.findMany({
      where,
      orderBy: [{ prioridade: 'asc' }, { detectadoEm: 'asc' }],
      take: limit,
    });
  }

  async contadores(user: AuthenticatedUser) {
    const where: Prisma.TrackingAttentionItemWhereInput = {};
    if (user.role === 'gerente') {
      if (user.unidadeId == null) throw new ForbiddenException('Gerente sem unidade');
      where.unidadeId = user.unidadeId;
    }
    const grupos = await this.prisma.trackingAttentionItem.groupBy({
      by: ['status', 'prioridade'],
      where,
      _count: true,
    });
    const contagem = { aberto: 0, visto: 0, resolvido: 0, descartado: 0 };
    const porPrioridade = { 1: 0, 2: 0, 3: 0 };
    for (const g of grupos) {
      const s = g.status as keyof typeof contagem;
      if (s in contagem) contagem[s] += g._count;
      if (s === 'aberto') {
        const p = g.prioridade as 1 | 2 | 3;
        if (p in porPrioridade) porPrioridade[p] += g._count;
      }
    }
    return { porStatus: contagem, abertosPorPrioridade: porPrioridade };
  }

  async detalhe(id: bigint, user: AuthenticatedUser) {
    const item = await this.prisma.trackingAttentionItem.findUnique({
      where: { id },
      include: {
        eventos: { orderBy: { ocorreuEm: 'asc' }, include: { usuario: { select: { id: true, nome: true } } } },
        vistoPor: { select: { id: true, nome: true } },
        resolvidoPor: { select: { id: true, nome: true } },
      },
    });
    if (!item) throw new NotFoundException();
    this.checarAcessoUnidade(item.unidadeId, user);
    return { ...item, linkKommo: this.linkKommo(item.kommoLeadId) };
  }

  async marcarVisto(id: bigint, user: AuthenticatedUser) {
    const item = await this.prisma.trackingAttentionItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException();
    this.checarAcessoUnidade(item.unidadeId, user);
    if (item.status !== 'aberto') return item;

    const atualizado = await this.prisma.trackingAttentionItem.update({
      where: { id },
      data: { status: 'visto', vistoEm: new Date(), vistoPorId: user.id },
    });
    await this.registrarEvento(id, 'visto', user.id, null);
    return atualizado;
  }

  async resolver(id: bigint, user: AuthenticatedUser, observacao?: string) {
    const item = await this.prisma.trackingAttentionItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException();
    this.checarAcessoUnidade(item.unidadeId, user);

    const atualizado = await this.prisma.trackingAttentionItem.update({
      where: { id },
      data: { status: 'resolvido', resolvidoEm: new Date(), resolvidoPorId: user.id },
    });
    await this.registrarEvento(id, 'resolvido', user.id, observacao ? { observacao } : null);
    return atualizado;
  }

  async descartar(id: bigint, user: AuthenticatedUser, observacao?: string) {
    const item = await this.prisma.trackingAttentionItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException();
    this.checarAcessoUnidade(item.unidadeId, user);

    const atualizado = await this.prisma.trackingAttentionItem.update({
      where: { id },
      data: { status: 'descartado' },
    });
    await this.registrarEvento(id, 'descartado', user.id, observacao ? { observacao } : null);
    return atualizado;
  }

  async reabrir(id: bigint, user: AuthenticatedUser) {
    const item = await this.prisma.trackingAttentionItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException();
    this.checarAcessoUnidade(item.unidadeId, user);

    const atualizado = await this.prisma.trackingAttentionItem.update({
      where: { id },
      data: {
        status: 'aberto',
        vistoEm: null,
        vistoPorId: null,
        resolvidoEm: null,
        resolvidoPorId: null,
      },
    });
    await this.registrarEvento(id, 'reaberto', user.id, null);
    return atualizado;
  }

  private checarAcessoUnidade(unidadeIdItem: number, user: AuthenticatedUser) {
    if (user.role === 'admin') return;
    if (user.unidadeId !== unidadeIdItem) {
      throw new ForbiddenException('Sem acesso a item de outra unidade');
    }
  }

  private linkKommo(kommoLeadId: bigint): string {
    const sub = this.config.get<string>('KOMMO_SUBDOMAIN');
    return sub ? `https://${sub}.kommo.com/leads/detail/${kommoLeadId}` : '';
  }

  private async registrarEvento(
    attentionItemId: bigint,
    evento: string,
    porUsuarioId: number | null,
    metadata: unknown,
  ) {
    await this.prisma.trackingAttentionEvent.create({
      data: {
        attentionItemId,
        evento,
        porUsuarioId,
        metadata: (metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });
  }
}
