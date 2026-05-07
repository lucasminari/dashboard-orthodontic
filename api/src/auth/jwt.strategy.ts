import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';

export interface JwtPayload {
  sub: number;
  role: string;
  unidadeId: number | null;
}

export interface AuthenticatedUser {
  id: number;
  email: string;
  nome: string;
  role: string;
  unidadeId: number | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private users: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const u = await this.users.findById(payload.sub);
    if (!u || !u.ativo) {
      throw new UnauthorizedException('Usuario inativo ou inexistente');
    }
    return {
      id: u.id,
      email: u.email,
      nome: u.nome,
      role: u.role,
      unidadeId: u.unidadeId,
    };
  }
}
