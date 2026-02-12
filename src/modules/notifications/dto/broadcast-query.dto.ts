import { IsEnum, IsNumberString, IsOptional } from 'class-validator';
import { BroadcastStatus, NotificationChannel } from '@prisma/client';

export class BroadcastQueryDto {
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @IsOptional()
  @IsEnum(BroadcastStatus)
  status?: BroadcastStatus;

  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  pageSize?: string;
}
