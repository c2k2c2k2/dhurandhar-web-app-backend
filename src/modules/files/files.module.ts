import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { MinioModule } from '../../infra/minio/minio.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { PaymentsModule } from '../payments/payments.module';
import { AdminFilesController } from './admin-files.controller';
import { AssetsController } from './assets.controller';
import { FilesService } from './files.service';
import { MinioService } from './minio.service';
import { MinioTestController } from './minio-test.controller';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    MinioModule,
    AuthModule,
    AuthorizationModule,
    PaymentsModule,
  ],
  controllers: [AdminFilesController, AssetsController, MinioTestController],
  providers: [FilesService, MinioService],
  exports: [FilesService, MinioService],
})
export class FilesModule {}
