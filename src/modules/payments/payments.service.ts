import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CouponType,
  PaymentMandateStatus,
  PaymentOrderFlow,
  PaymentOrderStatus,
  PaymentTransactionStatus,
  Prisma,
  SubscriptionStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  CheckoutDto,
  CheckoutPreviewDto,
  PaymentOrderQueryDto,
  PaymentRefundDto,
} from './dto';
import { PhonepeService } from './phonepe/phonepe.service';
import { SubscriptionsService } from './subscriptions.service';
import { NotificationsService } from '../notifications/notifications.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RENEWAL_WINDOW_DAYS = 7;
const DEFAULT_AUTOPAY_MANDATE_VALIDITY_DAYS = 3650;
const DEFAULT_AUTOPAY_RETRY_MINUTES = 60;

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

  async previewCheckout(userId: string | undefined, dto: CheckoutPreviewDto) {
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

    const coupon = dto.couponCode
      ? await this.resolveCoupon(userId, dto.couponCode, plan.pricePaise)
      : null;
    const finalAmountPaise = coupon ? coupon.finalAmountPaise : plan.pricePaise;
    const autoPay = this.resolveAutoPayDetails(plan, dto.enableAutoPay === true);

    return {
      plan: {
        id: plan.id,
        key: plan.key,
        name: plan.name,
        tier: plan.tier,
        durationDays: plan.durationDays,
        validity: this.extractPlanValidity(plan),
      },
      baseAmountPaise: plan.pricePaise,
      discountPaise: coupon?.discountPaise ?? 0,
      finalAmountPaise,
      coupon: coupon
        ? {
            code: dto.couponCode?.trim().toUpperCase() ?? '',
            discountPaise: coupon.discountPaise,
          }
        : null,
      autoPay,
    };
  }

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
    const autoPay = this.resolveAutoPayDetails(plan, dto.enableAutoPay === true);
    if (autoPay.requested && !autoPay.eligible) {
      throw new BadRequestException({
        code: 'AUTOPAY_NOT_AVAILABLE',
        message: autoPay.message,
      });
    }
    const orderFlow = autoPay.requested
      ? PaymentOrderFlow.AUTOPAY_SETUP
      : PaymentOrderFlow.ONE_TIME;

    const expiresMinutes =
      this.configService.get<number>('PENDING_ORDER_EXPIRE_MINUTES') ?? 30;
    const expiresAt = new Date(now.getTime() + expiresMinutes * 60 * 1000);

    if (idempotencyKey) {
      const existing = await this.prisma.paymentOrder.findFirst({
        where: {
          userId,
          idempotencyKey,
          flow: orderFlow,
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
            flow: existing.flow,
            autoPay: {
              enabled: existing.flow === PaymentOrderFlow.AUTOPAY_SETUP,
            },
          };
        }
      }
    }

    const reusable = await this.prisma.paymentOrder.findFirst({
      where: {
        userId,
        planId: plan.id,
        flow: orderFlow,
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
          flow: reusable.flow,
          autoPay: {
            enabled: reusable.flow === PaymentOrderFlow.AUTOPAY_SETUP,
          },
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
        flow: orderFlow,
        idempotencyKey: idempotencyKey ?? undefined,
        expiresAt,
        metadataJson: {
          couponCode: dto.couponCode,
          discountPaise: coupon?.discountPaise ?? 0,
          autoPay,
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

    const checkoutRedirectUrl = this.buildRedirectUrl(
      redirectUrl,
      order.merchantTransactionId,
    );

    let payUrl = '';
    if (order.flow === PaymentOrderFlow.AUTOPAY_SETUP) {
      const merchantSubscriptionId = this.buildMerchantSubscriptionId(
        userId,
        plan.id,
      );
      const mandateValidityDays = Number(
        this.configService.get<number>(
          'PHONEPE_SUBSCRIPTION_MANDATE_VALIDITY_DAYS',
        ) ?? DEFAULT_AUTOPAY_MANDATE_VALIDITY_DAYS,
      );
      const mandateExpireAt = new Date(
        now.getTime() + Math.max(30, mandateValidityDays) * DAY_MS,
      );

      const setupResponse = await this.phonepeService.setupSubscription({
        merchantOrderId: order.merchantTransactionId,
        amount: order.finalAmountPaise,
        redirectUrl: checkoutRedirectUrl,
        cancelRedirectUrl: checkoutRedirectUrl,
        expireAfterSeconds: expiresMinutes * 60,
        merchantSubscriptionId,
        authWorkflowType:
          this.configService.get<string>(
            'PHONEPE_SUBSCRIPTION_AUTH_WORKFLOW_TYPE',
          ) ?? 'TRANSACTION',
        amountType:
          this.configService.get<string>('PHONEPE_SUBSCRIPTION_AMOUNT_TYPE') ??
          'FIXED',
        maxAmount: plan.pricePaise,
        frequency:
          this.configService.get<string>('PHONEPE_SUBSCRIPTION_FREQUENCY') ??
          'ON_DEMAND',
        expireAt: mandateExpireAt.getTime(),
        metaInfo: {
          udf1: plan.id,
          udf2: plan.key,
        },
      });

      if (!setupResponse.redirectUrl) {
        throw new BadRequestException({
          code: 'PHONEPE_REDIRECT_MISSING',
          message: 'PhonePe subscription setup redirect URL missing.',
          details: setupResponse,
        });
      }
      payUrl = setupResponse.redirectUrl;

      await this.prisma.paymentOrder.update({
        where: { id: order.id },
        data: {
          status: PaymentOrderStatus.PENDING,
          metadataJson: {
            ...(order.metadataJson as Record<string, unknown> | undefined),
            redirectUrl: payUrl,
            merchantSubscriptionId,
            mandateExpireAt: mandateExpireAt.toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
    } else {
      const paymentMessage = this.configService.get<string>(
        'PHONEPE_PAYMENT_MESSAGE',
      );
      const disablePaymentRetry =
        this.configService.get<boolean>('PHONEPE_DISABLE_PAYMENT_RETRY') ??
        false;

      const payload = {
        merchantOrderId: order.merchantTransactionId,
        amount: order.finalAmountPaise,
        redirectUrl: checkoutRedirectUrl,
        message: paymentMessage,
        expireAfterSeconds: expiresMinutes * 60,
        disablePaymentRetry,
      };

      const standardResponse = await this.phonepeService.initiatePayment(payload);
      payUrl = standardResponse.redirectUrl;

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
    }

    return {
      redirectUrl: payUrl,
      merchantTransactionId: order.merchantTransactionId,
      orderId: order.id,
      amountPaise: order.finalAmountPaise,
      flow: order.flow,
      autoPay: {
        enabled: order.flow === PaymentOrderFlow.AUTOPAY_SETUP,
      },
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

  async processDueAutoPayCharges(limit = 10) {
    const now = new Date();
    const mandates = await this.prisma.paymentMandate.findMany({
      where: {
        status: PaymentMandateStatus.ACTIVE,
        nextChargeAt: { lte: now },
      },
      orderBy: { nextChargeAt: 'asc' },
      take: limit,
      include: {
        plan: {
          select: {
            id: true,
            key: true,
            name: true,
            durationDays: true,
            pricePaise: true,
            metadataJson: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
      },
    });

    let initiated = 0;
    for (const mandate of mandates) {
      try {
        const started = await this.initiateAutoPayChargeForMandate(mandate, now);
        if (started) {
          initiated += 1;
        }
      } catch (error) {
        void error;
      }
    }

    return { scanned: mandates.length, initiated };
  }

  async sendAutoPayRenewalReminders(limit = 40) {
    const reminderHours = Number(
      this.configService.get<number>('PAYMENTS_AUTOPAY_REMINDER_HOURS') ?? 24,
    );
    const safeReminderHours =
      Number.isFinite(reminderHours) && reminderHours > 0 ? reminderHours : 24;

    const now = new Date();
    const until = new Date(now.getTime() + safeReminderHours * 60 * 60 * 1000);
    const mandates = await this.prisma.paymentMandate.findMany({
      where: {
        status: PaymentMandateStatus.ACTIVE,
        nextChargeAt: { gte: now, lte: until },
      },
      orderBy: { nextChargeAt: 'asc' },
      take: limit,
      include: {
        plan: { select: { name: true } },
        user: { select: { id: true, email: true, fullName: true } },
      },
    });

    let notified = 0;
    for (const mandate of mandates) {
      if (!mandate.user.email || !mandate.nextChargeAt) {
        continue;
      }

      const metadata = (mandate.metadataJson ?? {}) as Record<string, unknown>;
      const reminderKey = mandate.nextChargeAt.toISOString();
      if (metadata.lastReminderFor === reminderKey) {
        continue;
      }

      this.notificationsService
        .sendAutopayRenewalReminderEmail({
          userId: mandate.user.id,
          email: mandate.user.email,
          planName: mandate.plan.name,
          amountPaise: mandate.amountPaise,
          chargeAt: mandate.nextChargeAt,
        })
        .catch(() => undefined);

      await this.prisma.paymentMandate.update({
        where: { id: mandate.id },
        data: {
          metadataJson: this.toJsonValue({
            ...(metadata ?? {}),
            lastReminderFor: reminderKey,
          }),
        },
      });
      notified += 1;
    }

    return { scanned: mandates.length, notified };
  }

  private async initiateAutoPayChargeForMandate(
    mandate: {
      id: string;
      userId: string;
      planId: string;
      merchantSubscriptionId: string;
      providerSubscriptionId: string | null;
      amountPaise: number;
      nextChargeAt: Date | null;
      metadataJson: Prisma.JsonValue | null;
      user: { id: string; email: string | null; fullName: string | null };
      plan: {
        id: string;
        key: string;
        name: string;
        durationDays: number;
        pricePaise: number;
        metadataJson: Prisma.JsonValue | null;
      };
    },
    now: Date,
  ) {
    const existingPending = await this.prisma.paymentOrder.findFirst({
      where: {
        mandateId: mandate.id,
        flow: PaymentOrderFlow.AUTOPAY_CHARGE,
        status: {
          in: [PaymentOrderStatus.CREATED, PaymentOrderStatus.PENDING],
        },
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    if (existingPending) {
      return false;
    }

    const expiresMinutes =
      this.configService.get<number>('PENDING_ORDER_EXPIRE_MINUTES') ?? 30;
    const expiresAt = new Date(now.getTime() + expiresMinutes * 60 * 1000);
    const scheduledFor = mandate.nextChargeAt ?? now;
    const retryMinutes = Number(
      this.configService.get<number>('PAYMENTS_AUTOPAY_RETRY_MINUTES') ??
        DEFAULT_AUTOPAY_RETRY_MINUTES,
    );
    const safeRetryMinutes =
      Number.isFinite(retryMinutes) && retryMinutes > 0
        ? retryMinutes
        : DEFAULT_AUTOPAY_RETRY_MINUTES;

    const order = await this.prisma.paymentOrder.create({
      data: {
        userId: mandate.userId,
        planId: mandate.planId,
        mandateId: mandate.id,
        merchantTransactionId: randomUUID(),
        merchantUserId: mandate.userId,
        amountPaise: mandate.amountPaise,
        finalAmountPaise: mandate.amountPaise,
        status: PaymentOrderStatus.CREATED,
        flow: PaymentOrderFlow.AUTOPAY_CHARGE,
        expiresAt,
        metadataJson: this.toJsonValue({
          scheduledFor: scheduledFor.toISOString(),
          autoPay: {
            mandateId: mandate.id,
            merchantSubscriptionId: mandate.merchantSubscriptionId,
            providerSubscriptionId:
              mandate.providerSubscriptionId ?? mandate.merchantSubscriptionId,
          },
        }),
      },
    });

    await this.prisma.paymentMandate.update({
      where: { id: mandate.id },
      data: {
        nextChargeAt: new Date(now.getTime() + safeRetryMinutes * 60 * 1000),
      },
    });

    const merchantSubscriptionId = mandate.merchantSubscriptionId;
    const notifyBeforeExecute =
      this.configService.get<boolean>('PHONEPE_SUBSCRIPTION_NOTIFY_BEFORE_EXECUTE') ??
      true;
    if (notifyBeforeExecute) {
      try {
        const notifyResponse = await this.phonepeService.notifySubscriptionRedemption(
          {
            merchantSubscriptionId,
            merchantOrderId: order.merchantTransactionId,
            amount: order.finalAmountPaise,
            expireAt: expiresAt.getTime(),
            metaInfo: {
              udf1: order.id,
              udf2: mandate.id,
            },
          },
        );

        await this.prisma.paymentEvent.create({
          data: {
            orderId: order.id,
            providerEventId:
              (notifyResponse.orderId as string | undefined) ??
              order.merchantTransactionId,
            eventType: 'PHONEPE_AUTOPAY_NOTIFY',
            payloadJson: this.toJsonValue(notifyResponse),
            processedAt: new Date(),
          },
        });
      } catch (error) {
        await this.prisma.paymentEvent.create({
          data: {
            orderId: order.id,
            providerEventId: order.merchantTransactionId,
            eventType: 'PHONEPE_AUTOPAY_NOTIFY_FAILED',
            payloadJson: this.toJsonValue({
              message: (error as { message?: string } | undefined)?.message,
            }),
            processedAt: new Date(),
          },
        });
      }
    }

    const executeResponse = await this.phonepeService.executeSubscriptionRedemption(
      {
        merchantOrderId: order.merchantTransactionId,
      },
    );

    await this.prisma.paymentEvent.create({
      data: {
        orderId: order.id,
        providerEventId:
          (executeResponse.orderId as string | undefined) ??
          executeResponse.paymentDetails?.[0]?.transactionId ??
          order.merchantTransactionId,
        eventType: 'PHONEPE_AUTOPAY_EXECUTE',
        payloadJson: this.toJsonValue(executeResponse),
        processedAt: new Date(),
      },
    });

    const normalized = this.normalizeStatus(executeResponse);
    const nextStatus = this.applyTransition(
      PaymentOrderStatus.CREATED,
      normalized.orderStatus,
    );

    await this.prisma.paymentOrder.update({
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
    });
    await this.upsertTransaction(order.id, normalized, executeResponse);

    if (
      nextStatus === PaymentOrderStatus.SUCCESS ||
      nextStatus === PaymentOrderStatus.FAILED ||
      nextStatus === PaymentOrderStatus.EXPIRED ||
      nextStatus === PaymentOrderStatus.CANCELLED
    ) {
      const updatedOrder = await this.prisma.paymentOrder.findUnique({
        where: { id: order.id },
        include: {
          subscription: true,
          user: { select: { id: true, email: true, fullName: true } },
          plan: {
            select: {
              id: true,
              key: true,
              name: true,
              durationDays: true,
              pricePaise: true,
              metadataJson: true,
            },
          },
          mandate: true,
        },
      });

      if (updatedOrder) {
        if (nextStatus === PaymentOrderStatus.SUCCESS) {
          await this.handleAutoPayChargeSuccess(updatedOrder);
        } else {
          await this.handleAutoPayChargeFailure(updatedOrder);
        }
      }
    }

    return true;
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
      include: {
        subscription: true,
        mandate: true,
      },
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

    const statusResponse =
      order.flow === PaymentOrderFlow.AUTOPAY_SETUP
        ? await this.phonepeService.checkSubscriptionSetupStatus(
            merchantTransactionId,
          )
        : order.flow === PaymentOrderFlow.AUTOPAY_CHARGE
          ? await this.phonepeService.checkSubscriptionRedemptionStatus(
              merchantTransactionId,
            )
          : await this.phonepeService.checkStatus(merchantTransactionId);
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
        plan: {
          select: {
            id: true,
            key: true,
            name: true,
            durationDays: true,
            pricePaise: true,
            metadataJson: true,
          },
        },
        mandate: true,
      },
    });

    await this.upsertTransaction(order.id, normalized, statusResponse);

    if (nextStatus === PaymentOrderStatus.SUCCESS) {
      if (updated.flow === PaymentOrderFlow.AUTOPAY_SETUP) {
        await this.handleAutoPaySetupSuccess(
          updated,
          statusResponse as unknown as Record<string, unknown>,
        );
      } else if (updated.flow === PaymentOrderFlow.AUTOPAY_CHARGE) {
        await this.handleAutoPayChargeSuccess(updated);
      } else {
        await this.handleOneTimeOrderSuccess(updated);
      }
    } else if (
      updated.flow === PaymentOrderFlow.AUTOPAY_CHARGE &&
      (nextStatus === PaymentOrderStatus.FAILED ||
        nextStatus === PaymentOrderStatus.EXPIRED ||
        nextStatus === PaymentOrderStatus.CANCELLED)
    ) {
      await this.handleAutoPayChargeFailure(updated);
    }

    if (
      nextStatus === PaymentOrderStatus.SUCCESS &&
      updated.couponId &&
      updated.flow !== PaymentOrderFlow.AUTOPAY_CHARGE
    ) {
      await this.redeemCoupon(updated.id, updated.userId, updated.couponId);
    }

    return updated;
  }

  private async handleOneTimeOrderSuccess(order: {
    id: string;
    userId: string;
    planId: string | null;
    finalAmountPaise: number;
    subscription?: { id: string; endsAt: Date | null } | null;
    user?: { id: string; email: string | null; fullName: string | null } | null;
    plan?: { id: string; name: string; durationDays: number } | null;
  }) {
    if (order.user?.email) {
      this.notificationsService
        .sendPaymentSuccessEmail({
          userId: order.user.id,
          email: order.user.email,
          amountPaise: order.finalAmountPaise,
          planName: order.plan?.name,
          orderId: order.id,
        })
        .catch(() => undefined);
    }

    let activatedSubscription = order.subscription;
    if (!activatedSubscription && order.planId) {
      try {
        activatedSubscription = await this.subscriptionsService.activateSubscription(
          order.userId,
          order.planId,
          order.id,
        );
      } catch (error) {
        void error;
      }
    }

    if (activatedSubscription && order.user?.email) {
      this.notificationsService
        .sendSubscriptionActivatedEmail({
          userId: order.user.id,
          email: order.user.email,
          planName: order.plan?.name,
          endsAt: activatedSubscription.endsAt ?? null,
        })
        .catch(() => undefined);
    }
  }

  private async handleAutoPaySetupSuccess(
    order: {
      id: string;
      userId: string;
      planId: string | null;
      mandateId: string | null;
      finalAmountPaise: number;
      metadataJson: Prisma.JsonValue | null;
      user?: { id: string; email: string | null; fullName: string | null } | null;
      plan?: {
        id: string;
        key: string;
        name: string;
        durationDays: number;
        pricePaise: number;
        metadataJson: Prisma.JsonValue | null;
      } | null;
      subscription?: { id: string; endsAt: Date | null } | null;
    },
    statusResponse: Record<string, unknown>,
  ) {
    if (!order.planId) {
      return;
    }

    const metadata = (order.metadataJson ?? {}) as Record<string, unknown>;
    const merchantSubscriptionId =
      (typeof metadata.merchantSubscriptionId === 'string'
        ? metadata.merchantSubscriptionId
        : undefined) ??
      this.buildMerchantSubscriptionId(order.userId, order.planId);

    const paymentFlow = (statusResponse.paymentFlow ?? {}) as Record<
      string,
      unknown
    >;
    const providerSubscriptionId =
      (typeof paymentFlow.subscriptionId === 'string'
        ? paymentFlow.subscriptionId
        : undefined) ??
      (typeof paymentFlow.merchantSubscriptionId === 'string'
        ? paymentFlow.merchantSubscriptionId
        : undefined) ??
      merchantSubscriptionId;

    const fetchedPlan =
      order.plan ??
      (await this.prisma.plan.findUnique({
        where: { id: order.planId },
        select: {
          id: true,
          key: true,
          name: true,
          durationDays: true,
          pricePaise: true,
          metadataJson: true,
        },
      }));
    const interval = this.resolveAutoPayInterval(
      fetchedPlan ?? {
        durationDays: 30,
        metadataJson: null,
      },
    );

    const startsAt = new Date();
    const nextChargeAt = this.addAutoPayInterval(startsAt, interval);
    const existingMandate = await this.prisma.paymentMandate.findFirst({
      where: {
        OR: [
          { setupOrderId: order.id },
          { merchantSubscriptionId },
          { providerSubscriptionId },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    const mandate = existingMandate
      ? await this.prisma.paymentMandate.update({
          where: { id: existingMandate.id },
          data: {
            setupOrderId: order.id,
            merchantSubscriptionId,
            providerSubscriptionId,
            status: PaymentMandateStatus.ACTIVE,
            amountPaise:
              fetchedPlan?.pricePaise ??
              order.plan?.pricePaise ??
              order.finalAmountPaise,
            intervalUnit: interval.unit,
            intervalCount: interval.count,
            startsAt,
            nextChargeAt,
            pausedAt: null,
            revokedAt: null,
            metadataJson: this.toJsonValue({
              ...(existingMandate.metadataJson as Record<string, unknown> | null),
              setupOrderId: order.id,
              phonepePaymentFlow: paymentFlow,
            }),
          },
        })
      : await this.prisma.paymentMandate.create({
          data: {
            userId: order.userId,
            planId: order.planId,
            setupOrderId: order.id,
            merchantSubscriptionId,
            providerSubscriptionId,
            status: PaymentMandateStatus.ACTIVE,
            amountPaise:
              fetchedPlan?.pricePaise ??
              order.plan?.pricePaise ??
              order.finalAmountPaise,
            intervalUnit: interval.unit,
            intervalCount: interval.count,
            startsAt,
            nextChargeAt,
            metadataJson: this.toJsonValue({
              setupOrderId: order.id,
              phonepePaymentFlow: paymentFlow,
            }),
          },
        });

    if (order.mandateId !== mandate.id) {
      await this.prisma.paymentOrder.update({
        where: { id: order.id },
        data: {
          mandateId: mandate.id,
          metadataJson: this.toJsonValue({
            ...(metadata ?? {}),
            merchantSubscriptionId,
            providerSubscriptionId,
            autoPay: {
              ...(metadata.autoPay as Record<string, unknown> | undefined),
              requested: true,
              eligible: true,
              enabled: true,
            },
          }),
        },
      });
    }

    await this.handleOneTimeOrderSuccess(order);

    if (order.user?.email) {
      this.notificationsService
        .sendAutopayEnabledEmail({
          userId: order.user.id,
          email: order.user.email,
          planName: order.plan?.name,
          nextChargeAt,
        })
        .catch(() => undefined);
    }
  }

  private async handleAutoPayChargeSuccess(order: {
    id: string;
    userId: string;
    planId: string | null;
    mandateId: string | null;
    finalAmountPaise: number;
    metadataJson: Prisma.JsonValue | null;
    user?: { id: string; email: string | null; fullName: string | null } | null;
    plan?: {
      id: string;
      key: string;
      name: string;
      durationDays: number;
      pricePaise: number;
      metadataJson: Prisma.JsonValue | null;
    } | null;
    subscription?: { id: string; endsAt: Date | null } | null;
    mandate?: {
      id: string;
      intervalUnit: string;
      intervalCount: number;
      nextChargeAt: Date | null;
      status: PaymentMandateStatus;
    } | null;
  }) {
    const now = new Date();
    const metadata = (order.metadataJson ?? {}) as Record<string, unknown>;

    if (order.mandateId) {
      const mandate =
        order.mandate ??
        (await this.prisma.paymentMandate.findUnique({
          where: { id: order.mandateId },
        }));

      if (mandate) {
        const scheduledFor =
          typeof metadata.scheduledFor === 'string'
            ? new Date(metadata.scheduledFor)
            : mandate.nextChargeAt ?? now;
        const baseDate =
          Number.isFinite(scheduledFor.getTime()) &&
          scheduledFor.getTime() > now.getTime()
            ? scheduledFor
            : now;
        const nextChargeAt = this.addAutoPayInterval(baseDate, {
          unit: mandate.intervalUnit,
          count: Math.max(1, mandate.intervalCount),
        });

        await this.prisma.paymentMandate.update({
          where: { id: mandate.id },
          data: {
            status: PaymentMandateStatus.ACTIVE,
            lastChargedAt: now,
            nextChargeAt,
            pausedAt: null,
            revokedAt: null,
          },
        });

        if (order.user?.email) {
          this.notificationsService
            .sendAutopayRenewalSuccessEmail({
              userId: order.user.id,
              email: order.user.email,
              planName: order.plan?.name,
              amountPaise: order.finalAmountPaise,
              chargedAt: now,
              nextChargeAt,
            })
            .catch(() => undefined);
        }
      }
    }

    await this.handleOneTimeOrderSuccess(order);
  }

  private async handleAutoPayChargeFailure(order: {
    mandateId: string | null;
    user?: { id: string; email: string | null; fullName: string | null } | null;
    plan?: { name: string } | null;
  }) {
    const now = new Date();
    const retryMinutes = Number(
      this.configService.get<number>('PAYMENTS_AUTOPAY_RETRY_MINUTES') ??
        DEFAULT_AUTOPAY_RETRY_MINUTES,
    );
    const safeRetryMinutes =
      Number.isFinite(retryMinutes) && retryMinutes > 0
        ? retryMinutes
        : DEFAULT_AUTOPAY_RETRY_MINUTES;

    if (order.mandateId) {
      await this.prisma.paymentMandate.update({
        where: { id: order.mandateId },
        data: {
          status: PaymentMandateStatus.ACTIVE,
          nextChargeAt: new Date(now.getTime() + safeRetryMinutes * 60 * 1000),
        },
      });
    }

    if (order.user?.email) {
      this.notificationsService
        .sendAutopayRenewalFailureEmail({
          userId: order.user.id,
          email: order.user.email,
          planName: order.plan?.name,
          failedAt: now,
          retryAfterMinutes: safeRetryMinutes,
        })
        .catch(() => undefined);
    }
  }

  private normalizeStatus(response: {
    state?: string;
    amount?: number;
    payableAmount?: number;
    transactionId?: string;
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
      providerTransactionId: latestAttempt?.transactionId ?? response.transactionId,
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

  private extractPlanValidity(plan: {
    durationDays: number;
    metadataJson: Prisma.JsonValue | null;
  }) {
    const metadata =
      plan.metadataJson &&
      typeof plan.metadataJson === 'object' &&
      !Array.isArray(plan.metadataJson)
        ? (plan.metadataJson as Record<string, unknown>)
        : null;
    const rawValidity =
      metadata?.validity &&
      typeof metadata.validity === 'object' &&
      !Array.isArray(metadata.validity)
        ? (metadata.validity as Record<string, unknown>)
        : null;

    const unitRaw = typeof rawValidity?.unit === 'string' ? rawValidity.unit : '';
    const valueRaw =
      typeof rawValidity?.value === 'number' ? rawValidity.value : undefined;
    const labelRaw =
      typeof rawValidity?.label === 'string' ? rawValidity.label : undefined;

    const durationDays =
      typeof rawValidity?.durationDays === 'number' &&
      Number.isFinite(rawValidity.durationDays)
        ? rawValidity.durationDays
        : plan.durationDays;

    if (unitRaw) {
      return {
        unit: unitRaw.toUpperCase(),
        value: valueRaw,
        durationDays,
        label: labelRaw,
      };
    }

    if (durationDays % 365 === 0) {
      const value = Math.max(1, Math.round(durationDays / 365));
      return {
        unit: 'YEARS',
        value,
        durationDays,
        label: `${value} year${value === 1 ? '' : 's'}`,
      };
    }

    if (durationDays % 30 === 0) {
      const value = Math.max(1, Math.round(durationDays / 30));
      return {
        unit: 'MONTHS',
        value,
        durationDays,
        label: `${value} month${value === 1 ? '' : 's'}`,
      };
    }

    return {
      unit: 'DAYS',
      value: durationDays,
      durationDays,
      label: `${durationDays} day${durationDays === 1 ? '' : 's'}`,
    };
  }

  private resolveAutoPayDetails(
    plan: {
      durationDays: number;
      metadataJson: Prisma.JsonValue | null;
    },
    requested: boolean,
  ) {
    const validity = this.extractPlanValidity(plan);
    const lifetimeDays = Number(
      this.configService.get<number>('SUBSCRIPTION_LIFETIME_DAYS') ?? 36500,
    );
    const safeLifetimeDays =
      Number.isFinite(lifetimeDays) && lifetimeDays > 0 ? lifetimeDays : 36500;
    const isLifetime =
      validity.unit === 'LIFETIME' || plan.durationDays >= safeLifetimeDays;

    if (isLifetime) {
      return {
        requested,
        eligible: false,
        reason: 'LIFETIME_PLAN',
        message: 'AutoPay is not supported for lifetime plans.',
        intervalUnit: 'MONTH',
        intervalCount: 1,
      };
    }

    let intervalUnit: 'DAY' | 'MONTH' | 'YEAR' = 'MONTH';
    let intervalCount = 1;

    if (validity.unit === 'YEARS') {
      intervalUnit = 'YEAR';
      intervalCount = Math.max(1, Number(validity.value ?? 1));
    } else if (validity.unit === 'MONTHS') {
      intervalUnit = 'MONTH';
      intervalCount = Math.max(1, Number(validity.value ?? 1));
    } else if (validity.unit === 'DAYS') {
      intervalUnit = 'DAY';
      intervalCount = Math.max(1, Number(validity.value ?? plan.durationDays));
    } else {
      intervalUnit = 'DAY';
      intervalCount = Math.max(1, plan.durationDays);
    }

    return {
      requested,
      eligible: true,
      reason: 'AVAILABLE',
      message:
        intervalUnit === 'DAY'
          ? `AutoPay will renew every ${intervalCount} day${intervalCount === 1 ? '' : 's'}.`
          : intervalUnit === 'MONTH'
            ? `AutoPay will renew every ${intervalCount} month${intervalCount === 1 ? '' : 's'}.`
            : `AutoPay will renew every ${intervalCount} year${intervalCount === 1 ? '' : 's'}.`,
      intervalUnit,
      intervalCount,
    };
  }

  private resolveAutoPayInterval(plan: {
    durationDays: number;
    metadataJson: Prisma.JsonValue | null;
  }) {
    const details = this.resolveAutoPayDetails(plan, true);
    if (!details.eligible) {
      return {
        unit: 'MONTH',
        count: 1,
      };
    }
    return {
      unit: details.intervalUnit,
      count: details.intervalCount,
    };
  }

  private addAutoPayInterval(
    fromDate: Date,
    interval: { unit: string; count: number },
  ) {
    const next = new Date(fromDate);
    const count = Math.max(1, interval.count);

    if (interval.unit === 'YEAR') {
      next.setFullYear(next.getFullYear() + count);
      return next;
    }

    if (interval.unit === 'DAY') {
      next.setDate(next.getDate() + count);
      return next;
    }

    next.setMonth(next.getMonth() + count);
    return next;
  }

  private buildMerchantSubscriptionId(userId: string, planId: string) {
    const user = userId.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
    const plan = planId.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
    const nonce = randomUUID().replace(/-/g, '').toUpperCase().slice(0, 16);
    return `SUB_${user}_${plan}_${nonce}`.slice(0, 60);
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
