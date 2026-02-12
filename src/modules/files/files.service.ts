import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FileAssetPurpose, UserType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { EntitlementService } from '../payments/entitlement.service';
import { InitUploadDto } from './dto';
import { MinioService } from './minio.service';

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minioService: MinioService,
    private readonly entitlementService: EntitlementService,
  ) {}

  async initUpload(userId: string, dto: InitUploadDto) {
    this.validateContentType(dto.purpose, dto.contentType);
    this.validateSize(dto.purpose, dto.sizeBytes);

    const objectKey = this.buildObjectKey(dto.purpose, dto.fileName);

    const asset = await this.prisma.fileAsset.create({
      data: {
        objectKey,
        fileName: dto.fileName,
        contentType: dto.contentType,
        sizeBytes: dto.sizeBytes,
        checksum: dto.checksum,
        purpose: dto.purpose,
        createdByUserId: userId,
      },
    });

    const uploadUrl = await this.minioService.getPresignedPutUrl(objectKey);

    return {
      fileAssetId: asset.id,
      objectKey: asset.objectKey,
      uploadUrl,
      expiresInSeconds: 900,
    };
  }

  async confirmUpload(fileAssetId: string) {
    const asset = await this.prisma.fileAsset.findUnique({ where: { id: fileAssetId } });
    if (!asset) {
      throw new NotFoundException({
        code: 'FILE_NOT_FOUND',
        message: 'File asset not found.',
      });
    }

    const stat = await this.minioService.statObject(asset.objectKey);

    if (asset.sizeBytes && stat.size !== asset.sizeBytes) {
      throw new BadRequestException({
        code: 'FILE_SIZE_MISMATCH',
        message: 'Uploaded file size does not match expected size.',
      });
    }

    return this.prisma.fileAsset.update({
      where: { id: fileAssetId },
      data: { confirmedAt: new Date(), sizeBytes: stat.size },
    });
  }

  async getAssetStream(
    assetId: string,
    user: { userId: string; type: string } | undefined,
  ) {
    const asset = await this.prisma.fileAsset.findUnique({
      where: { id: assetId },
      include: { assetReferences: true },
    });

    if (!asset) {
      throw new NotFoundException({
        code: 'FILE_NOT_FOUND',
        message: 'File asset not found.',
      });
    }

    await this.assertAssetAccess(asset.id, user);

    const stream = await this.minioService.getObjectStream(asset.objectKey);

    return { asset, stream };
  }

  async assertAssetAccess(assetId: string, user: { userId: string; type: string } | undefined) {
    if (user?.type === UserType.ADMIN) {
      return true;
    }

    const asset = await this.prisma.fileAsset.findUnique({
      where: { id: assetId },
      include: { assetReferences: true },
    });

    if (!asset) {
      throw new NotFoundException({
        code: 'FILE_NOT_FOUND',
        message: 'File asset not found.',
      });
    }

    if (asset.assetReferences.length === 0) {
      throw new ForbiddenException({
        code: 'FILE_ACCESS_DENIED',
        message: 'No valid asset references found.',
      });
    }

    for (const ref of asset.assetReferences) {
      switch (ref.resourceType) {
        case 'NOTE': {
          const note = await this.prisma.note.findUnique({
            where: { id: ref.resourceId },
            include: { topics: true },
          });
          if (note?.isPublished) {
            if (!note.isPremium) {
              return true;
            }
            const canAccess = await this.entitlementService.canAccessNote(user?.userId, note);
            if (canAccess) {
              return true;
            }
          }
          break;
        }
        case 'QUESTION': {
          const question = await this.prisma.question.findUnique({ where: { id: ref.resourceId } });
          if (question?.isPublished) {
            return true;
          }
          break;
        }
        case 'PAGE': {
          const page = await this.prisma.page.findUnique({ where: { id: ref.resourceId } });
          if (page?.status === 'PUBLISHED') {
            return true;
          }
          break;
        }
        case 'BANNER': {
          const banner = await this.prisma.banner.findUnique({ where: { id: ref.resourceId } });
          if (banner?.isActive) {
            return true;
          }
          break;
        }
        case 'ANNOUNCEMENT': {
          const announcement = await this.prisma.announcement.findUnique({ where: { id: ref.resourceId } });
          if (announcement?.isActive) {
            return true;
          }
          break;
        }
        case 'HOME_SECTION': {
          const homeSection = await this.prisma.homeSection.findUnique({ where: { id: ref.resourceId } });
          if (homeSection?.isActive) {
            return true;
          }
          break;
        }
        case 'USER': {
          if (user?.userId && user.userId === ref.resourceId) {
            return true;
          }
          break;
        }
        default:
          break;
      }
    }

    throw new ForbiddenException({
      code: 'FILE_ACCESS_DENIED',
      message: 'You are not authorized to access this asset.',
    });
  }

  private buildObjectKey(purpose: FileAssetPurpose, fileName: string) {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${purpose.toLowerCase()}/${year}/${month}/${randomUUID()}-${safeName}`;
  }

  private validateContentType(purpose: FileAssetPurpose, contentType: string) {
    const allowed: Record<FileAssetPurpose, string[]> = {
      NOTES_PDF: ['application/pdf'],
      PRINT_PDF: ['application/pdf'],
      QUESTION_IMAGE: ['image/png', 'image/jpeg', 'image/webp'],
      OPTION_IMAGE: ['image/png', 'image/jpeg', 'image/webp'],
      EXPLANATION_IMAGE: ['image/png', 'image/jpeg', 'image/webp'],
      OTHER: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
    };

    if (!allowed[purpose].includes(contentType)) {
      throw new BadRequestException({
        code: 'FILE_INVALID_TYPE',
        message: 'Unsupported content type for this asset purpose.',
      });
    }
  }

  private validateSize(purpose: FileAssetPurpose, sizeBytes: number) {
    const maxPdf = Number(process.env.MAX_PDF_BYTES ?? 52428800);
    const maxImage = Number(process.env.MAX_IMAGE_BYTES ?? 2097152);

    if (purpose === FileAssetPurpose.NOTES_PDF || purpose === FileAssetPurpose.PRINT_PDF) {
      if (sizeBytes > maxPdf) {
        throw new BadRequestException({
          code: 'FILE_TOO_LARGE',
          message: 'PDF exceeds max size.',
        });
      }
      return;
    }

    if (sizeBytes > maxImage) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: 'Image exceeds max size.',
      });
    }
  }
}
