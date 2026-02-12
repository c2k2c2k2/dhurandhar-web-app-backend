import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Audit, CurrentUser } from '../../common/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { PolicyGuard } from '../authorization/guards';
import { Policy, RequireUserType } from '../authorization/decorators';
import { AnnouncementCreateDto, AnnouncementUpdateDto } from './dto';
import { CmsService } from './cms.service';

@ApiTags('admin-cms-announcements')
@ApiBearerAuth()
@Controller('admin/cms/announcements')
@UseGuards(JwtAuthGuard, PolicyGuard)
export class AdminAnnouncementsController {
  constructor(private readonly cmsService: CmsService) {}

  @Get()
  @RequireUserType('ADMIN')
  @Policy('admin.config.write')
  listAnnouncements(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.cmsService.listAnnouncementsAdmin(Number(page ?? 1), Number(pageSize ?? 20));
  }

  @Post()
  @RequireUserType('ADMIN')
  @Policy('admin.config.write')
  @Audit('cms.announcement.create', 'Announcement')
  createAnnouncement(
    @CurrentUser() user: { userId: string },
    @Body() dto: AnnouncementCreateDto,
  ) {
    return this.cmsService.createAnnouncement(user.userId, dto);
  }

  @Patch(':announcementId')
  @RequireUserType('ADMIN')
  @Policy('admin.config.write')
  @Audit('cms.announcement.update', 'Announcement')
  updateAnnouncement(
    @Param('announcementId') announcementId: string,
    @Body() dto: AnnouncementUpdateDto,
  ) {
    return this.cmsService.updateAnnouncement(announcementId, dto);
  }
}
