import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { FileAssetPurpose } from '@prisma/client';

export class InitUploadDto {
  @IsEnum(FileAssetPurpose)
  purpose!: FileAssetPurpose;

  @IsString()
  fileName!: string;

  @IsString()
  contentType!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @IsOptional()
  @IsString()
  checksum?: string;
}
