import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { SubscribeDto } from './dto/subscribe.dto';

export interface PushPayload {
  titulo: string;
  corpo: string;
  url?: string;
  tag?: string; // p/ replace de notificacoes anteriores
}

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly log = new Logger(NotificationsService.name);
  private vapidConfigurado = false;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  onModuleInit() {
    const pub = this.config.get<string>('VAPID_PUBLIC_KEY');
    const priv = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT') ?? 'mailto:dev@orthodontic.local';
    if (!pub || !priv) {
      this.log.warn('VAPID nao configurado — push notifications desabilitadas');
      return;
    }
    webpush.setVapidDetails(subject, pub, priv);
    this.vapidConfigurado = true;
    this.log.log('VAPID configurado, push pronto');
  }

  publicKey(): string | null {
    return this.config.get<string>('VAPID_PUBLIC_KEY') ?? null;
  }

  async subscribe(usuarioId: number, dto: SubscribeDto) {
    return this.prisma.trackingPushSubscription.upsert({
      where: { usuarioId_endpoint: { usuarioId, endpoint: dto.endpoint } },
      create: {
        usuarioId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent: dto.userAgent ?? null,
      },
      update: {
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent: dto.userAgent ?? null,
      },
    });
  }

  async unsubscribe(usuarioId: number, endpoint: string) {
    await this.prisma.trackingPushSubscription.deleteMany({
      where: { usuarioId, endpoint },
    });
  }

  /**
   * Envia push pra todos os dispositivos de um usuario.
   * Remove subscriptions invalidas (410 Gone) automaticamente.
   */
  async enviarParaUsuario(usuarioId: number, payload: PushPayload): Promise<{ enviados: number; falhas: number }> {
    if (!this.vapidConfigurado) return { enviados: 0, falhas: 0 };

    const subs = await this.prisma.trackingPushSubscription.findMany({
      where: { usuarioId },
    });

    let enviados = 0;
    let falhas = 0;
    const expirados: bigint[] = [];

    for (const s of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          JSON.stringify(payload),
        );
        enviados++;
      } catch (e) {
        falhas++;
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          expirados.push(s.id);
        } else {
          this.log.warn(`Falha ao enviar push pra sub ${s.id}: ${(e as Error).message}`);
        }
      }
    }

    if (expirados.length) {
      await this.prisma.trackingPushSubscription.deleteMany({
        where: { id: { in: expirados } },
      });
      this.log.log(`Removidas ${expirados.length} subscriptions expiradas`);
    }

    return { enviados, falhas };
  }

  /**
   * Envia push pra todos os gerentes de uma unidade + todos os admins.
   */
  async enviarParaUnidade(unidadeId: number, payload: PushPayload) {
    const usuarios = await this.prisma.trackingUser.findMany({
      where: {
        ativo: true,
        OR: [{ role: 'admin' }, { role: 'gerente', unidadeId }],
      },
      select: { id: true },
    });
    let enviados = 0;
    let falhas = 0;
    for (const u of usuarios) {
      const r = await this.enviarParaUsuario(u.id, payload);
      enviados += r.enviados;
      falhas += r.falhas;
    }
    return { enviados, falhas, destinatarios: usuarios.length };
  }
}
