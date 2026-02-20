import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class PaymentRefundDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  amountPaise?: number;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  merchantRefundId?: string;
}
