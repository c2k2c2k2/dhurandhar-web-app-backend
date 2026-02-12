import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards';
import { PolicyGuard } from '../authorization/guards';
import { Policy, RequireUserType } from '../authorization/decorators';
import { AdminExportSubscriptionsQueryDto } from './dto';
import { AdminOpsService } from './admin-ops.service';

@ApiTags('admin-exports')
@ApiBearerAuth()
@Controller('admin/exports')
@UseGuards(JwtAuthGuard, PolicyGuard)
export class AdminExportsController {
  constructor(private readonly adminOpsService: AdminOpsService) {}

  @Get('users')
  @RequireUserType('ADMIN')
  @Policy('users.read')
  async exportUsers(@Res() res: Response) {
    const csv = await this.adminOpsService.exportUsersCsv();
    const fileName = `users-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(csv);
  }

  @Get('subscriptions')
  @RequireUserType('ADMIN')
  @Policy('payments.read')
  async exportSubscriptions(
    @Res() res: Response,
    @Query() query: AdminExportSubscriptionsQueryDto,
  ) {
    const csv = await this.adminOpsService.exportSubscriptionsCsv(query);
    const fileName = `subscriptions-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(csv);
  }
}
