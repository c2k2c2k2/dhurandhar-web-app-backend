import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Audit, CurrentUser } from '../../common/decorators';
import { Policy, RequireUserType } from '../authorization/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { PolicyGuard } from '../authorization/guards';
import { AdminBlockUserDto, AdminEntitlementDto, AdminUserQueryDto, UpdateMeDto } from './dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, PolicyGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user?: { userId: string }) {
    return this.usersService.getMe(user?.userId);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: { userId: string } | undefined, @Body() dto: UpdateMeDto) {
    return this.usersService.updateMe(user?.userId, dto);
  }

  @Get()
  @RequireUserType('ADMIN')
  @Policy('users.read')
  listUsers(@Query() query: AdminUserQueryDto) {
    return this.usersService.listUsers(query);
  }

  @Get(':userId')
  @RequireUserType('ADMIN')
  @Policy('users.read')
  getUser(@Param('userId') userId: string) {
    return this.usersService.getUser(userId);
  }

  @Patch(':userId/block')
  @RequireUserType('ADMIN')
  @Policy('users.manage')
  @Audit('users.block', 'User')
  blockUser(@Param('userId') userId: string, @Body() dto: AdminBlockUserDto) {
    return this.usersService.blockUser(userId, dto);
  }

  @Patch(':userId/unblock')
  @RequireUserType('ADMIN')
  @Policy('users.manage')
  @Audit('users.unblock', 'User')
  unblockUser(@Param('userId') userId: string) {
    return this.usersService.unblockUser(userId);
  }

  @Post(':userId/force-logout')
  @RequireUserType('ADMIN')
  @Policy('users.manage')
  @Audit('users.force_logout', 'User')
  forceLogout(@Param('userId') userId: string) {
    return this.usersService.forceLogout(userId);
  }

  @Post(':userId/entitlements/grant')
  @RequireUserType('ADMIN')
  @Policy('users.manage')
  @Audit('users.entitlement.grant', 'Entitlement')
  grantEntitlement(@Param('userId') userId: string, @Body() dto: AdminEntitlementDto) {
    return this.usersService.grantEntitlement(userId, dto);
  }

  @Post(':userId/entitlements/revoke')
  @RequireUserType('ADMIN')
  @Policy('users.manage')
  @Audit('users.entitlement.revoke', 'Entitlement')
  revokeEntitlement(@Param('userId') userId: string, @Body() dto: AdminEntitlementDto) {
    return this.usersService.revokeEntitlement(userId, dto);
  }
}
