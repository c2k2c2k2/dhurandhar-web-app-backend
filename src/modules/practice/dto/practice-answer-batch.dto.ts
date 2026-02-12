import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { PracticeAnswerDto } from './practice-answer.dto';

export class PracticeAnswerBatchDto {
  @ValidateNested({ each: true })
  @Type(() => PracticeAnswerDto)
  items!: PracticeAnswerDto[];
}
