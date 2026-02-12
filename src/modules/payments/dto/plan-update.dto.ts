import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class PlanUpdateDto {
  @IsOptional()
  @IsString()
  key?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  tier?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  pricePaise?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  metadataJson?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  featuresJson?: Record<string, unknown>;
}
