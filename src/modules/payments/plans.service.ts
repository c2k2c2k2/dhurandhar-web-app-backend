import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PlanCreateDto, PlanQueryDto, PlanUpdateDto } from './dto';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublicPlans() {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { pricePaise: 'asc' },
    });
  }

  async listAdminPlans(query: PlanQueryDto) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);
    const isActive =
      query.isActive === undefined ? undefined : query.isActive === 'true';

    const where = {
      isActive,
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.plan.count({ where }),
      this.prisma.plan.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data, total, page, pageSize };
  }

  async createPlan(dto: PlanCreateDto) {
    const existing = await this.prisma.plan.findUnique({ where: { key: dto.key } });
    if (existing) {
      throw new BadRequestException({
        code: 'PLAN_KEY_EXISTS',
        message: 'Plan key already exists.',
      });
    }

    return this.prisma.plan.create({
      data: {
        key: dto.key,
        name: dto.name,
        tier: dto.tier,
        pricePaise: dto.pricePaise,
        durationDays: dto.durationDays,
        isActive: dto.isActive ?? true,
        metadataJson: dto.metadataJson
          ? (dto.metadataJson as Prisma.InputJsonValue)
          : undefined,
        featuresJson: dto.featuresJson
          ? (dto.featuresJson as Prisma.InputJsonValue)
          : undefined,
      },
    });
  }

  async updatePlan(planId: string, dto: PlanUpdateDto) {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundException({
        code: 'PLAN_NOT_FOUND',
        message: 'Plan not found.',
      });
    }

    if (dto.key && dto.key !== plan.key) {
      const existing = await this.prisma.plan.findUnique({ where: { key: dto.key } });
      if (existing) {
        throw new BadRequestException({
          code: 'PLAN_KEY_EXISTS',
          message: 'Plan key already exists.',
        });
      }
    }

    return this.prisma.plan.update({
      where: { id: planId },
      data: {
        key: dto.key ?? undefined,
        name: dto.name ?? undefined,
        tier: dto.tier ?? undefined,
        pricePaise: dto.pricePaise ?? undefined,
        durationDays: dto.durationDays ?? undefined,
        isActive: dto.isActive ?? undefined,
        metadataJson: dto.metadataJson
          ? (dto.metadataJson as Prisma.InputJsonValue)
          : undefined,
        featuresJson: dto.featuresJson
          ? (dto.featuresJson as Prisma.InputJsonValue)
          : undefined,
      },
    });
  }
}
