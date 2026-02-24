import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AssetResourceType, FileAssetPurpose, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { BulkImportDto, CreateQuestionDto, QuestionQueryDto, UpdateQuestionDto } from './dto';
import {
  extractQuestionSearchFragments,
  sanitizeQuestionContent,
} from './utils/rich-content.util';

type PrismaWriter = PrismaService | Prisma.TransactionClient;

@Injectable()
export class QuestionBankService {
  constructor(private readonly prisma: PrismaService) {}

  async createQuestion(userId: string, dto: CreateQuestionDto) {
    return this.createQuestionInternal(this.prisma, userId, dto);
  }

  async updateQuestion(questionId: string, dto: UpdateQuestionDto) {
    const existing = await this.prisma.question.findUnique({ where: { id: questionId } });
    if (!existing) {
      throw new NotFoundException({
        code: 'QUESTION_NOT_FOUND',
        message: 'Question not found.',
      });
    }

    if (dto.subjectId) {
      await this.assertSubjectExists(dto.subjectId);
    }

    if (dto.topicId && !dto.subjectId && existing.topicId) {
      const topic = await this.prisma.topic.findUnique({ where: { id: dto.topicId } });
      if (!topic || topic.subjectId !== existing.subjectId) {
        throw new BadRequestException({
          code: 'TOPIC_INVALID',
          message: 'Topic does not belong to subject.',
        });
      }
    }

    const subjectId = dto.subjectId ?? existing.subjectId;
    const subject = await this.assertSubjectExists(subjectId);
    const topicId = dto.topicId ?? existing.topicId;
    let topicName: string | undefined;
    if (topicId) {
      const topic = await this.prisma.topic.findUnique({
        where: { id: topicId },
        select: { id: true, name: true, subjectId: true },
      });
      if (topic && topic.subjectId === subjectId) {
        topicName = topic.name;
      }
    }

    const statementInput = dto.statementJson
      ? (sanitizeQuestionContent(dto.statementJson) as Prisma.InputJsonValue)
      : undefined;
    const optionsInput = dto.optionsJson
      ? (sanitizeQuestionContent(dto.optionsJson) as Prisma.InputJsonValue)
      : undefined;
    const explanationInput = dto.explanationJson
      ? (sanitizeQuestionContent(dto.explanationJson) as Prisma.InputJsonValue)
      : undefined;

    const statementJson = (statementInput ?? existing.statementJson) as Prisma.InputJsonValue;
    const optionsJson = (optionsInput ?? existing.optionsJson) as Prisma.InputJsonValue;
    const explanationJson = (explanationInput ?? existing.explanationJson) as Prisma.InputJsonValue;

    const assetIds = this.extractAssetIds([statementJson, optionsJson, explanationJson]);
    await this.validateAssets(assetIds);

    const searchText = this.buildSearchText(
      [statementJson, optionsJson, explanationJson],
      subject.name,
      topicName,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.question.update({
        where: { id: questionId },
        data: {
          subjectId: dto.subjectId ?? undefined,
          topicId: dto.topicId ?? undefined,
          type: dto.type ?? undefined,
          difficulty: dto.difficulty ?? undefined,
          statementJson: statementInput,
          optionsJson: optionsInput,
          explanationJson: explanationInput,
          correctAnswerJson: dto.correctAnswerJson
            ? (dto.correctAnswerJson as Prisma.InputJsonValue)
            : undefined,
          isPublished: dto.isPublished ?? undefined,
          hasMedia: assetIds.length > 0,
          searchText,
        },
      });

      await tx.assetReference.deleteMany({
        where: { resourceType: AssetResourceType.QUESTION, resourceId: questionId },
      });

      if (assetIds.length) {
        await tx.assetReference.createMany({
          data: assetIds.map((assetId) => ({
            assetId,
            resourceType: AssetResourceType.QUESTION,
            resourceId: questionId,
          })),
        });
      }

      await this.refreshQuestionSearchVector(questionId, tx);
    });

