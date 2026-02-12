import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Audit, CurrentUser } from '../../common/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { PolicyGuard } from '../authorization/guards';
import { Policy, RequireUserType } from '../authorization/decorators';
import { AppConfigCreateDto, AppConfigQueryDto } from './dto';
import { CmsService } from './cms.service';

@ApiTags('admin-cms')
@ApiBearerAuth()
@Controller('admin/cms')
@UseGuards(JwtAuthGuard, PolicyGuard)
export class AdminCmsController {
  constructor(private readonly cmsService: CmsService) {}

  @Get('configs')
  @RequireUserType('ADMIN')
  @Policy('admin.config.write')
  listConfigs(@Query() query: AppConfigQueryDto) {
    return this.cmsService.listAppConfigs(query);
  }

  @Post('configs')
  @RequireUserType('ADMIN')
  @Policy('admin.config.write')
  @Audit('cms.config.create', 'AppConfig')
  createConfig(@CurrentUser() user: { userId: string }, @Body() dto: AppConfigCreateDto) {
    return this.cmsService.createAppConfig(user.userId, dto);
  }

  @Post('configs/:configId/publish')
  @RequireUserType('ADMIN')
  @Policy('admin.config.write')
  @Audit('cms.config.publish', 'AppConfig')
  publishConfig(@Param('configId') configId: string) {
    return this.cmsService.publishAppConfig(configId);
  }
}
