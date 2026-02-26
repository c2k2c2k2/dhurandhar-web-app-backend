import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Audit, CurrentUser } from '../../common/decorators';
import { Policy, RequireUserType } from '../authorization/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { PolicyGuard } from '../authorization/guards';
import {
  AdminActivateSubscriptionDto,
  AdminBlockUserDto,
  AdminCreateUserDto,
  AdminEntitlementDto,
  AdminUpdateUserDto,
  AdminUserQueryDto,
  UpdateMeDto,
} from './dto';
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
  updateMe(
    @CurrentUser() user: { userId: string } | undefined,
    @Body() dto: UpdateMeDto,
  ) {
    return this.usersService.updateMe(user?.userId, dto);
  }

  @Post()
  @RequireUserType('ADMIN')
  @Policy('users.manage')
  @Audit('users.create', 'User')
  createUser(
    @CurrentUser() user: { userId: string },
    @Body() dto: AdminCreateUserDto,
  ) {
    return this.usersService.createUser(user.userId, dto);
  }

  @Get()
  @RequireUserType('ADMIN')
  @Policy('users.read')
  listUsers(@Query() query: AdminUserQueryDto) {
    return this.usersService.listUsers(query);
  }

  @Get(':userId/authorization')
  @RequireUserType('ADMIN')
  @Policy('rbac.read')
  getUserAuthorization(@Param('userId') userId: string) {
    return this.usersService.getUserAuthorization(userId);
  }

  @Get(':userId')
  @RequireUserType('ADMIN')
  @Policy('users.read')
  getUser(@Param('userId') userId: string) {
    return this.usersService.getUser(userId);
  }

  @Patch(':userId')
  @RequireUserType('ADMIN')
  @Policy('users.manage')
  @Audit('users.update', 'User')
  updateUser(
    @CurrentUser() user: { userId: string },
    @Param('userId') userId: string,
    @Body() dto: AdminUpdateUserDto,
  ) {
    return this.usersService.updateUser(user.userId, userId, dto);
  }

  @Patch(':userId/block')
  @RequireUserType('ADMIN')
  @Policy('users.manage')
  @Audit('users.block', 'User')
  blockUser(
    @CurrentUser() user: { userId: string },
    @Param('userId') userId: string,
    @Body() dto: AdminBlockUserDto,
  ) {
    return this.usersService.blockUser(user.userId, userId, dto);
  }

  @Patch(':userId/unblock')
  @RequireUserType('ADMIN')
  @Policy('users.manage')
  @Audit('users.unblock', 'User')
  unblockUser(@CurrentUser() user: { userId: string }, @Param('userId') userId: string) {
    return this.usersService.unblockUser(user.userId, userId);
  }

  @Post(':userId/force-logout')
  @RequireUserType('ADMIN')
  @Policy('users.manage')
  @Audit('users.force_logout', 'User')
  forceLogout(@CurrentUser() user: { userId: string }, @Param('userId') userId: string) {
    return this.usersService.forceLogout(user.userId, userId);
  }

  @Post(':userId/entitlements/grant')
  @RequireUserType('ADMIN')
  @Policy('users.manage')
  @Audit('users.entitlement.grant', 'Entitlement')
  grantEntitlement(
    @CurrentUser() user: { userId: string },
    @Param('userId') userId: string,
    @Body() dto: AdminEntitlementDto,
  ) {
    return this.usersService.grantEntitlement(user.userId, userId, dto);
  }

  @Post(':userId/entitlements/revoke')
  @RequireUserType('ADMIN')
  @Policy('users.manage')
  @Audit('users.entitlement.revoke', 'Entitlement')
  revokeEntitlement(
    @CurrentUser() user: { userId: string },
    @Param('userId') userId: string,
    @Body() dto: AdminEntitlementDto,
  ) {
    return this.usersService.revokeEntitlement(user.userId, userId, dto);
  }

  @Post(':userId/subscriptions/activate')
  @RequireUserType('ADMIN')
  @Policy('subscriptions.manage')
  @Audit('users.subscription.activate', 'Subscription')
  activateSubscription(
    @CurrentUser() user: { userId: string },
    @Param('userId') userId: string,
    @Body() dto: AdminActivateSubscriptionDto,
  ) {
    return this.usersService.activateSubscriptionByAdmin(
      user.userId,
      userId,
      dto,
    );
  }
}
