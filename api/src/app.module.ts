import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: raw => validateEnv(raw),
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
