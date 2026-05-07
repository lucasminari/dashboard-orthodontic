import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { LeadsPollingService } from './leads-polling.service';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('ingestion')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ingestion')
export class IngestionController {
  constructor(
    private polling: LeadsPollingService,
    private prisma: PrismaService,
  ) {}

  @Post('polling/leads/run')
  @Roles('admin')
  @ApiOperation({ summary: 'Trigger manual do polling de leads (somente admin)' })
  rodarPollingLeads(@Body() body: { janelaSegundos?: number; maxPaginas?: number }) {
    return this.polling.executar({
      janelaSegundos: body?.janelaSegundos,
      maxPaginas: body?.maxPaginas,
    });
  }

  @Get('runs')
  @Roles('admin')
  @ApiOperation({ summary: 'Lista as ultimas execucoes de sync' })
  listarRuns(@Query('limit') limit?: string) {
    return this.prisma.trackingSyncRun.findMany({
      orderBy: { iniciadoEm: 'desc' },
      take: Math.min(Number(limit) || 20, 200),
    });
  }
}
