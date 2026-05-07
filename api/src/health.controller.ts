import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from './prisma/prisma.service';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get('/')
  root() {
    return { name: 'OrthoDontic API', docs: '/api/docs' };
  }

  @Get('/health')
  async health() {
    let db: 'ok' | 'fail' = 'fail';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'ok';
    } catch {
      db = 'fail';
    }
    return { status: 'ok', db, ts: new Date().toISOString() };
  }
}
