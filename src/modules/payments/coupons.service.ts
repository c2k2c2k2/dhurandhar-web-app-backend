import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CouponCreateDto, CouponQueryDto, CouponUpdateDto } from './dto';

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAdminCoupons(query: CouponQueryDto) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);
    const isActive =
      query.isActive === undefined ? undefined : query.isActive === 'true';

    const where = {
      isActive,
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.coupon.count({ where }),
      this.prisma.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data, total, page, pageSize };
  }

  async createCoupon(dto: CouponCreateDto) {
    const existing = await this.prisma.coupon.findUnique({ where: { code: dto.code } });
    if (existing) {
      throw new BadRequestException({
        code: 'COUPON_CODE_EXISTS',
        message: 'Coupon code already exists.',
      });
    }

    return this.prisma.coupon.create({
      data: {
        code: dto.code,
        type: dto.type,
        value: dto.value,
        maxRedemptions: dto.maxRedemptions,
        maxRedemptionsPerUser: dto.maxRedemptionsPerUser,
        minAmountPaise: dto.minAmountPaise,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        isActive: dto.isActive ?? true,
        metadataJson: dto.metadataJson
          ? (dto.metadataJson as Prisma.InputJsonValue)
          : undefined,
      },
    });
  }

  async updateCoupon(couponId: string, dto: CouponUpdateDto) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id: couponId } });
    if (!coupon) {
      throw new NotFoundException({
        code: 'COUPON_NOT_FOUND',
        message: 'Coupon not found.',
      });
    }

    if (dto.code && dto.code !== coupon.code) {
      const existing = await this.prisma.coupon.findUnique({ where: { code: dto.code } });
      if (existing) {
        throw new BadRequestException({
          code: 'COUPON_CODE_EXISTS',
          message: 'Coupon code already exists.',
        });
      }
    }

    return this.prisma.coupon.update({
      where: { id: couponId },
      data: {
        code: dto.code ?? undefined,
        type: dto.type ?? undefined,
        value: dto.value ?? undefined,
        maxRedemptions: dto.maxRedemptions ?? undefined,
        maxRedemptionsPerUser: dto.maxRedemptionsPerUser ?? undefined,
        minAmountPaise: dto.minAmountPaise ?? undefined,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        isActive: dto.isActive ?? undefined,
        metadataJson: dto.metadataJson
          ? (dto.metadataJson as Prisma.InputJsonValue)
          : undefined,
      },
    });
  }
}
