import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Audit } from '../../common/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { PolicyGuard } from '../authorization/guards';
import { Policy, RequireUserType } from '../authorization/decorators';
import { PaymentOrderQueryDto, PaymentRefundDto } from './dto';
import { PaymentsService } from './payments.service';

@ApiTags('admin-payments')
@ApiBearerAuth()
@Controller('admin/payments')
@UseGuards(JwtAuthGuard, PolicyGuard)
export class AdminPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('orders')
  @RequireUserType('ADMIN')
  @Policy('payments.read')
  listOrders(@Query() query: PaymentOrderQueryDto) {
    return this.paymentsService.listOrdersAdmin(query);
  }

  @Post('orders/:orderId/finalize')
  @RequireUserType('ADMIN')
  @Policy('payments.read')
  @Audit('payments.finalize', 'PaymentOrder')
  finalizeOrder(@Param('orderId') orderId: string) {
    return this.paymentsService.manualFinalize(orderId);
  }

  @Post('orders/:orderId/refund')
  @RequireUserType('ADMIN')
  @Policy('payments.refund')
  @Audit('payments.refund.initiate', 'PaymentOrder')
  refundOrder(
    @Param('orderId') orderId: string,
    @Body() dto: PaymentRefundDto,
  ) {
    return this.paymentsService.refundOrder(orderId, dto);
  }

  @Get('refunds/:merchantRefundId/status')
  @RequireUserType('ADMIN')
  @Policy('payments.refund')
  @Audit('payments.refund.status', 'PaymentOrder')
  refundStatus(@Param('merchantRefundId') merchantRefundId: string) {
    return this.paymentsService.getRefundStatusByMerchantRefundId(
      merchantRefundId,
    );
  }
}
