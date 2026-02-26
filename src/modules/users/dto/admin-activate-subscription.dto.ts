import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminActivateSubscriptionDto {
  @IsString()
  @MaxLength(120)
  planId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
