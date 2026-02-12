import { IsInt, IsNumber, IsOptional } from 'class-validator';

export class NoteProgressDto {
  @IsOptional()
  @IsInt()
  lastPage?: number;

  @IsOptional()
  @IsNumber()
  completionPercent?: number;
}
