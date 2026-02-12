import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TestEngineService } from './test-engine.service';
import { Public, CurrentUser } from '../../common/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { PolicyGuard } from '../authorization/guards';
import { Policy } from '../authorization/decorators';
import { AttemptQueryDto, AttemptSaveDto, AttemptSubmitDto, TestQueryDto } from './dto';

@ApiTags('tests')
@Controller()
export class TestEngineController {
  constructor(private readonly testEngineService: TestEngineService) {}

  @Public()
  @Get('tests')
  listTests(@Query() query: TestQueryDto) {
    return this.testEngineService.listPublishedTests(query);
  }

  @Public()
  @Get('tests/:testId')
  getTest(@Param('testId') testId: string) {
    return this.testEngineService.getTestPublic(testId);
  }

  @Post('tests/:testId/start')
  @UseGuards(JwtAuthGuard, PolicyGuard)
  @Policy('tests.attempt')
  startAttempt(
    @CurrentUser() user: { userId: string },
    @Param('testId') testId: string,
  ) {
    return this.testEngineService.startAttempt(user.userId, testId);
  }

  @Patch('attempts/:attemptId/save')
  @UseGuards(JwtAuthGuard)
  saveAttempt(
    @CurrentUser() user: { userId: string },
    @Param('attemptId') attemptId: string,
    @Body() dto: AttemptSaveDto,
  ) {
    return this.testEngineService.saveAttempt(user.userId, attemptId, dto);
  }

  @Post('attempts/:attemptId/submit')
  @UseGuards(JwtAuthGuard)
  submitAttempt(
    @CurrentUser() user: { userId: string },
    @Param('attemptId') attemptId: string,
    @Body() dto: AttemptSubmitDto,
  ) {
    return this.testEngineService.submitAttempt(user.userId, attemptId, dto);
  }

  @Get('attempts/me')
  @UseGuards(JwtAuthGuard)
  listAttempts(@CurrentUser() user: { userId: string }, @Query() query: AttemptQueryDto) {
    return this.testEngineService.listAttempts(user.userId, query);
  }

  @Get('attempts/:attemptId')
  @UseGuards(JwtAuthGuard)
  getAttempt(@CurrentUser() user: { userId: string }, @Param('attemptId') attemptId: string) {
    return this.testEngineService.getAttempt(user.userId, attemptId);
  }
}
