import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Audit, CurrentUser } from '../../common/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { PolicyGuard } from '../authorization/guards';
import { Policy, RequireUserType } from '../authorization/decorators';
import { BroadcastCreateDto, BroadcastQueryDto, BroadcastScheduleDto } from './dto';
import { NotificationsService } from './notifications.service';

@ApiTags('admin-notifications')
@ApiBearerAuth()
@Controller('admin/notifications/broadcasts')
@UseGuards(JwtAuthGuard, PolicyGuard)
export class AdminBroadcastsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @RequireUserType('ADMIN')
  @Policy('notifications.read')
  listBroadcasts(@Query() query: BroadcastQueryDto) {
    return this.notificationsService.listBroadcasts(query);
  }

  @Post()
  @RequireUserType('ADMIN')
  @Policy('notifications.manage')
  @Audit('notifications.broadcast.create', 'Broadcast')
  createBroadcast(
    @CurrentUser() user: { userId: string } | undefined,
    @Body() dto: BroadcastCreateDto,
  ) {
    return this.notificationsService.createBroadcast(user?.userId, dto);
  }

  @Post(':broadcastId/schedule')
  @RequireUserType('ADMIN')
  @Policy('notifications.manage')
  @Audit('notifications.broadcast.schedule', 'Broadcast')
  scheduleBroadcast(
    @Param('broadcastId') broadcastId: string,
    @Body() dto: BroadcastScheduleDto,
  ) {
    return this.notificationsService.scheduleBroadcast(broadcastId, dto);
  }

  @Post(':broadcastId/cancel')
  @RequireUserType('ADMIN')
  @Policy('notifications.manage')
  @Audit('notifications.broadcast.cancel', 'Broadcast')
  cancelBroadcast(@Param('broadcastId') broadcastId: string) {
    return this.notificationsService.cancelBroadcast(broadcastId);
  }
}
