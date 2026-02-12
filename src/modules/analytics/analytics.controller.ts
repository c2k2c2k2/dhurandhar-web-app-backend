import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators';
import { JwtAuthGuard } from '../auth/guards';
import {
  AnalyticsNotesQueryDto,
  AnalyticsPaginationDto,
  AnalyticsTestBreakdownDto,
  AnalyticsWeakQueryDto,
} from './dto';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@Controller('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('me/summary')
  getSummary(@CurrentUser() user: { userId: string }) {
    return this.analyticsService.getStudentSummary(user.userId);
  }

  @Get('me/notes')
  listNotes(@CurrentUser() user: { userId: string }, @Query() query: AnalyticsNotesQueryDto) {
    return this.analyticsService.listNoteProgress(user.userId, query);
  }

  @Get('me/practice/topics')
  listPracticeTopics(
    @CurrentUser() user: { userId: string },
    @Query() query: AnalyticsPaginationDto,
  ) {
    return this.analyticsService.listPracticeTopics(user.userId, query);
  }

  @Get('me/practice/weak')
  listWeakQuestions(@CurrentUser() user: { userId: string }, @Query() query: AnalyticsWeakQueryDto) {
    return this.analyticsService.listWeakQuestions(user.userId, query);
  }

  @Get('me/tests/summary')
  getTestSummary(@CurrentUser() user: { userId: string }) {
    return this.analyticsService.getTestSummary(user.userId);
  }

  @Get('me/tests/breakdown')
  getTestBreakdown(
    @CurrentUser() user: { userId: string },
    @Query() query: AnalyticsTestBreakdownDto,
  ) {
    return this.analyticsService.getTestBreakdown(user.userId, query);
  }
}
