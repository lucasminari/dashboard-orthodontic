import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    this.log.log('Conectado ao Postgres');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
