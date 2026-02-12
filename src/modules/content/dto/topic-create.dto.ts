import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class TopicCreateDto {
  @IsString()
  subjectId!: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  orderIndex?: number;
}
