import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.trackingUser.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
  }

  findById(id: number) {
    return this.prisma.trackingUser.findUnique({ where: { id } });
  }
}
