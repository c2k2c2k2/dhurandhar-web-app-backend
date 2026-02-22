import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttemptStatus,
  AttemptEventType,
  CmsConfigStatus,
  Prisma,
  QuestionDifficulty,
  TestType,
} from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  AttemptQueryDto,
  AttemptSaveDto,
  AttemptSubmitDto,
  TestCreateDto,
  TestQueryDto,
  TestUpdateDto,
} from './dto';
import { DEFAULT_TEST_PRESETS, TestPreset } from './test-presets';

type TestConfig = {
  presetKey?: string;
  questionIds?: string[];
  items?: { questionId: string; marks?: number }[];
  sections?: Array<{
    key?: string;
    title?: string;
    subjectId?: string;
    topicIds?: string[];
    difficulty?: QuestionDifficulty;
    count: number;
    durationMinutes?: number;
    marksPerQuestion?: number;
    negativeMarksPerWrong?: number;
    questionIds?: string[];
  }>;
  mixer?: {
    subjectId?: string;
    topicIds?: string[];
    difficulty?: QuestionDifficulty;
    count: number;
  };
  durationMinutes?: number;
  marksPerQuestion?: number;
  negativeMarksPerWrong?: number;
};

@Injectable()
export class TestEngineService {
  constructor(private readonly prisma: PrismaService) {}

  async listTestPresets() {
    const configuredPresets = await this.getConfiguredPresets();
    const presets = configuredPresets.length
      ? configuredPresets
      : DEFAULT_TEST_PRESETS;
    return { data: presets };
  }

  async createTest(userId: string, dto: TestCreateDto) {
    if (dto.subjectId) {
      await this.assertSubjectExists(dto.subjectId);
    }

    const config = await this.normalizeTestConfig(dto.configJson as TestConfig);

    return this.prisma.$transaction(async (tx) => {
      const test = await tx.test.create({
        data: {
          subjectId: dto.subjectId ?? undefined,
          createdByUserId: userId,
          title: dto.title,
          description: dto.description,
          type: dto.type,
          configJson: config as Prisma.InputJsonValue,
          isPublished: dto.isPublished ?? false,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
          publishedAt: dto.isPublished ? new Date() : undefined,
        },
      });

      await this.syncTestQuestions(tx, test.id, config);
      return test;
    });
  }

