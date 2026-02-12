import { IsDateString, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { EntitlementKind } from '@prisma/client';

export class AdminEntitlementDto {
  @IsOptional()
  @IsEnum(EntitlementKind)
  kind?: EntitlementKind;

  @IsOptional()
  @IsObject()
  scopeJson?: Record<string, unknown>;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
