import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RoleCreateDto, RoleUpdateDto } from './dto';

const SYSTEM_ROLE_KEYS = new Set(['ADMIN_SUPER', 'STUDENT']);
const CORE_RBAC_PERMISSIONS = [
  { key: 'rbac.read', description: 'View roles and permissions.' },
  {
    key: 'rbac.manage',
    description: 'Create and manage roles and role assignments.',
  },
  {
    key: 'subscriptions.manage',
    description: 'Assign subscriptions to students from admin panel.',
  },
] as const;

@Injectable()
export class AccessControlService {
  constructor(private readonly prisma: PrismaService) {}

  async listPermissions() {
    await this.ensureCorePermissions();

    return this.prisma.permission.findMany({
      orderBy: { key: 'asc' },
      select: {
        id: true,
        key: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async listRoles() {
    await this.ensureCorePermissions();

    const roles = await this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: {
        rolePermissions: {
          include: {
            permission: {
              select: {
                id: true,
                key: true,
                description: true,
              },
            },
          },
        },
        _count: {
          select: {
            userRoles: true,
          },
        },
      },
    });

    return roles.map((role) => this.mapRole(role));
  }

  async getRole(roleId: string) {
    await this.ensureCorePermissions();

    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: {
        rolePermissions: {
          include: {
            permission: {
              select: {
                id: true,
                key: true,
                description: true,
              },
            },
          },
        },
        _count: {
          select: {
            userRoles: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException({
        code: 'RBAC_ROLE_NOT_FOUND',
        message: 'Role not found.',
      });
    }

    return this.mapRole(role);
  }

  async createRole(dto: RoleCreateDto) {
    await this.ensureCorePermissions();

    const roleKey = this.normalizeRoleKey(dto.key ?? dto.name);

    if (SYSTEM_ROLE_KEYS.has(roleKey)) {
      throw new BadRequestException({
        code: 'RBAC_ROLE_RESERVED',
        message: 'System role keys cannot be used for custom roles.',
      });
    }

    const permissionKeys = dto.permissionKeys ?? [];
    const permissions = await this.resolvePermissions(permissionKeys);

    try {
      const role = await this.prisma.$transaction(async (tx) => {
        const createdRole = await tx.role.create({
          data: {
            key: roleKey,
            name: dto.name.trim(),
            description: dto.description?.trim() || undefined,
          },
        });

        if (permissions.length) {
          await tx.rolePermission.createMany({
            data: permissions.map((permission) => ({
              roleId: createdRole.id,
              permissionId: permission.id,
            })),
            skipDuplicates: true,
          });
        }

        return tx.role.findUnique({
          where: { id: createdRole.id },
          include: {
            rolePermissions: {
              include: {
                permission: {
                  select: {
                    id: true,
                    key: true,
                    description: true,
                  },
                },
              },
            },
            _count: {
              select: {
                userRoles: true,
              },
            },
          },
        });
      });

      if (!role) {
        throw new NotFoundException({
          code: 'RBAC_ROLE_NOT_FOUND',
          message: 'Role not found.',
        });
      }

      return this.mapRole(role);
    } catch (error) {
      this.handlePrismaError(error);
      throw error;
    }
  }

  async updateRole(roleId: string, dto: RoleUpdateDto) {
    await this.ensureCorePermissions();

    const existing = await this.prisma.role.findUnique({ where: { id: roleId } });

    if (!existing) {
      throw new NotFoundException({
        code: 'RBAC_ROLE_NOT_FOUND',
        message: 'Role not found.',
      });
    }

    if (SYSTEM_ROLE_KEYS.has(existing.key)) {
      throw new ForbiddenException({
        code: 'RBAC_ROLE_SYSTEM_LOCKED',
        message: 'System roles cannot be edited.',
      });
    }

    const permissions =
      dto.permissionKeys === undefined
        ? undefined
        : await this.resolvePermissions(dto.permissionKeys);

    const role = await this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id: roleId },
        data: {
          name: dto.name?.trim() || undefined,
          description:
            dto.description === undefined ? undefined : dto.description.trim() || null,
        },
      });

      if (permissions !== undefined) {
        await tx.rolePermission.deleteMany({ where: { roleId } });

        if (permissions.length) {
          await tx.rolePermission.createMany({
            data: permissions.map((permission) => ({
              roleId,
              permissionId: permission.id,
            })),
            skipDuplicates: true,
          });
        }
      }

      return tx.role.findUnique({
        where: { id: roleId },
        include: {
          rolePermissions: {
            include: {
              permission: {
                select: {
                  id: true,
                  key: true,
                  description: true,
                },
              },
            },
          },
          _count: {
            select: {
              userRoles: true,
            },
          },
        },
      });
    });

