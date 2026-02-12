import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AttemptStatus,
  PaymentOrderStatus,
  PracticeEventType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  AdminAnalyticsCoverageDto,
  AdminAnalyticsEngagementDto,
  AdminAnalyticsRangeDto,
  AdminAnalyticsRevenueDto,
  AnalyticsNotesQueryDto,
  AnalyticsPaginationDto,
  AnalyticsTestBreakdownDto,
  AnalyticsWeakQueryDto,
} from './dto';

type BreakdownTotals = { correct: number; wrong: number; total: number };

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStudentSummary(userId: string) {
    const [
      noteTotal,
      noteCompleted,
      noteAvg,
      noteLast,
      practiceTotal,
      practiceCorrect,
      practiceWrong,
      practiceLast,
      attemptTotal,
      attemptEvaluated,
      attemptAvg,
      attemptLast,
    ] = await Promise.all([
      this.prisma.noteProgress.count({ where: { userId } }),
      this.prisma.noteProgress.count({
        where: { userId, completionPercent: { gte: 99 } },
      }),
      this.prisma.noteProgress.aggregate({
        where: { userId },
        _avg: { completionPercent: true },
      }),
      this.prisma.noteProgress.findFirst({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
      this.prisma.practiceQuestionEvent.count({
        where: { userId, eventType: PracticeEventType.ANSWERED },
      }),
      this.prisma.practiceQuestionEvent.count({
        where: { userId, eventType: PracticeEventType.ANSWERED, isCorrect: true },
      }),
      this.prisma.practiceQuestionEvent.count({
        where: { userId, eventType: PracticeEventType.ANSWERED, isCorrect: false },
      }),
      this.prisma.practiceQuestionEvent.findFirst({
        where: { userId, eventType: PracticeEventType.ANSWERED },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.prisma.attempt.count({ where: { userId } }),
      this.prisma.attempt.count({
        where: { userId, status: AttemptStatus.EVALUATED },
      }),
      this.prisma.attempt.aggregate({
        where: { userId, totalScore: { not: null } },
        _avg: { totalScore: true },
      }),
      this.prisma.attempt.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    const practiceAccuracy =
      practiceTotal > 0 ? Math.round((practiceCorrect / practiceTotal) * 100) : 0;
    const noteCompletionRate =
      noteTotal > 0 ? Math.round((noteCompleted / noteTotal) * 100) : 0;

    return {
      notes: {
        total: noteTotal,
        completed: noteCompleted,
        inProgress: Math.max(0, noteTotal - noteCompleted),
        completionRate: noteCompletionRate,
        averageCompletion: noteAvg._avg.completionPercent ?? 0,
        lastUpdatedAt: noteLast?.updatedAt ?? null,
      },
      practice: {
        answered: practiceTotal,
        correct: practiceCorrect,
        wrong: practiceWrong,
        accuracy: practiceAccuracy,
        lastAnsweredAt: practiceLast?.createdAt ?? null,
      },
      tests: {
        attempts: attemptTotal,
        evaluated: attemptEvaluated,
        averageScore: attemptAvg._avg.totalScore ?? 0,
        lastAttemptAt: attemptLast?.createdAt ?? null,
      },
    };
  }

  async listNoteProgress(userId: string, query: AnalyticsNotesQueryDto) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);
    const status = query.status?.toLowerCase();

    const where: Prisma.NoteProgressWhereInput = { userId };
    if (status === 'completed') {
      where.completionPercent = { gte: 99 };
    } else if (status === 'in-progress' || status === 'in_progress') {
      where.completionPercent = { lt: 99 };
    }

    const noteWhere: Prisma.NoteWhereInput = {};
    if (query.subjectId) {
      noteWhere.subjectId = query.subjectId;
    }
    if (query.topicId) {
      noteWhere.topics = { some: { topicId: query.topicId } };
    }
    if (Object.keys(noteWhere).length > 0) {
      where.note = noteWhere;
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.noteProgress.count({ where }),
      this.prisma.noteProgress.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          note: {
            include: {
              topics: { include: { topic: true } },
            },
          },
        },
      }),
    ]);

    return { data, total, page, pageSize };
  }

  async listPracticeTopics(userId: string, query: AnalyticsPaginationDto) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);

    const [total, data] = await this.prisma.$transaction([
      this.prisma.userTopicProgress.count({ where: { userId } }),
      this.prisma.userTopicProgress.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { topic: { include: { subject: true } } },
      }),
    ]);

    return { data, total, page, pageSize };
  }

  async listWeakQuestions(userId: string, query: AnalyticsWeakQueryDto) {
    const limit = query.limit ? Number(query.limit) : 20;
    const take = Number.isNaN(limit) ? 20 : Math.min(Math.max(limit, 1), 100);

    return this.prisma.userQuestionState.findMany({
      where: { userId, wrongCount: { gt: 0 } },
      orderBy: [{ wrongCount: 'desc' }, { updatedAt: 'desc' }],
      take,
      include: {
        question: {
          select: {
            id: true,
            subjectId: true,
            topicId: true,
            type: true,
            difficulty: true,
            statementJson: true,
            optionsJson: true,
            explanationJson: true,
            hasMedia: true,
          },
        },
      },
    });
  }

  async getTestSummary(userId: string) {
    const [total, evaluated, avgScore, lastAttempt] = await Promise.all([
      this.prisma.attempt.count({ where: { userId } }),
      this.prisma.attempt.count({
        where: { userId, status: AttemptStatus.EVALUATED },
      }),
      this.prisma.attempt.aggregate({
        where: { userId, totalScore: { not: null } },
        _avg: { totalScore: true },
        _max: { totalScore: true },
      }),
      this.prisma.attempt.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, status: true, totalScore: true },
      }),
    ]);

    return {
      attempts: total,
      evaluated,
      averageScore: avgScore._avg.totalScore ?? 0,
      bestScore: avgScore._max.totalScore ?? 0,
      lastAttempt,
    };
  }

  async getTestBreakdown(userId: string, query: AnalyticsTestBreakdownDto) {
    const days = query.days ? Number(query.days) : 30;
    if (Number.isNaN(days) || days <= 0) {
      throw new BadRequestException({
        code: 'ANALYTICS_DAYS_INVALID',
        message: 'Days must be a positive number.',
      });
    }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const attempts = await this.prisma.attempt.findMany({
      where: {
        userId,
        status: AttemptStatus.EVALUATED,
        createdAt: { gte: since },
      },
      select: { scoreJson: true },
    });

    const perTopic: Record<string, BreakdownTotals> = {};
    const perSubject: Record<string, BreakdownTotals> = {};

    for (const attempt of attempts) {
      const score = attempt.scoreJson as
        | {
            perTopic?: Record<string, BreakdownTotals>;
            perSubject?: Record<string, BreakdownTotals>;
          }
        | null
        | undefined;

      if (score?.perTopic) {
        Object.entries(score.perTopic).forEach(([topicId, totals]) => {
          const current = perTopic[topicId] ?? { correct: 0, wrong: 0, total: 0 };
          current.correct += totals.correct ?? 0;
          current.wrong += totals.wrong ?? 0;
          current.total += totals.total ?? 0;
          perTopic[topicId] = current;
        });
      }

      if (score?.perSubject) {
        Object.entries(score.perSubject).forEach(([subjectId, totals]) => {
          const current = perSubject[subjectId] ?? { correct: 0, wrong: 0, total: 0 };
          current.correct += totals.correct ?? 0;
          current.wrong += totals.wrong ?? 0;
          current.total += totals.total ?? 0;
          perSubject[subjectId] = current;
        });
      }
    }

    const topicIds = Object.keys(perTopic);
    const subjectIds = Object.keys(perSubject);

    type TopicSummary = { id: string; name: string; subjectId: string };
    type SubjectSummary = { id: string; name: string };

    const [topics, subjects] = await Promise.all([
      topicIds.length
        ? this.prisma.topic.findMany({
            where: { id: { in: topicIds } },
            select: { id: true, name: true, subjectId: true },
          })
        : Promise.resolve([] as TopicSummary[]),
      subjectIds.length
        ? this.prisma.subject.findMany({
            where: { id: { in: subjectIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as SubjectSummary[]),
    ]);

    const topicMap = new Map<string, TopicSummary>(
      topics.map((topic) => [topic.id, topic] as const),
    );
    const subjectMap = new Map<string, SubjectSummary>(
      subjects.map((subject) => [subject.id, subject] as const),
    );

    return {
      days,
      perTopic: topicIds.map((topicId) => ({
        topicId,
        topicName: topicMap.get(topicId)?.name ?? null,
        subjectId: topicMap.get(topicId)?.subjectId ?? null,
        ...perTopic[topicId],
      })),
      perSubject: subjectIds.map((subjectId) => ({
        subjectId,
        subjectName: subjectMap.get(subjectId)?.name ?? null,
        ...perSubject[subjectId],
      })),
    };
  }

  async getAdminKpis(query: AdminAnalyticsRangeDto) {
    const { start, end } = this.resolveRange(query.from, query.to, 30);

    const [
      totalUsers,
      totalStudents,
      totalAdmins,
      totalNotes,
      totalQuestions,
      totalTests,
      ordersCount,
      revenueAgg,
      attemptsCount,
      practiceAnswers,
      noteProgressUpdates,
    ] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { type: 'STUDENT' } }),
      this.prisma.user.count({ where: { type: 'ADMIN' } }),
      this.prisma.note.count(),
      this.prisma.question.count(),
      this.prisma.test.count(),
      this.prisma.paymentOrder.count({
        where: {
          status: PaymentOrderStatus.SUCCESS,
          completedAt: { gte: start, lt: end },
        },
      }),
      this.prisma.paymentOrder.aggregate({
        where: {
          status: PaymentOrderStatus.SUCCESS,
          completedAt: { gte: start, lt: end },
        },
        _sum: { finalAmountPaise: true },
      }),
      this.prisma.attempt.count({
        where: { createdAt: { gte: start, lt: end } },
      }),
      this.prisma.practiceQuestionEvent.count({
        where: {
          createdAt: { gte: start, lt: end },
          eventType: PracticeEventType.ANSWERED,
        },
      }),
      this.prisma.noteProgress.count({
        where: { updatedAt: { gte: start, lt: end } },
      }),
    ]);

    const [dau, wau, activeRange] = await Promise.all([
      this.countActiveUsers(new Date(Date.now() - 24 * 60 * 60 * 1000), new Date()),
      this.countActiveUsers(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), new Date()),
      this.countActiveUsers(start, end),
    ]);

    return {
      range: { from: start.toISOString(), to: end.toISOString() },
      users: {
        total: totalUsers,
        students: totalStudents,
        admins: totalAdmins,
        activeRange,
        dau,
        wau,
      },
      content: {
        notes: totalNotes,
        questions: totalQuestions,
        tests: totalTests,
      },
      activity: {
        attempts: attemptsCount,
        practiceAnswers,
        noteProgressUpdates,
      },
      revenue: {
        orders: ordersCount,
        amountPaise: revenueAgg._sum.finalAmountPaise ?? 0,
        currency: 'INR',
      },
    };
  }

  async getAdminRevenue(query: AdminAnalyticsRevenueDto) {
    const period = (query.period ?? 'day').toLowerCase();
    if (!['day', 'week', 'month'].includes(period)) {
      throw new BadRequestException({
        code: 'ANALYTICS_PERIOD_INVALID',
        message: 'Period must be day, week, or month.',
      });
    }

    const { start, end } = this.resolveRange(query.from, query.to, 30);
    const orders = await this.prisma.paymentOrder.findMany({
      where: {
        status: PaymentOrderStatus.SUCCESS,
        completedAt: { gte: start, lt: end },
      },
      select: { completedAt: true, finalAmountPaise: true },
    });

    const keys = this.enumerateBuckets(start, end, period as 'day' | 'week' | 'month');
    const buckets = new Map<string, { key: string; amountPaise: number; orderCount: number }>();
    keys.forEach((key) => buckets.set(key, { key, amountPaise: 0, orderCount: 0 }));

    for (const order of orders) {
      if (!order.completedAt) continue;
      const key = this.getBucketKey(order.completedAt, period as 'day' | 'week' | 'month');
      const bucket = buckets.get(key);
      if (!bucket) continue;
      bucket.amountPaise += order.finalAmountPaise;
      bucket.orderCount += 1;
    }

    const data = keys.map((key) => buckets.get(key)).filter(Boolean) as Array<{
      key: string;
      amountPaise: number;
      orderCount: number;
    }>;

    const totalAmountPaise = data.reduce((sum, item) => sum + item.amountPaise, 0);

    return {
      period,
      range: { from: start.toISOString(), to: end.toISOString() },
      totalAmountPaise,
      currency: 'INR',
      data,
    };
  }

  async getAdminEngagement(query: AdminAnalyticsEngagementDto) {
    const days = query.days ? Number(query.days) : 30;
    if (Number.isNaN(days) || days <= 0) {
      throw new BadRequestException({
        code: 'ANALYTICS_DAYS_INVALID',
        message: 'Days must be a positive number.',
      });
    }

    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

    const [practiceEvents, attempts, noteProgress] = await this.prisma.$transaction([
      this.prisma.practiceQuestionEvent.findMany({
        where: {
          createdAt: { gte: start, lt: end },
          eventType: PracticeEventType.ANSWERED,
        },
        select: { userId: true, createdAt: true },
      }),
      this.prisma.attempt.findMany({
        where: { createdAt: { gte: start, lt: end } },
        select: { userId: true, createdAt: true },
      }),
      this.prisma.noteProgress.findMany({
        where: { updatedAt: { gte: start, lt: end } },
        select: { userId: true, updatedAt: true },
      }),
    ]);

    const buckets = new Map<string, Set<string>>();
    const addUser = (date: Date, userId: string) => {
      const key = this.toDateKey(date);
      const set = buckets.get(key) ?? new Set<string>();
      set.add(userId);
      buckets.set(key, set);
    };

    practiceEvents.forEach((event) => addUser(event.createdAt, event.userId));
    attempts.forEach((attempt) => addUser(attempt.createdAt, attempt.userId));
    noteProgress.forEach((progress) => addUser(progress.updatedAt, progress.userId));

    const daysKeys = this.enumerateBuckets(start, end, 'day');
    const data = daysKeys.map((key) => ({
      date: key,
      activeUsers: buckets.get(key)?.size ?? 0,
    }));

    return {
      range: { from: start.toISOString(), to: end.toISOString() },
      data,
    };
  }

  async getContentCoverage(query: AdminAnalyticsCoverageDto) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 50);

    const subjectWhere = query.subjectId ? { id: query.subjectId } : undefined;
    const subjects = await this.prisma.subject.findMany({
      where: subjectWhere,
      orderBy: { orderIndex: 'asc' },
      include: {
        _count: { select: { topics: true, notes: true, questions: true, tests: true } },
      },
    });

    const topicWhere: Prisma.TopicWhereInput = {
      subjectId: query.subjectId ?? undefined,
    };

    const [topicTotal, topics] = await this.prisma.$transaction([
      this.prisma.topic.count({ where: topicWhere }),
      this.prisma.topic.findMany({
        where: topicWhere,
        orderBy: { orderIndex: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          subject: true,
          _count: { select: { notes: true, questions: true } },
        },
      }),
    ]);

    const gaps = topics
      .filter((topic) => topic._count.notes === 0 && topic._count.questions === 0)
      .map((topic) => ({
        topicId: topic.id,
        topicName: topic.name,
        subjectId: topic.subjectId,
        subjectName: topic.subject.name,
      }));

    return {
      subjects: subjects.map((subject) => ({
        id: subject.id,
        name: subject.name,
        counts: subject._count,
      })),
      topics: {
        data: topics,
        total: topicTotal,
        page,
        pageSize,
      },
      gaps,
    };
  }

  private resolveRange(from?: string, to?: string, defaultDays = 30) {
    const parsedFrom = this.parseDateInput(from, 'start');
    const parsedTo = this.parseDateInput(to, 'end');

    const end = parsedTo ?? new Date();
    const start =
      parsedFrom ?? new Date(end.getTime() - defaultDays * 24 * 60 * 60 * 1000);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException({
        code: 'ANALYTICS_RANGE_INVALID',
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

  private toDateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private getBucketKey(date: Date, period: 'day' | 'week' | 'month') {
    if (period === 'day') {
      return this.toDateKey(date);
    }
    if (period === 'month') {
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    }
    const { year, week } = this.getIsoWeek(date);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }

  private enumerateBuckets(start: Date, end: Date, period: 'day' | 'week' | 'month') {
    const keys: string[] = [];
    const cursor = new Date(start.getTime());

    if (period === 'day') {
      while (cursor < end) {
        keys.push(this.toDateKey(cursor));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      return keys;
    }

    if (period === 'month') {
      while (cursor < end) {
        keys.push(
          `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`,
        );
        cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
        cursor.setUTCHours(0, 0, 0, 0);
      }
      return keys;
    }

    while (cursor < end) {
      keys.push(this.getBucketKey(cursor, 'week'));
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
    return keys;
  }

  private getIsoWeek(date: Date) {
    const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return { year: tmp.getUTCFullYear(), week };
  }

  private async countActiveUsers(start: Date, end: Date) {
    const [practiceUsers, attemptUsers, noteUsers] = await this.prisma.$transaction([
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

    const active = new Set<string>();
    practiceUsers.forEach((item) => active.add(item.userId));
    attemptUsers.forEach((item) => active.add(item.userId));
    noteUsers.forEach((item) => active.add(item.userId));
    return active.size;
  }
}
