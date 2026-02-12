import { IsBooleanString, IsEnum, IsNumberString, IsOptional, IsString } from 'class-validator';
import { UserStatus, UserType } from '@prisma/client';

export class AdminUserQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(UserType)
  type?: UserType;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsBooleanString()
  hasActiveSubscription?: string;

  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  pageSize?: string;
}
