import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Audit, CurrentUser } from '../../common/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { PolicyGuard } from '../authorization/guards';
import { Policy, RequireUserType } from '../authorization/decorators';
import { PageCreateDto, PageQueryDto, PageUpdateDto } from './dto';
import { CmsService } from './cms.service';

@ApiTags('admin-cms-pages')
@ApiBearerAuth()
@Controller('admin/cms/pages')
@UseGuards(JwtAuthGuard, PolicyGuard)
export class AdminPagesController {
  constructor(private readonly cmsService: CmsService) {}

  @Get()
  @RequireUserType('ADMIN')
  @Policy('admin.config.write')
  listPages(@Query() query: PageQueryDto) {
    return this.cmsService.listPagesAdmin(query);
  }

  @Post()
  @RequireUserType('ADMIN')
  @Policy('admin.config.write')
  @Audit('cms.page.create', 'Page')
  createPage(@CurrentUser() user: { userId: string }, @Body() dto: PageCreateDto) {
    return this.cmsService.createPage(user.userId, dto);
  }

  @Patch(':pageId')
  @RequireUserType('ADMIN')
  @Policy('admin.config.write')
  @Audit('cms.page.update', 'Page')
  updatePage(@Param('pageId') pageId: string, @Body() dto: PageUpdateDto) {
    return this.cmsService.updatePage(pageId, dto);
  }

  @Post(':pageId/publish')
  @RequireUserType('ADMIN')
  @Policy('admin.config.write')
  @Audit('cms.page.publish', 'Page')
  publishPage(@Param('pageId') pageId: string) {
    return this.cmsService.publishPage(pageId);
  }

  @Post(':pageId/unpublish')
  @RequireUserType('ADMIN')
  @Policy('admin.config.write')
  @Audit('cms.page.unpublish', 'Page')
  unpublishPage(@Param('pageId') pageId: string) {
    return this.cmsService.unpublishPage(pageId);
  }
}
