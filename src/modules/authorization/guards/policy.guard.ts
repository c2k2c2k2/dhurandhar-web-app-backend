import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { POLICY_KEY, POLICY_OPTIONS_KEY, REQUIRE_USER_TYPE_KEY } from '../decorators';
import { AuthorizationService } from '../authorization.service';
import { PolicyService } from '../policy.service';

const WILDCARD_PERMISSION = '*';

@Injectable()
export class PolicyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
    private readonly policyService: PolicyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policyKey = this.reflector.getAllAndOverride<string | undefined>(POLICY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const policyOptions = this.reflector.getAllAndOverride<Record<string, unknown> | undefined>(
      POLICY_OPTIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredUserTypes = this.reflector.getAllAndOverride<string[] | undefined>(
      REQUIRE_USER_TYPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTHZ_UNAUTHORIZED',
        message: 'Unauthorized.',
      });
    }

    if (requiredUserTypes?.length && !requiredUserTypes.includes(user.type)) {
      throw new ForbiddenException({
        code: 'AUTHZ_FORBIDDEN',
        message: 'User type not permitted.',
      });
    }

    if (policyKey) {
      let permissions = request.permissions;
      if (!permissions) {
        permissions = await this.authorizationService.getUserPermissions(user.userId);
        request.permissions = permissions;
      }

      if (permissions.has(WILDCARD_PERMISSION)) {
        return true;
      }

      const allowed = await this.policyService.evaluate(policyKey, {
        user: { ...user, roles: user.roles ?? [] },
        request,
        permissions,
        options: policyOptions,
      });

      if (!allowed) {
        throw new ForbiddenException({
          code: 'AUTHZ_FORBIDDEN',
          message: 'You do not have permission to perform this action.',
        });
      }
    }

    return true;
  }
}
