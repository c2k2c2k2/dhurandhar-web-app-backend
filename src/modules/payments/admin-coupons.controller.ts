import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Audit } from '../../common/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { PolicyGuard } from '../authorization/guards';
import { Policy, RequireUserType } from '../authorization/decorators';
import { CouponCreateDto, CouponQueryDto, CouponUpdateDto } from './dto';
import { CouponsService } from './coupons.service';

@ApiTags('admin-coupons')
@ApiBearerAuth()
@Controller('admin/coupons')
@UseGuards(JwtAuthGuard, PolicyGuard)
export class AdminCouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Get()
  @RequireUserType('ADMIN')
  @Policy('payments.read')
  listCoupons(@Query() query: CouponQueryDto) {
    return this.couponsService.listAdminCoupons(query);
  }

  @Post()
  @RequireUserType('ADMIN')
  @Policy('admin.config.write')
  @Audit('coupons.create', 'Coupon')
  createCoupon(@Body() dto: CouponCreateDto) {
    return this.couponsService.createCoupon(dto);
  }

  @Patch(':couponId')
  @RequireUserType('ADMIN')
  @Policy('admin.config.write')
  @Audit('coupons.update', 'Coupon')
  updateCoupon(@Param('couponId') couponId: string, @Body() dto: CouponUpdateDto) {
    return this.couponsService.updateCoupon(couponId, dto);
  }
}
