import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { CmsController } from './cms.controller';
import { CmsService } from './cms.service';
import { AdminCmsController } from './admin-cms.controller';
import { AdminBannersController } from './admin-banners.controller';
import { AdminAnnouncementsController } from './admin-announcements.controller';
import { AdminHomeSectionsController } from './admin-home-sections.controller';
import { AdminPagesController } from './admin-pages.controller';

@Module({
  imports: [PrismaModule, ConfigModule, AuthModule, AuthorizationModule],
  controllers: [
    CmsController,
    AdminCmsController,
    AdminBannersController,
    AdminAnnouncementsController,
    AdminHomeSectionsController,
    AdminPagesController,
  ],
  providers: [CmsService],
})
export class CmsModule {}
