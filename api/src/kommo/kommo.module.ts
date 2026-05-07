import { Module } from '@nestjs/common';
import { KommoClient } from './kommo.client';

@Module({
  providers: [KommoClient],
  exports: [KommoClient],
})
export class KommoModule {}
