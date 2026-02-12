import { IsDateString, IsOptional } from 'class-validator';

export class BroadcastScheduleDto {
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
