import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Audit, CurrentUser } from '../../common/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { PolicyGuard } from '../authorization/guards';
import { Policy, RequireUserType } from '../authorization/decorators';
import { BannerCreateDto, BannerUpdateDto } from './dto';
import { CmsService } from './cms.service';

@ApiTags('admin-cms-banners')
@ApiBearerAuth()
@Controller('admin/cms/banners')
@UseGuards(JwtAuthGuard, PolicyGuard)
export class AdminBannersController {
  constructor(private readonly cmsService: CmsService) {}

  @Get()
  @RequireUserType('ADMIN')
  @Policy('admin.config.write')
  listBanners(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.cmsService.listBannersAdmin(Number(page ?? 1), Number(pageSize ?? 20));
  }

  @Post()
  @RequireUserType('ADMIN')
  @Policy('admin.config.write')
  @Audit('cms.banner.create', 'Banner')
  createBanner(@CurrentUser() user: { userId: string }, @Body() dto: BannerCreateDto) {
    return this.cmsService.createBanner(user.userId, dto);
  }

  @Patch(':bannerId')
  @RequireUserType('ADMIN')
  @Policy('admin.config.write')
  @Audit('cms.banner.update', 'Banner')
  updateBanner(@Param('bannerId') bannerId: string, @Body() dto: BannerUpdateDto) {
    return this.cmsService.updateBanner(bannerId, dto);
  }
}
