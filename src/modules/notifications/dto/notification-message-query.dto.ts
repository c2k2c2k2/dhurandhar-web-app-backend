import { IsDateString, IsEnum, IsNumberString, IsOptional, IsString } from 'class-validator';
import { NotificationChannel } from '@prisma/client';

export class NotificationMessageQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  pageSize?: string;
}
