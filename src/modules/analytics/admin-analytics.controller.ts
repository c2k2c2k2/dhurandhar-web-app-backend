import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards';
import { PolicyGuard } from '../authorization/guards';
import { Policy, RequireUserType } from '../authorization/decorators';
import {
  AdminAnalyticsCoverageDto,
  AdminAnalyticsEngagementDto,
  AdminAnalyticsRangeDto,
  AdminAnalyticsRevenueDto,
} from './dto';
import { AnalyticsService } from './analytics.service';

@ApiTags('admin-analytics')
@ApiBearerAuth()
@Controller('admin/analytics')
@UseGuards(JwtAuthGuard, PolicyGuard)
export class AdminAnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('kpis')
  @RequireUserType('ADMIN')
  @Policy('analytics.read')
  getKpis(@Query() query: AdminAnalyticsRangeDto) {
    return this.analyticsService.getAdminKpis(query);
  }

  @Get('overview')
  @RequireUserType('ADMIN')
  @Policy('analytics.read')
  getOverview(@Query() query: AdminAnalyticsRangeDto) {
    return this.analyticsService.getAdminKpis(query);
  }

  @Get('revenue')
  @RequireUserType('ADMIN')
  @Policy('analytics.read')
  getRevenue(@Query() query: AdminAnalyticsRevenueDto) {
    return this.analyticsService.getAdminRevenue(query);
  }

  @Get('engagement')
  @RequireUserType('ADMIN')
  @Policy('analytics.read')
  getEngagement(@Query() query: AdminAnalyticsEngagementDto) {
    return this.analyticsService.getAdminEngagement(query);
  }

  @Get('content-coverage')
  @RequireUserType('ADMIN')
  @Policy('analytics.read')
  getContentCoverage(@Query() query: AdminAnalyticsCoverageDto) {
    return this.analyticsService.getContentCoverage(query);
  }

  @Get('coverage')
  @RequireUserType('ADMIN')
  @Policy('analytics.read')
  getCoverage(@Query() query: AdminAnalyticsCoverageDto) {
    return this.analyticsService.getContentCoverage(query);
  }
}
