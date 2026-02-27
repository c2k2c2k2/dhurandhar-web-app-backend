import { IsEmail, IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { OtpPurpose } from '@prisma/client';
import { INDIAN_PHONE_INPUT_REGEX } from '../../../common/utils/phone';

export class OtpVerifyDto {
  @IsEnum(OtpPurpose)
  purpose!: OtpPurpose;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(INDIAN_PHONE_INPUT_REGEX, {
    message: 'Phone must be a valid Indian mobile number.',
  })
  phone?: string;

  @IsString()
  otp!: string;
}
