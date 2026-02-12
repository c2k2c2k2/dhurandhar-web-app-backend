import { forwardRef, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { parseDurationToSeconds } from '../../common/utils/duration';
import { AuthController } from './auth.controller';
import { AuthSessionService } from './auth-session.service';
import { AuthService } from './auth.service';
import { AuthTokenService } from './auth-token.service';
import { JwtAuthGuard, OptionalJwtAuthGuard } from './guards';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    forwardRef(() => NotificationsModule),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const accessTtl = configService.get<string>('JWT_ACCESS_TTL');
        const accessTtlSeconds = parseDurationToSeconds(accessTtl, 15 * 60);
        return {
          secret: configService.get<string>('JWT_ACCESS_SECRET'),
          signOptions: {
            expiresIn: accessTtlSeconds,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthSessionService, AuthTokenService, JwtAuthGuard, OptionalJwtAuthGuard],
  exports: [
    AuthService,
    AuthSessionService,
    AuthTokenService,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    JwtModule,
  ],
})
export class AuthModule {}
