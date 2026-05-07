import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { KommoClient } from '../kommo/kommo.client';
import { AttentionService } from '../attention/attention.service';

/**
 * Webhook do Kommo. Sem JwtAuthGuard — autenticacao por HMAC.
 *
 * Formato tipico de payload do Kommo (form-encoded ou JSON):
 *   {
 *     "leads": {
 *       "status":  [{ id, status_id, old_status_id, ... }],
 *       "update":  [{ id, name, status_id, ... }],
 *       "add":     [{ id, name, status_id, ... }],
 *       "delete":  [{ id }]
 *     },
 *     "contacts": { ... },
 *     "account":  { id, subdomain }
 *   }
 *
 * Como nao temos amostra real ainda, o handler:
 *  - Loga todo payload recebido em tracking_sync_runs (tipo='webhook')
 *    pra ter exemplo real depois.
 *  - Quando reconhece estrutura conhecida, processa lead_status changes
 *    e cria stage_transitions.
 *  - Idempotencia 100% via UNIQUE em tracking_stage_transitions.
 */
@ApiExcludeController()
@Controller('webhook/kommo')
export class KommoWebhookController {
  private readonly log = new Logger(KommoWebhookController.name);

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private kommo: KommoClient,
    private attention: AttentionService,
  ) {}

  @Post()
  @HttpCode(200)
  async receber(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-signature') xSig: string | undefined,
    @Headers('x-kommo-signature') xKommoSig: string | undefined,
    @Body() body: unknown,
  ) {
    this.validarAssinatura(req, xSig || xKommoSig);

    const inicio = new Date();
    const run = await this.prisma.trackingSyncRun.create({
      data: { tipo: 'webhook', iniciadoEm: inicio },
    });

    let leadsProcessados = 0;
    let transicoes = 0;
    const erros: string[] = [];

    try {
      const eventos = this.extrairLeads(body);
      leadsProcessados = eventos.length;

      for (const ev of eventos) {
        try {
          if (ev.statusAtual !== undefined && ev.statusAnterior !== undefined) {
            const r = await this.prisma.trackingStageTransition.createMany({
              data: {
                kommoLeadId: BigInt(ev.id),
                unidadeId: ev.unidadeId ?? null,
                deStatus: ev.statusAnterior,
                paraStatus: ev.statusAtual,
                ocorreuEm: new Date(),
                fonte: 'webhook',
              },
              skipDuplicates: true,
            });
            transicoes += r.count;
          }
        } catch (e) {
          erros.push(`lead ${ev.id}: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      erros.push((e as Error).message);
    }

    await this.prisma.trackingSyncRun.update({
      where: { id: run.id },
      data: {
        terminadoEm: new Date(),
        leadsProcessados,
        novos: 0,
        atualizados: transicoes,
        erros: erros.length ? (erros as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        status: erros.length === 0 ? 'ok' : 'parcial',
      },
    });

    return { received: true, leadsProcessados, transicoes, erros: erros.length };
  }

  private validarAssinatura(req: RawBodyRequest<Request>, sig: string | undefined) {
    const secret = this.config.get<string>('KOMMO_WEBHOOK_SECRET');
    // Sem secret configurado = nao valida (modo dev). Em prod, sempre setar.
    if (!secret) {
      this.log.warn('KOMMO_WEBHOOK_SECRET nao configurado — pulando validacao HMAC');
      return;
    }
    if (!sig) throw new UnauthorizedException('Faltou assinatura no webhook');
    if (!req.rawBody) throw new UnauthorizedException('rawBody indisponivel');

    const esperada = crypto.createHmac('sha1', secret).update(req.rawBody).digest('hex');
    const ok = sig.length === esperada.length && crypto.timingSafeEqual(
      Buffer.from(sig, 'hex'),
      Buffer.from(esperada, 'hex'),
    );
    if (!ok) throw new UnauthorizedException('Assinatura invalida');
  }

  /**
   * Tenta extrair eventos de lead do payload. Tolerante a variacoes de formato.
   */
  private extrairLeads(body: unknown): {
    id: number;
    statusAtual?: string;
    statusAnterior?: string;
    unidadeId?: number | null;
  }[] {
    if (!body || typeof body !== 'object') return [];
    const b = body as Record<string, any>;
    const out: ReturnType<typeof this.extrairLeads> = [];

    const grupos = b.leads || {};
    for (const grupo of ['status', 'update', 'add'] as const) {
      const arr = grupos[grupo];
      if (!Array.isArray(arr)) continue;
      for (const l of arr) {
        if (typeof l?.id !== 'number' && typeof l?.id !== 'string') continue;
        out.push({
          id: Number(l.id),
          statusAtual: l.status_id != null ? String(l.status_id) : undefined,
          statusAnterior: l.old_status_id != null ? String(l.old_status_id) : undefined,
        });
      }
    }
    return out;
  }
}
