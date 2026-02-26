import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { seconds, Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { Public, CurrentUser } from '../../common/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { CheckoutDto, CheckoutPreviewDto } from './dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('checkout/preview')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @UseGuards(JwtAuthGuard)
  checkoutPreview(
    @CurrentUser() user: { userId: string },
    @Body() dto: CheckoutPreviewDto,
  ) {
    return this.paymentsService.previewCheckout(user.userId, dto);
  }

  @Post('checkout')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @UseGuards(JwtAuthGuard)
  checkout(
    @CurrentUser() user: { userId: string },
    @Body() dto: CheckoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-idempotency-key') legacyIdempotencyKey?: string,
  ) {
    const key = idempotencyKey ?? legacyIdempotencyKey;
    return this.paymentsService.checkout(user.userId, dto, key);
  }

  @Get('orders/:merchantTransactionId/status')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @UseGuards(JwtAuthGuard)
  orderStatus(
    @CurrentUser() user: { userId: string },
    @Param('merchantTransactionId') merchantTransactionId: string,
  ) {
    return this.paymentsService.getOrderStatus(
      user.userId,
      merchantTransactionId,
    );
  }

  @Public()
  @Post('webhook/phonepe')
  webhook(
    @Body() payload: unknown,
    @Headers('authorization') authorization?: string,
    @Req() request?: Request & { rawBody?: string },
  ) {
    return this.paymentsService.handleWebhook(
      payload,
      authorization,
      request?.rawBody,
    );
  }
}
