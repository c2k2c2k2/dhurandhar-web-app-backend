import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { parseDurationToSeconds } from '../../common/utils/duration';
import { IAuthTokenService } from './interfaces';

@Injectable()
export class AuthTokenService implements IAuthTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async issueTokens(userId: string, type: UserType, roles: string[] = []) {
    const accessTtl = this.configService.get<string>('JWT_ACCESS_TTL');
    const refreshTtl = this.configService.get<string>('JWT_REFRESH_TTL');
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
    const accessTtlSeconds = parseDurationToSeconds(accessTtl, 15 * 60);
    const refreshTtlSeconds = parseDurationToSeconds(refreshTtl, 30 * 24 * 60 * 60);

    if (!refreshSecret) {
      throw new BadRequestException({
        code: 'AUTH_CONFIG_MISSING',
        message: 'JWT refresh secret missing.',
      });
    }

    const sessionId = randomUUID();
    const accessToken = await this.jwtService.signAsync(
      { sub: userId, type, roles, sid: sessionId },
      { expiresIn: accessTtlSeconds },
    );

    const refreshToken = await this.jwtService.signAsync(
      { sub: userId, sid: sessionId },
      { expiresIn: refreshTtlSeconds, secret: refreshSecret },
    );

    return { accessToken, refreshToken, sessionId };
  }
}
