import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards';
import { PolicyGuard } from '../authorization/guards';
import { Policy, RequireUserType } from '../authorization/decorators';
import { AdminContentHealthQueryDto, AdminOpsSummaryQueryDto } from './dto';
import { AdminOpsService } from './admin-ops.service';

@ApiTags('admin-ops')
@ApiBearerAuth()
@Controller('admin/ops')
@UseGuards(JwtAuthGuard, PolicyGuard)
export class AdminOpsController {
  constructor(private readonly adminOpsService: AdminOpsService) {}

  @Get('summary')
  @RequireUserType('ADMIN')
  @Policy('analytics.read')
  getSummary(@Query() query: AdminOpsSummaryQueryDto) {
    return this.adminOpsService.getSummary(query);
  }

  @Get('content-health')
  @RequireUserType('ADMIN')
  @Policy('content.manage')
  getContentHealth(@Query() query: AdminContentHealthQueryDto) {
    return this.adminOpsService.getContentHealth(query);
  }
}
