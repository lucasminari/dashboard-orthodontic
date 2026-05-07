import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health.controller';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesGuard } from './auth/guards/roles.guard';
import { IngestionModule } from './ingestion/ingestion.module';
import { AttentionModule } from './attention/attention.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: raw => validateEnv(raw),
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    UsersModule,
    AuthModule,
    NotificationsModule,
    IngestionModule,
    AttentionModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: RolesGuard }],
})
export class AppModule {}
