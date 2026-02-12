import { IsOptional, IsString } from 'class-validator';

export class CheckoutDto {
  @IsString()
  planId!: string;

  @IsOptional()
  @IsString()
  couponCode?: string;
}
