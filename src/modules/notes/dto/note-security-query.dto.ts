import { IsDateString, IsEnum, IsNumberString, IsOptional, IsString } from 'class-validator';
import { NoteSecuritySignalType } from '@prisma/client';

export class NoteSecurityQueryDto {
  @IsOptional()
  @IsString()
  noteId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsEnum(NoteSecuritySignalType)
  signalType?: NoteSecuritySignalType;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  pageSize?: string;
}
