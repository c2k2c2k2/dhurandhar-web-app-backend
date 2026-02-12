import { IsArray, IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateNoteDto {
  @IsString()
  subjectId!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isPremium?: boolean;

  @IsOptional()
  @IsString()
  fileAssetId?: string;

  @IsOptional()
  @IsInt()
  pageCount?: number;

  @IsOptional()
  @IsArray()
  topicIds?: string[];
}
