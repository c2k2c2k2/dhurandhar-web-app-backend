import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards';
import { PolicyGuard } from '../authorization/guards';
import { Policy, RequireUserType } from '../authorization/decorators';
import { AdminOpsSummaryQueryDto } from './dto';
import { AdminOpsService } from './admin-ops.service';

@ApiTags('admin-ops')
@ApiBearerAuth()
@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, PolicyGuard)
export class AdminDashboardController {
  constructor(private readonly adminOpsService: AdminOpsService) {}

  @Get('summary')
  @RequireUserType('ADMIN')
  @Policy('analytics.read')
  getSummary(@Query() query: AdminOpsSummaryQueryDto) {
    return this.adminOpsService.getSummary(query);
  }
}
