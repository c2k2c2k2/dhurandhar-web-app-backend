import { IsOptional, IsString } from 'class-validator';

export class AdminContentHealthQueryDto {
  @IsOptional()
  @IsString()
  subjectId?: string;
}
