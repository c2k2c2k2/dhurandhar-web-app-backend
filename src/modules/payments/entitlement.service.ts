import { Injectable } from '@nestjs/common';
import { EntitlementKind } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

interface EntitlementScope {
  subjectIds?: string[];
  topicIds?: string[];
  noteIds?: string[];
}

@Injectable()
export class EntitlementService {
  constructor(private readonly prisma: PrismaService) {}

  async hasActiveSubscription(userId?: string) {
    if (!userId) {
      return false;
    }

    const now = new Date();
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
    });

    return Boolean(subscription);
  }

  async canAccessNote(userId: string | undefined, note: { id: string; subjectId: string; isPremium: boolean; topics?: { topicId: string }[] }) {
    if (!note.isPremium) {
      return true;
    }

    if (!userId) {
      return false;
    }

    const entitlements = await this.getActiveEntitlements(userId, [EntitlementKind.NOTES, EntitlementKind.ALL]);
    if (entitlements.length === 0) {
      return false;
    }

    const topicIds = new Set(note.topics?.map((item) => item.topicId) ?? []);

    for (const entitlement of entitlements) {
      const scope = (entitlement.scopeJson ?? {}) as EntitlementScope;
      if (!scope.subjectIds && !scope.topicIds && !scope.noteIds) {
        return true;
      }

      if (scope.noteIds?.includes(note.id)) {
        return true;
      }

      if (scope.subjectIds?.includes(note.subjectId)) {
        return true;
      }

      if (scope.topicIds?.some((id) => topicIds.has(id))) {
        return true;
      }
    }

    return false;
  }

  async canAccessTests(userId?: string) {
    if (!userId) {
      return false;
    }

    const entitlements = await this.getActiveEntitlements(userId, [EntitlementKind.TESTS, EntitlementKind.ALL]);
    return entitlements.length > 0;
  }

  async canAccessPractice(userId?: string) {
    if (!userId) {
      return false;
    }

    const entitlements = await this.getActiveEntitlements(userId, [EntitlementKind.PRACTICE, EntitlementKind.ALL]);
    return entitlements.length > 0;
  }

  denyReason(userId: string | undefined) {
    if (!userId) {
      return 'NOT_AUTHENTICATED';
    }
    return 'NO_ACTIVE_ENTITLEMENT';
  }

  private async getActiveEntitlements(userId: string, kinds: EntitlementKind[]) {
    const now = new Date();
    return this.prisma.entitlement.findMany({
      where: {
        userId,
        kind: { in: kinds },
        AND: [
          {
            OR: [{ startsAt: null }, { startsAt: { lte: now } }],
          },
          {
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          },
        ],
      },
    });
  }
}
