import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PracticeEventType,
  PracticeMode,
  PracticeSessionStatus,
  Prisma,
  QuestionDifficulty,
} from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  PracticeAnswerBatchDto,
  PracticeAnswerDto,
  PracticeStartDto,
} from './dto';

@Injectable()
export class PracticeService {
  constructor(private readonly prisma: PrismaService) {}

  async startPractice(userId: string, dto: PracticeStartDto) {
    if (dto.subjectId) {
      await this.assertSubjectExists(dto.subjectId);
    }
    if (dto.topicId) {
      await this.assertTopicExists(dto.topicId, dto.subjectId);
    }

    const session = await this.prisma.practiceSession.create({
      data: {
        userId,
        subjectId: dto.subjectId ?? undefined,
        topicId: dto.topicId ?? undefined,
        mode: dto.mode ?? PracticeMode.PRACTICE,
        configJson: dto.configJson
          ? (dto.configJson as Prisma.InputJsonValue)
          : undefined,
        status: PracticeSessionStatus.ACTIVE,
      },
    });

    return session;
  }

  async endPractice(userId: string, sessionId: string) {
    const session = await this.prisma.practiceSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.userId !== userId) {
      throw new NotFoundException({
        code: 'PRACTICE_SESSION_NOT_FOUND',
        message: 'Practice session not found.',
      });
    }

    if (session.status !== PracticeSessionStatus.ACTIVE) {
      return session;
    }

