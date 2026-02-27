import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentOrderStatus,
  PaymentTransactionStatus,
  PaymentProvider,
  PracticeEventType,
  Prisma,
  SubscriptionStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import {
  getIndianPhoneAliases,
  normalizeIndianPhone,
} from '../../common/utils/phone';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { SubscriptionsService } from '../payments/subscriptions.service';
import {
  AdminActivateSubscriptionDto,
  AdminBlockUserDto,
  AdminCreateUserDto,
  AdminEntitlementDto,
  AdminUpdateUserDto,
  AdminUserQueryDto,
  UpdateMeDto,
} from './dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RENEWAL_WINDOW_DAYS = 7;
const STUDENT_ROLE_KEY = 'STUDENT';
const ADMIN_ROLE_PREFIX = 'ADMIN_';
const SUPER_ADMIN_ROLE_KEY = 'ADMIN_SUPER';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly authorizationService: AuthorizationService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

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

    const renewalWindowDays = Number(
      this.configService.get<number>('SUBSCRIPTION_RENEWAL_WINDOW_DAYS') ??
        DEFAULT_RENEWAL_WINDOW_DAYS,
    );
    const safeRenewalWindowDays =
      Number.isFinite(renewalWindowDays) && renewalWindowDays >= 0
        ? renewalWindowDays
        : DEFAULT_RENEWAL_WINDOW_DAYS;

    const subscriptionPolicy = subscription?.endsAt
      ? (() => {
          const diffMs = subscription.endsAt.getTime() - now.getTime();
          const daysUntilExpiry = Math.max(0, Math.ceil(diffMs / DAY_MS));
          const renewalOpensAt = new Date(
            subscription.endsAt.getTime() - safeRenewalWindowDays * DAY_MS,
          );
          return {
            daysUntilExpiry,
            renewalWindowDays: safeRenewalWindowDays,
            renewalOpensAt: renewalOpensAt.toISOString(),
            canRenewCurrentPlan: now >= renewalOpensAt,
          };
        })()
      : {
          daysUntilExpiry: null,
          renewalWindowDays: safeRenewalWindowDays,
          renewalOpensAt: null,
          canRenewCurrentPlan: false,
        };

    return {
      ...user,
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            startsAt: subscription.startsAt,
            endsAt: subscription.endsAt,
            plan: subscription.plan,
            policy: subscriptionPolicy,
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

    const phone = this.normalizeOptionalPhoneInput(dto.phone);
    if (typeof phone === 'string') {
      await this.assertPhoneAvailable(phone, userId);
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: dto.fullName ?? undefined,
        phone,
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

  async createUser(actorUserId: string | undefined, dto: AdminCreateUserDto) {
    if (!actorUserId) {
      throw new BadRequestException({
        code: 'USER_ID_REQUIRED',
        message: 'User id is required.',
      });
    }

    const type = dto.type ?? UserType.STUDENT;
    const resolvedRoles = await this.resolveRolesByIds(dto.roleIds ?? []);

    await this.enforceAdminMutationCapability(actorUserId, {
      targetType: type,
      targetRoleKeys: resolvedRoles.map((role) => role.key),
    });

    if (type === UserType.ADMIN && resolvedRoles.length === 0) {
      throw new BadRequestException({
        code: 'USER_ADMIN_ROLE_REQUIRED',
        message: 'At least one role is required for admin users.',
      });
    }

    if (type !== UserType.STUDENT && dto.initialPlanId?.trim()) {
      throw new BadRequestException({
        code: 'USER_SUBSCRIPTION_TARGET_INVALID',
        message: 'Initial subscription can only be assigned to student users.',
      });
    }

    const initialPlanId = dto.initialPlanId?.trim();
    if (initialPlanId) {
      await this.authorizationService.assertPermission(
        actorUserId,
        'subscriptions.manage',
      );
    }

    let roleIds = resolvedRoles.map((role) => role.id);
    if (type === UserType.STUDENT && roleIds.length === 0) {
      roleIds = [await this.getStudentRoleId()];
    }

    const email = dto.email.trim().toLowerCase();
    const phone = this.normalizeOptionalPhoneInput(dto.phone);
    const fullName = dto.fullName?.trim() || undefined;
    const passwordHash = await bcrypt.hash(dto.password, 10);

    if (typeof phone === 'string') {
      await this.assertPhoneAvailable(phone);
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            phone,
            fullName,
            type,
            status: dto.status ?? UserStatus.ACTIVE,
            passwordHash,
          },
          select: { id: true },
        });

        if (roleIds.length) {
          await tx.userRole.createMany({
            data: roleIds.map((roleId) => ({ userId: user.id, roleId })),
            skipDuplicates: true,
          });
        }

        return tx.user.findUnique({
          where: { id: user.id },
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
            userRoles: {
              include: {
                role: {
                  select: {
                    id: true,
                    key: true,
                    name: true,
                  },
                },
              },
            },
          },
        });
      });

      if (!created) {
        throw new NotFoundException({
          code: 'USER_NOT_FOUND',
          message: 'User not found.',
        });
      }

      if (initialPlanId && type === UserType.STUDENT) {
        await this.activateSubscriptionByAdmin(actorUserId, created.id, {
          planId: initialPlanId,
          reason: dto.initialSubscriptionReason?.trim() || undefined,
        });
      }

      return created;
    } catch (error) {
      this.handleUniqueConstraint(error);
      throw error;
    }
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

    const where: Prisma.UserWhereInput = andConditions.length
      ? { AND: andConditions }
      : {};

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

  async getUserAuthorization(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: {
            role: {
              select: {
                id: true,
                key: true,
                name: true,
              },
            },
          },
        },
        userPermissions: {
          include: {
            permission: {
              select: {
                id: true,
                key: true,
                description: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
    }

    const effectivePermissions =
      await this.authorizationService.getUserPermissions(userId);

    return {
      userId: user.id,
      roles: user.userRoles.map((link) => link.role),
      userPermissionOverrides: user.userPermissions.map((override) => ({
        permissionId: override.permissionId,
        permissionKey: override.permission.key,
        allow: override.allow,
      })),
      effectivePermissions: Array.from(effectivePermissions).sort(
        (left, right) => left.localeCompare(right),
      ),
    };
  }

  async getUser(userId: string) {
    const [user, lastNoteRead, lastPractice, lastAttempt] =
      await this.prisma.$transaction([
        this.prisma.user.findUnique({
          where: { id: userId },
          include: {
            userRoles: { include: { role: true } },
            subscriptions: {
              orderBy: { createdAt: 'desc' },
              include: {
                plan: {
                  select: {
                    id: true,
                    key: true,
                    name: true,
                    tier: true,
                  },
                },
              },
            },
            entitlements: {
              orderBy: { createdAt: 'desc' },
            },
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

    const effectivePermissions =
      await this.authorizationService.getUserPermissions(userId);

    return {
      ...user,
      activity: {
        lastNoteReadAt: lastNoteRead?.createdAt ?? null,
        lastPracticeAt: lastPractice?.createdAt ?? null,
        lastTestAt: lastAttempt?.submittedAt ?? null,
      },
      effectivePermissions: Array.from(effectivePermissions).sort(
        (left, right) => left.localeCompare(right),
      ),
    };
  }

  async updateUser(
    actorUserId: string | undefined,
    userId: string,
    dto: AdminUpdateUserDto,
  ) {
    if (!actorUserId) {
      throw new BadRequestException({
        code: 'USER_ID_REQUIRED',
        message: 'User id is required.',
      });
    }

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: {
            role: {
              select: {
                key: true,
              },
            },
          },
        },
      },
    });

    if (!currentUser) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
    }

    const resolvedRoles =
      dto.roleIds === undefined
        ? undefined
        : await this.resolveRolesByIds(dto.roleIds);

    const nextType = dto.type ?? currentUser.type;
    const nextRoleKeys =
      resolvedRoles?.map((role) => role.key) ??
      currentUser.userRoles.map((roleLink) => roleLink.role.key);

    await this.enforceAdminMutationCapability(actorUserId, {
      currentType: currentUser.type,
      currentRoleKeys: currentUser.userRoles.map(
        (roleLink) => roleLink.role.key,
      ),
      targetType: nextType,
      targetRoleKeys: nextRoleKeys,
    });

    if (
      nextType === UserType.ADMIN &&
      resolvedRoles &&
      resolvedRoles.length === 0
    ) {
      throw new BadRequestException({
        code: 'USER_ADMIN_ROLE_REQUIRED',
        message: 'At least one role is required for admin users.',
      });
    }

    if (
      actorUserId === userId &&
      currentUser.userRoles.some(
        (roleLink) => roleLink.role.key === SUPER_ADMIN_ROLE_KEY,
      ) &&
      resolvedRoles &&
      !resolvedRoles.some((role) => role.key === SUPER_ADMIN_ROLE_KEY)
    ) {
      throw new BadRequestException({
        code: 'USER_SELF_LOCKOUT',
        message: 'You cannot remove your own super admin role.',
      });
    }

    let nextRoleIds = resolvedRoles?.map((role) => role.id);
    if (
      resolvedRoles &&
      nextType === UserType.STUDENT &&
      nextRoleIds?.length === 0
    ) {
      nextRoleIds = [await this.getStudentRoleId()];
    }

    const email = dto.email?.trim().toLowerCase();
    const phone = this.normalizeOptionalPhoneInput(dto.phone);
    const fullName = dto.fullName?.trim();

    if (typeof phone === 'string') {
      await this.assertPhoneAvailable(phone, userId);
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: {
            email: email || undefined,
            phone,
            fullName: fullName === undefined ? undefined : fullName || null,
            status: dto.status ?? undefined,
            type: dto.type ?? undefined,
            passwordHash: dto.password
              ? await bcrypt.hash(dto.password, 10)
              : undefined,
          },
        });

        if (nextRoleIds) {
          await tx.userRole.deleteMany({ where: { userId } });
          if (nextRoleIds.length) {
            await tx.userRole.createMany({
              data: nextRoleIds.map((roleId) => ({ userId, roleId })),
              skipDuplicates: true,
            });
          }
        }

        return tx.user.findUnique({
          where: { id: userId },
          include: {
            userRoles: {
              include: {
                role: {
                  select: {
                    id: true,
                    key: true,
                    name: true,
                  },
                },
              },
            },
          },
        });
      });

      if (!updated) {
        throw new NotFoundException({
          code: 'USER_NOT_FOUND',
          message: 'User not found.',
        });
      }

      return updated;
    } catch (error) {
      this.handleUniqueConstraint(error);
      throw error;
    }
  }

  async blockUser(
    actorUserId: string | undefined,
    userId: string,
    dto: AdminBlockUserDto,
  ) {
    if (!actorUserId) {
      throw new BadRequestException({
        code: 'USER_ID_REQUIRED',
        message: 'User id is required.',
      });
    }
    void dto;
    if (actorUserId === userId) {
      throw new BadRequestException({
        code: 'USER_SELF_BLOCK_FORBIDDEN',
        message: 'You cannot block your own account.',
      });
    }

    await this.assertCanMutateTargetUser(actorUserId, userId);

    return this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { status: UserStatus.BLOCKED, activeStudentSessionId: null },
      }),
      this.prisma.refreshSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async unblockUser(actorUserId: string | undefined, userId: string) {
    if (!actorUserId) {
      throw new BadRequestException({
        code: 'USER_ID_REQUIRED',
        message: 'User id is required.',
      });
    }

    await this.assertCanMutateTargetUser(actorUserId, userId);

    return this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.ACTIVE },
    });
  }

  async forceLogout(actorUserId: string | undefined, userId: string) {
    if (!actorUserId) {
      throw new BadRequestException({
        code: 'USER_ID_REQUIRED',
        message: 'User id is required.',
      });
    }

    await this.assertCanMutateTargetUser(actorUserId, userId);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { activeStudentSessionId: null },
      }),
      this.prisma.refreshSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.noteViewSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { success: true };
  }

  async grantEntitlement(
    actorUserId: string | undefined,
    userId: string,
    dto: AdminEntitlementDto,
  ) {
    if (!actorUserId) {
      throw new BadRequestException({
        code: 'USER_ID_REQUIRED',
        message: 'User id is required.',
      });
    }

    await this.assertCanMutateTargetUser(actorUserId, userId);

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
        scopeJson: dto.scopeJson
          ? (dto.scopeJson as Prisma.InputJsonValue)
          : undefined,
        reason: dto.reason ?? undefined,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      },
    });
  }

  async revokeEntitlement(
    actorUserId: string | undefined,
    userId: string,
    dto: AdminEntitlementDto,
  ) {
    if (!actorUserId) {
      throw new BadRequestException({
        code: 'USER_ID_REQUIRED',
        message: 'User id is required.',
      });
    }

    await this.assertCanMutateTargetUser(actorUserId, userId);

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

  async activateSubscriptionByAdmin(
    actorUserId: string | undefined,
    userId: string,
    dto: AdminActivateSubscriptionDto,
  ) {
    if (!actorUserId) {
      throw new BadRequestException({
        code: 'USER_ID_REQUIRED',
        message: 'User id is required.',
      });
    }

    const targetUser = await this.assertCanMutateTargetUser(actorUserId, userId);

    if (targetUser.type !== UserType.STUDENT) {
      throw new BadRequestException({
        code: 'USER_SUBSCRIPTION_TARGET_INVALID',
        message: 'Subscriptions can only be assigned to student users.',
      });
    }

    const normalizedPlanId = dto.planId.trim();
    const plan = await this.prisma.plan.findUnique({
      where: { id: normalizedPlanId },
      select: { id: true, key: true, name: true, isActive: true, pricePaise: true },
    });

    if (!plan || !plan.isActive) {
      throw new NotFoundException({
        code: 'PLAN_NOT_FOUND',
        message: 'Plan not found.',
      });
    }

    const now = new Date();
    const normalizedReason = dto.reason?.trim() || undefined;
    const manualRef = `ADMIN-${randomUUID()}`;

    const [order, transaction] = await this.prisma.$transaction(async (tx) => {
      const createdOrder = await tx.paymentOrder.create({
        data: {
          userId,
          planId: plan.id,
          merchantTransactionId: manualRef,
          merchantUserId: userId,
          provider: PaymentProvider.PHONEPE,
          currency: 'INR',
          amountPaise: plan.pricePaise,
          finalAmountPaise: plan.pricePaise,
          status: PaymentOrderStatus.CREATED,
          expiresAt: now,
          metadataJson: this.toJsonValue({
            source: 'ADMIN_PANEL',
            mode: 'MANUAL_SUBSCRIPTION_ACTIVATION',
            activatedByUserId: actorUserId,
            reason: normalizedReason ?? null,
            phonePeReference: null,
          }),
        },
      });

      const createdTransaction = await tx.paymentTransaction.create({
        data: {
          orderId: createdOrder.id,
          status: PaymentTransactionStatus.PENDING,
          rawResponseJson: this.toJsonValue({
            source: 'ADMIN_PANEL',
            mode: 'MANUAL_SUBSCRIPTION_ACTIVATION',
            status: 'CREATED',
          }),
        },
      });

      await tx.paymentEvent.create({
        data: {
          orderId: createdOrder.id,
          eventType: 'ADMIN_SUBSCRIPTION_ACTIVATION_REQUESTED',
          payloadJson: this.toJsonValue({
            actorUserId,
            targetUserId: userId,
            planId: plan.id,
            reason: normalizedReason ?? null,
          }),
          processedAt: now,
        },
      });

      return [createdOrder, createdTransaction] as const;
    });

    try {
      const subscription = await this.subscriptionsService.activateSubscription(
        userId,
        plan.id,
        order.id,
      );

      await this.prisma.$transaction([
        this.prisma.paymentOrder.update({
          where: { id: order.id },
          data: {
            status: PaymentOrderStatus.SUCCESS,
            completedAt: new Date(),
          },
        }),
        this.prisma.paymentTransaction.update({
          where: { id: transaction.id },
          data: {
            status: PaymentTransactionStatus.SUCCESS,
            rawResponseJson: this.toJsonValue({
              source: 'ADMIN_PANEL',
              mode: 'MANUAL_SUBSCRIPTION_ACTIVATION',
              status: 'SUCCESS',
              subscriptionId: subscription.id,
            }),
          },
        }),
        this.prisma.paymentEvent.create({
          data: {
            orderId: order.id,
            eventType: 'ADMIN_SUBSCRIPTION_ACTIVATED',
            payloadJson: this.toJsonValue({
              actorUserId,
              targetUserId: userId,
              planId: plan.id,
              subscriptionId: subscription.id,
            }),
            processedAt: new Date(),
          },
        }),
      ]);

      return {
        success: true,
        userId,
        plan: {
          id: plan.id,
          key: plan.key,
          name: plan.name,
        },
        paymentOrderId: order.id,
        subscription,
      };
    } catch (error) {
      await this.prisma.$transaction([
        this.prisma.paymentOrder.update({
          where: { id: order.id },
          data: {
            status: PaymentOrderStatus.FAILED,
            completedAt: new Date(),
          },
        }),
        this.prisma.paymentTransaction.update({
          where: { id: transaction.id },
          data: {
            status: PaymentTransactionStatus.FAILED,
            rawResponseJson: this.toJsonValue({
              source: 'ADMIN_PANEL',
              mode: 'MANUAL_SUBSCRIPTION_ACTIVATION',
              status: 'FAILED',
              error:
                error instanceof Error
                  ? error.message
                  : 'Manual subscription activation failed.',
            }),
          },
        }),
        this.prisma.paymentEvent.create({
          data: {
            orderId: order.id,
            eventType: 'ADMIN_SUBSCRIPTION_ACTIVATION_FAILED',
            payloadJson: this.toJsonValue({
              actorUserId,
              targetUserId: userId,
              planId: plan.id,
              reason:
                error instanceof Error
                  ? error.message
                  : 'Manual subscription activation failed.',
            }),
            processedAt: new Date(),
          },
        }),
      ]);

      throw error;
    }
  }

  private async assertCanMutateTargetUser(actorUserId: string, targetUserId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        type: true,
        userRoles: {
          include: {
            role: {
              select: {
                key: true,
              },
            },
          },
        },
      },
    });

    if (!target) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
    }

    await this.enforceAdminMutationCapability(actorUserId, {
      currentType: target.type,
      currentRoleKeys: target.userRoles.map((roleLink) => roleLink.role.key),
      targetType: target.type,
      targetRoleKeys: target.userRoles.map((roleLink) => roleLink.role.key),
    });

    return target;
  }

  private async resolveRolesByIds(roleIds: string[]) {
    const uniqueRoleIds = Array.from(
      new Set(
        roleIds
          .map((roleId) => roleId.trim())
          .filter((roleId) => roleId.length > 0),
      ),
    );

    if (uniqueRoleIds.length === 0) {
      return [];
    }

    const roles = await this.prisma.role.findMany({
      where: { id: { in: uniqueRoleIds } },
      select: {
        id: true,
        key: true,
        name: true,
      },
    });

    if (roles.length !== uniqueRoleIds.length) {
      const foundRoleIds = new Set(roles.map((role) => role.id));
      const missingRoleIds = uniqueRoleIds.filter(
        (roleId) => !foundRoleIds.has(roleId),
      );

      throw new BadRequestException({
        code: 'ROLE_NOT_FOUND',
        message: `Unknown roles: ${missingRoleIds.join(', ')}`,
      });
    }

    return roles;
  }

  private async getStudentRoleId() {
    const studentRole = await this.prisma.role.findUnique({
      where: { key: STUDENT_ROLE_KEY },
      select: { id: true },
    });

    if (!studentRole) {
      throw new NotFoundException({
        code: 'ROLE_STUDENT_MISSING',
        message: 'Default student role is missing.',
      });
    }

    return studentRole.id;
  }

  private async enforceAdminMutationCapability(
    actorUserId: string,
    context: {
      currentType?: UserType;
      currentRoleKeys?: string[];
      targetType: UserType;
      targetRoleKeys: string[];
    },
  ) {
    const currentTouchesAdmin =
      context.currentType === UserType.ADMIN ||
      (context.currentRoleKeys ?? []).some((roleKey) =>
        this.isAdminRoleKey(roleKey),
      );

    const targetTouchesAdmin =
      context.targetType === UserType.ADMIN ||
      context.targetRoleKeys.some((roleKey) => this.isAdminRoleKey(roleKey));

    if (!currentTouchesAdmin && !targetTouchesAdmin) {
      return;
    }

    await this.authorizationService.assertPermission(
      actorUserId,
      'rbac.manage',
    );
  }

  private isAdminRoleKey(roleKey: string) {
    return (
      roleKey === SUPER_ADMIN_ROLE_KEY || roleKey.startsWith(ADMIN_ROLE_PREFIX)
    );
  }

  private normalizeOptionalPhoneInput(phone?: string) {
    if (phone === undefined) {
      return undefined;
    }

    const trimmed = phone.trim();
    if (!trimmed) {
      return null;
    }

    try {
      return normalizeIndianPhone(trimmed);
    } catch {
      throw new BadRequestException({
        code: 'USER_PHONE_INVALID',
        message: 'Enter a valid Indian mobile number.',
      });
    }
  }

  private async assertPhoneAvailable(phone: string, excludeUserId?: string) {
    const existing = await this.prisma.user.findFirst({
      where: {
        id: excludeUserId ? { not: excludeUserId } : undefined,
        phone: { in: getIndianPhoneAliases(phone) },
      },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException({
        code: 'USER_DUPLICATE_FIELD',
        message: 'Email or phone already in use.',
      });
    }
  }

  private handleUniqueConstraint(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new BadRequestException({
        code: 'USER_DUPLICATE_FIELD',
        message: 'Email or phone already in use.',
      });
    }
  }

  private toJsonValue(value: unknown) {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  }
}
