import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class SubjectUpdateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  orderIndex?: number;
}
