import { IsBoolean, IsEnum } from 'class-validator';
import { NotificationChannel } from '@prisma/client';

export class NotificationPreferenceUpdateDto {
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @IsBoolean()
  isEnabled!: boolean;
}
