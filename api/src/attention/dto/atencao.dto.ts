import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, IsIn } from 'class-validator';

export class ListarFilaQuery {
  @ApiPropertyOptional({ enum: ['aberto', 'visto', 'resolvido', 'descartado'] })
  @IsOptional()
  @IsIn(['aberto', 'visto', 'resolvido', 'descartado'])
  status?: 'aberto' | 'visto' | 'resolvido' | 'descartado';

  @ApiPropertyOptional({ description: 'Filtra por unidade. Admins so. Gerente sempre da propria.' })
  @IsOptional()
  @IsInt()
  unidadeId?: number;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @IsInt()
  limit?: number;
}

export class CriarAttentionItemInput {
  @ApiProperty()
  @IsInt()
  kommoLeadId!: number;

  @ApiProperty()
  @IsInt()
  unidadeId!: number;

  @ApiProperty({ enum: ['timeout_olivia', 'frustracao', 'pediu_humano', 'repeticao'] })
  @IsString()
  motivo!: 'timeout_olivia' | 'frustracao' | 'pediu_humano' | 'repeticao';

  @ApiProperty({ minimum: 1, maximum: 3 })
  @IsInt()
  prioridade!: number;

  @ApiPropertyOptional()
  @IsOptional()
  motivoDetalhe?: Record<string, unknown>;
}
