import { IsBooleanString, IsOptional, IsString } from 'class-validator';

export class NoteQueryDto {
  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  topicId?: string;

  @IsOptional()
  @IsBooleanString()
  isPublished?: string;

  @IsOptional()
  @IsBooleanString()
  isPremium?: string;
}
