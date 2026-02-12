import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { CmsService } from './cms.service';

@ApiTags('cms')
@Controller('cms')
export class CmsController {
  constructor(private readonly cmsService: CmsService) {}

  @Public()
  @Get('public')
  getPublicContent(@Query('keys') keys?: string) {
    const list = keys ? keys.split(',').map((item) => item.trim()).filter(Boolean) : undefined;
    return this.cmsService.getPublicContent(list);
  }

  @Public()
  @Get('student')
  getStudentContent(@Query('keys') keys?: string) {
    const list = keys ? keys.split(',').map((item) => item.trim()).filter(Boolean) : undefined;
    return this.cmsService.getStudentContent(list);
  }

  @Public()
  @Get('pages/:slug')
  getPage(@Param('slug') slug: string) {
    return this.cmsService.getPublicPage(slug);
  }
}