    if (!role) {
      throw new NotFoundException({
        code: 'RBAC_ROLE_NOT_FOUND',
        message: 'Role not found.',
      });
    }

    return this.mapRole(role);
  }

  async deleteRole(roleId: string) {
    await this.ensureCorePermissions();

    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: {
        _count: {
          select: {
            userRoles: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException({
        code: 'RBAC_ROLE_NOT_FOUND',
        message: 'Role not found.',
      });
    }

    if (SYSTEM_ROLE_KEYS.has(role.key)) {
      throw new ForbiddenException({
        code: 'RBAC_ROLE_SYSTEM_LOCKED',
        message: 'System roles cannot be deleted.',
      });
    }

    if (role._count.userRoles > 0) {
      throw new BadRequestException({
        code: 'RBAC_ROLE_IN_USE',
        message: 'Role is assigned to users. Unassign it before deleting.',
      });
    }

    await this.prisma.role.delete({ where: { id: roleId } });

    return { success: true };
  }

  private mapRole(role: {
    id: string;
    key: string;
    name: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
    rolePermissions: {
      permission: {
        id: string;
        key: string;
        description: string | null;
      };
    }[];
    _count: {
      userRoles: number;
    };
  }) {
    const permissions = role.rolePermissions
      .map((link) => link.permission)
      .sort((left, right) => left.key.localeCompare(right.key));

    return {
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      isSystem: SYSTEM_ROLE_KEYS.has(role.key),
      userCount: role._count.userRoles,
      permissions,
      permissionKeys: permissions.map((permission) => permission.key),
    };
  }

  private normalizeRoleKey(raw: string) {
    const normalized = raw
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80);

    if (!normalized) {
      throw new BadRequestException({
        code: 'RBAC_ROLE_KEY_INVALID',
        message: 'Role key is invalid.',
      });
    }

    return normalized;
  }

  private async resolvePermissions(permissionKeys: string[]) {
    const uniqueKeys = Array.from(
      new Set(permissionKeys.map((key) => key.trim()).filter((key) => key.length > 0)),
    );

    if (uniqueKeys.length === 0) {
      return [];
    }

    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: uniqueKeys } },
      select: { id: true, key: true },
    });

    if (permissions.length !== uniqueKeys.length) {
      const found = new Set(permissions.map((permission) => permission.key));
      const missing = uniqueKeys.filter((key) => !found.has(key));

      throw new BadRequestException({
        code: 'RBAC_PERMISSION_NOT_FOUND',
        message: `Unknown permission keys: ${missing.join(', ')}`,
      });
    }

    return permissions;
  }

  private handlePrismaError(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new BadRequestException({
        code: 'RBAC_ROLE_KEY_EXISTS',
        message: 'Role key already exists.',
      });
    }
  }

  private async ensureCorePermissions() {
    await this.prisma.permission.createMany({
      data: CORE_RBAC_PERMISSIONS.map((permission) => ({
        key: permission.key,
        description: permission.description,
      })),
      skipDuplicates: true,
    });
  }
}
