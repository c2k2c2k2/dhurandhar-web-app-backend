import {
  BadRequestException,
  ConflictException,
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
import {
  getIndianPhoneAliases,
  normalizeIndianPhone,
} from '../../common/utils/phone';
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

type StudentSingleSessionStrategy =
  | 'FORCE_LOGOUT_EXISTING'
  | 'DENY_NEW_LOGIN';

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
    const normalizedEmail = dto.email.trim().toLowerCase();
    const normalizedPhone = this.normalizeIndianPhoneOrThrow(dto.phone);
    const phoneAliases = getIndianPhoneAliases(normalizedPhone);

    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: normalizedEmail }, { phone: { in: phoneAliases } }],
      },
    });
    if (existing) {
      if (existing.email === normalizedEmail) {
        throw new BadRequestException({
          code: 'AUTH_EMAIL_EXISTS',
          message: 'Email already registered.',
        });
      }

      throw new BadRequestException({
        code: 'AUTH_PHONE_EXISTS',
        message: 'Phone number already registered.',
      });
    }

    await this.consumeRegistrationOtp(normalizedEmail, dto.otp);

    const passwordHash = await this.hashValue(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        phone: normalizedPhone,
        fullName: dto.fullName,
        passwordHash,
        emailVerifiedAt: new Date(),
        type: UserType.STUDENT,
      },
    });

    const { accessToken, refreshToken, sessionId } =
      await this.authTokenService.issueTokens(user.id, user.type);
    await this.createLoginSession(
      user.id,
      user.type,
      refreshToken,
      sessionId,
      meta,
    );

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
    await this.createLoginSession(
      user.id,
      user.type,
      refreshToken,
      sessionId,
      meta,
    );

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
      await this.prisma.$transaction(async (tx) => {
        await tx.refreshSession.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
        });
        await tx.user.updateMany({
          where: {
            id: session.userId,
            activeStudentSessionId: session.id,
          },
          data: { activeStudentSessionId: null },
        });
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

    const enforceStudentSingleSession = this.shouldEnforceStudentSingleSession(
      user.type,
    );
    if (
      enforceStudentSingleSession &&
      user.activeStudentSessionId &&
      user.activeStudentSessionId !== session.id
    ) {
      this.throwSessionConflict();
    }

    const roles = user.userRoles?.map((item) => item.role.key) ?? [];
    const { accessToken, refreshToken, sessionId } =
      await this.authTokenService.issueTokens(user.id, user.type, roles);
    await this.rotateRefreshSession(
      user.id,
      user.type,
      session.id,
      refreshToken,
      sessionId,
      meta,
    );

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

    await this.prisma.$transaction(async (tx) => {
      await tx.refreshSession.updateMany({
        where: { id: payload.sid, userId: payload.sub, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.user.updateMany({
        where: { id: payload.sub, activeStudentSessionId: payload.sid },
        data: { activeStudentSessionId: null },
      });
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

    const [user, sessions] = await this.prisma.$transaction([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { activeStudentSessionId: true },
      }),
      this.prisma.refreshSession.findMany({
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
      }),
    ]);

    return sessions.map((session) => ({
      ...session,
      isActive:
        !session.revokedAt && user?.activeStudentSessionId === session.id,
    }));
  }

  async requestOtp(dto: OtpRequestDto) {
    const identifier = this.resolveIdentifier(dto.email, dto.phone);
    const isEmailIdentifier = identifier.includes('@');
    const user = await this.findUserByIdentifier(identifier);
    const allowEmailVerificationWithoutUser =
      dto.purpose === OtpPurpose.LOGIN && isEmailIdentifier;

    if (!user && !allowEmailVerificationWithoutUser) {
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
        userId: user?.id,
        identifier,
        purpose: dto.purpose,
        codeHash,
        expiresAt,
      },
    });

    const emailTarget =
      dto.email ?? (identifier.includes('@') ? identifier : undefined);
    if (emailTarget) {
      if (user?.id) {
        this.notificationsService
          .sendOtpEmail({
            userId: user.id,
            email: emailTarget,
            otp,
            expiresAt,
            purpose: dto.purpose,
          })
          .catch(() => undefined);
      } else {
        this.notificationsService
          .sendOtpEmailToAddress({
            email: emailTarget,
            otp,
            expiresAt,
            purpose: dto.purpose,
          })
          .catch(() => undefined);
      }
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

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: tokenRecord.userId },
        data: { passwordHash, activeStudentSessionId: null },
      });
      await tx.passwordResetToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: new Date() },
      });
      await tx.refreshSession.updateMany({
        where: { userId: tokenRecord.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.noteViewSession.updateMany({
        where: { userId: tokenRecord.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    return { success: true };
  }

  // Tokens issued via AuthTokenService for easy swap with external IdP later.

  private async createLoginSession(
    userId: string,
    userType: UserType,
    refreshToken: string,
    sessionId: string,
    meta?: { ip?: string; userAgent?: string },
  ) {
    const hashedToken = await this.hashValue(refreshToken);
    const shouldEnforce = this.shouldEnforceStudentSingleSession(userType);
    const strategy = this.getStudentSingleSessionStrategy();

    await this.prisma.$transaction(async (tx) => {
      if (shouldEnforce) {
        if (strategy === 'DENY_NEW_LOGIN') {
          const existingSession = await tx.refreshSession.findFirst({
            where: { userId, revokedAt: null },
            select: { id: true },
          });
          if (existingSession) {
            throw new ConflictException({
              code: 'AUTH_ALREADY_LOGGED_IN',
              message:
                'This account is already active on another device. Please logout there first.',
            });
          }
        } else {
          await tx.refreshSession.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
      }

      await tx.refreshSession.create({
        data: {
          id: sessionId,
          userId,
          hashedToken,
          ip: meta?.ip,
          userAgent: meta?.userAgent,
        },
      });

      if (shouldEnforce) {
        await tx.user.update({
          where: { id: userId },
          data: { activeStudentSessionId: sessionId },
        });
      }
    });
  }

  private async rotateRefreshSession(
    userId: string,
    userType: UserType,
    currentSessionId: string,
    refreshToken: string,
    sessionId: string,
    meta?: { ip?: string; userAgent?: string },
  ) {
    const hashedToken = await this.hashValue(refreshToken);
    const shouldEnforce = this.shouldEnforceStudentSingleSession(userType);

    await this.prisma.$transaction(async (tx) => {
      if (shouldEnforce) {
        await tx.refreshSession.updateMany({
          where: {
            userId,
            revokedAt: null,
            id: { not: currentSessionId },
          },
          data: { revokedAt: new Date() },
        });
      }

      await tx.refreshSession.create({
        data: {
          id: sessionId,
          userId,
          hashedToken,
          ip: meta?.ip,
          userAgent: meta?.userAgent,
        },
      });

      const revokedCurrent = await tx.refreshSession.updateMany({
        where: { id: currentSessionId, userId, revokedAt: null },
        data: { revokedAt: new Date(), replacedBySessionId: sessionId },
      });
      if (!revokedCurrent.count) {
        throw new UnauthorizedException({
          code: 'AUTH_SESSION_REVOKED',
          message: 'Refresh session has been revoked.',
        });
      }

      if (shouldEnforce) {
        await tx.user.update({
          where: { id: userId },
          data: { activeStudentSessionId: sessionId },
        });
      }
    });
  }

  private shouldEnforceStudentSingleSession(userType: UserType) {
    return (
      userType === UserType.STUDENT &&
      (this.configService.get<boolean>('STUDENT_SINGLE_SESSION_ENFORCEMENT') ??
        true)
    );
  }

  private getStudentSingleSessionStrategy(): StudentSingleSessionStrategy {
    return (
      this.configService.get<StudentSingleSessionStrategy>(
        'STUDENT_SINGLE_SESSION_STRATEGY',
      ) ?? 'FORCE_LOGOUT_EXISTING'
    );
  }

  private throwSessionConflict() {
    throw new UnauthorizedException({
      code: 'AUTH_SESSION_CONFLICT',
      message:
        'Your account is already active on another device. Please login again.',
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

    if (email?.trim()) {
      return email.trim().toLowerCase();
    }

    return this.normalizeIndianPhoneOrThrow(phone ?? '');
  }

  private async findUserByIdentifier(identifier: string) {
    if (!identifier.includes('@')) {
      return this.prisma.user.findFirst({
        where: {
          phone: {
            in: getIndianPhoneAliases(identifier),
          },
        },
      });
    }

    return this.prisma.user.findFirst({
      where: {
        email: identifier,
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

  private normalizeIndianPhoneOrThrow(phone: string) {
    try {
      return normalizeIndianPhone(phone);
    } catch {
      throw new BadRequestException({
        code: 'AUTH_PHONE_INVALID',
        message: 'Enter a valid Indian mobile number.',
      });
    }
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

  private async consumeRegistrationOtp(email: string, otp: string) {
    const otpRecord = await this.prisma.otpCode.findFirst({
      where: {
        identifier: email,
        purpose: OtpPurpose.LOGIN,
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

    const valid = await bcrypt.compare(otp, otpRecord.codeHash);
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

    const consumed = await this.prisma.otpCode.updateMany({
      where: { id: otpRecord.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    if (!consumed.count) {
      throw new UnauthorizedException({
        code: 'AUTH_OTP_INVALID',
        message: 'OTP is invalid or expired.',
      });
    }
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
