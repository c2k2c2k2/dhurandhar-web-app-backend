import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser, Public } from '../../common/decorators';
import { OptionalJwtAuthGuard } from '../auth/guards';
import { FilesService } from './files.service';

@ApiTags('assets')
@Controller('assets')
@UseGuards(OptionalJwtAuthGuard)
export class AssetsController {
  constructor(private readonly filesService: FilesService) {}

  @Public()
  @Get(':assetId')
  async streamAsset(
    @Param('assetId') assetId: string,
    @CurrentUser() user: { userId: string; type: string } | undefined,
    @Res() res: Response,
  ) {
    const { asset, stream } = await this.filesService.getAssetStream(assetId, user);

    res.setHeader('Content-Type', asset.contentType);
    res.setHeader('Content-Length', asset.sizeBytes);
    res.setHeader('Content-Disposition', `inline; filename="${asset.fileName}"`);
    res.setHeader('Cache-Control', 'no-store');

    stream.pipe(res);
  }
}
