import { IsNumberString, IsOptional } from 'class-validator';

export class NoteSecurityProfileDto {
  @IsOptional()
  @IsNumberString()
  limit?: string;
}
