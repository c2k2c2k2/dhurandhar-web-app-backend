import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Audit, CurrentUser } from '../../common/decorators';
import { Policy, RequireUserType } from '../authorization/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { PolicyGuard } from '../authorization/guards';
import { BulkImportDto, CreateQuestionDto, QuestionQueryDto, UpdateQuestionDto } from './dto';
import { QuestionBankService } from './question-bank.service';

@ApiTags('admin-questions')
@ApiBearerAuth()
@Controller('admin/questions')
@UseGuards(JwtAuthGuard, PolicyGuard)
export class AdminQuestionsController {
  constructor(private readonly questionBankService: QuestionBankService) {}

  @Post()
  @RequireUserType('ADMIN')
  @Policy('questions.crud')
  @Audit('questions.create', 'Question')
  createQuestion(@CurrentUser() user: { userId: string }, @Body() dto: CreateQuestionDto) {
    return this.questionBankService.createQuestion(user.userId, dto);
  }

  @Patch(':questionId')
  @RequireUserType('ADMIN')
  @Policy('questions.crud')
  @Audit('questions.update', 'Question')
  updateQuestion(@Param('questionId') questionId: string, @Body() dto: UpdateQuestionDto) {
    return this.questionBankService.updateQuestion(questionId, dto);
  }

  @Post(':questionId/publish')
  @RequireUserType('ADMIN')
  @Policy('questions.publish')
  @Audit('questions.publish', 'Question')
  publish(@Param('questionId') questionId: string) {
    return this.questionBankService.publishQuestion(questionId);
  }

  @Post(':questionId/unpublish')
  @RequireUserType('ADMIN')
  @Policy('questions.publish')
  @Audit('questions.unpublish', 'Question')
  unpublish(@Param('questionId') questionId: string) {
    return this.questionBankService.unpublishQuestion(questionId);
  }

  @Get()
  @RequireUserType('ADMIN')
  @Policy('questions.read')
  list(@Query() query: QuestionQueryDto) {
    return this.questionBankService.listAdminQuestions(query);
  }

  @Get(':questionId')
  @RequireUserType('ADMIN')
  @Policy('questions.read')
  getQuestion(@Param('questionId') questionId: string) {
    return this.questionBankService.getQuestion(questionId, true, true);
  }

  @Post('bulk-import')
  @RequireUserType('ADMIN')
  @Policy('questions.crud')
  @Audit('questions.bulk_import', 'Question')
  bulkImport(@CurrentUser() user: { userId: string }, @Body() dto: BulkImportDto) {
    return this.questionBankService.bulkImport(user.userId, dto);
  }
}