  async updateTest(testId: string, dto: TestUpdateDto) {
    const test = await this.prisma.test.findUnique({ where: { id: testId } });
    if (!test) {
      throw new NotFoundException({
        code: 'TEST_NOT_FOUND',
        message: 'Test not found.',
      });
    }

    if (dto.subjectId) {
      await this.assertSubjectExists(dto.subjectId);
    }

    const config = dto.configJson
      ? await this.normalizeTestConfig(dto.configJson as TestConfig)
      : (test.configJson as TestConfig);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.test.update({
        where: { id: testId },
        data: {
          subjectId: dto.subjectId ?? undefined,
          title: dto.title ?? undefined,
          description: dto.description ?? undefined,
          type: dto.type ?? undefined,
          configJson: dto.configJson
            ? (config as Prisma.InputJsonValue)
            : undefined,
          isPublished: dto.isPublished ?? undefined,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
          publishedAt: dto.isPublished ? new Date() : undefined,
        },
      });

      if (dto.configJson) {
        await this.syncTestQuestions(tx, testId, config);
      }

      return updated;
    });
  }

  async publishTest(testId: string) {
    return this.prisma.test.update({
      where: { id: testId },
      data: { isPublished: true, publishedAt: new Date() },
    });
  }

  async unpublishTest(testId: string) {
    return this.prisma.test.update({
      where: { id: testId },
      data: { isPublished: false, publishedAt: null },
    });
  }

  async listAdminTests(query: TestQueryDto) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);

    const where = {
      subjectId: query.subjectId ?? undefined,
      type: query.type as TestType | undefined,
      isPublished: query.isPublished ? query.isPublished === 'true' : undefined,
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.test.count({ where }),
      this.prisma.test.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data, total, page, pageSize };
  }

  async listPublishedTests(query: TestQueryDto) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);
    const now = new Date();

    const where = {
      subjectId: query.subjectId ?? undefined,
      type: query.type as TestType | undefined,
      isPublished: true,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.test.count({ where }),
      this.prisma.test.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data, total, page, pageSize };
  }

  async getTestPublic(testId: string) {
    const now = new Date();
    const test = await this.prisma.test.findUnique({ where: { id: testId } });
    if (!test || !test.isPublished) {
      throw new NotFoundException({
        code: 'TEST_NOT_FOUND',
        message: 'Test not found.',
      });
    }
    if (test.startsAt && test.startsAt > now) {
      throw new BadRequestException({
        code: 'TEST_NOT_ACTIVE',
        message: 'Test not active yet.',
      });
    }
    if (test.endsAt && test.endsAt < now) {
      throw new BadRequestException({
        code: 'TEST_ENDED',
        message: 'Test window ended.',
      });
    }
    return test;
  }

  async startAttempt(userId: string, testId: string) {
    const test = await this.getTestPublic(testId);
    const config = test.configJson as TestConfig;

    const selections = await this.selectQuestions(test, config);
    const questionIds = selections.map((item) => item.questionId);

    const questions = await this.prisma.question.findMany({
      where: { id: { in: questionIds } },
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
    });

    const questionMap = new Map(questions.map((q) => [q.id, q]));
    const orderedQuestions = selections
      .map((item) => questionMap.get(item.questionId))
      .filter((item): item is (typeof questions)[number] => Boolean(item));

    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.attempt.create({
        data: {
          testId: test.id,
          userId,
          status: AttemptStatus.STARTED,
        },
      });

      await tx.attemptQuestion.createMany({
        data: selections.map((item, index) => ({
          attemptId: attempt.id,
          questionId: item.questionId,
          orderIndex: item.orderIndex ?? index,
        })),
      });

      await tx.attemptEventLog.create({
        data: {
          attemptId: attempt.id,
          eventType: AttemptEventType.START,
        },
      });

      return {
        attemptId: attempt.id,
        testId: test.id,
        questions: orderedQuestions,
      };
    });
  }

  async saveAttempt(userId: string, attemptId: string, dto: AttemptSaveDto) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.userId !== userId) {
      throw new NotFoundException({
        code: 'ATTEMPT_NOT_FOUND',
        message: 'Attempt not found.',
      });
    }

    if (attempt.status === AttemptStatus.SUBMITTED || attempt.status === AttemptStatus.EVALUATED) {
      throw new BadRequestException({
        code: 'ATTEMPT_LOCKED',
        message: 'Attempt already submitted.',
      });
    }

    const answersJson = dto.answersJson ?? (attempt.answersJson as Prisma.JsonValue | null);

    await this.prisma.$transaction([
      this.prisma.attempt.update({
        where: { id: attemptId },
        data: {
          answersJson: answersJson as Prisma.InputJsonValue | undefined,
          status: AttemptStatus.IN_PROGRESS,
        },
      }),
      this.prisma.attemptEventLog.create({
        data: {
          attemptId,
          eventType: AttemptEventType.SAVE,
        },
      }),
    ]);

    return { success: true };
  }

  async submitAttempt(userId: string, attemptId: string, dto: AttemptSubmitDto) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        test: true,
        questions: { include: { question: true } },
      },
    });

    if (!attempt || attempt.userId !== userId) {
      throw new NotFoundException({
        code: 'ATTEMPT_NOT_FOUND',
        message: 'Attempt not found.',
      });
    }

    if (attempt.status === AttemptStatus.SUBMITTED || attempt.status === AttemptStatus.EVALUATED) {
      throw new BadRequestException({
        code: 'ATTEMPT_LOCKED',
        message: 'Attempt already submitted.',
      });
    }

    const answersMap = this.normalizeAnswers(dto.answersJson ?? (attempt.answersJson as Prisma.JsonValue | null));

    const testConfig = (attempt.test?.configJson as TestConfig) ?? {};
    const marksMap = await this.getMarksMap(attempt.testId);
    const defaultMark = this.getDefaultMark(testConfig);
    const defaultNegativeMark = this.getDefaultNegativeMark(testConfig);
    const sectionRuleByOrder = this.buildSectionRuleByOrder(testConfig);

    let totalScore = 0;
    let correctCount = 0;
    let wrongCount = 0;

    const perTopic: Record<string, { correct: number; wrong: number; total: number }> = {};
    const perSubject: Record<string, { correct: number; wrong: number; total: number }> = {};
    const perSection: Record<
      string,
      { correct: number; wrong: number; total: number; netScore: number }
    > = {};

    const orderedAttemptQuestions = [...attempt.questions].sort(
      (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0),
    );

    for (let index = 0; index < orderedAttemptQuestions.length; index += 1) {
      const attemptQuestion = orderedAttemptQuestions[index];
      const question = attemptQuestion.question;
      if (!question) {
        continue;
      }

      const answer = answersMap.get(question.id);
      const isCorrect = this.isEqual(answer, question.correctAnswerJson);

      const sectionRule = sectionRuleByOrder.get(attemptQuestion.orderIndex ?? index);
      const mark = marksMap.get(question.id) ?? sectionRule?.marksPerQuestion ?? defaultMark;
      const negativeMark =
        sectionRule?.negativeMarksPerWrong ?? defaultNegativeMark;

      if (isCorrect) {
        totalScore += mark;
        correctCount += 1;
      } else {
        totalScore -= negativeMark;
        wrongCount += 1;
      }

      const topicKey = question.topicId ?? 'unknown';
      const subjectKey = question.subjectId;

      perTopic[topicKey] = perTopic[topicKey] ?? { correct: 0, wrong: 0, total: 0 };
      perTopic[topicKey].total += 1;
      if (isCorrect) {
        perTopic[topicKey].correct += 1;
      } else {
        perTopic[topicKey].wrong += 1;
      }

      perSubject[subjectKey] = perSubject[subjectKey] ?? { correct: 0, wrong: 0, total: 0 };
      perSubject[subjectKey].total += 1;
      if (isCorrect) {
        perSubject[subjectKey].correct += 1;
      } else {
        perSubject[subjectKey].wrong += 1;
      }

      const sectionKey = sectionRule?.sectionKey ?? 'default';
      perSection[sectionKey] = perSection[sectionKey] ?? {
        correct: 0,
        wrong: 0,
        total: 0,
        netScore: 0,
      };
      perSection[sectionKey].total += 1;
      if (isCorrect) {
        perSection[sectionKey].correct += 1;
        perSection[sectionKey].netScore += mark;
      } else {
        perSection[sectionKey].wrong += 1;
        perSection[sectionKey].netScore -= negativeMark;
      }
    }

    const scoreJson = {
      totalQuestions: orderedAttemptQuestions.length,
      correctCount,
      wrongCount,
      totalScore,
      marksPerQuestion: defaultMark,
      negativeMarksPerWrong: defaultNegativeMark,
      perSection,
      perTopic,
      perSubject,
    };

    await this.prisma.$transaction([
      this.prisma.attempt.update({
        where: { id: attemptId },
        data: {
          status: AttemptStatus.EVALUATED,
          submittedAt: new Date(),
          answersJson: (dto.answersJson ?? attempt.answersJson) as Prisma.InputJsonValue | undefined,
          scoreJson: scoreJson as Prisma.InputJsonValue,
          totalScore,
        },
      }),
      this.prisma.attemptEventLog.create({
        data: {
          attemptId,
          eventType: AttemptEventType.SUBMIT,
        },
      }),
    ]);

    return { totalScore, scoreJson };
  }

  async listAttempts(userId: string, query: AttemptQueryDto) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);

    const [total, data] = await this.prisma.$transaction([
      this.prisma.attempt.count({ where: { userId } }),
      this.prisma.attempt.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { test: true },
      }),
    ]);

    return { data, total, page, pageSize };
  }

  async getAttempt(userId: string, attemptId: string) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        test: true,
        questions: { include: { question: true } },
      },
    });

    if (!attempt || attempt.userId !== userId) {
      throw new NotFoundException({
        code: 'ATTEMPT_NOT_FOUND',
        message: 'Attempt not found.',
      });
    }

    const questions = attempt.questions.map((item) => {
      const question = item.question;
      if (!question) return null;
      return {
        ...question,
        correctAnswerJson: undefined,
      };
    }).filter(Boolean);

    return { ...attempt, questions };
  }

  private async syncTestQuestions(
    tx: PrismaService | Prisma.TransactionClient,
    testId: string,
    config: TestConfig,
  ) {
    const items = this.resolveFixedItems(config);

    await tx.testQuestion.deleteMany({ where: { testId } });

    if (items.length === 0) {
      return;
    }

    const questionIds = items.map((item) => item.questionId);
    const questions = await tx.question.findMany({ where: { id: { in: questionIds } } });
    if (questions.length !== questionIds.length) {
      throw new BadRequestException({
        code: 'TEST_QUESTION_INVALID',
        message: 'One or more questions are invalid.',
      });
    }

    await tx.testQuestion.createMany({
      data: items.map((item, index) => ({
        testId,
        questionId: item.questionId,
        orderIndex: item.orderIndex ?? index,
        marks: item.marks ?? null,
      })),
    });
  }

  private resolveFixedItems(
    config: TestConfig,
  ): Array<{ questionId: string; orderIndex: number; marks?: number }> {
    if (Array.isArray(config.sections) && config.sections.length > 0) {
      const fromSections: Array<{ questionId: string; orderIndex: number; marks?: number }> = [];
      let orderIndex = 0;
      for (const section of config.sections) {
        if (!Array.isArray(section.questionIds) || section.questionIds.length === 0) {
          continue;
        }
        for (const questionId of section.questionIds) {
          fromSections.push({
            questionId,
            orderIndex,
            marks: section.marksPerQuestion ?? config.marksPerQuestion,
          });
          orderIndex += 1;
        }
      }

      if (fromSections.length > 0) {
        return fromSections;
      }
    }

    if (Array.isArray(config.items) && config.items.length > 0) {
      return config.items.map((item, index) => ({
        questionId: item.questionId,
        orderIndex: index,
        marks: item.marks,
      }));
    }

    if (Array.isArray(config.questionIds) && config.questionIds.length > 0) {
      return config.questionIds.map((questionId, index) => ({
        questionId,
        orderIndex: index,
        marks: undefined,
      }));
    }

    return [];
  }

  private async selectQuestions(test: { id: string; subjectId: string | null }, config: TestConfig) {
    const fixedItems = await this.prisma.testQuestion.findMany({
      where: { testId: test.id },
      orderBy: { orderIndex: 'asc' },
    });

    if (fixedItems.length > 0) {
      return fixedItems.map((item, index) => ({
        questionId: item.questionId,
        orderIndex: item.orderIndex ?? index,
      }));
    }

    if (Array.isArray(config.sections) && config.sections.length > 0) {
      return this.selectSectionQuestions(test, config);
    }

    const mixer = config.mixer;
    if (!mixer || !mixer.count) {
      throw new BadRequestException({
        code: 'TEST_CONFIG_INVALID',
        message: 'Test configuration missing question selection.',
      });
    }

    const where = {
      isPublished: true,
      subjectId: mixer.subjectId ?? test.subjectId ?? undefined,
      topicId: mixer.topicIds?.length ? { in: mixer.topicIds } : undefined,
      difficulty: mixer.difficulty ?? undefined,
    };

    const pool = await this.prisma.question.findMany({
      where,
      select: { id: true },
    });

    if (pool.length < mixer.count) {
      throw new BadRequestException({
        code: 'TEST_QUESTION_POOL_EMPTY',
        message: 'Not enough questions to satisfy test.',
      });
    }

    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, mixer.count);

    return selected.map((item, index) => ({
      questionId: item.id,
      orderIndex: index,
    }));
  }

  private async selectSectionQuestions(
    test: { id: string; subjectId: string | null },
    config: TestConfig,
  ) {
    if (!Array.isArray(config.sections) || config.sections.length === 0) {
      return [];
    }

    const selected: Array<{ questionId: string; orderIndex: number }> = [];
    const selectedIds = new Set<string>();
    let orderIndex = 0;

    for (let sectionIndex = 0; sectionIndex < config.sections.length; sectionIndex += 1) {
      const section = config.sections[sectionIndex];
      const sectionTitle = section.title || section.key || `Section ${sectionIndex + 1}`;

      if (Array.isArray(section.questionIds) && section.questionIds.length > 0) {
        const questionIds = section.questionIds;
        const questions = await this.prisma.question.findMany({
          where: { id: { in: questionIds }, isPublished: true },
          select: { id: true },
        });
        if (questions.length !== questionIds.length) {
          throw new BadRequestException({
            code: 'TEST_SECTION_QUESTION_INVALID',
            message: `One or more fixed questions are invalid in section '${sectionTitle}'.`,
          });
        }

        for (const questionId of questionIds) {
          if (selectedIds.has(questionId)) {
            continue;
          }
          selectedIds.add(questionId);
          selected.push({ questionId, orderIndex });
          orderIndex += 1;
        }
        continue;
      }

      const count = Number(section.count ?? 0);
      if (!Number.isFinite(count) || count <= 0) {
        throw new BadRequestException({
          code: 'TEST_SECTION_COUNT_INVALID',
          message: `Question count is required for section '${sectionTitle}'.`,
        });
      }

      const where = {
        isPublished: true,
        subjectId: section.subjectId ?? test.subjectId ?? undefined,
        topicId: section.topicIds?.length ? { in: section.topicIds } : undefined,
        difficulty: section.difficulty ?? undefined,
        id: selectedIds.size ? { notIn: Array.from(selectedIds) } : undefined,
      };

      const pool = await this.prisma.question.findMany({
        where,
        select: { id: true },
      });

      if (pool.length < count) {
        throw new BadRequestException({
          code: 'TEST_SECTION_POOL_INSUFFICIENT',
          message: `Not enough questions available for section '${sectionTitle}'.`,
        });
      }

      const picked = this.shuffle(pool).slice(0, count);
      for (const question of picked) {
        selectedIds.add(question.id);
        selected.push({ questionId: question.id, orderIndex });
        orderIndex += 1;
      }
    }

    return selected;
  }

  private async getMarksMap(testId: string) {
    const entries = await this.prisma.testQuestion.findMany({
      where: { testId },
      select: { questionId: true, marks: true },
    });
    const map = new Map<string, number>();
    for (const entry of entries) {
      if (entry.marks != null) {
        map.set(entry.questionId, entry.marks);
      }
    }
    return map;
  }

  private getDefaultMark(config?: TestConfig) {
    if (!config) {
      return 1;
    }
    const mark = config.marksPerQuestion;
    if (typeof mark === 'number' && mark > 0) {
      return mark;
    }
    return 1;
  }

  private getDefaultNegativeMark(config?: TestConfig) {
    if (!config) {
      return 0;
    }

    const mark = config.negativeMarksPerWrong;
    if (typeof mark === 'number' && mark >= 0) {
      return mark;
    }

    return 0;
  }

  private buildSectionRuleByOrder(config: TestConfig) {
    const map = new Map<
      number,
      {
        sectionKey: string;
        marksPerQuestion?: number;
        negativeMarksPerWrong?: number;
      }
    >();

    if (!Array.isArray(config.sections) || config.sections.length === 0) {
      return map;
    }

    let cursor = 0;
    config.sections.forEach((section, index) => {
      const countFromIds = Array.isArray(section.questionIds)
        ? section.questionIds.length
        : 0;
      const count = Number(section.count ?? countFromIds);
      if (!Number.isFinite(count) || count <= 0) {
        return;
      }

      const sectionKey =
        section.key || section.title || `section_${index + 1}`;
      for (let i = 0; i < count; i += 1) {
        map.set(cursor + i, {
          sectionKey,
          marksPerQuestion: section.marksPerQuestion,
          negativeMarksPerWrong: section.negativeMarksPerWrong,
        });
      }
      cursor += count;
    });

    return map;
  }

  private async normalizeTestConfig(config: TestConfig): Promise<TestConfig> {
    if (!config?.presetKey) {
      return config;
    }

    const preset = await this.getPresetByKey(config.presetKey);
    if (!preset) {
      throw new BadRequestException({
        code: 'TEST_PRESET_NOT_FOUND',
        message: 'Selected test preset was not found.',
      });
    }

    return {
      ...config,
      durationMinutes:
        typeof config.durationMinutes === 'number' && config.durationMinutes > 0
          ? config.durationMinutes
          : preset.durationMinutes,
      marksPerQuestion:
        typeof config.marksPerQuestion === 'number' && config.marksPerQuestion > 0
          ? config.marksPerQuestion
          : preset.marksPerQuestion,
      negativeMarksPerWrong:
        typeof config.negativeMarksPerWrong === 'number' &&
        config.negativeMarksPerWrong >= 0
          ? config.negativeMarksPerWrong
          : preset.negativeMarksPerWrong,
      sections:
        Array.isArray(config.sections) && config.sections.length > 0
          ? config.sections
          : preset.sections.map((section) => ({
              key: section.key,
              title: section.title,
              count: section.count,
              durationMinutes: section.durationMinutes,
              subjectId: section.subjectId,
              topicIds: section.topicIds,
              difficulty: section.difficulty,
              marksPerQuestion: section.marksPerQuestion,
              negativeMarksPerWrong: section.negativeMarksPerWrong,
              questionIds: section.questionIds,
            })),
    };
  }

  private async getPresetByKey(key: string) {
    const configured = await this.getConfiguredPresets();
    const presets = configured.length ? configured : DEFAULT_TEST_PRESETS;
    return presets.find((preset) => preset.key === key) ?? null;
  }

  private async getConfiguredPresets(): Promise<TestPreset[]> {
    const config = await this.prisma.appConfig.findFirst({
      where: { key: 'test.presets', status: CmsConfigStatus.PUBLISHED },
      orderBy: { version: 'desc' },
      select: { configJson: true },
    });

    if (!config?.configJson) {
      return [];
    }

    const raw = config.configJson as unknown;
    const presets = Array.isArray(raw)
      ? raw
      : raw && typeof raw === 'object' && Array.isArray((raw as { presets?: unknown[] }).presets)
        ? (raw as { presets: unknown[] }).presets
        : [];

    return presets
      .map((item) => this.normalizePreset(item))
      .filter((item): item is TestPreset => Boolean(item));
  }

  private normalizePreset(value: unknown): TestPreset | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const raw = value as Record<string, unknown>;
    if (
      typeof raw.key !== 'string' ||
      typeof raw.title !== 'string' ||
      !Array.isArray(raw.sections)
    ) {
      return null;
    }

    const durationMinutes =
      typeof raw.durationMinutes === 'number' && raw.durationMinutes > 0
        ? raw.durationMinutes
        : 60;
    const marksPerQuestion =
      typeof raw.marksPerQuestion === 'number' && raw.marksPerQuestion > 0
        ? raw.marksPerQuestion
        : 1;
    const negativeMarksPerWrong =
      typeof raw.negativeMarksPerWrong === 'number' &&
      raw.negativeMarksPerWrong >= 0
        ? raw.negativeMarksPerWrong
        : 0;

    const sections: TestPreset['sections'] = [];
    raw.sections.forEach((section, index) => {
      if (!section || typeof section !== 'object' || Array.isArray(section)) {
        return;
      }
      const item = section as Record<string, unknown>;
      const count =
        typeof item.count === 'number' && item.count > 0
          ? item.count
          : Array.isArray(item.questionIds)
            ? item.questionIds.length
            : 0;
      if (count <= 0) {
        return;
      }

      sections.push({
        key: typeof item.key === 'string' ? item.key : `section_${index + 1}`,
        title:
          typeof item.title === 'string'
            ? item.title
            : `Section ${index + 1}`,
        count,
        durationMinutes:
          typeof item.durationMinutes === 'number' && item.durationMinutes > 0
            ? item.durationMinutes
            : undefined,
        subjectId: typeof item.subjectId === 'string' ? item.subjectId : undefined,
        topicIds: Array.isArray(item.topicIds)
          ? item.topicIds.filter((id): id is string => typeof id === 'string')
          : undefined,
        difficulty:
          typeof item.difficulty === 'string'
            ? (item.difficulty as QuestionDifficulty)
            : undefined,
        marksPerQuestion:
          typeof item.marksPerQuestion === 'number' && item.marksPerQuestion > 0
            ? item.marksPerQuestion
            : undefined,
        negativeMarksPerWrong:
          typeof item.negativeMarksPerWrong === 'number' &&
          item.negativeMarksPerWrong >= 0
            ? item.negativeMarksPerWrong
            : undefined,
        questionIds: Array.isArray(item.questionIds)
          ? item.questionIds.filter((id): id is string => typeof id === 'string')
          : undefined,
      });
    });

    if (!sections.length) {
      return null;
    }

    return {
      key: raw.key,
      title: raw.title,
      exam: typeof raw.exam === 'string' ? raw.exam : 'Custom',
      description:
        typeof raw.description === 'string' ? raw.description : undefined,
      durationMinutes,
      marksPerQuestion,
      negativeMarksPerWrong,
      sections,
    };
  }

  private shuffle<T>(items: T[]) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  private normalizeAnswers(value: unknown) {
    const map = new Map<string, unknown>();
    if (!value) {
      return map;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object') {
          const payload = item as { questionId?: string; answer?: unknown };
          if (payload.questionId) {
            map.set(payload.questionId, payload.answer);
          }
        }
      }
      return map;
    }

    if (typeof value === 'object') {
      Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
        map.set(key, val);
      });
    }

    return map;
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
    const subject = await this.prisma.subject.findUnique({ where: { id: subjectId } });
    if (!subject) {
      throw new BadRequestException({
        code: 'SUBJECT_NOT_FOUND',
        message: 'Subject not found.',
      });
    }
  }
}
