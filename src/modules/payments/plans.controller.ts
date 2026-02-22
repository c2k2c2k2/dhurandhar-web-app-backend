import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public } from '../../common/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { PlansService } from './plans.service';

@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Public()
  @Get()
  listPlans() {
    return this.plansService.listPublicPlans();
  }

  @Get('me/options')
  @UseGuards(JwtAuthGuard)
  listPlansForMe(@CurrentUser() user: { userId: string }) {
    return this.plansService.listPlansForUser(user.userId);
  }
}
