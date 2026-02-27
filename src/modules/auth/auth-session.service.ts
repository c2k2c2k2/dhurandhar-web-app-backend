import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserType } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { IAuthSessionService } from './interfaces';

@Injectable()
export class AuthSessionService implements IAuthSessionService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async validateRequest(
    request: Request,
    options?: { optional?: boolean },
  ): Promise<
    { userId: string; type: string; roles: string[]; sid?: string } | undefined
  > {
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

    let payload: { sub: string; type: string; roles?: string[]; sid?: string };
    try {
      payload = this.jwtService.verify<{
        sub: string;
        type: string;
        roles?: string[];
        sid?: string;
      }>(token);
    } catch {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_TOKEN',
        message: 'Token is invalid or expired.',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { status: true, type: true, activeStudentSessionId: true },
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

    await this.enforceStudentSession({
      userId: payload.sub,
      userType: user.type,
      tokenSid: payload.sid,
      activeStudentSessionId: user.activeStudentSessionId,
    });

    return {
      userId: payload.sub,
      type: user.type,
      roles: payload.roles ?? [],
      sid: payload.sid,
    };
  }

  private isStudentSingleSessionEnabled() {
    return (
      this.configService.get<boolean>('STUDENT_SINGLE_SESSION_ENFORCEMENT') ??
      true
    );
  }

  private async enforceStudentSession(input: {
    userId: string;
    userType: UserType;
    tokenSid?: string;
    activeStudentSessionId?: string | null;
  }) {
    if (
      !this.isStudentSingleSessionEnabled() ||
      input.userType !== UserType.STUDENT
    ) {
      return;
    }

    if (!input.tokenSid) {
      if (input.activeStudentSessionId) {
        this.throwSessionConflict();
      }
      return;
    }

    const activeSession = await this.prisma.refreshSession.findFirst({
      where: {
        id: input.tokenSid,
        userId: input.userId,
        revokedAt: null,
      },
      select: { id: true },
    });
    if (!activeSession) {
      throw new UnauthorizedException({
        code: 'AUTH_SESSION_REVOKED',
        message: 'Session is no longer active. Please login again.',
      });
    }

    if (!input.activeStudentSessionId) {
      const adopted = await this.prisma.user.updateMany({
        where: { id: input.userId, activeStudentSessionId: null },
        data: { activeStudentSessionId: input.tokenSid },
      });

      if (adopted.count > 0) {
        return;
      }

      const currentUser = await this.prisma.user.findUnique({
        where: { id: input.userId },
        select: { activeStudentSessionId: true },
      });

      if (currentUser?.activeStudentSessionId !== input.tokenSid) {
        this.throwSessionConflict();
      }
      return;
    }

    if (input.activeStudentSessionId !== input.tokenSid) {
      this.throwSessionConflict();
    }
  }

  private throwSessionConflict(): never {
    throw new UnauthorizedException({
      code: 'AUTH_SESSION_CONFLICT',
      message:
        'Your account is already active on another device. Please login again.',
    });
  }
}
