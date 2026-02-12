import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { OtpPurpose } from '@prisma/client';

export class OtpRequestDto {
  @IsEnum(OtpPurpose)
  purpose!: OtpPurpose;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
