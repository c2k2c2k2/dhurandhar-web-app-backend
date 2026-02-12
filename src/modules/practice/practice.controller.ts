import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PracticeEventType } from '@prisma/client';
import { PracticeService } from './practice.service';
import { CurrentUser } from '../../common/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { Policy } from '../authorization/decorators';
import { PolicyGuard } from '../authorization/guards';
import {
  PracticeAnswerBatchDto,
  PracticeAnswerDto,
  PracticeQueryDto,
  PracticeStartDto,
} from './dto';

@ApiTags('practice')
@Controller('practice')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PolicyGuard)
@Policy('practice.use')
export class PracticeController {
  constructor(private readonly practiceService: PracticeService) {}

  @Post('start')
  startPractice(@CurrentUser() user: { userId: string }, @Body() dto: PracticeStartDto) {
    return this.practiceService.startPractice(user.userId, dto);
  }

  @Post(':sessionId/end')
  endPractice(@CurrentUser() user: { userId: string }, @Param('sessionId') sessionId: string) {
    return this.practiceService.endPractice(user.userId, sessionId);
  }

  @Get(':sessionId/next')
  getNextQuestions(
    @CurrentUser() user: { userId: string },
    @Param('sessionId') sessionId: string,
    @Query() query: PracticeQueryDto,
  ) {
    const limit = query.limit ? Number(query.limit) : undefined;
    return this.practiceService.getNextQuestions(
      user.userId,
      sessionId,
      Number.isNaN(limit ?? NaN) ? undefined : limit,
    );
  }

  @Post(':sessionId/answer')
  recordAnswer(
    @CurrentUser() user: { userId: string },
    @Param('sessionId') sessionId: string,
    @Body() dto: PracticeAnswerDto,
  ) {
    return this.practiceService.recordAnswer(user.userId, sessionId, dto);
  }

  @Post(':sessionId/answer/batch')
  recordAnswerBatch(
    @CurrentUser() user: { userId: string },
    @Param('sessionId') sessionId: string,
    @Body() dto: PracticeAnswerBatchDto,
  ) {
    return this.practiceService.recordAnswersBatch(user.userId, sessionId, dto);
  }

  @Post(':sessionId/reveal')
  revealExplanation(
    @CurrentUser() user: { userId: string },
    @Param('sessionId') sessionId: string,
    @Body() dto: PracticeAnswerDto,
  ) {
    return this.practiceService.recordAnswersBatch(user.userId, sessionId, {
      items: [{ ...dto, eventType: PracticeEventType.REVEALED }],
    });
  }

  @Get('progress')
  getProgress(@CurrentUser() user: { userId: string }) {
    return this.practiceService.getProgress(user.userId);
  }

  @Get('weak-questions')
  getWeakQuestions(@CurrentUser() user: { userId: string }, @Query('limit') limit?: string) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.practiceService.getWeakQuestions(
      user.userId,
      Number.isNaN(parsedLimit ?? NaN) ? undefined : parsedLimit,
    );
  }

  @Get('trend')
  getTrend(@CurrentUser() user: { userId: string }, @Query('days') days?: string) {
    const parsedDays = days ? Number(days) : undefined;
    return this.practiceService.getTrend(
      user.userId,
      Number.isNaN(parsedDays ?? NaN) ? undefined : parsedDays,
    );
  }
}
