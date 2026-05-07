import { Module } from '@nestjs/common';
import { KommoModule } from '../kommo/kommo.module';
import { LeadsPollingService } from './leads-polling.service';
import { IngestionController } from './ingestion.controller';

@Module({
  imports: [KommoModule],
  providers: [LeadsPollingService],
  controllers: [IngestionController],
  exports: [LeadsPollingService],
})
export class IngestionModule {}
