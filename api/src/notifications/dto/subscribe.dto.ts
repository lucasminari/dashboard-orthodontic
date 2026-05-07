import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class SubscribeDto {
  @ApiProperty({ example: 'https://fcm.googleapis.com/fcm/send/...' })
  @IsString()
  endpoint!: string;

  @ApiProperty({
    example: { p256dh: 'BNc...', auth: 'ABC...' },
    description: 'Chaves do PushSubscription.toJSON().keys',
  })
  @IsObject()
  keys!: { p256dh: string; auth: string };

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  userAgent?: string;
}
