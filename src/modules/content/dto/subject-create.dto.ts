import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class SubjectCreateDto {
  @IsString()
  key!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  orderIndex?: number;
}
