import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators';
import { Policy, RequireUserType } from '../authorization/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { PolicyGuard } from '../authorization/guards';
import { InitUploadDto } from './dto';
import { FilesService } from './files.service';

@ApiTags('admin-files')
@ApiBearerAuth()
@Controller('admin/files')
@UseGuards(JwtAuthGuard, PolicyGuard)
export class AdminFilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('init-upload')
  @RequireUserType('ADMIN')
  @Policy('content.manage')
  initUpload(@CurrentUser() user: { userId: string }, @Body() dto: InitUploadDto) {
    return this.filesService.initUpload(user.userId, dto);
  }

  @Post('confirm-upload/:fileAssetId')
  @RequireUserType('ADMIN')
  @Policy('content.manage')
  confirmUpload(@Param('fileAssetId') fileAssetId: string) {
    return this.filesService.confirmUpload(fileAssetId);
  }
}