    return this.prisma.question.findUnique({ where: { id: questionId } });
  }

  async publishQuestion(questionId: string) {
    return this.prisma.question.update({
      where: { id: questionId },
      data: { isPublished: true },
    });
  }

  async unpublishQuestion(questionId: string) {
    return this.prisma.question.update({
      where: { id: questionId },
      data: { isPublished: false },
    });
  }

  async listAdminQuestions(query: QuestionQueryDto) {
    const where = {
      subjectId: query.subjectId ?? undefined,
      topicId: query.topicId ?? undefined,
      type: query.type ?? undefined,
      difficulty: query.difficulty ?? undefined,
      isPublished: query.isPublished ? query.isPublished === 'true' : undefined,
    };

    return this.prisma.question.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async listQuestions(query: QuestionQueryDto) {
    const where = {
      isPublished: true,
      subjectId: query.subjectId ?? undefined,
      topicId: query.topicId ?? undefined,
      type: query.type ?? undefined,
      difficulty: query.difficulty ?? undefined,
    };

    return this.prisma.question.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
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
  }

  async getQuestion(questionId: string, allowUnpublished = false, includeAssets = false) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
    });

    if (!question || (!allowUnpublished && !question.isPublished)) {
      throw new NotFoundException({
        code: 'QUESTION_NOT_FOUND',
        message: 'Question not found.',
      });
    }

    if (!allowUnpublished) {
      return {
        ...question,
        correctAnswerJson: undefined,
      };
    }

    if (!includeAssets) {
      return question;
    }

    const assetIds = this.extractAssetIds([
      question.statementJson,
      question.optionsJson,
      question.explanationJson,
    ]);

    const assets = assetIds.length
      ? await this.prisma.fileAsset.findMany({
          where: { id: { in: assetIds } },
          select: {
            id: true,
            fileName: true,
            contentType: true,
            sizeBytes: true,
            purpose: true,
            confirmedAt: true,
          },
        })
      : [];

    return {
      ...question,
      assets,
    };
  }

  async bulkImport(userId: string, dto: BulkImportDto) {
    const results: { id: string }[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        const created = await this.createQuestionInternal(tx, userId, item);
        results.push({ id: created.id });
      }
    });

    return { count: results.length, items: results };
  }

  private async createQuestionInternal(tx: PrismaWriter, userId: string, dto: CreateQuestionDto) {
    const subject = await this.assertSubjectExists(dto.subjectId, tx);
    let topicName: string | undefined;

    if (dto.topicId) {
      const topic = await tx.topic.findUnique({
        where: { id: dto.topicId },
        select: { id: true, name: true, subjectId: true },
      });
      if (!topic || topic.subjectId !== dto.subjectId) {
        throw new BadRequestException({
          code: 'TOPIC_INVALID',
          message: 'Topic does not belong to subject.',
        });
      }
      topicName = topic.name;
    }

    const statementJson = sanitizeQuestionContent(dto.statementJson) as Prisma.InputJsonValue;
    const optionsJson = dto.optionsJson
      ? (sanitizeQuestionContent(dto.optionsJson) as Prisma.InputJsonValue)
      : undefined;
    const explanationJson = dto.explanationJson
      ? (sanitizeQuestionContent(dto.explanationJson) as Prisma.InputJsonValue)
      : undefined;

    const assetIds = this.extractAssetIds([statementJson, optionsJson, explanationJson]);
    await this.validateAssets(assetIds, tx);

    const searchText = this.buildSearchText(
      [statementJson, optionsJson, explanationJson],
      subject.name,
      topicName,
    );

    const question = await tx.question.create({
      data: {
        subjectId: dto.subjectId,
        topicId: dto.topicId,
        createdByUserId: userId,
        type: dto.type,
        difficulty: dto.difficulty ?? undefined,
        statementJson,
        optionsJson,
        explanationJson,
        correctAnswerJson: dto.correctAnswerJson
          ? (dto.correctAnswerJson as Prisma.InputJsonValue)
          : undefined,
        isPublished: dto.isPublished ?? false,
        hasMedia: assetIds.length > 0,
        searchText,
      },
    });

    if (assetIds.length) {
      await tx.assetReference.createMany({
        data: assetIds.map((assetId) => ({
          assetId,
          resourceType: AssetResourceType.QUESTION,
          resourceId: question.id,
        })),
      });
    }

    await this.refreshQuestionSearchVector(question.id, tx);

    return question;
  }

  private buildSearchText(values: unknown[], subjectName?: string, topicName?: string) {
    const fragments = values.flatMap((value) => extractQuestionSearchFragments(value));
    return [...fragments, subjectName, topicName]
      .filter((item): item is string => Boolean(item))
      .join(' ');
  }

  private async refreshQuestionSearchVector(
    questionId: string,
    tx: PrismaWriter = this.prisma,
  ) {
    await tx.$executeRaw(
      Prisma.sql`UPDATE \"Question\" SET \"searchVector\" = to_tsvector('simple', coalesce(\"searchText\", '')) WHERE id = ${questionId}`,
    );
  }

  private extractAssetIds(values: unknown[]) {
    const ids = new Set<string>();
    const walk = (value: unknown) => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      if (value && typeof value === 'object') {
        Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
          if (typeof val === 'string' && (key === 'imageAssetId' || key === 'assetId')) {
            ids.add(val);
          }
          walk(val);
        });
      }
    };

    values.forEach(walk);
    return Array.from(ids);
  }

  private async validateAssets(assetIds: string[], tx: PrismaWriter = this.prisma) {
    if (assetIds.length === 0) {
      return;
    }

    const assets = await tx.fileAsset.findMany({ where: { id: { in: assetIds } } });
    if (assets.length !== assetIds.length) {
      throw new BadRequestException({
        code: 'ASSET_INVALID',
        message: 'One or more assets are invalid.',
      });
    }

    const allowedPurposes = new Set<FileAssetPurpose>([
      FileAssetPurpose.QUESTION_IMAGE,
      FileAssetPurpose.OPTION_IMAGE,
      FileAssetPurpose.EXPLANATION_IMAGE,
    ]);

    assets.forEach((asset) => {
      if (!asset.confirmedAt) {
        throw new BadRequestException({
          code: 'ASSET_NOT_CONFIRMED',
          message: 'Asset must be confirmed before use.',
        });
      }
      if (!allowedPurposes.has(asset.purpose)) {
        throw new BadRequestException({
          code: 'ASSET_INVALID_PURPOSE',
          message: 'Asset purpose not allowed for questions.',
        });
      }
    });
  }

  private async assertSubjectExists(subjectId: string, tx: PrismaWriter = this.prisma) {
    const subject = await tx.subject.findUnique({
      where: { id: subjectId },
      select: { id: true, name: true },
    });
    if (!subject) {
      throw new BadRequestException({
        code: 'SUBJECT_NOT_FOUND',
        message: 'Subject not found.',
      });
    }
    return subject;
  }
}
