import { BadRequestException, Body, Controller, Get, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { randomUUID } from 'crypto';
import { Public } from '../../common/decorators';
import { MinioService } from './minio.service';
import { IsOptional, IsString } from 'class-validator';

class MinioTestUploadDto {
  @IsOptional()
  @IsString()
  objectKey?: string;

  @IsOptional()
  @IsString()
  prefix?: string;
}

@ApiTags('test-minio')
@Controller('test/minio')
export class MinioTestController {
  constructor(private readonly minioService: MinioService) {}

  @Public()
  @Get('ping')
  async ping() {
    return this.minioService.ping();
  }

  @Public()
  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        objectKey: { type: 'string' },
        prefix: { type: 'string' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: MinioTestUploadDto,
  ) {
    if (!file) {
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'Upload a file with form-data field "file".',
      });
    }

    const prefix = body?.prefix?.trim() || 'test-uploads';
    const safeName = (file.originalname || 'upload')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .slice(0, 120);
    const objectKey =
      body?.objectKey?.trim() || `${prefix}/${Date.now()}-${randomUUID()}-${safeName}`;

    await this.minioService.uploadObject(objectKey, file.buffer, file.mimetype);
    const downloadUrl = await this.minioService.getPresignedGetUrl(objectKey, 900);

    return {
      bucket: this.minioService.getBucketName(),
      objectKey,
      sizeBytes: file.size,
      contentType: file.mimetype,
      downloadUrl,
    };
  }
}
