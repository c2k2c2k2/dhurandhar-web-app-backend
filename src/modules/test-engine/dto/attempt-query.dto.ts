import { IsNumberString, IsOptional } from 'class-validator';

export class AttemptQueryDto {
  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  pageSize?: string;
}
