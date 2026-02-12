import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Audit, CurrentUser } from '../../common/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { PolicyGuard } from '../authorization/guards';
import { Policy, RequireUserType } from '../authorization/decorators';
import { TestCreateDto, TestQueryDto, TestUpdateDto } from './dto';
import { TestEngineService } from './test-engine.service';

@ApiTags('admin-tests')
@ApiBearerAuth()
@Controller('admin/tests')
@UseGuards(JwtAuthGuard, PolicyGuard)
export class AdminTestsController {
  constructor(private readonly testEngineService: TestEngineService) {}

  @Get()
  @RequireUserType('ADMIN')
  @Policy('tests.crud')
  listTests(@Query() query: TestQueryDto) {
    return this.testEngineService.listAdminTests(query);
  }

  @Post()
  @RequireUserType('ADMIN')
  @Policy('tests.crud')
  @Audit('tests.create', 'Test')
  createTest(@CurrentUser() user: { userId: string }, @Body() dto: TestCreateDto) {
    return this.testEngineService.createTest(user.userId, dto);
  }

  @Patch(':testId')
  @RequireUserType('ADMIN')
  @Policy('tests.crud')
  @Audit('tests.update', 'Test')
  updateTest(@Param('testId') testId: string, @Body() dto: TestUpdateDto) {
    return this.testEngineService.updateTest(testId, dto);
  }

  @Post(':testId/publish')
  @RequireUserType('ADMIN')
  @Policy('tests.publish')
  @Audit('tests.publish', 'Test')
  publishTest(@Param('testId') testId: string) {
    return this.testEngineService.publishTest(testId);
  }

  @Post(':testId/unpublish')
  @RequireUserType('ADMIN')
  @Policy('tests.publish')
  @Audit('tests.unpublish', 'Test')
  unpublishTest(@Param('testId') testId: string) {
    return this.testEngineService.unpublishTest(testId);
  }
}
