import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Audit } from '../../common/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { PolicyGuard } from '../authorization/guards';
import { Policy, RequireUserType } from '../authorization/decorators';
import {
  NotificationMessageQueryDto,
  NotificationTemplateCreateDto,
  NotificationTemplateQueryDto,
  NotificationTemplateUpdateDto,
} from './dto';
import { NotificationsService } from './notifications.service';

@ApiTags('admin-notifications')
@ApiBearerAuth()
@Controller('admin/notifications')
@UseGuards(JwtAuthGuard, PolicyGuard)
export class AdminNotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('templates')
  @RequireUserType('ADMIN')
  @Policy('notifications.read')
  listTemplates(@Query() query: NotificationTemplateQueryDto) {
    return this.notificationsService.listTemplates(query);
  }

  @Post('templates')
  @RequireUserType('ADMIN')
  @Policy('notifications.manage')
  @Audit('notifications.template.create', 'NotificationTemplate')
  createTemplate(@Body() dto: NotificationTemplateCreateDto) {
    return this.notificationsService.createTemplate(dto);
  }

  @Patch('templates/:templateId')
  @RequireUserType('ADMIN')
  @Policy('notifications.manage')
  @Audit('notifications.template.update', 'NotificationTemplate')
  updateTemplate(
    @Param('templateId') templateId: string,
    @Body() dto: NotificationTemplateUpdateDto,
  ) {
    return this.notificationsService.updateTemplate(templateId, dto);
  }

  @Get('messages')
  @RequireUserType('ADMIN')
  @Policy('notifications.read')
  listMessages(@Query() query: NotificationMessageQueryDto) {
    return this.notificationsService.listMessages(query);
  }

  @Post('messages/:messageId/resend')
  @RequireUserType('ADMIN')
  @Policy('notifications.manage')
  @Audit('notifications.message.resend', 'NotificationMessage')
  resendMessage(@Param('messageId') messageId: string) {
    return this.notificationsService.resendMessage(messageId);
  }
}
