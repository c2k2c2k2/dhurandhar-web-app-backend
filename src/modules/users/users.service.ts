import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  EntitlementKind,
  PracticeEventType,
  Prisma,
  SubscriptionStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AdminBlockUserDto, AdminEntitlementDto, AdminUserQueryDto, UpdateMeDto } from './dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId?: string) {
    if (!userId) {
      throw new BadRequestException({
        code: 'USER_ID_REQUIRED',
        message: 'User id is required.',
      });
    }

    const now = new Date();
    const [user, subscription, entitlements] = await this.prisma.$transaction([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          phone: true,
          fullName: true,
          type: true,
          status: true,
          createdAt: true,
          lastLoginAt: true,
          lastActiveAt: true,
        },
      }),
      this.prisma.subscription.findFirst({
        where: {
          userId,
          status: SubscriptionStatus.ACTIVE,
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        },
        orderBy: { endsAt: 'desc' },
        include: {
          plan: {
            select: {
              id: true,
              key: true,
              name: true,
              tier: true,
              pricePaise: true,
              durationDays: true,
              metadataJson: true,
              featuresJson: true,
            },
          },
        },
      }),
      this.prisma.entitlement.findMany({
        where: {
          userId,
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          AND: [
            {
              OR: [{ startsAt: null }, { startsAt: { lte: now } }],
            },
          ],
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          kind: true,
          scopeJson: true,
          reason: true,
          startsAt: true,
          endsAt: true,
          subscriptionId: true,
        },
      }),
    ]);

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
    }

    return {
      ...user,
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            startsAt: subscription.startsAt,
            endsAt: subscription.endsAt,
            plan: subscription.plan,
          }
        : null,
      entitlements,
    };
  }

  async updateMe(userId: string | undefined, dto: UpdateMeDto) {
    if (!userId) {
      throw new BadRequestException({
        code: 'USER_ID_REQUIRED',
        message: 'User id is required.',
      });
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: dto.fullName ?? undefined,
        phone: dto.phone ?? undefined,
        lastActiveAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        phone: true,
        fullName: true,
        type: true,
        status: true,
      },
    });
  }

  async listUsers(query: AdminUserQueryDto) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);

    const andConditions: Prisma.UserWhereInput[] = [];

    if (query.search) {
      andConditions.push({
        OR: [
          { email: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search, mode: 'insensitive' } },
          { fullName: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }

    if (query.type) {
      andConditions.push({ type: query.type });
    }

    if (query.status) {
      andConditions.push({ status: query.status });
    }

    if (query.hasActiveSubscription) {
      const now = new Date();
      const wantsActive = query.hasActiveSubscription === 'true';
      const activeFilter: Prisma.SubscriptionWhereInput = {
        status: SubscriptionStatus.ACTIVE,
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      };

      if (wantsActive) {
        andConditions.push({ subscriptions: { some: activeFilter } });
      } else {
        andConditions.push({ NOT: { subscriptions: { some: activeFilter } } });
      }
    }

    const where: Prisma.UserWhereInput = andConditions.length ? { AND: andConditions } : {};

    const [total, data] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          email: true,
          phone: true,
          fullName: true,
          type: true,
          status: true,
          createdAt: true,
          lastLoginAt: true,
        },
      }),
    ]);

    return { data, total, page, pageSize };
  }

  async getUser(userId: string) {
    const [user, lastNoteRead, lastPractice, lastAttempt] = await this.prisma.$transaction([
      this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: { include: { role: true } },
          subscriptions: true,
          entitlements: true,
        },
      }),
      this.prisma.noteAccessLog.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.prisma.practiceQuestionEvent.findFirst({
        where: { userId, eventType: PracticeEventType.ANSWERED },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.prisma.attempt.findFirst({
        where: { userId, submittedAt: { not: null } },
        orderBy: { submittedAt: 'desc' },
        select: { submittedAt: true },
      }),
    ]);

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
    }

    return {
      ...user,
      activity: {
        lastNoteReadAt: lastNoteRead?.createdAt ?? null,
        lastPracticeAt: lastPractice?.createdAt ?? null,
        lastTestAt: lastAttempt?.submittedAt ?? null,
      },
    };
  }

  async blockUser(userId: string, _dto: AdminBlockUserDto) {
    return this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { status: UserStatus.BLOCKED },
      }),
      this.prisma.refreshSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async unblockUser(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.ACTIVE },
    });
  }

  async forceLogout(userId: string) {
    await this.prisma.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.prisma.noteViewSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { success: true };
  }

  async grantEntitlement(userId: string, dto: AdminEntitlementDto) {
    if (!dto.kind) {
      throw new BadRequestException({
        code: 'ENTITLEMENT_KIND_REQUIRED',
        message: 'Entitlement kind is required.',
      });
    }

    return this.prisma.entitlement.create({
      data: {
        userId,
        kind: dto.kind,
        scopeJson: dto.scopeJson ? (dto.scopeJson as Prisma.InputJsonValue) : undefined,
        reason: dto.reason ?? undefined,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      },
    });
  }

  async revokeEntitlement(userId: string, dto: AdminEntitlementDto) {
    if (!dto.kind) {
      throw new BadRequestException({
        code: 'ENTITLEMENT_KIND_REQUIRED',
        message: 'Entitlement kind is required.',
      });
    }

    const result = await this.prisma.entitlement.updateMany({
      where: {
        userId,
        kind: dto.kind,
        endsAt: null,
      },
      data: { endsAt: new Date(), revokedReason: dto.reason ?? undefined },
    });

    if (result.count === 0) {
      throw new NotFoundException({
        code: 'ENTITLEMENT_NOT_FOUND',
        message: 'No active entitlement found.',
      });
    }

    return { success: true };
  }
}
