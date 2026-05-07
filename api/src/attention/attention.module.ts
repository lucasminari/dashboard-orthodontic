import { Module } from '@nestjs/common';
import { AttentionService } from './attention.service';
import { AttentionController } from './attention.controller';

@Module({
  providers: [AttentionService],
  controllers: [AttentionController],
  exports: [AttentionService],
})
export class AttentionModule {}
