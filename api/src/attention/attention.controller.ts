import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AttentionService } from './attention.service';
import { CriarAttentionItemInput, ListarFilaQuery } from './dto/atencao.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@ApiTags('atencao')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('atencao')
export class AttentionController {
  constructor(private service: AttentionService) {}

  @Get('fila')
  @ApiOperation({ summary: 'Lista itens da fila. Gerente so ve da propria unidade.' })
  fila(@CurrentUser() user: AuthenticatedUser, @Query() q: ListarFilaQuery) {
    return this.service.listarFila(user, q);
  }

  @Get('contadores')
  @ApiOperation({ summary: 'Contagem por status e prioridade pra cards de dashboard.' })
  contadores(@CurrentUser() user: AuthenticatedUser) {
    return this.service.contadores(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe + historico de eventos + link pro Kommo' })
  detalhe(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.service.detalhe(BigInt(id), user);
  }

  @Post(':id/visto')
  @ApiOperation({ summary: 'Marca como visto (leu, ainda nao resolveu)' })
  visto(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.service.marcarVisto(BigInt(id), user);
  }

  @Post(':id/resolver')
  @ApiOperation({ summary: 'Marca como resolvido (humano tratou)' })
  resolver(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { observacao?: string },
  ) {
    return this.service.resolver(BigInt(id), user, body?.observacao);
  }

  @Post(':id/descartar')
  @ApiOperation({ summary: 'Marca como falso positivo' })
  descartar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { observacao?: string },
  ) {
    return this.service.descartar(BigInt(id), user, body?.observacao);
  }

  @Post(':id/reabrir')
  @ApiOperation({ summary: 'Reabre item que tinha sido resolvido/descartado' })
  reabrir(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.service.reabrir(BigInt(id), user);
  }

  @Post('admin/criar')
  @Roles('admin')
  @ApiOperation({
    summary: 'Cria item manualmente (admin). Em producao, detectores fazem isso automaticamente.',
  })
  criarManual(@Body() body: CriarAttentionItemInput) {
    return this.service.criarOuAtualizar(body);
  }
}
