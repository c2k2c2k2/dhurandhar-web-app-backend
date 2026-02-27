import { IsOptional, IsString, Matches } from 'class-validator';
import { INDIAN_PHONE_INPUT_REGEX } from '../../../common/utils/phone';

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  @Matches(INDIAN_PHONE_INPUT_REGEX, {
    message: 'Phone must be a valid Indian mobile number.',
  })
  phone?: string;
}
