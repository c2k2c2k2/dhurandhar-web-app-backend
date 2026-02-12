import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { PolicyGuard } from '../authorization/guards';
import { Policy, RequireUserType } from '../authorization/decorators';
import { PrintJobCreateDto, PrintJobQueryDto } from './dto';
import { PrintEngineService } from './print-engine.service';

@ApiTags('admin-print-jobs')
@ApiBearerAuth()
@Controller('admin/print-jobs')
@UseGuards(JwtAuthGuard, PolicyGuard)
export class PrintEngineController {
  constructor(private readonly printEngineService: PrintEngineService) {}

  @Post()
  @RequireUserType('ADMIN')
  @Policy('content.manage')
  createJob(@CurrentUser() user: { userId: string }, @Body() dto: PrintJobCreateDto) {
    return this.printEngineService.createJob(user.userId, dto);
  }

  @Get()
  @RequireUserType('ADMIN')
  @Policy('content.manage')
  listJobs(@Query() query: PrintJobQueryDto) {
    return this.printEngineService.listJobs(query);
  }

  @Get(':jobId')
  @RequireUserType('ADMIN')
  @Policy('content.manage')
  getJob(@Param('jobId') jobId: string) {
    return this.printEngineService.getJob(jobId);
  }

  @Get(':jobId/download')
  @RequireUserType('ADMIN')
  @Policy('content.manage')
  getDownload(@Param('jobId') jobId: string) {
    return this.printEngineService.getDownloadUrl(jobId);
  }

  @Post(':jobId/retry')
  @RequireUserType('ADMIN')
  @Policy('content.manage')
  retry(@Param('jobId') jobId: string) {
    return this.printEngineService.retryJob(jobId);
  }

  @Post(':jobId/cancel')
  @RequireUserType('ADMIN')
  @Policy('content.manage')
  cancel(@Param('jobId') jobId: string) {
    return this.printEngineService.cancelJob(jobId);
  }
}
