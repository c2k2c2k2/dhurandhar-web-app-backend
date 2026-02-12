import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { IAuthSessionService } from './interfaces';

@Injectable()
export class AuthSessionService implements IAuthSessionService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async validateRequest(
    request: Request,
    options?: { optional?: boolean },
  ): Promise<{ userId: string; type: string; roles: string[] } | undefined> {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      if (options?.optional) {
        return undefined;
      }
      throw new UnauthorizedException({
        code: 'AUTH_MISSING_TOKEN',
        message: 'Authorization header is required.',
      });
    }

    const [, token] = authHeader.split(' ');
    if (!token) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_TOKEN',
        message: 'Invalid authorization header.',
      });
    }

    try {
      const payload = this.jwtService.verify<{ sub: string; type: string; roles?: string[] }>(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { status: true, type: true },
      });
      if (!user) {
        throw new UnauthorizedException({
          code: 'AUTH_USER_NOT_FOUND',
          message: 'User not found.',
        });
      }
      if (user.status === 'BLOCKED') {
        throw new ForbiddenException({
          code: 'AUTH_USER_BLOCKED',
          message: 'User access is blocked.',
        });
      }

      return {
        userId: payload.sub,
        type: user.type,
        roles: payload.roles ?? [],
      };
    } catch {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_TOKEN',
        message: 'Token is invalid or expired.',
      });
    }
  }
}
