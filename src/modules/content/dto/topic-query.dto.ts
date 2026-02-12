import { IsOptional, IsString } from 'class-validator';

export class TopicQueryDto {
  @IsOptional()
  @IsString()
  subjectId?: string;
}
