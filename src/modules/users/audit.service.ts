import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AdminAuditQueryDto } from './dto';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async listAuditLogs(query: AdminAuditQueryDto) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);

    const where = {
      actorUserId: query.actorUserId ?? undefined,
      action: query.action ?? undefined,
      resourceType: query.resourceType ?? undefined,
      resourceId: query.resourceId ?? undefined,
      createdAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          actorUser: {
            select: { id: true, email: true, fullName: true },
          },
        },
      }),
    ]);

    return { data, total, page, pageSize };
  }
}