    return this.prisma.practiceSession.update({
      where: { id: sessionId },
      data: { status: PracticeSessionStatus.ENDED, endedAt: new Date() },
    });
  }

  async getNextQuestions(
    userId: string,
    sessionId: string,
    countOverride?: number,
  ) {
    const session = await this.prisma.practiceSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.userId !== userId) {
      throw new NotFoundException({
        code: 'PRACTICE_SESSION_NOT_FOUND',
        message: 'Practice session not found.',
      });
    }

    if (session.status !== PracticeSessionStatus.ACTIVE) {
      throw new BadRequestException({
        code: 'PRACTICE_SESSION_INACTIVE',
        message: 'Practice session is not active.',
      });
    }

    const config = (session.configJson ?? {}) as {
      count?: number;
      difficulty?: QuestionDifficulty;
    };
    const limit = countOverride ?? config.count ?? 5;

    const questions = await this.selectQuestions(userId, {
      subjectId: session.subjectId ?? undefined,
      topicId: session.topicId ?? undefined,
      difficulty: config.difficulty,
      limit,
    });

    await this.prisma.practiceQuestionEvent.createMany({
      data: questions.map((question) => ({
        sessionId: session.id,
        userId,
        questionId: question.id,
        eventType: PracticeEventType.SERVED,
      })),
    });

    return {
      sessionId: session.id,
      questions,
    };
  }

  async recordAnswer(
    userId: string,
    sessionId: string,
    dto: PracticeAnswerDto,
  ) {
    return this.recordAnswersBatch(userId, sessionId, { items: [dto] });
  }

  async recordAnswersBatch(
    userId: string,
    sessionId: string,
    dto: PracticeAnswerBatchDto,
  ) {
    const session = await this.prisma.practiceSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.userId !== userId) {
      throw new NotFoundException({
        code: 'PRACTICE_SESSION_NOT_FOUND',
        message: 'Practice session not found.',
      });
    }

    const questionIds = dto.items.map((item) => item.questionId);
    const questions = await this.prisma.question.findMany({
      where: { id: { in: questionIds } },
      select: {
        id: true,
        subjectId: true,
        topicId: true,
        correctAnswerJson: true,
      },
    });
    const questionMap = new Map(questions.map((q) => [q.id, q]));

    const now = new Date();
    const events: Prisma.PracticeQuestionEventCreateManyInput[] = [];
    const results: Array<{
      questionId: string;
      eventType: PracticeEventType;
      isCorrect: boolean | null;
      correctAnswerJson: Prisma.JsonValue;
    }> = [];
    const questionStateUpdates: Array<Prisma.PrismaPromise<unknown>> = [];
    const topicProgressUpdates: Array<Prisma.PrismaPromise<unknown>> = [];

    for (const item of dto.items) {
      const question = questionMap.get(item.questionId);
      if (!question) {
        continue;
      }

      const eventType = item.eventType ?? PracticeEventType.ANSWERED;
      const isCorrect =
        item.isCorrect ??
        (item.answerJson !== undefined
          ? this.isEqual(item.answerJson, question.correctAnswerJson)
          : undefined);

      events.push({
        sessionId: session.id,
        userId,
        questionId: question.id,
        eventType,
        isCorrect: isCorrect ?? undefined,
        payloadJson: item.answerJson
          ? (item.answerJson as Prisma.InputJsonValue)
          : undefined,
        createdAt: now,
      });

      results.push({
        questionId: question.id,
        eventType,
        isCorrect: typeof isCorrect === 'boolean' ? isCorrect : null,
        correctAnswerJson: question.correctAnswerJson ?? null,
      });

      if (
        eventType === PracticeEventType.ANSWERED &&
        typeof isCorrect === 'boolean'
      ) {
        questionStateUpdates.push(
          this.prisma.userQuestionState.upsert({
            where: { userId_questionId: { userId, questionId: question.id } },
            update: {
              correctCount: isCorrect ? { increment: 1 } : undefined,
              wrongCount: !isCorrect ? { increment: 1 } : undefined,
              lastAnsweredAt: now,
              lastIsCorrect: isCorrect,
            },
            create: {
              userId,
              questionId: question.id,
              correctCount: isCorrect ? 1 : 0,
              wrongCount: !isCorrect ? 1 : 0,
              lastAnsweredAt: now,
              lastIsCorrect: isCorrect,
            },
          }),
        );

        if (question.topicId) {
          topicProgressUpdates.push(
            this.prisma.userTopicProgress.upsert({
              where: { userId_topicId: { userId, topicId: question.topicId } },
              update: {
                totalAnswered: { increment: 1 },
                correctCount: isCorrect ? { increment: 1 } : undefined,
              },
              create: {
                userId,
                topicId: question.topicId,
                totalAnswered: 1,
                correctCount: isCorrect ? 1 : 0,
              },
            }),
          );
        }
      }
    }

    await this.prisma.$transaction([
      this.prisma.practiceQuestionEvent.createMany({ data: events }),
      ...questionStateUpdates,
      ...topicProgressUpdates,
    ]);

    return { success: true, results };
  }

  async getProgress(userId: string) {
    const topics = await this.prisma.userTopicProgress.findMany({
      where: { userId },
      include: { topic: true },
      orderBy: { updatedAt: 'desc' },
    });

    const subjectMap = new Map<
      string,
      { subjectId: string; totalAnswered: number; correctCount: number }
    >();

    topics.forEach((item) => {
      const subjectId = item.topic.subjectId;
      const record = subjectMap.get(subjectId) ?? {
        subjectId,
        totalAnswered: 0,
        correctCount: 0,
      };
      record.totalAnswered += item.totalAnswered;
      record.correctCount += item.correctCount;
      subjectMap.set(subjectId, record);
    });

    return {
      topics,
      subjects: Array.from(subjectMap.values()),
    };
  }

  async getWeakQuestions(userId: string, limit = 20) {
    const states = await this.prisma.userQuestionState.findMany({
      where: { userId },
      orderBy: { wrongCount: 'desc' },
      take: limit,
      include: { question: true },
    });

    return states.map((state) => ({
      question: state.question,
      wrongCount: state.wrongCount,
      correctCount: state.correctCount,
      lastAnsweredAt: state.lastAnsweredAt,
    }));
  }

  async getTrend(userId: string, days = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const events = await this.prisma.practiceQuestionEvent.findMany({
      where: {
        userId,
        createdAt: { gte: since },
        eventType: PracticeEventType.ANSWERED,
      },
      select: {
        createdAt: true,
        isCorrect: true,
      },
    });

    const buckets = new Map<
      string,
      { date: string; total: number; correct: number }
    >();
    events.forEach((event) => {
      const date = event.createdAt.toISOString().slice(0, 10);
      const bucket = buckets.get(date) ?? { date, total: 0, correct: 0 };
      bucket.total += 1;
      if (event.isCorrect) {
        bucket.correct += 1;
      }
      buckets.set(date, bucket);
    });

    return Array.from(buckets.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
  }

  private async selectQuestions(
    userId: string,
    params: {
      subjectId?: string;
      topicId?: string;
      difficulty?: QuestionDifficulty;
      limit: number;
    },
  ) {
    const where = {
      isPublished: true,
      subjectId: params.subjectId ?? undefined,
      topicId: params.topicId ?? undefined,
      difficulty: params.difficulty ?? undefined,
    };

    const candidates = await this.prisma.question.findMany({
      where,
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
      take: 200,
    });

    if (candidates.length === 0) {
      throw new BadRequestException({
        code: 'PRACTICE_NO_QUESTIONS',
        message: 'No questions available for practice.',
      });
    }

    const states = await this.prisma.userQuestionState.findMany({
      where: { userId, questionId: { in: candidates.map((q) => q.id) } },
    });
    const stateMap = new Map(states.map((s) => [s.questionId, s]));

    const ranked = [...candidates].sort((a, b) => {
      const stateA = stateMap.get(a.id);
      const stateB = stateMap.get(b.id);

      const scoreA = this.practiceScore(stateA);
      const scoreB = this.practiceScore(stateB);

      if (scoreA !== scoreB) {
        return scoreA - scoreB;
      }

      const lastA = stateA?.lastAnsweredAt?.getTime() ?? 0;
      const lastB = stateB?.lastAnsweredAt?.getTime() ?? 0;
      return lastA - lastB;
    });

    return ranked.slice(0, params.limit);
  }

  private practiceScore(state?: { correctCount: number; wrongCount: number }) {
    if (!state) return 0; // unseen
    if (state.wrongCount > 0) return 1;
    return 2;
  }

  private isEqual(a: unknown, b: unknown) {
    return this.stableStringify(a) === this.stableStringify(b);
  }

  private stableStringify(value: unknown): string {
    if (value === null || value === undefined) {
      return 'null';
    }
    if (typeof value !== 'object') {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `"${key}":${this.stableStringify(val)}`);
    return `{${entries.join(',')}}`;
  }

  private async assertSubjectExists(subjectId: string) {
    const subject = await this.prisma.subject.findUnique({
      where: { id: subjectId },
    });
    if (!subject) {
      throw new BadRequestException({
        code: 'SUBJECT_NOT_FOUND',
        message: 'Subject not found.',
      });
    }
  }

  private async assertTopicExists(topicId: string, subjectId?: string) {
    const topic = await this.prisma.topic.findUnique({
      where: { id: topicId },
    });
    if (!topic) {
      throw new BadRequestException({
        code: 'TOPIC_NOT_FOUND',
        message: 'Topic not found.',
      });
    }
    if (subjectId && topic.subjectId !== subjectId) {
      throw new BadRequestException({
        code: 'TOPIC_INVALID',
        message: 'Topic does not belong to subject.',
      });
    }
  }
}
