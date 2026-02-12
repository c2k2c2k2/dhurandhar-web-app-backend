import { IsBoolean, IsInt, IsObject, IsOptional, IsString } from 'class-validator';

export class HomeSectionCreateDto {
  @IsString()
  type!: string;

  @IsObject()
  configJson!: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  orderIndex?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
