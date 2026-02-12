import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AttemptEventType, PaymentOrderStatus, PracticeEventType, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class AnalyticsRollupService {
  private readonly logger = new Logger(AnalyticsRollupService.name);
  private readonly globalDimension = '__GLOBAL__';

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 3 * * *')
  async recomputeYesterday() {
    const today = new Date();
    const target = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1));
    await this.recomputeDay(target);
  }

  private async recomputeDay(day: Date) {
    const { start, end } = this.getDayBounds(day);

    const [
      practiceAnswered,
      practiceCorrect,
      practiceWrong,
      submissions,
      noteUpdates,
      revenueAgg,
      orderCount,
      practiceUsers,
      attemptUsers,
      noteUsers,
    ] = await Promise.all([
      this.prisma.practiceQuestionEvent.count({
        where: {
          createdAt: { gte: start, lt: end },
          eventType: PracticeEventType.ANSWERED,
        },
      }),
      this.prisma.practiceQuestionEvent.count({
        where: {
          createdAt: { gte: start, lt: end },
          eventType: PracticeEventType.ANSWERED,
          isCorrect: true,
        },
      }),
      this.prisma.practiceQuestionEvent.count({
        where: {
          createdAt: { gte: start, lt: end },
          eventType: PracticeEventType.ANSWERED,
          isCorrect: false,
        },
      }),
      this.prisma.attemptEventLog.count({
        where: { createdAt: { gte: start, lt: end }, eventType: AttemptEventType.SUBMIT },
      }),
      this.prisma.noteProgress.count({ where: { updatedAt: { gte: start, lt: end } } }),
      this.prisma.paymentOrder.aggregate({
        where: {
          status: PaymentOrderStatus.SUCCESS,
          completedAt: { gte: start, lt: end },
        },
        _sum: { finalAmountPaise: true },
      }),
      this.prisma.paymentOrder.count({
        where: {
          status: PaymentOrderStatus.SUCCESS,
          completedAt: { gte: start, lt: end },
        },
      }),
      this.prisma.practiceQuestionEvent.findMany({
        where: {
          createdAt: { gte: start, lt: end },
          eventType: PracticeEventType.ANSWERED,
        },
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.attempt.findMany({
        where: { createdAt: { gte: start, lt: end } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.noteProgress.findMany({
        where: { updatedAt: { gte: start, lt: end } },
        select: { userId: true },
        distinct: ['userId'],
      }),
    ]);

    const activeUsers = new Set<string>();
    practiceUsers.forEach((item) => activeUsers.add(item.userId));
    attemptUsers.forEach((item) => activeUsers.add(item.userId));
    noteUsers.forEach((item) => activeUsers.add(item.userId));

    await Promise.all([
      this.upsertDailyStat(start, 'practice.answers', practiceAnswered),
      this.upsertDailyStat(start, 'practice.correct', practiceCorrect),
      this.upsertDailyStat(start, 'practice.wrong', practiceWrong),
      this.upsertDailyStat(start, 'tests.submitted', submissions),
      this.upsertDailyStat(start, 'notes.progress', noteUpdates),
      this.upsertDailyStat(start, 'orders.success', orderCount),
      this.upsertDailyStat(start, 'revenue.paid', revenueAgg._sum.finalAmountPaise ?? 0, {
        currency: 'INR',
      }),
      this.upsertDailyStat(start, 'users.active', activeUsers.size),
    ]);

    this.logger.log(
      `Daily stats recomputed for ${start.toISOString().slice(0, 10)}: active=${activeUsers.size}`,
    );
  }

  private getDayBounds(date: Date) {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
    return { start, end };
  }

  private async upsertDailyStat(
    date: Date,
    metricKey: string,
    valueInt: number,
    metaJson?: Record<string, unknown>,
  ) {
    await this.prisma.dailyStat.upsert({
      where: {
        date_metricKey_dimensionKey_dimensionValue: {
          date,
          metricKey,
          dimensionKey: this.globalDimension,
          dimensionValue: this.globalDimension,
        },
      },
      update: {
        valueInt,
        metaJson: metaJson ? (metaJson as Prisma.InputJsonValue) : undefined,
      },
      create: {
        date,
        metricKey,
        dimensionKey: this.globalDimension,
        dimensionValue: this.globalDimension,
        valueInt,
        metaJson: metaJson ? (metaJson as Prisma.InputJsonValue) : undefined,
      },
    });
  }
}
