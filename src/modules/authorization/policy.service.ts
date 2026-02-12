import { BadRequestException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { EntitlementService } from '../payments/entitlement.service';

export interface PolicyContext {
  user: { userId: string; type: string; roles: string[] };
  request: Request;
  permissions: Set<string>;
  options?: Record<string, unknown>;
}

type PolicyResolver = (context: PolicyContext) => Promise<boolean> | boolean;

@Injectable()
export class PolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlementService: EntitlementService,
  ) {}

  async evaluate(policyKey: string, context: PolicyContext): Promise<boolean> {
    const resolver = this.getResolver(policyKey);
    if (resolver) {
      return resolver(context);
    }

    return context.permissions.has(policyKey);
  }

  private getResolver(policyKey: string): PolicyResolver | undefined {
    const resolvers: Record<string, PolicyResolver> = {
      'notes.read.premium': (context) => this.resolvePremiumNoteAccess(context),
      'tests.attempt': (context) => this.resolveTestAccess(context),
      'practice.use': (context) => this.resolvePracticeAccess(context),
      'users.own': (context) => this.resolveOwnUser(context),
      'attempts.own': (context) => this.resolveOwnAttempt(context),
    };

    return resolvers[policyKey];
  }

  private resolveParam(request: Request, key: string): string | undefined {
    const paramsValue = request.params?.[key];
    if (typeof paramsValue === 'string' && paramsValue.length) {
      return paramsValue;
    }
    const bodyValue = (request.body as Record<string, unknown> | undefined)?.[key];
    if (typeof bodyValue === 'string' && bodyValue.length) {
      return bodyValue;
    }
    const queryValue = request.query?.[key];
    if (typeof queryValue === 'string' && queryValue.length) {
      return queryValue;
    }
    return undefined;
  }

  private resolveRequiredParam(request: Request, key: string, policyKey: string): string {
    const value = this.resolveParam(request, key);
    if (!value) {
      throw new BadRequestException({
        code: 'AUTHZ_POLICY_CONFIG',
        message: `Policy ${policyKey} requires param ${key}.`,
      });
    }
    return value;
  }

  private async resolvePremiumNoteAccess(context: PolicyContext) {
    if (context.user.type === 'ADMIN') {
      return true;
    }

    const noteIdParam =
      (context.options?.noteIdParam as string | undefined) ?? 'noteId';
    const noteId = this.resolveRequiredParam(context.request, noteIdParam, 'notes.read.premium');

    const note = await this.prisma.note.findUnique({
      where: { id: noteId },
      include: { topics: true },
    });
    if (!note) {
      return false;
    }
    if (!note.isPremium) {
      return true;
    }

    return this.entitlementService.canAccessNote(context.user.userId, {
      id: note.id,
      subjectId: note.subjectId,
      isPremium: note.isPremium,
      topics: note.topics,
    });
  }

  private async resolveTestAccess(context: PolicyContext) {
    if (context.user.type === 'ADMIN') {
      return true;
    }
    return this.entitlementService.canAccessTests(context.user.userId);
  }

  private async resolvePracticeAccess(context: PolicyContext) {
    if (context.user.type === 'ADMIN') {
      return true;
    }
    return this.entitlementService.canAccessPractice(context.user.userId);
  }

  private resolveOwnUser(context: PolicyContext) {
    const userIdParam =
      (context.options?.userIdParam as string | undefined) ?? 'userId';
    const userId = this.resolveRequiredParam(context.request, userIdParam, 'users.own');
    return userId === context.user.userId;
  }

  private async resolveOwnAttempt(context: PolicyContext) {
    const attemptIdParam =
      (context.options?.attemptIdParam as string | undefined) ?? 'attemptId';
    const attemptId = this.resolveRequiredParam(context.request, attemptIdParam, 'attempts.own');
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      select: { userId: true },
    });
    return attempt?.userId === context.user.userId;
  }
}
