import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import type { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private users: UsersService,
    private jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const u = await this.users.findByEmail(dto.email);
    if (!u || !u.ativo) throw new UnauthorizedException('Credenciais invalidas');

    const ok = await bcrypt.compare(dto.senha, u.senhaHash);
    if (!ok) throw new UnauthorizedException('Credenciais invalidas');

    const payload: JwtPayload = {
      sub: u.id,
      role: u.role,
      unidadeId: u.unidadeId ?? null,
    };

    return {
      access_token: await this.jwt.signAsync(payload),
      user: {
        id: u.id,
        email: u.email,
        nome: u.nome,
        role: u.role,
        unidadeId: u.unidadeId,
      },
    };
  }

  static async hashSenha(senha: string): Promise<string> {
    return bcrypt.hash(senha, 10);
  }
}
