import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { NotificationChannel } from '@prisma/client';

export class NotificationTemplateUpdateDto {
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsObject()
  bodyJson?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  variablesJson?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
