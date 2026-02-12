import { IsOptional, IsString } from 'class-validator';

export class AdminBlockUserDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
