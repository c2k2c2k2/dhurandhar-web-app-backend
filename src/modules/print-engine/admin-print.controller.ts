import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrintJobType } from '@prisma/client';
import { CurrentUser } from '../../common/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { PolicyGuard } from '../authorization/guards';
import { Policy, RequireUserType } from '../authorization/decorators';
import { PrintPracticeJobDto, PrintTestJobDto } from './dto';
import { PrintEngineService } from './print-engine.service';

@ApiTags('admin-print')
@ApiBearerAuth()
@Controller('admin/print')
@UseGuards(JwtAuthGuard, PolicyGuard)
export class AdminPrintController {
  constructor(private readonly printEngineService: PrintEngineService) {}

  @Post('test/:testId')
  @RequireUserType('ADMIN')
  @Policy('content.manage')
  createTestPrintJob(
    @CurrentUser() user: { userId: string },
    @Param('testId') testId: string,
    @Body() dto: PrintTestJobDto,
  ) {
    return this.printEngineService.createJob(user.userId, {
      type: PrintJobType.TEST,
      testId,
      includeAnswerKey: dto.includeAnswerKey,
      title: dto.title,
      subtitle: dto.subtitle,
    });
  }

  @Post('practice')
  @RequireUserType('ADMIN')
  @Policy('content.manage')
  createPracticePrintJob(
    @CurrentUser() user: { userId: string },
    @Body() dto: PrintPracticeJobDto,
  ) {
    return this.printEngineService.createPracticeJob(user.userId, dto);
  }
}
