import { IsEnum, IsOptional, IsString } from 'class-validator';
import { NotificationChannel } from '@prisma/client';

export class NotificationTemplateQueryDto {
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  isActive?: string;
}
