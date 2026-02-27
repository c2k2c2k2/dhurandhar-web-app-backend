import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { INDIAN_PHONE_INPUT_REGEX } from '../../../common/utils/phone';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Matches(INDIAN_PHONE_INPUT_REGEX, {
    message: 'Phone must be a valid Indian mobile number.',
  })
  phone!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  @Matches(/^\d{6}$/, {
    message: 'OTP must be a 6 digit code.',
  })
  otp!: string;

  @IsOptional()
  @IsString()
  fullName?: string;
}
