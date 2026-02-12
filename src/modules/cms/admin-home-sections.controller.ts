import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Audit, CurrentUser } from '../../common/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { PolicyGuard } from '../authorization/guards';
import { Policy, RequireUserType } from '../authorization/decorators';
import { HomeSectionCreateDto, HomeSectionReorderDto, HomeSectionUpdateDto } from './dto';
import { CmsService } from './cms.service';

@ApiTags('admin-cms-home-sections')
@ApiBearerAuth()
@Controller('admin/cms/home-sections')
@UseGuards(JwtAuthGuard, PolicyGuard)
export class AdminHomeSectionsController {
  constructor(private readonly cmsService: CmsService) {}

  @Get()
  @RequireUserType('ADMIN')
  @Policy('admin.config.write')
  listSections(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.cmsService.listHomeSectionsAdmin(Number(page ?? 1), Number(pageSize ?? 50));
  }

  @Post()
  @RequireUserType('ADMIN')
  @Policy('admin.config.write')
  @Audit('cms.home_section.create', 'HomeSection')
  createSection(@CurrentUser() user: { userId: string }, @Body() dto: HomeSectionCreateDto) {
    return this.cmsService.createHomeSection(user.userId, dto);
  }

  @Patch(':sectionId')
  @RequireUserType('ADMIN')
  @Policy('admin.config.write')
  @Audit('cms.home_section.update', 'HomeSection')
  updateSection(@Param('sectionId') sectionId: string, @Body() dto: HomeSectionUpdateDto) {
    return this.cmsService.updateHomeSection(sectionId, dto);
  }

  @Post('reorder')
  @RequireUserType('ADMIN')
  @Policy('admin.config.write')
  @Audit('cms.home_section.reorder', 'HomeSection')
  reorder(@Body() dto: HomeSectionReorderDto) {
    return this.cmsService.reorderHomeSections(dto);
  }
}
