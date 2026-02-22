import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { EntitlementKind, Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

type EntitlementConfig = {
  kind: EntitlementKind;
  scopeJson?: Record<string, unknown>;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIFETIME_DAYS = 36500;

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async activateSubscription(userId: string, planId: string, paymentOrderId?: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) {
      throw new Error('Plan not found or inactive.');
    }

    const now = new Date();
    const stacking =
      this.configService.get<boolean>('SUBSCRIPTION_STACKING') ?? true;

    const activeSubs = await this.prisma.subscription.findMany({
      where: {
        userId,
        status: SubscriptionStatus.ACTIVE,
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      orderBy: { endsAt: 'desc' },
    });

    const canStack = stacking && !activeSubs.some((sub) => !sub.endsAt);

    if (!canStack && activeSubs.length > 0) {
      await this.expireSubscriptionsByIds(activeSubs.map((sub) => sub.id), now, 'REPLACED');
    }

    const latestEnd = canStack
      ? activeSubs.find((sub) => sub.endsAt && sub.endsAt > now)?.endsAt
      : undefined;
    const startsAt = latestEnd ?? now;
    const isLifetime = this.isLifetimePlan(plan);
    const endsAt = isLifetime
      ? null
      : new Date(startsAt.getTime() + plan.durationDays * DAY_MS);

    const subscription = await this.prisma.subscription.create({
      data: {
        userId,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        startsAt,
        endsAt,
        paymentOrderId,
      },
    });

    await this.createEntitlementsForSubscription(subscription.id, userId, plan, startsAt, endsAt);

    return subscription;
  }

  @Cron('0 2 * * *')
  async expireSubscriptionsDaily() {
    await this.expireSubscriptions();
  }

  async expireSubscriptions() {
    const now = new Date();
    const expiring = await this.prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        endsAt: { lte: now },
      },
      select: { id: true },
    });

    if (expiring.length === 0) {
      return { expired: 0 };
    }

    await this.expireSubscriptionsByIds(expiring.map((item) => item.id), now, 'SUBSCRIPTION_EXPIRED');
    this.logger.log(`Expired ${expiring.length} subscriptions.`);

    return { expired: expiring.length };
  }

  private async expireSubscriptionsByIds(subscriptionIds: string[], now: Date, reason: string) {
    if (subscriptionIds.length === 0) {
      return;
    }

    await this.prisma.subscription.updateMany({
      where: { id: { in: subscriptionIds } },
      data: { status: SubscriptionStatus.EXPIRED },
    });

    await this.prisma.entitlement.updateMany({
      where: {
        subscriptionId: { in: subscriptionIds },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      data: { endsAt: now, revokedReason: reason },
    });
  }

  private async createEntitlementsForSubscription(
    subscriptionId: string,
    userId: string,
    plan: { featuresJson: Prisma.JsonValue | null },
    startsAt: Date,
    endsAt: Date | null,
  ) {
    const config = (plan.featuresJson ?? {}) as Record<string, unknown>;
    const entitlements =
      (Array.isArray(config.entitlements) ? config.entitlements : undefined) ??
      [{ kind: EntitlementKind.ALL }];

    const payload: EntitlementConfig[] = [];
    for (const item of entitlements) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const kind = (item as { kind?: EntitlementKind }).kind;
      if (!kind) {
        continue;
      }
      const scopeJson = (item as { scopeJson?: Record<string, unknown> }).scopeJson;
      payload.push({
        kind,
        scopeJson,
      });
    }

    if (payload.length === 0) {
      return;
    }

    await this.prisma.entitlement.createMany({
      data: payload.map((entry) => ({
        userId,
        kind: entry.kind,
        scopeJson: entry.scopeJson as Prisma.InputJsonValue | undefined,
        subscriptionId,
        startsAt,
        endsAt,
        reason: 'SUBSCRIPTION',
      })),
    });
  }

  private isLifetimePlan(plan: {
    durationDays: number;
    metadataJson: Prisma.JsonValue | null;
  }) {
    const metadata = plan.metadataJson;
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      const validity = (metadata as Record<string, unknown>).validity;
      if (validity && typeof validity === 'object' && !Array.isArray(validity)) {
        const unit = (validity as Record<string, unknown>).unit;
        if (typeof unit === 'string' && unit.toUpperCase() === 'LIFETIME') {
          return true;
        }
      }
    }

    const lifetimeDays = Number(
      this.configService.get<number>('SUBSCRIPTION_LIFETIME_DAYS') ??
        DEFAULT_LIFETIME_DAYS,
    );
    const safeLifetimeDays =
      Number.isFinite(lifetimeDays) && lifetimeDays > 0
        ? lifetimeDays
        : DEFAULT_LIFETIME_DAYS;

    return plan.durationDays >= safeLifetimeDays;
  }
}
