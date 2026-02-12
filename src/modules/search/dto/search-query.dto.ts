import { IsIn, IsNumberString, IsOptional, IsString } from 'class-validator';

export class SearchQueryDto {
  @IsString()
  q!: string;

  @IsOptional()
  @IsIn(['notes', 'questions', 'all'])
  type?: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  topicId?: string;

  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  pageSize?: string;
}
