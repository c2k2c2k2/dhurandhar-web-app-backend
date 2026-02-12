import { IsEmail, IsString } from 'class-validator';

export class PasswordRequestDto {
  @IsEmail()
  email!: string;

  @IsString()
  redirectUrl!: string;
}
