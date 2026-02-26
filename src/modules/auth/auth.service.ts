import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OtpPurpose, UserType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'crypto';
import ms = require('ms');
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  LoginDto,
  LogoutDto,
  OtpRequestDto,
  OtpVerifyDto,
  PasswordRequestDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
} from './dto';
import { AuthTokenService } from './auth-token.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly authTokenService: AuthTokenService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async register(dto: RegisterDto, meta?: { ip?: string; userAgent?: string }) {
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email },
    });
    if (existing) {
      throw new BadRequestException({
        code: 'AUTH_EMAIL_EXISTS',
        message: 'Email already registered.',
      });
    }

    const passwordHash = await this.hashValue(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        passwordHash,
        type: UserType.STUDENT,
      },
    });

    const { accessToken, refreshToken, sessionId } =
      await this.authTokenService.issueTokens(user.id, user.type);
    await this.createRefreshSession(user.id, refreshToken, sessionId, meta);

    return {
      user: this.sanitizeUser(user),
      accessToken,
      refreshToken,
    };
  }

  async login(dto: LoginDto, meta?: { ip?: string; userAgent?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }

    const roles = user.userRoles?.map((item) => item.role.key) ?? [];
    const { accessToken, refreshToken, sessionId } =
      await this.authTokenService.issueTokens(user.id, user.type, roles);
    await this.createRefreshSession(user.id, refreshToken, sessionId, meta);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastActiveAt: new Date() },
    });

    return {
      user: this.sanitizeUser(user),
      accessToken,
      refreshToken,
    };
  }

  async refresh(dto: RefreshDto, meta?: { ip?: string; userAgent?: string }) {
    const payload = await this.verifyRefreshToken(dto.refreshToken);

    const session = await this.prisma.refreshSession.findUnique({
      where: { id: payload.sid },
    });

    if (!session || session.userId !== payload.sub) {
      throw new UnauthorizedException({
        code: 'AUTH_SESSION_NOT_FOUND',
        message: 'Refresh session not found.',
      });
    }

    if (session.revokedAt) {
      throw new UnauthorizedException({
        code: 'AUTH_SESSION_REVOKED',
        message: 'Refresh session has been revoked.',
      });
    }

    const tokenMatches = await bcrypt.compare(
      dto.refreshToken,
      session.hashedToken,
    );
    if (!tokenMatches) {
      await this.prisma.refreshSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException({
        code: 'AUTH_SESSION_COMPROMISED',
        message: 'Refresh token mismatch.',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTH_USER_NOT_FOUND',
        message: 'User not found.',
      });
    }

    const roles = user.userRoles?.map((item) => item.role.key) ?? [];
    const { accessToken, refreshToken, sessionId } =
      await this.authTokenService.issueTokens(user.id, user.type, roles);
    const newSession = await this.createRefreshSession(
      user.id,
      refreshToken,
      sessionId,
      meta,
    );

    await this.prisma.refreshSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), replacedBySessionId: newSession.id },
    });

    return { accessToken, refreshToken };
  }

  async logout(dto: LogoutDto) {
    if (!dto.refreshToken) {
      throw new BadRequestException({
        code: 'AUTH_REFRESH_REQUIRED',
        message: 'Refresh token is required.',
      });
    }

    const payload = await this.verifyRefreshToken(dto.refreshToken);

    await this.prisma.refreshSession.updateMany({
      where: { id: payload.sid, userId: payload.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { success: true };
  }

  async getMe(userId?: string) {
    if (!userId) {
      throw new UnauthorizedException({
        code: 'AUTH_UNAUTHORIZED',
        message: 'Unauthorized.',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: {
                      select: { key: true },
                    },
                  },
                },
              },
            },
          },
        },
        userPermissions: {
          include: {
            permission: {
              select: { key: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'AUTH_USER_NOT_FOUND',
        message: 'User not found.',
      });
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { lastActiveAt: new Date() },
    });

    return this.sanitizeUser(user, true);
  }

  async listSessions(userId?: string) {
    if (!userId) {
      throw new UnauthorizedException({
        code: 'AUTH_UNAUTHORIZED',
        message: 'Unauthorized.',
      });
    }

    return this.prisma.refreshSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userAgent: true,
        ip: true,
        revokedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async requestOtp(dto: OtpRequestDto) {
    const identifier = this.resolveIdentifier(dto.email, dto.phone);
    const user = await this.findUserByIdentifier(identifier);

    if (!user) {
      throw new NotFoundException({
        code: 'AUTH_USER_NOT_FOUND',
        message: 'User not found.',
      });
    }

    await this.enforceOtpRateLimit(identifier, dto.purpose);

    const otp = this.generateOtp();
    const codeHash = await this.hashValue(otp);
    const expiresAt = new Date(Date.now() + ms('10m'));

    await this.prisma.otpCode.create({
      data: {
        userId: user.id,
        identifier,
        purpose: dto.purpose,
        codeHash,
        expiresAt,
      },
    });

    const emailTarget =
      dto.email ?? (identifier.includes('@') ? identifier : undefined);
    if (emailTarget) {
      this.notificationsService
        .sendOtpEmail({
          userId: user.id,
          email: emailTarget,
          otp,
          expiresAt,
          purpose: dto.purpose,
        })
        .catch(() => undefined);
    }

    return {
      success: true,
      expiresAt,
      otp: this.shouldExposeSecret() ? otp : undefined,
    };
  }

  async verifyOtp(dto: OtpVerifyDto) {
    const identifier = this.resolveIdentifier(dto.email, dto.phone);
    const otpRecord = await this.prisma.otpCode.findFirst({
      where: {
        identifier,
        purpose: dto.purpose,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new UnauthorizedException({
        code: 'AUTH_OTP_INVALID',
        message: 'OTP is invalid or expired.',
      });
    }

    const valid = await bcrypt.compare(dto.otp, otpRecord.codeHash);
    if (!valid) {
      await this.prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException({
        code: 'AUTH_OTP_INVALID',
        message: 'OTP is invalid or expired.',
      });
    }

    await this.prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { consumedAt: new Date() },
    });

    if (dto.purpose === OtpPurpose.PASSWORD_RESET) {
      const userId = otpRecord.userId;
      if (!userId) {
        throw new UnauthorizedException({
          code: 'AUTH_USER_NOT_FOUND',
          message: 'User not found.',
        });
      }
      const { token, expiresAt } = await this.createPasswordResetToken(userId);

      return {
        success: true,
        resetToken: this.shouldExposeSecret() ? token : undefined,
        expiresAt,
      };
    }

    return { success: true };
  }

  async requestPasswordReset(dto: PasswordRequestDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'AUTH_USER_NOT_FOUND',
        message: 'User not found.',
      });
    }

    const { token, expiresAt } = await this.createPasswordResetToken(user.id);

    if (user.email) {
      this.notificationsService
        .sendPasswordResetEmail({
          userId: user.id,
          email: user.email,
          token,
          redirectUrl: dto.redirectUrl,
          expiresAt,
        })
        .catch(() => undefined);
    }

    return {
      success: true,
      resetToken: this.shouldExposeSecret() ? token : undefined,
      expiresAt,
      redirectUrl: dto.redirectUrl,
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const [tokenId, tokenSecret] = dto.token.split('.');
    if (!tokenId || !tokenSecret) {
      throw new UnauthorizedException({
        code: 'AUTH_RESET_INVALID',
        message: 'Reset token is invalid or expired.',
      });
    }

    const tokenRecord = await this.prisma.passwordResetToken.findUnique({
      where: { id: tokenId },
    });

    if (
      !tokenRecord ||
      tokenRecord.usedAt ||
      tokenRecord.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException({
        code: 'AUTH_RESET_INVALID',
        message: 'Reset token is invalid or expired.',
      });
    }

    const valid = await bcrypt.compare(tokenSecret, tokenRecord.tokenHash);
    if (!valid) {
      throw new UnauthorizedException({
        code: 'AUTH_RESET_INVALID',
        message: 'Reset token is invalid or expired.',
      });
    }

    const passwordHash = await this.hashValue(dto.newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: tokenRecord.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { success: true };
  }

  // Tokens issued via AuthTokenService for easy swap with external IdP later.

  private async createRefreshSession(
    userId: string,
    refreshToken: string,
    sessionId: string,
    meta?: { ip?: string; userAgent?: string },
  ) {
    return this.prisma.refreshSession.create({
      data: {
        id: sessionId,
        userId,
        hashedToken: await this.hashValue(refreshToken),
        ip: meta?.ip,
        userAgent: meta?.userAgent,
      },
    });
  }

  private async verifyRefreshToken(
    token: string,
  ): Promise<{ sub: string; sid: string }> {
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!refreshSecret) {
      throw new BadRequestException({
        code: 'AUTH_CONFIG_MISSING',
        message: 'JWT refresh secret missing.',
      });
    }

    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        sid?: string;
      }>(token, {
        secret: refreshSecret,
      });
      if (!payload.sub || !payload.sid) {
        throw new Error('Missing subject');
      }
      return { sub: payload.sub, sid: payload.sid };
    } catch {
      throw new UnauthorizedException({
        code: 'AUTH_REFRESH_INVALID',
        message: 'Invalid refresh token.',
      });
    }
  }

  private sanitizeUser(
    user: {
      id: string;
      email: string;
      fullName?: string | null;
      type: UserType;
      userRoles?: {
        role: {
          key: string;
          rolePermissions?: { permission: { key: string } }[];
        };
      }[];
      userPermissions?: {
        allow: boolean;
        permission: { key: string };
      }[];
    },
    includeRoles = false,
  ) {
    const base = {
      id: user.id,
      email: user.email,
      fullName: user.fullName ?? undefined,
      type: user.type,
    };

    if (!includeRoles) {
      return base;
    }

    const permissions = new Set<string>();
    user.userRoles?.forEach((roleLink) => {
      roleLink.role.rolePermissions?.forEach((rolePermission) => {
        permissions.add(rolePermission.permission.key);
      });
    });
    user.userPermissions?.forEach((userPermission) => {
      if (userPermission.allow) {
        permissions.add(userPermission.permission.key);
      } else {
        permissions.delete(userPermission.permission.key);
      }
    });

    return {
      ...base,
      roles: user.userRoles?.map((item) => item.role.key) ?? [],
      permissions: Array.from(permissions).sort((left, right) =>
        left.localeCompare(right),
      ),
    };
  }

  private resolveIdentifier(email?: string, phone?: string) {
    if (!email && !phone) {
      throw new BadRequestException({
        code: 'AUTH_IDENTIFIER_REQUIRED',
        message: 'Email or phone is required.',
      });
    }
    return email ?? phone ?? '';
  }

  private async findUserByIdentifier(identifier: string) {
    return this.prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { phone: identifier }],
      },
    });
  }

  private generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private generateToken() {
    return randomBytes(32).toString('hex');
  }

  private async hashValue(value: string) {
    return bcrypt.hash(value, 10);
  }

  private async createPasswordResetToken(userId: string) {
    const tokenId = randomUUID();
    const tokenSecret = this.generateToken();
    const tokenHash = await this.hashValue(tokenSecret);
    const expiresAt = new Date(Date.now() + ms('30m'));

    await this.prisma.passwordResetToken.create({
      data: {
        id: tokenId,
        userId,
        tokenHash,
        expiresAt,
      },
    });

    return { token: `${tokenId}.${tokenSecret}`, expiresAt };
  }

  private async enforceOtpRateLimit(identifier: string, purpose: OtpPurpose) {
    const now = new Date();
    const cooldownMs = 60 * 1000;
    const windowMs = 15 * 60 * 1000;
    const maxRequests = 5;

    const latest = await this.prisma.otpCode.findFirst({
      where: { identifier, purpose },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    if (latest && now.getTime() - latest.createdAt.getTime() < cooldownMs) {
      throw new BadRequestException({
        code: 'AUTH_OTP_COOLDOWN',
        message: 'Please wait before requesting another OTP.',
      });
    }

    const recentCount = await this.prisma.otpCode.count({
      where: {
        identifier,
        purpose,
        createdAt: { gte: new Date(now.getTime() - windowMs) },
      },
    });

    if (recentCount >= maxRequests) {
      throw new BadRequestException({
        code: 'AUTH_OTP_RATE_LIMIT',
        message: 'Too many OTP requests. Please try again later.',
      });
    }
  }

  private shouldExposeSecret() {
    return (
      (this.configService.get<string>('NODE_ENV') ?? 'development') !==
      'production'
    );
  }
}
