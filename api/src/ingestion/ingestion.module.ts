import { Module } from '@nestjs/common';
import { KommoModule } from '../kommo/kommo.module';
import { AttentionModule } from '../attention/attention.module';
import { LeadsPollingService } from './leads-polling.service';
import { IngestionController } from './ingestion.controller';
import { KommoWebhookController } from './webhook.controller';

@Module({
  imports: [KommoModule, AttentionModule],
  providers: [LeadsPollingService],
  controllers: [IngestionController, KommoWebhookController],
  exports: [LeadsPollingService],
})
export class IngestionModule {}
