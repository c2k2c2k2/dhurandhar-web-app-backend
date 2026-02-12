import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsRollupService } from './analytics.rollup.service';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [PrismaModule, AuthModule, AuthorizationModule],
  controllers: [AnalyticsController, AdminAnalyticsController],
  providers: [AnalyticsService, AnalyticsRollupService],
})
export class AnalyticsModule {}
