import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  PlanCreateDto,
  PlanDurationUnit,
  PlanQueryDto,
  PlanUpdateDto,
} from './dto';

type PlanValidity = {
  unit: PlanDurationUnit;
  value: number | null;
  durationDays: number;
  label: string;
};

type ActivePlanSubscription = {
  id: string;
  planId: string;
  startsAt: Date | null;
  endsAt: Date | null;
  status: SubscriptionStatus;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RENEWAL_WINDOW_DAYS = 7;
const DEFAULT_LIFETIME_DAYS = 36500;

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async listPublicPlans() {
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { pricePaise: 'asc' },
    });

    return plans.map((plan) => this.serializePlan(plan));
  }

  async listPlansForUser(userId: string) {
    const now = new Date();
    const renewalWindowDays = this.resolveRenewalWindowDays();

    const [plans, subscriptions] = await this.prisma.$transaction([
      this.prisma.plan.findMany({
        where: { isActive: true },
        orderBy: { pricePaise: 'asc' },
      }),
      this.prisma.subscription.findMany({
        where: {
          userId,
          status: SubscriptionStatus.ACTIVE,
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          planId: true,
          startsAt: true,
          endsAt: true,
          status: true,
        },
      }),
    ]);

    const subscriptionByPlan = new Map<string, ActivePlanSubscription>();
    for (const subscription of subscriptions) {
      const current = subscriptionByPlan.get(subscription.planId);
      if (!current) {
        subscriptionByPlan.set(subscription.planId, subscription);
        continue;
      }

      if (!current.endsAt && subscription.endsAt) {
        continue;
      }

      if (
        subscription.endsAt &&
        (!current.endsAt || subscription.endsAt > current.endsAt)
      ) {
        subscriptionByPlan.set(subscription.planId, subscription);
      }
    }

    return plans.map((plan) => {
      const activeSubscription = subscriptionByPlan.get(plan.id) ?? null;
      const purchase = this.getPurchaseStatus(
        activeSubscription,
        now,
        renewalWindowDays,
      );

      return {
        ...this.serializePlan(plan),
        activeSubscription,
        purchase,
      };
    });
  }

  async listAdminPlans(query: PlanQueryDto) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);
    const isActive =
      query.isActive === undefined ? undefined : query.isActive === 'true';

    const where = {
      isActive,
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.plan.count({ where }),
      this.prisma.plan.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data: data.map((plan) => this.serializePlan(plan)), total, page, pageSize };
  }

  async createPlan(dto: PlanCreateDto) {
    const existing = await this.prisma.plan.findUnique({ where: { key: dto.key } });
    if (existing) {
      throw new BadRequestException({
        code: 'PLAN_KEY_EXISTS',
        message: 'Plan key already exists.',
      });
    }

    const { durationDays, validity } = this.resolveDuration(
      {
        durationDays: dto.durationDays,
        durationUnit: dto.durationUnit,
        durationValue: dto.durationValue,
      },
      null,
      null,
    );

    const metadataJson = this.mergeMetadataWithValidity(dto.metadataJson, validity);

    const created = await this.prisma.plan.create({
      data: {
        key: dto.key,
        name: dto.name,
        tier: dto.tier,
        pricePaise: dto.pricePaise,
        durationDays,
        isActive: dto.isActive ?? true,
        metadataJson,
        featuresJson: dto.featuresJson
          ? (dto.featuresJson as Prisma.InputJsonValue)
          : undefined,
      },
    });

    return this.serializePlan(created);
  }

  async updatePlan(planId: string, dto: PlanUpdateDto) {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundException({
        code: 'PLAN_NOT_FOUND',
        message: 'Plan not found.',
      });
    }

    if (dto.key && dto.key !== plan.key) {
      const existing = await this.prisma.plan.findUnique({ where: { key: dto.key } });
      if (existing) {
        throw new BadRequestException({
          code: 'PLAN_KEY_EXISTS',
          message: 'Plan key already exists.',
        });
      }
    }

    const hasDurationInput =
      dto.durationDays !== undefined ||
      dto.durationUnit !== undefined ||
      dto.durationValue !== undefined;

    const hasMetadataInput = dto.metadataJson !== undefined;

    const { durationDays, validity } = this.resolveDuration(
      {
        durationDays: dto.durationDays,
        durationUnit: dto.durationUnit,
        durationValue: dto.durationValue,
      },
      plan.durationDays,
      plan.metadataJson,
    );

    const updated = await this.prisma.plan.update({
      where: { id: planId },
      data: {
        key: dto.key ?? undefined,
        name: dto.name ?? undefined,
        tier: dto.tier ?? undefined,
        pricePaise: dto.pricePaise ?? undefined,
        durationDays: hasDurationInput ? durationDays : undefined,
        isActive: dto.isActive ?? undefined,
        metadataJson:
          hasDurationInput || hasMetadataInput
            ? this.mergeMetadataWithValidity(
                dto.metadataJson ??
                  (plan.metadataJson as Record<string, unknown> | undefined),
                validity,
              )
            : undefined,
        featuresJson: dto.featuresJson
          ? (dto.featuresJson as Prisma.InputJsonValue)
          : undefined,
      },
    });

    return this.serializePlan(updated);
  }

  private serializePlan(plan: {
    id: string;
    key: string;
    name: string;
    tier: string | null;
    pricePaise: number;
    durationDays: number;
    isActive: boolean;
    metadataJson: Prisma.JsonValue | null;
    featuresJson: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const validity =
      this.extractValidityFromMetadata(plan.metadataJson) ??
      this.deriveValidityFromDurationDays(plan.durationDays);

    return {
      ...plan,
      validity,
    };
  }

  private getPurchaseStatus(
    subscription: ActivePlanSubscription | null,
    now: Date,
    renewalWindowDays: number,
  ) {
    if (!subscription) {
      return {
        canPurchase: true,
        mode: 'NEW' as const,
        reason: 'AVAILABLE',
        message: 'Plan is available for purchase.',
        renewalWindowDays,
        daysUntilExpiry: null,
        renewalOpensAt: null,
      };
    }

    if (!subscription.endsAt) {
      return {
        canPurchase: false,
        mode: 'BLOCKED' as const,
        reason: 'LIFETIME_ACTIVE',
        message: 'Your lifetime subscription is already active for this plan.',
        renewalWindowDays,
        daysUntilExpiry: null,
        renewalOpensAt: null,
      };
    }

    const diffMs = subscription.endsAt.getTime() - now.getTime();
    const daysUntilExpiry = Math.max(0, Math.ceil(diffMs / DAY_MS));
    const renewalOpensAt = new Date(
      subscription.endsAt.getTime() - renewalWindowDays * DAY_MS,
    );

    if (diffMs <= renewalWindowDays * DAY_MS) {
      return {
        canPurchase: true,
        mode: 'RENEW' as const,
        reason: 'RENEW_WINDOW_OPEN',
        message: `Renewal is available. Current plan expires in ${daysUntilExpiry} day${
          daysUntilExpiry === 1 ? '' : 's'
        }.`,
        renewalWindowDays,
        daysUntilExpiry,
        renewalOpensAt: renewalOpensAt.toISOString(),
      };
    }

    return {
      canPurchase: false,
      mode: 'BLOCKED' as const,
      reason: 'ACTIVE_PLAN_EXISTS',
      message: `You can renew this plan in the last ${renewalWindowDays} days before expiry.`,
      renewalWindowDays,
      daysUntilExpiry,
      renewalOpensAt: renewalOpensAt.toISOString(),
    };
  }

  private resolveDuration(
    input: {
      durationDays?: number;
      durationValue?: number;
      durationUnit?: PlanDurationUnit;
    },
    fallbackDurationDays: number | null,
    fallbackMetadata: Prisma.JsonValue | null,
  ) {
    if (
      input.durationUnit &&
      input.durationUnit !== PlanDurationUnit.LIFETIME &&
      !input.durationValue
    ) {
      throw new BadRequestException({
        code: 'PLAN_DURATION_VALUE_REQUIRED',
        message: 'durationValue is required when durationUnit is set.',
      });
    }

    if (
      input.durationValue !== undefined &&
      !input.durationUnit
    ) {
      throw new BadRequestException({
        code: 'PLAN_DURATION_UNIT_REQUIRED',
        message: 'durationUnit is required when durationValue is set.',
      });
    }

    if (input.durationUnit) {
      if (input.durationUnit === PlanDurationUnit.LIFETIME) {
        const durationDays = this.resolveLifetimeDays();
        const validity: PlanValidity = {
          unit: PlanDurationUnit.LIFETIME,
          value: null,
          durationDays,
          label: 'Lifetime access',
        };
        return { durationDays, validity };
      }

      const durationValue = input.durationValue ?? 1;
      const durationDays = this.convertToDays(durationValue, input.durationUnit);
      const validity: PlanValidity = {
        unit: input.durationUnit,
        value: durationValue,
        durationDays,
        label: this.buildValidityLabel(input.durationUnit, durationValue),
      };

      return { durationDays, validity };
    }

    if (input.durationDays !== undefined) {
      const validity = this.deriveValidityFromDurationDays(input.durationDays);
      return {
        durationDays: input.durationDays,
        validity,
      };
    }

    if (fallbackDurationDays !== null) {
      const validity =
        this.extractValidityFromMetadata(fallbackMetadata) ??
        this.deriveValidityFromDurationDays(fallbackDurationDays);

      return {
        durationDays: fallbackDurationDays,
        validity,
      };
    }

    throw new BadRequestException({
      code: 'PLAN_DURATION_REQUIRED',
      message:
        'Provide either durationDays or durationValue + durationUnit while creating a plan.',
    });
  }

  private convertToDays(value: number, unit: PlanDurationUnit) {
    switch (unit) {
      case PlanDurationUnit.DAYS:
        return value;
      case PlanDurationUnit.MONTHS:
        return value * 30;
      case PlanDurationUnit.YEARS:
        return value * 365;
      case PlanDurationUnit.LIFETIME:
        return this.resolveLifetimeDays();
      default:
        return value;
    }
  }

  private deriveValidityFromDurationDays(durationDays: number): PlanValidity {
    const lifetimeDays = this.resolveLifetimeDays();
    if (durationDays >= lifetimeDays) {
      return {
        unit: PlanDurationUnit.LIFETIME,
        value: null,
        durationDays,
        label: 'Lifetime access',
      };
    }

    if (durationDays % 365 === 0) {
      const value = Math.floor(durationDays / 365);
      return {
        unit: PlanDurationUnit.YEARS,
        value,
        durationDays,
        label: this.buildValidityLabel(PlanDurationUnit.YEARS, value),
      };
    }

    if (durationDays % 30 === 0) {
      const value = Math.floor(durationDays / 30);
      return {
        unit: PlanDurationUnit.MONTHS,
        value,
        durationDays,
        label: this.buildValidityLabel(PlanDurationUnit.MONTHS, value),
      };
    }

    return {
      unit: PlanDurationUnit.DAYS,
      value: durationDays,
      durationDays,
      label: this.buildValidityLabel(PlanDurationUnit.DAYS, durationDays),
    };
  }

  private extractValidityFromMetadata(
    metadataJson: Prisma.JsonValue | null,
  ): PlanValidity | null {
    if (!metadataJson || typeof metadataJson !== 'object' || Array.isArray(metadataJson)) {
      return null;
    }

    const validityRaw = (metadataJson as Record<string, unknown>).validity;
    if (!validityRaw || typeof validityRaw !== 'object' || Array.isArray(validityRaw)) {
      return null;
    }

    const unitRaw = (validityRaw as Record<string, unknown>).unit;
    const durationDaysRaw = (validityRaw as Record<string, unknown>).durationDays;
    const valueRaw = (validityRaw as Record<string, unknown>).value;

    if (
      typeof unitRaw !== 'string' ||
      !Object.values(PlanDurationUnit).includes(unitRaw as PlanDurationUnit)
    ) {
      return null;
    }

    const unit = unitRaw as PlanDurationUnit;
    const durationDays =
      typeof durationDaysRaw === 'number' && Number.isFinite(durationDaysRaw)
        ? durationDaysRaw
        : unit === PlanDurationUnit.LIFETIME
          ? this.resolveLifetimeDays()
          : typeof valueRaw === 'number' && Number.isFinite(valueRaw)
            ? this.convertToDays(valueRaw, unit)
            : null;

    if (!durationDays) {
      return null;
    }

    const value =
      unit === PlanDurationUnit.LIFETIME
        ? null
        : typeof valueRaw === 'number' && Number.isFinite(valueRaw)
          ? valueRaw
          : this.deriveValidityFromDurationDays(durationDays).value;

    return {
      unit,
      value,
      durationDays,
      label:
        typeof (validityRaw as Record<string, unknown>).label === 'string'
          ? String((validityRaw as Record<string, unknown>).label)
          : unit === PlanDurationUnit.LIFETIME
            ? 'Lifetime access'
            : this.buildValidityLabel(unit, value ?? durationDays),
    };
  }

  private mergeMetadataWithValidity(
    metadata: Record<string, unknown> | undefined,
    validity: PlanValidity,
  ) {
    const merged: Record<string, unknown> = {
      ...(metadata ?? {}),
      validity: {
        unit: validity.unit,
        value: validity.value,
        durationDays: validity.durationDays,
        label: validity.label,
      },
    };

    return merged as Prisma.InputJsonValue;
  }

  private buildValidityLabel(unit: PlanDurationUnit, value: number) {
    switch (unit) {
      case PlanDurationUnit.DAYS:
        return `${value} day${value === 1 ? '' : 's'}`;
      case PlanDurationUnit.MONTHS:
        return `${value} month${value === 1 ? '' : 's'}`;
      case PlanDurationUnit.YEARS:
        return `${value} year${value === 1 ? '' : 's'}`;
      case PlanDurationUnit.LIFETIME:
        return 'Lifetime access';
      default:
        return `${value} days`;
    }
  }

  private resolveRenewalWindowDays() {
    const value = Number(
      this.configService.get<number>('SUBSCRIPTION_RENEWAL_WINDOW_DAYS') ??
        DEFAULT_RENEWAL_WINDOW_DAYS,
    );
    if (!Number.isFinite(value) || value < 0) {
      return DEFAULT_RENEWAL_WINDOW_DAYS;
    }
    return value;
  }

  private resolveLifetimeDays() {
    const value = Number(
      this.configService.get<number>('SUBSCRIPTION_LIFETIME_DAYS') ??
        DEFAULT_LIFETIME_DAYS,
    );
    if (!Number.isFinite(value) || value <= 0) {
      return DEFAULT_LIFETIME_DAYS;
    }
    return value;
  }
}
