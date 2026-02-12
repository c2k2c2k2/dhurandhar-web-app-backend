import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CouponType, PaymentOrderStatus, PaymentTransactionStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CheckoutDto, PaymentOrderQueryDto } from './dto';
import { PhonepeService } from './phonepe/phonepe.service';
import { SubscriptionsService } from './subscriptions.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PaymentsService {
  private readonly terminalStatuses = new Set<PaymentOrderStatus>([
    PaymentOrderStatus.SUCCESS,
    PaymentOrderStatus.FAILED,
    PaymentOrderStatus.EXPIRED,
    PaymentOrderStatus.CANCELLED,
    PaymentOrderStatus.REFUNDED,
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly phonepeService: PhonepeService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async checkout(userId: string | undefined, dto: CheckoutDto, idempotencyKey?: string) {
    if (!userId) {
      throw new UnauthorizedException({
        code: 'AUTH_UNAUTHORIZED',
        message: 'Unauthorized.',
      });
    }

    const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
    if (!plan || !plan.isActive) {
      throw new NotFoundException({
        code: 'PLAN_NOT_FOUND',
        message: 'Plan not found.',
      });
    }

    const now = new Date();
    const expiresMinutes = this.configService.get<number>('PENDING_ORDER_EXPIRE_MINUTES') ?? 30;
    const expiresAt = new Date(now.getTime() + expiresMinutes * 60 * 1000);

    if (idempotencyKey) {
      const existing = await this.prisma.paymentOrder.findFirst({
        where: {
          userId,
          idempotencyKey,
          status: { in: [PaymentOrderStatus.CREATED, PaymentOrderStatus.PENDING] },
          expiresAt: { gt: now },
        },
      });
      if (existing) {
        const metadata = (existing.metadataJson ?? {}) as { redirectUrl?: string };
        if (metadata.redirectUrl) {
          return {
            redirectUrl: metadata.redirectUrl,
            merchantTransactionId: existing.merchantTransactionId,
            orderId: existing.id,
            amountPaise: existing.finalAmountPaise,
          };
        }
      }
    }

    const reusable = await this.prisma.paymentOrder.findFirst({
      where: {
        userId,
        planId: plan.id,
        status: { in: [PaymentOrderStatus.CREATED, PaymentOrderStatus.PENDING] },
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (reusable) {
      const metadata = (reusable.metadataJson ?? {}) as { redirectUrl?: string };
      if (metadata.redirectUrl) {
        return {
          redirectUrl: metadata.redirectUrl,
          merchantTransactionId: reusable.merchantTransactionId,
          orderId: reusable.id,
          amountPaise: reusable.finalAmountPaise,
        };
      }
    }

    const coupon = dto.couponCode
      ? await this.resolveCoupon(userId, dto.couponCode, plan.pricePaise)
      : null;
    const finalAmountPaise = coupon ? coupon.finalAmountPaise : plan.pricePaise;

    const merchantTransactionId = randomUUID();
    const order = await this.prisma.paymentOrder.create({
      data: {
        userId,
        planId: plan.id,
        couponId: coupon?.couponId,
        merchantTransactionId,
        merchantUserId: userId,
        amountPaise: plan.pricePaise,
        finalAmountPaise,
        status: PaymentOrderStatus.CREATED,
        idempotencyKey: idempotencyKey ?? undefined,
        expiresAt,
        metadataJson: {
          couponCode: dto.couponCode,
          discountPaise: coupon?.discountPaise ?? 0,
        } as Prisma.InputJsonValue,
      },
    });

    const redirectUrl = this.configService.get<string>('PHONEPE_REDIRECT_URL');
    const callbackUrl = this.configService.get<string>('PHONEPE_CALLBACK_URL');
    if (!redirectUrl || !callbackUrl) {
      throw new BadRequestException({
        code: 'PHONEPE_CONFIG_MISSING',
        message: 'PhonePe redirect/callback URL missing.',
      });
    }

    const merchantId = this.configService.get<string>('PHONEPE_MERCHANT_ID');
    if (!merchantId) {
      throw new BadRequestException({
        code: 'PHONEPE_CONFIG_MISSING',
        message: 'PHONEPE_MERCHANT_ID is missing.',
      });
    }

    const payload = {
      merchantId,
      merchantTransactionId: order.merchantTransactionId,
      merchantUserId: order.merchantUserId,
      amount: order.finalAmountPaise,
      redirectUrl,
      redirectMode: 'REDIRECT',
      callbackUrl,
      paymentInstrument: { type: 'PAY_PAGE' },
    };

    const { redirectUrl: payUrl } = await this.phonepeService.initiatePayment(payload);

    await this.prisma.paymentOrder.update({
      where: { id: order.id },
      data: {
        status: PaymentOrderStatus.PENDING,
        metadataJson: {
          ...(order.metadataJson as Record<string, unknown> | undefined),
          redirectUrl: payUrl,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      redirectUrl: payUrl,
      merchantTransactionId: order.merchantTransactionId,
      orderId: order.id,
      amountPaise: order.finalAmountPaise,
    };
  }

  async getOrderStatus(userId: string | undefined, merchantTransactionId: string) {
    if (!userId) {
      throw new UnauthorizedException({
        code: 'AUTH_UNAUTHORIZED',
        message: 'Unauthorized.',
      });
    }

    const order = await this.prisma.paymentOrder.findUnique({
      where: { merchantTransactionId },
    });

    if (!order || order.userId !== userId) {
      throw new NotFoundException({
        code: 'PAYMENT_ORDER_NOT_FOUND',
        message: 'Payment order not found.',
      });
    }

    const updated = await this.refreshOrderStatus(order.id, order.merchantTransactionId);
    return updated;
  }

  async listOrdersAdmin(query: PaymentOrderQueryDto) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);

    const where = {
      userId: query.userId ?? undefined,
      status: query.status as PaymentOrderStatus | undefined,
      createdAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.paymentOrder.count({ where }),
      this.prisma.paymentOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, email: true, fullName: true } },
          transactions: true,
          events: true,
        },
      }),
    ]);

    return { data, total, page, pageSize };
  }

  async manualFinalize(orderId: string) {
    const order = await this.prisma.paymentOrder.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException({
        code: 'PAYMENT_ORDER_NOT_FOUND',
        message: 'Payment order not found.',
      });
    }

    return this.refreshOrderStatus(order.id, order.merchantTransactionId);
  }

  async handleWebhook(payload: Record<string, unknown>, authHeader?: string) {
    this.validateWebhookAuth(authHeader);

    const merchantTransactionId = this.extractMerchantTransactionId(payload);
    if (!merchantTransactionId) {
      throw new BadRequestException({
        code: 'PHONEPE_WEBHOOK_INVALID',
        message: 'merchantTransactionId missing.',
      });
    }

    const orderRecord = await this.prisma.paymentOrder.findUnique({
      where: { merchantTransactionId },
    });
    if (!orderRecord) {
      throw new NotFoundException({
        code: 'PAYMENT_ORDER_NOT_FOUND',
        message: 'Payment order not found.',
      });
    }

    const providerEventId =
      (payload as { eventId?: string }).eventId ??
      (payload as { transactionId?: string }).transactionId ??
      (payload as { payload?: { transactionId?: string } }).payload?.transactionId ??
      merchantTransactionId;

    const existingEvent = providerEventId
      ? await this.prisma.paymentEvent.findFirst({
          where: { providerEventId, eventType: 'PHONEPE_WEBHOOK', orderId: orderRecord.id },
        })
      : null;

    if (!existingEvent) {
      await this.prisma.paymentEvent.create({
        data: {
          orderId: orderRecord.id,
          providerEventId,
          eventType: 'PHONEPE_WEBHOOK',
          payloadJson: payload as Prisma.InputJsonValue,
        },
      });
    }

    const order = await this.refreshOrderStatus(orderRecord.id, merchantTransactionId);

    if (providerEventId) {
      await this.prisma.paymentEvent.updateMany({
        where: {
          providerEventId,
          eventType: 'PHONEPE_WEBHOOK',
          orderId: orderRecord.id,
          processedAt: null,
        },
        data: { processedAt: new Date() },
      });
    }

    return { success: true, status: order.status };
  }

  async expireStaleOrders() {
    const now = new Date();
    const result = await this.prisma.paymentOrder.updateMany({
      where: {
        status: { in: [PaymentOrderStatus.CREATED, PaymentOrderStatus.PENDING] },
        expiresAt: { lte: now },
      },
      data: {
        status: PaymentOrderStatus.EXPIRED,
        completedAt: now,
      },
    });

    return { expired: result.count };
  }

  async reconcilePendingOrders(limit = 25) {
    const now = new Date();
    const orders = await this.prisma.paymentOrder.findMany({
      where: {
        status: { in: [PaymentOrderStatus.CREATED, PaymentOrderStatus.PENDING] },
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true, merchantTransactionId: true },
    });

    for (const order of orders) {
      try {
        await this.refreshOrderStatus(order.id, order.merchantTransactionId);
      } catch (error) {
        void error;
      }
    }

    return { reconciled: orders.length };
  }

  private async refreshOrderStatusByMerchant(merchantTransactionId: string) {
    const order = await this.prisma.paymentOrder.findUnique({
      where: { merchantTransactionId },
    });
    if (!order) {
      throw new NotFoundException({
        code: 'PAYMENT_ORDER_NOT_FOUND',
        message: 'Payment order not found.',
      });
    }
    return this.refreshOrderStatus(order.id, merchantTransactionId);
  }

  private async refreshOrderStatus(orderId: string, merchantTransactionId: string) {
    const order = await this.prisma.paymentOrder.findUnique({
      where: { id: orderId },
      include: { subscription: true },
    });
    if (!order) {
      throw new NotFoundException({
        code: 'PAYMENT_ORDER_NOT_FOUND',
        message: 'Payment order not found.',
      });
    }

    if (this.terminalStatuses.has(order.status)) {
      return order;
    }

    const statusResponse = await this.phonepeService.checkStatus(merchantTransactionId);
    const normalized = this.normalizeStatus(statusResponse);
    const nextStatus = this.applyTransition(order.status, normalized.orderStatus);

    const updated = await this.prisma.paymentOrder.update({
      where: { id: order.id },
      data: {
        status: nextStatus,
        finalAmountPaise: normalized.amountPaise ?? order.finalAmountPaise,
        completedAt:
          nextStatus === PaymentOrderStatus.SUCCESS ||
          nextStatus === PaymentOrderStatus.FAILED ||
          nextStatus === PaymentOrderStatus.EXPIRED ||
          nextStatus === PaymentOrderStatus.CANCELLED
            ? new Date()
            : undefined,
      },
      include: {
        subscription: true,
        user: { select: { id: true, email: true, fullName: true } },
        plan: { select: { id: true, name: true } },
      },
    });

    await this.upsertTransaction(order.id, normalized, statusResponse);

    if (nextStatus === PaymentOrderStatus.SUCCESS && updated.user?.email) {
      this.notificationsService
        .sendPaymentSuccessEmail({
          userId: updated.user.id,
          email: updated.user.email,
          amountPaise: updated.finalAmountPaise,
          planName: updated.plan?.name,
          orderId: updated.id,
        })
        .catch(() => undefined);
    }

    let activatedSubscription = updated.subscription;
    if (nextStatus === PaymentOrderStatus.SUCCESS && !updated.subscription && updated.planId) {
      try {
        activatedSubscription = await this.subscriptionsService.activateSubscription(
          updated.userId,
          updated.planId,
          updated.id,
        );
      } catch (error) {
        // Let the caller retry via status endpoint or webhook; don't mask payment status.
        void error;
      }
    }

    if (
      nextStatus === PaymentOrderStatus.SUCCESS &&
      activatedSubscription &&
      updated.user?.email
    ) {
      this.notificationsService
        .sendSubscriptionActivatedEmail({
          userId: updated.user.id,
          email: updated.user.email,
          planName: updated.plan?.name,
          endsAt: activatedSubscription.endsAt ?? null,
        })
        .catch(() => undefined);
    }

    if (nextStatus === PaymentOrderStatus.SUCCESS && updated.couponId) {
      await this.redeemCoupon(updated.id, updated.userId, updated.couponId);
    }

    return updated;
  }

  private normalizeStatus(response: {
    code?: string;
    data?: { state?: string; status?: string; responseCode?: string; transactionId?: string; amount?: number };
  }) {
    const rawState =
      response.data?.state ??
      response.data?.status ??
      response.data?.responseCode ??
      response.code ??
      '';
    const state = rawState.toUpperCase();

    let orderStatus: PaymentOrderStatus = PaymentOrderStatus.PENDING;
    if (['COMPLETED', 'SUCCESS', 'PAYMENT_SUCCESS'].includes(state)) {
      orderStatus = PaymentOrderStatus.SUCCESS;
    } else if (['FAILED', 'PAYMENT_FAILED'].includes(state)) {
      orderStatus = PaymentOrderStatus.FAILED;
    } else if (['EXPIRED'].includes(state)) {
      orderStatus = PaymentOrderStatus.EXPIRED;
    } else if (['CANCELLED', 'USER_CANCELLED'].includes(state)) {
      orderStatus = PaymentOrderStatus.CANCELLED;
    }

    const transactionStatus =
      orderStatus === PaymentOrderStatus.SUCCESS
        ? PaymentTransactionStatus.SUCCESS
        : orderStatus === PaymentOrderStatus.FAILED ||
            orderStatus === PaymentOrderStatus.CANCELLED ||
            orderStatus === PaymentOrderStatus.EXPIRED
          ? PaymentTransactionStatus.FAILED
          : PaymentTransactionStatus.PENDING;

    return {
      orderStatus,
      transactionStatus,
      providerTransactionId: response.data?.transactionId,
      amountPaise: response.data?.amount,
    };
  }

  private applyTransition(current: PaymentOrderStatus, next: PaymentOrderStatus) {
    if (current === next) {
      return current;
    }

    const allowed: Record<PaymentOrderStatus, PaymentOrderStatus[]> = {
      CREATED: [
        PaymentOrderStatus.PENDING,
        PaymentOrderStatus.SUCCESS,
        PaymentOrderStatus.FAILED,
        PaymentOrderStatus.EXPIRED,
        PaymentOrderStatus.CANCELLED,
      ],
      PENDING: [
        PaymentOrderStatus.SUCCESS,
        PaymentOrderStatus.FAILED,
        PaymentOrderStatus.EXPIRED,
        PaymentOrderStatus.CANCELLED,
      ],
      SUCCESS: [],
      FAILED: [],
      EXPIRED: [],
      CANCELLED: [],
      REFUNDED: [],
    };

    if (allowed[current]?.includes(next)) {
      return next;
    }

    return current;
  }

  private async upsertTransaction(
    orderId: string,
    normalized: { transactionStatus: PaymentTransactionStatus; providerTransactionId?: string },
    rawResponse: unknown,
  ) {
    if (normalized.providerTransactionId) {
      await this.prisma.paymentTransaction.upsert({
        where: { providerTransactionId: normalized.providerTransactionId },
        create: {
          orderId,
          providerTransactionId: normalized.providerTransactionId,
          status: normalized.transactionStatus,
          rawResponseJson: rawResponse as never,
        },
        update: {
          status: normalized.transactionStatus,
          rawResponseJson: rawResponse as never,
        },
      });
      return;
    }

    await this.prisma.paymentTransaction.create({
      data: {
        orderId,
        status: normalized.transactionStatus,
        rawResponseJson: rawResponse as never,
      },
    });
  }

  private validateWebhookAuth(authHeader?: string) {
    const username = this.configService.get<string>('PHONEPE_WEBHOOK_BASIC_USER');
    const password = this.configService.get<string>('PHONEPE_WEBHOOK_BASIC_PASS');
    if (!username && !password) {
      return;
    }
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      throw new UnauthorizedException({
        code: 'PHONEPE_WEBHOOK_UNAUTHORIZED',
        message: 'Unauthorized webhook.',
      });
    }
    const encoded = authHeader.slice('Basic '.length);
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const [user, pass] = decoded.split(':');
    if (user !== username || pass !== password) {
      throw new UnauthorizedException({
        code: 'PHONEPE_WEBHOOK_UNAUTHORIZED',
        message: 'Unauthorized webhook.',
      });
    }
  }

  private extractMerchantTransactionId(payload: Record<string, unknown>) {
    const direct = payload.merchantTransactionId;
    if (typeof direct === 'string') {
      return direct;
    }
    const nested = (payload as { data?: { merchantTransactionId?: string } }).data
      ?.merchantTransactionId;
    if (typeof nested === 'string') {
      return nested;
    }
    const payloadNested = (payload as { payload?: { merchantTransactionId?: string } }).payload
      ?.merchantTransactionId;
    if (typeof payloadNested === 'string') {
      return payloadNested;
    }
    return undefined;
  }

  private async resolveCoupon(userId: string, code: string, amountPaise: number) {
    const coupon = await this.prisma.coupon.findUnique({ where: { code } });
    if (!coupon || !coupon.isActive) {
      throw new BadRequestException({
        code: 'COUPON_INVALID',
        message: 'Coupon is invalid.',
      });
    }

    const now = new Date();
    if (coupon.startsAt && coupon.startsAt > now) {
      throw new BadRequestException({
        code: 'COUPON_NOT_STARTED',
        message: 'Coupon is not active yet.',
      });
    }
    if (coupon.endsAt && coupon.endsAt < now) {
      throw new BadRequestException({
        code: 'COUPON_EXPIRED',
        message: 'Coupon has expired.',
      });
    }
    if (coupon.minAmountPaise && amountPaise < coupon.minAmountPaise) {
      throw new BadRequestException({
        code: 'COUPON_MIN_AMOUNT',
        message: 'Order amount below coupon minimum.',
      });
    }

    if (coupon.maxRedemptions) {
      const total = await this.prisma.couponRedemption.count({
        where: { couponId: coupon.id },
      });
      if (total >= coupon.maxRedemptions) {
        throw new BadRequestException({
          code: 'COUPON_MAX_REDEEMED',
          message: 'Coupon redemption limit reached.',
        });
      }
    }

    if (coupon.maxRedemptionsPerUser) {
      const total = await this.prisma.couponRedemption.count({
        where: { couponId: coupon.id, userId },
      });
      if (total >= coupon.maxRedemptionsPerUser) {
        throw new BadRequestException({
          code: 'COUPON_USER_LIMIT',
          message: 'Coupon redemption limit reached for user.',
        });
      }
    }

    const discountPaise =
      coupon.type === CouponType.PERCENT
        ? Math.floor((amountPaise * coupon.value) / 100)
        : coupon.value;

    const finalAmountPaise = Math.max(0, amountPaise - discountPaise);

    return {
      couponId: coupon.id,
      discountPaise,
      finalAmountPaise,
    };
  }

  private async redeemCoupon(orderId: string, userId: string, couponId: string) {
    const existing = await this.prisma.couponRedemption.findFirst({
      where: { orderId },
    });
    if (existing) {
      return;
    }

    await this.prisma.couponRedemption.create({
      data: {
        couponId,
        userId,
        orderId,
      },
    });
  }
}
