import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { QuestionQueryDto } from './dto';
import { QuestionBankService } from './question-bank.service';

@ApiTags('questions')
@Controller('questions')
export class QuestionsController {
  constructor(private readonly questionBankService: QuestionBankService) {}

  @Public()
  @Get()
  list(@Query() query: QuestionQueryDto) {
    return this.questionBankService.listQuestions(query);
  }

  @Public()
  @Get(':questionId')
  getQuestion(@Param('questionId') questionId: string) {
    return this.questionBankService.getQuestion(questionId, false);
  }
}
