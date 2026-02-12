import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public } from '../../common/decorators';
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

@ApiTags('auth')
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  @Public()
  @Post('refresh')
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
  requestOtp(@Body() dto: OtpRequestDto) {
    return this.authService.requestOtp(dto);
  }

  @Public()
  @Post('otp/verify')
  verifyOtp(@Body() dto: OtpVerifyDto) {
    return this.authService.verifyOtp(dto);
  }

  @Public()
  @Post('password/request')
  requestPasswordReset(@Body() dto: PasswordRequestDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Public()
  @Post('password/reset')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
