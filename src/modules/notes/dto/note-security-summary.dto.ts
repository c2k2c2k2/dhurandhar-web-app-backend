import { IsDateString, IsNumberString, IsOptional } from 'class-validator';

export class NoteSecuritySummaryQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;
}
