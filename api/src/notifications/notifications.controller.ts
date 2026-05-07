import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { NotificationsService } from './notifications.service';
import { SubscribeDto } from './dto/subscribe.dto';

@ApiTags('push')
@Controller('push')
export class NotificationsController {
  constructor(private service: NotificationsService) {}

  @Get('public-key')
  @ApiOperation({ summary: 'Devolve a VAPID public key (cliente usa pra subscribe)' })
  publicKey() {
    return { publicKey: this.service.publicKey() };
  }

  @Post('subscribe')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Registra dispositivo do usuario logado pra receber push' })
  subscribe(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubscribeDto) {
    return this.service.subscribe(user.id, dto);
  }

  @Delete('subscribe')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove subscription do dispositivo' })
  unsubscribe(@CurrentUser() user: AuthenticatedUser, @Body() body: { endpoint: string }) {
    return this.service.unsubscribe(user.id, body.endpoint);
  }
}
