import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CheckoutPreviewDto {
  @IsString()
  planId!: string;

  @IsOptional()
  @IsString()
  couponCode?: string;

  @IsOptional()
  @IsBoolean()
  enableAutoPay?: boolean;
}
