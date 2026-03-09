import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { seconds, Throttle } from '@nestjs/throttler';
import { CurrentUser, Public } from '../../common/decorators';
import { SiteSettingsService } from '../site-settings/site-settings.service';
import { AuthService } from './auth.service';
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
import { JwtAuthGuard } from './guards';
import { Request } from 'express';

const AUTH_THROTTLE_TTL_SECONDS = 60;
const authThrottleLimit = () =>
  SiteSettingsService.getCachedNumber('AUTH_THROTTLE_LIMIT', 10, {
    integer: true,
    min: 1,
  });

@ApiTags('auth')
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @Throttle({
    default: {
      limit: authThrottleLimit,
      ttl: seconds(AUTH_THROTTLE_TTL_SECONDS),
    },
  })
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  @Public()
  @Post('login')
  @Throttle({
    default: {
      limit: authThrottleLimit,
      ttl: seconds(AUTH_THROTTLE_TTL_SECONDS),
    },
  })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  @Public()
  @Post('refresh')
  @Throttle({
    default: {
      limit: authThrottleLimit,
      ttl: seconds(AUTH_THROTTLE_TTL_SECONDS),
    },
  })
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.authService.refresh(dto, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  @Post('logout')
  logout(@Body() dto: LogoutDto) {
    return this.authService.logout(dto);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user?: { userId: string }) {
    return this.authService.getMe(user?.userId);
  }

  @ApiBearerAuth()
  @Get('sessions')
  sessions(@CurrentUser() user?: { userId: string }) {
    return this.authService.listSessions(user?.userId);
  }

  @Public()
  @Post('otp/request')
  @Throttle({
    default: {
      limit: authThrottleLimit,
      ttl: seconds(AUTH_THROTTLE_TTL_SECONDS),
    },
  })
  requestOtp(@Body() dto: OtpRequestDto) {
    return this.authService.requestOtp(dto);
  }

  @Public()
  @Post('otp/verify')
  @Throttle({
    default: {
      limit: authThrottleLimit,
      ttl: seconds(AUTH_THROTTLE_TTL_SECONDS),
    },
  })
  verifyOtp(@Body() dto: OtpVerifyDto) {
    return this.authService.verifyOtp(dto);
  }

  @Public()
  @Post('password/request')
  @Throttle({
    default: {
      limit: authThrottleLimit,
      ttl: seconds(AUTH_THROTTLE_TTL_SECONDS),
    },
  })
  requestPasswordReset(@Body() dto: PasswordRequestDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Public()
  @Post('password/reset')
  @Throttle({
    default: {
      limit: authThrottleLimit,
      ttl: seconds(AUTH_THROTTLE_TTL_SECONDS),
    },
  })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
