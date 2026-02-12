import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async assertPermission(userId: string | undefined, permissionKey: string) {
    if (!userId) {
      throw new UnauthorizedException({
        code: 'AUTHZ_UNAUTHORIZED',
        message: 'Unauthorized.',
      });
    }

    const permissions = await this.getUserPermissions(userId);
    if (!permissions.has(permissionKey)) {
      throw new ForbiddenException({
        code: 'AUTHZ_FORBIDDEN',
        message: 'You do not have permission to perform this action.',
      });
    }
  }

  async getUserPermissions(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
        },
        userPermissions: { include: { permission: true } },
      },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTHZ_USER_NOT_FOUND',
        message: 'User not found.',
      });
    }

    const permissions = new Set<string>();

    user.userRoles.forEach((roleLink) => {
      roleLink.role.rolePermissions.forEach((rolePermission) => {
        permissions.add(rolePermission.permission.key);
      });
    });

    user.userPermissions.forEach((userPermission) => {
      if (userPermission.allow) {
        permissions.add(userPermission.permission.key);
      } else {
        permissions.delete(userPermission.permission.key);
      }
    });

    return permissions;
  }
}
