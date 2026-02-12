import { IsBoolean, IsInt, IsObject, IsOptional, IsString } from 'class-validator';

export class HomeSectionUpdateDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsObject()
  configJson?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  orderIndex?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
