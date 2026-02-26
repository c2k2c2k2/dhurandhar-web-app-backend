import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Audit } from '../../common/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { Policy, RequireUserType } from '../authorization/decorators';
import { PolicyGuard } from '../authorization/guards';
import { RoleCreateDto, RoleUpdateDto } from './dto';
import { AccessControlService } from './access-control.service';

@ApiTags('admin-rbac')
@ApiBearerAuth()
@Controller('admin/rbac')
@UseGuards(JwtAuthGuard, PolicyGuard)
export class AdminAccessControlController {
  constructor(private readonly accessControlService: AccessControlService) {}

  @Get('permissions')
  @RequireUserType('ADMIN')
  @Policy('rbac.read')
  listPermissions() {
    return this.accessControlService.listPermissions();
  }

  @Get('roles')
  @RequireUserType('ADMIN')
  @Policy('rbac.read')
  listRoles() {
    return this.accessControlService.listRoles();
  }

  @Get('roles/:roleId')
  @RequireUserType('ADMIN')
  @Policy('rbac.read')
  getRole(@Param('roleId') roleId: string) {
    return this.accessControlService.getRole(roleId);
  }

  @Post('roles')
  @RequireUserType('ADMIN')
  @Policy('rbac.manage')
  @Audit('rbac.role.create', 'Role')
  createRole(@Body() dto: RoleCreateDto) {
    return this.accessControlService.createRole(dto);
  }

  @Patch('roles/:roleId')
  @RequireUserType('ADMIN')
  @Policy('rbac.manage')
  @Audit('rbac.role.update', 'Role')
  updateRole(@Param('roleId') roleId: string, @Body() dto: RoleUpdateDto) {
    return this.accessControlService.updateRole(roleId, dto);
  }

  @Delete('roles/:roleId')
  @RequireUserType('ADMIN')
  @Policy('rbac.manage')
  @Audit('rbac.role.delete', 'Role')
  deleteRole(@Param('roleId') roleId: string) {
    return this.accessControlService.deleteRole(roleId);
  }
}
