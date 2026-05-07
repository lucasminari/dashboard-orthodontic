import { plainToInstance } from 'class-transformer';
import { IsInt, IsOptional, IsString, validateSync } from 'class-validator';

export class EnvVars {
  @IsString()
  DATABASE_URL!: string;

  @IsString()
  KOMMO_SUBDOMAIN!: string;

  @IsString()
  KOMMO_ACCESS_TOKEN!: string;

  @IsOptional()
  @IsString()
  KOMMO_WEBHOOK_SECRET?: string;

  @IsString()
  JWT_SECRET!: string;

  @IsOptional()
  @IsString()
  JWT_EXPIRES_IN?: string;

  @IsOptional()
  @IsString()
  VAPID_PUBLIC_KEY?: string;

  @IsOptional()
  @IsString()
  VAPID_PRIVATE_KEY?: string;

  @IsOptional()
  @IsString()
  VAPID_SUBJECT?: string;

  @IsOptional()
  @IsInt()
  PORT?: number;

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;
}

export function validateEnv(raw: Record<string, unknown>): EnvVars {
  const cfg = plainToInstance(EnvVars, raw, { enableImplicitConversion: true });
  const errors = validateSync(cfg, { skipMissingProperties: false });
  if (errors.length) {
    const msg = errors
      .map(e => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(`Configuracao invalida:\n${msg}`);
  }
  return cfg;
}
