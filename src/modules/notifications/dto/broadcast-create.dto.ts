import { IsDateString, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { BroadcastStatus, NotificationChannel } from '@prisma/client';

export class BroadcastCreateDto {
  @IsString()
  title!: string;

  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsObject()
  audienceJson!: Record<string, unknown>;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsEnum(BroadcastStatus)
  status?: BroadcastStatus;
}
