import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class PlanCreateDto {
  @IsString()
  key!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  tier?: string;

  @IsInt()
  @Min(0)
  pricePaise!: number;

  @IsInt()
  @Min(1)
  durationDays!: number;

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
