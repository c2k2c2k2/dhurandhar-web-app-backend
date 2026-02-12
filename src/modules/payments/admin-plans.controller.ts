import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Audit } from '../../common/decorators';
import { Policy, RequireUserType } from '../authorization/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { PolicyGuard } from '../authorization/guards';
import { PlanCreateDto, PlanQueryDto, PlanUpdateDto } from './dto';
import { PlansService } from './plans.service';

@ApiTags('admin-plans')
@ApiBearerAuth()
@Controller('admin/plans')
@UseGuards(JwtAuthGuard, PolicyGuard)
export class AdminPlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  @RequireUserType('ADMIN')
  @Policy('payments.read')
  listPlans(@Query() query: PlanQueryDto) {
    return this.plansService.listAdminPlans(query);
  }

  @Post()
  @RequireUserType('ADMIN')
  @Policy('admin.config.write')
  @Audit('plans.create', 'Plan')
  createPlan(@Body() dto: PlanCreateDto) {
    return this.plansService.createPlan(dto);
  }

  @Patch(':planId')
  @RequireUserType('ADMIN')
  @Policy('admin.config.write')
  @Audit('plans.update', 'Plan')
  updatePlan(@Param('planId') planId: string, @Body() dto: PlanUpdateDto) {
    return this.plansService.updatePlan(planId, dto);
  }
}
