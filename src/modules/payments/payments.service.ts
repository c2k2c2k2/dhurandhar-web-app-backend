import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CouponType,
  PaymentOrderStatus,
  PaymentTransactionStatus,
  Prisma,
  SubscriptionStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CheckoutDto, PaymentOrderQueryDto, PaymentRefundDto } from './dto';
import { PhonepeService } from './phonepe/phonepe.service';
import { SubscriptionsService } from './subscriptions.service';
import { NotificationsService } from '../notifications/notifications.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RENEWAL_WINDOW_DAYS = 7;

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

  async checkout(
    userId: string | undefined,
    dto: CheckoutDto,
    idempotencyKey?: string,
  ) {
    if (!userId) {
      throw new UnauthorizedException({
        code: 'AUTH_UNAUTHORIZED',
        message: 'Unauthorized.',
      });
    }

    const plan = await this.prisma.plan.findUnique({
      where: { id: dto.planId },
    });
    if (!plan || !plan.isActive) {
      throw new NotFoundException({
        code: 'PLAN_NOT_FOUND',
        message: 'Plan not found.',
      });
    }

    const now = new Date();
    await this.assertPlanPurchaseAllowed(userId, plan.id, now);

    const expiresMinutes =
      this.configService.get<number>('PENDING_ORDER_EXPIRE_MINUTES') ?? 30;
    const expiresAt = new Date(now.getTime() + expiresMinutes * 60 * 1000);

    if (idempotencyKey) {
      const existing = await this.prisma.paymentOrder.findFirst({
        where: {
          userId,
          idempotencyKey,
          status: {
            in: [PaymentOrderStatus.CREATED, PaymentOrderStatus.PENDING],
          },
          expiresAt: { gt: now },
        },
      });
      if (existing) {
        const metadata = (existing.metadataJson ?? {}) as {
          redirectUrl?: string;
        };
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
        status: {
          in: [PaymentOrderStatus.CREATED, PaymentOrderStatus.PENDING],
        },
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (reusable) {
      const metadata = (reusable.metadataJson ?? {}) as {
        redirectUrl?: string;
      };
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
    if (!redirectUrl) {
      throw new BadRequestException({
        code: 'PHONEPE_CONFIG_MISSING',
        message: 'PhonePe redirect URL missing.',
      });
    }

    const paymentMessage = this.configService.get<string>(
      'PHONEPE_PAYMENT_MESSAGE',
    );
    const disablePaymentRetry =
      this.configService.get<boolean>('PHONEPE_DISABLE_PAYMENT_RETRY') ?? false;

    const payload = {
      merchantOrderId: order.merchantTransactionId,
      amount: order.finalAmountPaise,
      redirectUrl: this.buildRedirectUrl(
        redirectUrl,
        order.merchantTransactionId,
      ),
      message: paymentMessage,
      expireAfterSeconds: expiresMinutes * 60,
      disablePaymentRetry,
    };

    const { redirectUrl: payUrl } =
      await this.phonepeService.initiatePayment(payload);

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

  async getOrderStatus(
    userId: string | undefined,
    merchantTransactionId: string,
  ) {
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

    const updated = await this.refreshOrderStatus(
      order.id,
      order.merchantTransactionId,
    );
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
    const order = await this.prisma.paymentOrder.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException({
        code: 'PAYMENT_ORDER_NOT_FOUND',
        message: 'Payment order not found.',
      });
    }

    return this.refreshOrderStatus(order.id, order.merchantTransactionId);
  }

  async refundOrder(orderId: string, dto: PaymentRefundDto) {
    const order = await this.prisma.paymentOrder.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException({
        code: 'PAYMENT_ORDER_NOT_FOUND',
        message: 'Payment order not found.',
      });
    }

    if (
      order.status !== PaymentOrderStatus.SUCCESS &&
      order.status !== PaymentOrderStatus.REFUNDED
    ) {
      throw new BadRequestException({
        code: 'PAYMENT_ORDER_NOT_REFUNDABLE',
        message: 'Only successful orders can be refunded.',
      });
    }

    const merchantRefundId = dto.merchantRefundId?.trim() || randomUUID();
    const existingRefund = await this.prisma.paymentEvent.findFirst({
      where: {
        providerEventId: merchantRefundId,
        eventType: 'PHONEPE_REFUND_INITIATED',
      },
    });

    if (existingRefund && existingRefund.orderId !== order.id) {
      throw new BadRequestException({
        code: 'PAYMENT_REFUND_ID_CONFLICT',
        message: 'merchantRefundId already exists for another order.',
      });
    }

    if (existingRefund) {
      return this.getRefundStatusByMerchantRefundId(merchantRefundId);
    }

    const refundedAmountPaise = await this.getSuccessfulRefundedAmountPaise(
      order.id,
    );
    const remainingRefundablePaise = Math.max(
      0,
      order.finalAmountPaise - refundedAmountPaise,
    );

    if (remainingRefundablePaise <= 0) {
      throw new BadRequestException({
        code: 'PAYMENT_ALREADY_REFUNDED',
        message: 'Order amount is already fully refunded.',
      });
    }

    const amountPaise = dto.amountPaise ?? remainingRefundablePaise;
    if (amountPaise <= 0) {
      throw new BadRequestException({
        code: 'PAYMENT_REFUND_INVALID_AMOUNT',
        message: 'Refund amount must be greater than zero.',
      });
    }
    if (amountPaise > remainingRefundablePaise) {
      throw new BadRequestException({
        code: 'PAYMENT_REFUND_AMOUNT_EXCEEDS_LIMIT',
        message: 'Refund amount exceeds remaining refundable amount.',
      });
    }

    const response = await this.phonepeService.refund({
      merchantRefundId,
      originalMerchantOrderId: order.merchantTransactionId,
      amount: amountPaise,
    });

    await this.prisma.paymentEvent.create({
      data: {
        orderId: order.id,
        providerEventId: merchantRefundId,
        eventType: 'PHONEPE_REFUND_INITIATED',
        payloadJson: this.toJsonValue({
          merchantRefundId,
          originalMerchantOrderId: order.merchantTransactionId,
          amountPaise,
          reason: dto.reason,
          providerRefundId: response.refundId,
          state: response.state,
          response,
        }),
        processedAt: new Date(),
      },
    });

    let refundStatus:
      | Awaited<ReturnType<PhonepeService['getRefundStatus']>>
      | undefined;
    try {
      refundStatus = await this.refreshRefundStatus(order.id, merchantRefundId);
    } catch (error) {
      void error;
    }

    const updatedOrder = await this.prisma.paymentOrder.findUnique({
      where: { id: order.id },
    });

    return {
      orderId: order.id,
      merchantRefundId,
      providerRefundId: response.refundId,
      requestedAmountPaise: amountPaise,
      state: refundStatus?.state ?? response.state,
      refundStatus,
      orderStatus: updatedOrder?.status ?? order.status,
    };
  }

  async getRefundStatusByMerchantRefundId(merchantRefundId: string) {
    const initiatedRefund = await this.prisma.paymentEvent.findFirst({
      where: {
        providerEventId: merchantRefundId,
        eventType: 'PHONEPE_REFUND_INITIATED',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!initiatedRefund) {
      throw new NotFoundException({
        code: 'PAYMENT_REFUND_NOT_FOUND',
        message: 'Payment refund not found.',
      });
    }

    const response = await this.refreshRefundStatus(
      initiatedRefund.orderId,
      merchantRefundId,
    );
    const order = await this.prisma.paymentOrder.findUnique({
      where: { id: initiatedRefund.orderId },
    });

    return {
      orderId: initiatedRefund.orderId,
      merchantRefundId,
      state: response.state,
      amountPaise: response.amount,
      originalMerchantOrderId: response.originalMerchantOrderId,
      paymentDetails: response.paymentDetails,
      orderStatus: order?.status,
    };
  }

  async handleWebhook(payload: unknown, authHeader?: string, rawBody?: string) {
    const normalizedPayload = this.normalizeWebhookPayload(payload, rawBody);
    const verified = this.phonepeService.validateWebhookSignature(
      authHeader,
      rawBody,
    );
    const verifiedPayload = verified?.payload as
      | {
          merchantOrderId?: string;
          originalMerchantOrderId?: string;
          orderId?: string;
          paymentDetails?: Array<{ transactionId?: string }>;
        }
      | undefined;

    const merchantTransactionId = this.extractMerchantTransactionId(
      normalizedPayload,
      verifiedPayload,
    );
    if (!merchantTransactionId) {
      return {
        success: true,
        acknowledged: true,
        reason: 'NO_MERCHANT_ORDER_ID',
      };
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
      verifiedPayload?.paymentDetails?.[0]?.transactionId ??
      verifiedPayload?.orderId ??
      (normalizedPayload as { eventId?: string }).eventId ??
      (normalizedPayload as { transactionId?: string }).transactionId ??
      (normalizedPayload as { payload?: { transactionId?: string } }).payload
        ?.transactionId ??
      merchantTransactionId;

    const existingEvent = providerEventId
      ? await this.prisma.paymentEvent.findFirst({
          where: {
            providerEventId,
            eventType: 'PHONEPE_WEBHOOK',
            orderId: orderRecord.id,
          },
        })
      : null;

    if (!existingEvent) {
      await this.prisma.paymentEvent.create({
        data: {
          orderId: orderRecord.id,
          providerEventId,
          eventType: 'PHONEPE_WEBHOOK',
          payloadJson: this.toJsonValue(normalizedPayload),
        },
      });
    }

    const order = await this.refreshOrderStatus(
      orderRecord.id,
      merchantTransactionId,
    );

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
        status: {
          in: [PaymentOrderStatus.CREATED, PaymentOrderStatus.PENDING],
        },
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
        status: {
          in: [PaymentOrderStatus.CREATED, PaymentOrderStatus.PENDING],
        },
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

  private async refreshOrderStatus(
    orderId: string,
    merchantTransactionId: string,
  ) {
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

    const statusResponse = await this.phonepeService.checkStatus(
      merchantTransactionId,
    );
    const normalized = this.normalizeStatus(statusResponse);
    const nextStatus = this.applyTransition(
      order.status,
      normalized.orderStatus,
    );

    const updated = await this.prisma.paymentOrder.update({
      where: { id: order.id },
      data: {
        status: nextStatus,
        finalAmountPaise: normalized.amountPaise ?? order.finalAmountPaise,
        completedAt:
          nextStatus === PaymentOrderStatus.SUCCESS ||
          nextStatus === PaymentOrderStatus.FAILED ||
          nextStatus === PaymentOrderStatus.EXPIRED ||
          nextStatus === PaymentOrderStatus.CANCELLED ||
          nextStatus === PaymentOrderStatus.REFUNDED
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
    if (
      nextStatus === PaymentOrderStatus.SUCCESS &&
      !updated.subscription &&
      updated.planId
    ) {
      try {
        activatedSubscription =
          await this.subscriptionsService.activateSubscription(
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
    state?: string;
    amount?: number;
    payableAmount?: number;
    paymentDetails?: Array<{
      transactionId?: string;
      state?: string;
      amount?: number;
      timestamp?: number;
    }>;
    errorCode?: string;
    detailedErrorCode?: string;
  }) {
    const latestAttempt = [...(response.paymentDetails ?? [])].sort(
      (a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0),
    )[0];

    const rawState =
      latestAttempt?.state ?? response.state ?? response.errorCode ?? '';
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
    } else if (['REFUNDED', 'REFUND_SUCCESS'].includes(state)) {
      orderStatus = PaymentOrderStatus.REFUNDED;
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
      providerTransactionId: latestAttempt?.transactionId,
      amountPaise:
        latestAttempt?.amount ?? response.payableAmount ?? response.amount,
    };
  }

  private applyTransition(
    current: PaymentOrderStatus,
    next: PaymentOrderStatus,
  ) {
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
        PaymentOrderStatus.REFUNDED,
      ],
      SUCCESS: [PaymentOrderStatus.REFUNDED],
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
    normalized: {
      transactionStatus: PaymentTransactionStatus;
      providerTransactionId?: string;
    },
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

  private async refreshRefundStatus(orderId: string, merchantRefundId: string) {
    const response =
      await this.phonepeService.getRefundStatus(merchantRefundId);

    await this.prisma.paymentEvent.create({
      data: {
        orderId,
        providerEventId: merchantRefundId,
        eventType: 'PHONEPE_REFUND_STATUS',
        payloadJson: this.toJsonValue({
          merchantRefundId,
          merchantId: response.merchantId,
          originalMerchantOrderId: response.originalMerchantOrderId,
          amount: response.amount,
          state: response.state,
          paymentDetails: response.paymentDetails,
        }),
        processedAt: this.isRefundTerminalState(response.state)
          ? new Date()
          : null,
      },
    });

    if (this.isRefundSuccessState(response.state)) {
      await this.applyRefundStatusToOrder(orderId);
    }

    return response;
  }

  private extractMerchantTransactionId(
    payload: Record<string, unknown>,
    verifiedPayload?: {
      merchantOrderId?: string;
      originalMerchantOrderId?: string;
    },
  ) {
    const callbackMerchantOrderId = verifiedPayload?.merchantOrderId;
    if (typeof callbackMerchantOrderId === 'string') {
      return callbackMerchantOrderId;
    }
    const callbackOriginalMerchantOrderId =
      verifiedPayload?.originalMerchantOrderId;
    if (typeof callbackOriginalMerchantOrderId === 'string') {
      return callbackOriginalMerchantOrderId;
    }

    const merchantOrderId = payload.merchantOrderId;
    if (typeof merchantOrderId === 'string') {
      return merchantOrderId;
    }
    const originalMerchantOrderId = payload.originalMerchantOrderId;
    if (typeof originalMerchantOrderId === 'string') {
      return originalMerchantOrderId;
    }

    const direct = payload.merchantTransactionId;
    if (typeof direct === 'string') {
      return direct;
    }
    const callbackPayloadOrderId = (
      payload as { payload?: { merchantOrderId?: string } }
    ).payload?.merchantOrderId;
    if (typeof callbackPayloadOrderId === 'string') {
      return callbackPayloadOrderId;
    }
    const nested = (payload as { data?: { merchantTransactionId?: string } })
      .data?.merchantTransactionId;
    if (typeof nested === 'string') {
      return nested;
    }
    const nestedMerchantOrderId = (
      payload as { data?: { merchantOrderId?: string } }
    ).data?.merchantOrderId;
    if (typeof nestedMerchantOrderId === 'string') {
      return nestedMerchantOrderId;
    }
    const nestedOriginalMerchantOrderId = (
      payload as { data?: { originalMerchantOrderId?: string } }
    ).data?.originalMerchantOrderId;
    if (typeof nestedOriginalMerchantOrderId === 'string') {
      return nestedOriginalMerchantOrderId;
    }
    const payloadNested = (
      payload as { payload?: { merchantTransactionId?: string } }
    ).payload?.merchantTransactionId;
    if (typeof payloadNested === 'string') {
      return payloadNested;
    }
    const payloadNestedMerchantOrderId = (
      payload as { payload?: { merchantOrderId?: string } }
    ).payload?.merchantOrderId;
    if (typeof payloadNestedMerchantOrderId === 'string') {
      return payloadNestedMerchantOrderId;
    }
    const payloadNestedOriginalMerchantOrderId = (
      payload as { payload?: { originalMerchantOrderId?: string } }
    ).payload?.originalMerchantOrderId;
    if (typeof payloadNestedOriginalMerchantOrderId === 'string') {
      return payloadNestedOriginalMerchantOrderId;
    }
    return undefined;
  }

  private normalizeWebhookPayload(payload: unknown, rawBody?: string) {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return payload as Record<string, unknown>;
    }

    const parseText = (input: string) => {
      const trimmed = input.trim();
      if (!trimmed) {
        return {};
      }
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
        return { raw: parsed };
      } catch {
        return { raw: trimmed };
      }
    };

    if (typeof payload === 'string') {
      return parseText(payload);
    }

    if (typeof rawBody === 'string') {
      return parseText(rawBody);
    }

    return {};
  }

  private buildRedirectUrl(
    baseRedirectUrl: string,
    merchantTransactionId: string,
  ) {
    const url = new URL(baseRedirectUrl);
    if (!url.searchParams.has('merchantTransactionId')) {
      url.searchParams.set('merchantTransactionId', merchantTransactionId);
    }
    return url.toString();
  }

  private async applyRefundStatusToOrder(orderId: string) {
    const order = await this.prisma.paymentOrder.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      return null;
    }

    const refundedAmountPaise =
      await this.getSuccessfulRefundedAmountPaise(orderId);
    if (refundedAmountPaise < order.finalAmountPaise) {
      return order;
    }

    if (order.status === PaymentOrderStatus.REFUNDED) {
      return order;
    }

    return this.prisma.paymentOrder.update({
      where: { id: order.id },
      data: {
        status: PaymentOrderStatus.REFUNDED,
        completedAt: new Date(),
      },
    });
  }

  private async getSuccessfulRefundedAmountPaise(orderId: string) {
    const events = await this.prisma.paymentEvent.findMany({
      where: {
        orderId,
        eventType: 'PHONEPE_REFUND_STATUS',
      },
      select: {
        id: true,
        providerEventId: true,
        payloadJson: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const seenRefundIds = new Set<string>();
    let totalRefunded = 0;

    for (const event of events) {
      const payload = (event.payloadJson ?? {}) as {
        merchantRefundId?: string;
        state?: string;
        amount?: number;
      };

      const refundId =
        event.providerEventId ??
        payload.merchantRefundId ??
        `event:${event.id}`;
      if (seenRefundIds.has(refundId)) {
        continue;
      }
      seenRefundIds.add(refundId);

      if (!this.isRefundSuccessState(payload.state)) {
        continue;
      }

      const amount = Number(payload.amount ?? 0);
      if (Number.isFinite(amount) && amount > 0) {
        totalRefunded += amount;
      }
    }

    return totalRefunded;
  }

  private isRefundSuccessState(state?: string | null) {
    const normalized = (state ?? '').toUpperCase();
    return ['REFUND_SUCCESS', 'SUCCESS', 'COMPLETED', 'REFUNDED'].includes(
      normalized,
    );
  }

  private isRefundTerminalState(state?: string | null) {
    const normalized = (state ?? '').toUpperCase();
    return [
      'REFUND_SUCCESS',
      'SUCCESS',
      'COMPLETED',
      'REFUNDED',
      'REFUND_FAILED',
      'FAILED',
      'FAILURE',
      'CANCELLED',
    ].includes(normalized);
  }

  private toJsonValue(value: unknown) {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  }

  private async resolveCoupon(
    userId: string,
    code: string,
    amountPaise: number,
  ) {
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

  private async redeemCoupon(
    orderId: string,
    userId: string,
    couponId: string,
  ) {
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

  private async assertPlanPurchaseAllowed(
    userId: string,
    planId: string,
    now: Date,
  ) {
    const activeSamePlan = await this.prisma.subscription.findFirst({
      where: {
        userId,
        planId,
        status: SubscriptionStatus.ACTIVE,
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, endsAt: true },
    });

    if (!activeSamePlan) {
      return;
    }

    if (!activeSamePlan.endsAt) {
      throw new BadRequestException({
        code: 'PLAN_REPURCHASE_BLOCKED',
        message: 'This lifetime subscription is already active.',
        details: {
          reason: 'LIFETIME_ACTIVE',
        },
      });
    }

    const renewalWindowDays = Number(
      this.configService.get<number>('SUBSCRIPTION_RENEWAL_WINDOW_DAYS') ??
        DEFAULT_RENEWAL_WINDOW_DAYS,
    );
    const safeRenewalWindowDays =
      Number.isFinite(renewalWindowDays) && renewalWindowDays >= 0
        ? renewalWindowDays
        : DEFAULT_RENEWAL_WINDOW_DAYS;

    const renewalOpensAt = new Date(
      activeSamePlan.endsAt.getTime() - safeRenewalWindowDays * DAY_MS,
    );
    if (now >= renewalOpensAt) {
      return;
    }

    throw new BadRequestException({
      code: 'PLAN_REPURCHASE_BLOCKED',
      message: `You can renew this plan only in the last ${safeRenewalWindowDays} days before expiry.`,
      details: {
        reason: 'ACTIVE_PLAN_EXISTS',
        endsAt: activeSamePlan.endsAt.toISOString(),
        renewalOpensAt: renewalOpensAt.toISOString(),
        renewalWindowDays: safeRenewalWindowDays,
      },
    });
  }
}
