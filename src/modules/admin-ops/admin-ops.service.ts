import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AttemptEventType,
  PaymentOrderStatus,
  PracticeEventType,
  PrintJobStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  AdminContentHealthQueryDto,
  AdminExportSubscriptionsQueryDto,
  AdminOpsSummaryQueryDto,
} from './dto';

@Injectable()
export class AdminOpsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(query: AdminOpsSummaryQueryDto) {
    const { start, end } = this.resolveRange(query.from, query.to, 7);
    const now = new Date();

    const [
      totalUsers,
      totalStudents,
      totalAdmins,
      totalNotes,
      totalQuestions,
      totalTests,
      activeSubscriptions,
      pendingSubscriptions,
      pendingPaymentOrders,
      pendingPrintJobs,
      practiceAnswers,
      attemptSubmissions,
      noteProgressUpdates,
      revenueAgg,
      revenueOrders,
      securitySignals,
    ] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { type: 'STUDENT' } }),
      this.prisma.user.count({ where: { type: 'ADMIN' } }),
      this.prisma.note.count(),
      this.prisma.question.count(),
      this.prisma.test.count(),
      this.prisma.subscription.count({
        where: {
          status: SubscriptionStatus.ACTIVE,
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        },
      }),
      this.prisma.subscription.count({ where: { status: SubscriptionStatus.PENDING } }),
      this.prisma.paymentOrder.count({
        where: { status: { in: [PaymentOrderStatus.CREATED, PaymentOrderStatus.PENDING] } },
      }),
      this.prisma.printJob.count({
        where: { status: { in: [PrintJobStatus.QUEUED, PrintJobStatus.RUNNING] } },
      }),
      this.prisma.practiceQuestionEvent.count({
        where: {
          createdAt: { gte: start, lt: end },
          eventType: PracticeEventType.ANSWERED,
        },
      }),
      this.prisma.attemptEventLog.count({
        where: {
          createdAt: { gte: start, lt: end },
          eventType: AttemptEventType.SUBMIT,
        },
      }),
      this.prisma.noteProgress.count({
        where: { updatedAt: { gte: start, lt: end } },
      }),
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
      this.prisma.noteSecuritySignal.count({
        where: { createdAt: { gte: start, lt: end } },
      }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      range: { from: start.toISOString(), to: end.toISOString() },
      counts: {
        users: totalUsers,
        students: totalStudents,
        admins: totalAdmins,
        notes: totalNotes,
        questions: totalQuestions,
        tests: totalTests,
        activeSubscriptions,
      },
      revenue: {
        orders: revenueOrders,
        amountPaise: revenueAgg._sum.finalAmountPaise ?? 0,
        currency: 'INR',
      },
      activity: {
        practiceAnswers,
        testSubmissions: attemptSubmissions,
        noteProgressUpdates,
      },
      pending: {
        printJobs: pendingPrintJobs,
        paymentOrders: pendingPaymentOrders,
        subscriptions: pendingSubscriptions,
      },
      signals: {
        noteSecuritySignals: securitySignals,
      },
    };
  }

  async getContentHealth(query: AdminContentHealthQueryDto) {
    const subjectWhere = query.subjectId ? { id: query.subjectId } : undefined;
    const topicWhere = query.subjectId ? { subjectId: query.subjectId } : undefined;

    const [subjects, topics] = await this.prisma.$transaction([
      this.prisma.subject.findMany({
        where: subjectWhere,
        orderBy: { orderIndex: 'asc' },
        include: {
          _count: { select: { topics: true, notes: true, questions: true, tests: true } },
        },
      }),
      this.prisma.topic.findMany({
        where: topicWhere,
        orderBy: { orderIndex: 'asc' },
        include: {
          subject: { select: { id: true, name: true } },
          _count: { select: { notes: true, questions: true } },
        },
      }),
    ]);

    const subjectTestCounts = new Map<string, number>();
    subjects.forEach((subject) => {
      subjectTestCounts.set(subject.id, subject._count.tests ?? 0);
    });

    const topicHealth = topics.map((topic) => {
      const testsCount = subjectTestCounts.get(topic.subjectId) ?? 0;
      return {
        id: topic.id,
        name: topic.name,
        subjectId: topic.subjectId,
        subjectName: topic.subject.name,
        notesCount: topic._count.notes,
        questionsCount: topic._count.questions,
        testsCount,
      };
    });

    const missingNotes = topicHealth.filter((topic) => topic.notesCount === 0);
    const missingQuestions = topicHealth.filter((topic) => topic.questionsCount === 0);
    const missingTests = topicHealth.filter((topic) => topic.testsCount === 0);

    return {
      subjects: subjects.map((subject) => ({
        id: subject.id,
        name: subject.name,
        counts: subject._count,
      })),
      topics: topicHealth,
      missing: {
        notes: missingNotes,
        questions: missingQuestions,
        tests: missingTests,
      },
    };
  }

  async exportUsersCsv() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        phone: true,
        fullName: true,
        type: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    const rows = users.map((user) => [
      user.id,
      user.email,
      user.phone ?? '',
      user.fullName ?? '',
      user.type,
      user.status,
      this.formatDate(user.createdAt),
      this.formatDate(user.lastLoginAt),
    ]);

    return this.buildCsv(
      ['id', 'email', 'phone', 'fullName', 'type', 'status', 'createdAt', 'lastLoginAt'],
      rows,
    );
  }

  async exportSubscriptionsCsv(query: AdminExportSubscriptionsQueryDto) {
    const where = {
      status: query.status ? (query.status as SubscriptionStatus) : undefined,
      createdAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };

    const subscriptions = await this.prisma.subscription.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
        plan: { select: { id: true, key: true, name: true, tier: true } },
      },
    });

    const rows = subscriptions.map((subscription) => [
      subscription.id,
      subscription.userId,
      subscription.user?.email ?? '',
      subscription.user?.fullName ?? '',
      subscription.planId,
      subscription.plan?.key ?? '',
      subscription.plan?.name ?? '',
      subscription.plan?.tier ?? '',
      subscription.status,
      this.formatDate(subscription.startsAt),
      this.formatDate(subscription.endsAt),
      this.formatDate(subscription.createdAt),
      subscription.paymentOrderId ?? '',
    ]);

    return this.buildCsv(
      [
        'id',
        'userId',
        'userEmail',
        'userName',
        'planId',
        'planKey',
        'planName',
        'planTier',
        'status',
        'startsAt',
        'endsAt',
        'createdAt',
        'paymentOrderId',
      ],
      rows,
    );
  }

  private resolveRange(from?: string, to?: string, defaultDays = 7) {
    const parsedFrom = this.parseDateInput(from, 'start');
    const parsedTo = this.parseDateInput(to, 'end');
    const end = parsedTo ?? new Date();
    const start =
      parsedFrom ?? new Date(end.getTime() - defaultDays * 24 * 60 * 60 * 1000);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException({
        code: 'ADMIN_RANGE_INVALID',
        message: 'Invalid date range.',
      });
    }

    return { start, end };
  }

  private parseDateInput(value: string | undefined, boundary: 'start' | 'end') {
    if (!value) return undefined;
    const isDateOnly = value.length <= 10;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }
    if (!isDateOnly) {
      return parsed;
    }

    const year = parsed.getUTCFullYear();
    const month = parsed.getUTCMonth();
    const day = parsed.getUTCDate();
    if (boundary === 'start') {
      return new Date(Date.UTC(year, month, day));
    }
    return new Date(Date.UTC(year, month, day + 1));
  }

  private buildCsv(headers: string[], rows: string[][]) {
    const headerLine = headers.map((header) => this.escapeCsv(header)).join(',');
    const dataLines = rows.map((row) => row.map((cell) => this.escapeCsv(cell)).join(','));
    return [headerLine, ...dataLines].join('\n');
  }

  private escapeCsv(value: unknown) {
    const text = value === null || value === undefined ? '' : String(value);
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  private formatDate(value: Date | null) {
    return value ? value.toISOString() : '';
  }
}
