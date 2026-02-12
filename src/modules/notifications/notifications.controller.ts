import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { NotificationPreferenceUpdateDto } from './dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('preferences')
  listPreferences(@CurrentUser() user?: { userId: string }) {
    return this.notificationsService.listPreferences(user?.userId);
  }

  @Patch('preferences')
  updatePreference(
    @CurrentUser() user: { userId: string } | undefined,
    @Body() dto: NotificationPreferenceUpdateDto,
  ) {
    return this.notificationsService.updatePreference(user?.userId, dto);
  }
}
