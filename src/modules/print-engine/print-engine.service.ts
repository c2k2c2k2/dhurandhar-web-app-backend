import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AssetResourceType,
  FileAssetPurpose,
  PrintJobStatus,
  PrintJobType,
  Prisma,
  QuestionDifficulty,
} from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { MinioService } from '../files/minio.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  PrintJobCreateDto,
  PrintJobQueryDto,
  PrintPracticeJobDto,
} from './dto';

type TestConfig = {
  questionIds?: string[];
  items?: { questionId: string; marks?: number }[];
  mixer?: {
    subjectId?: string;
    topicIds?: string[];
    difficulty?: QuestionDifficulty;
    count: number;
  };
  marksPerQuestion?: number;
};

type PrintJobConfig = {
  type: PrintJobType;
  title?: string;
  subtitle?: string;
  includeAnswerKey?: boolean;
  testId?: string;
  questionIds?: string[];
};

type PrintJobItemInput = {
  questionId: string;
  orderIndex: number;
  marks?: number | null;
};

const DEFAULT_PAPER_TEMPLATE = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: "Times New Roman", serif; margin: 32px; color: #111; }
      h1 { font-size: 22px; margin-bottom: 4px; }
      .subtitle { margin: 0 0 16px 0; color: #555; }
      .question { margin-bottom: 14px; }
      .statement p { margin: 0 0 8px 0; }
      .options { margin: 0; padding-left: 18px; }
      .options li { margin-bottom: 6px; }
      img { max-width: 100%; height: auto; }
      .page-break { page-break-before: always; }
    </style>
  </head>
  <body>
    <header>
      <h1>{{title}}</h1>
      <p class="subtitle">{{subtitle}}</p>
    </header>
    <ol class="questions">
      {{content}}
    </ol>
  </body>
</html>`;

const DEFAULT_ANSWER_TEMPLATE = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: "Times New Roman", serif; margin: 32px; color: #111; }
      h2 { font-size: 20px; margin-bottom: 12px; }
      ol { padding-left: 18px; }
      li { margin-bottom: 6px; }
    </style>
  </head>
  <body>
    <h2>Answer Key</h2>
    <ol>
      {{answers}}
    </ol>
  </body>
</html>`;

@Injectable()
export class PrintEngineService {
  private readonly logger = new Logger(PrintEngineService.name);
  private readonly maxQuestions: number;
  private readonly maxEmbeddedBytes: number;
  private readonly useFakePdf: boolean;
  private readonly paperTemplate: string;
  private readonly answerTemplate: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly minioService: MinioService,
    private readonly configService: ConfigService,
    @InjectQueue('print-jobs') private readonly printQueue: Queue,
  ) {
    this.maxQuestions =
      this.configService.get<number>('PRINT_MAX_QUESTIONS') ?? 200;
    this.maxEmbeddedBytes =
      this.configService.get<number>('PRINT_MAX_EMBEDDED_IMAGE_BYTES') ??
      20971520;
    const fakeEnv = this.configService.get<boolean | string>('PRINT_FAKE_PDF');
    this.useFakePdf =
      typeof fakeEnv === 'boolean' ? fakeEnv : fakeEnv === 'true';

    this.paperTemplate = this.loadTemplate(
      'paper.html',
      DEFAULT_PAPER_TEMPLATE,
    );
    this.answerTemplate = this.loadTemplate(
      'answer-key.html',
      DEFAULT_ANSWER_TEMPLATE,
    );
  }

  // BullMQ worker is managed via @nestjs/bullmq Processor.

  async createJob(userId: string, dto: PrintJobCreateDto) {
    const { config, items } = await this.resolveJobItems(dto);
    if (items.length === 0) {
      throw new BadRequestException({
        code: 'PRINT_JOB_EMPTY',
        message: 'No questions selected for this print job.',
      });
    }

    if (items.length > this.maxQuestions) {
      throw new BadRequestException({
        code: 'PRINT_JOB_LIMIT',
        message: `Print job exceeds max questions (${this.maxQuestions}).`,
      });
    }

    const job = await this.prisma.printJob.create({
      data: {
        type: dto.type,
        configJson: config as Prisma.InputJsonValue,
        status: PrintJobStatus.QUEUED,
        createdByUserId: userId,
      },
    });

    await this.prisma.printJobItem.createMany({
      data: items.map((item) => ({
        jobId: job.id,
        questionId: item.questionId,
        orderIndex: item.orderIndex,
        metaJson:
          item.marks != null
            ? ({ marks: item.marks } as Prisma.InputJsonValue)
            : undefined,
      })),
    });

    await this.enqueue(job.id);
    return job;
  }

  async createPracticeJob(userId: string, dto: PrintPracticeJobDto) {
    const count = dto.count;
    if (!count || Number.isNaN(count)) {
      throw new BadRequestException({
        code: 'PRINT_PRACTICE_COUNT_REQUIRED',
        message: 'count is required for practice print jobs.',
      });
    }

    if (count > this.maxQuestions) {
      throw new BadRequestException({
        code: 'PRINT_JOB_LIMIT',
        message: `Print job exceeds max questions (${this.maxQuestions}).`,
      });
    }

    const where = {
      isPublished: true,
      subjectId: dto.subjectId ?? undefined,
      topicId: dto.topicIds?.length ? { in: dto.topicIds } : undefined,
      difficulty: dto.difficulty ?? undefined,
    };

    const pool = await this.prisma.question.findMany({
      where,
      select: { id: true },
    });

    if (pool.length === 0) {
      throw new BadRequestException({
        code: 'PRINT_PRACTICE_POOL_EMPTY',
        message: 'No questions available for the selected practice filters.',
      });
    }

    const picked = this.pickRandom(
      pool.map((item) => item.id),
      count,
    );

    return this.createJob(userId, {
      type: PrintJobType.PRACTICE,
      questionIds: picked,
      includeAnswerKey: dto.includeAnswerKey,
      title: dto.title,
      subtitle: dto.subtitle,
    });
  }

  async listJobs(query: PrintJobQueryDto) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);
    const where = {
      status: query.status ? (query.status as PrintJobStatus) : undefined,
      type: query.type ? (query.type as PrintJobType) : undefined,
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.printJob.count({ where }),
      this.prisma.printJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data, total, page, pageSize };
  }

  async getJob(jobId: string) {
    const job = await this.prisma.printJob.findUnique({
      where: { id: jobId },
      include: { items: true },
    });
    if (!job) {
      throw new NotFoundException({
        code: 'PRINT_JOB_NOT_FOUND',
        message: 'Print job not found.',
      });
    }
    return job;
  }

  async getDownloadUrl(jobId: string) {
    const job = await this.prisma.printJob.findUnique({ where: { id: jobId } });
    if (!job || !job.outputFileAssetId) {
      throw new NotFoundException({
        code: 'PRINT_JOB_FILE_NOT_FOUND',
        message: 'Print output not available.',
      });
    }

    const asset = await this.prisma.fileAsset.findUnique({
      where: { id: job.outputFileAssetId },
    });
    if (!asset) {
      throw new NotFoundException({
        code: 'FILE_NOT_FOUND',
        message: 'File asset not found.',
      });
    }

    const downloadUrl = await this.minioService.getPresignedGetUrl(
      asset.objectKey,
    );

    return {
      fileAssetId: asset.id,
      fileName: asset.fileName,
      downloadUrl,
      expiresInSeconds: 900,
    };
  }

  async retryJob(jobId: string) {
    const job = await this.prisma.printJob.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException({
        code: 'PRINT_JOB_NOT_FOUND',
        message: 'Print job not found.',
      });
    }

    const retryable = new Set<PrintJobStatus>([
      PrintJobStatus.FAILED,
      PrintJobStatus.CANCELLED,
      PrintJobStatus.QUEUED,
    ]);
    if (!retryable.has(job.status)) {
      throw new BadRequestException({
        code: 'PRINT_JOB_RETRY_INVALID',
        message: 'Only queued, failed, or cancelled jobs can be retried.',
      });
    }

    const updated = await this.prisma.printJob.update({
      where: { id: jobId },
      data: {
        status: PrintJobStatus.QUEUED,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        outputFileAssetId: null,
      },
    });

    await this.enqueue(jobId);
    return updated;
  }

  async cancelJob(jobId: string) {
    const job = await this.prisma.printJob.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException({
        code: 'PRINT_JOB_NOT_FOUND',
        message: 'Print job not found.',
      });
    }

    if (job.status === PrintJobStatus.DONE) {
      throw new BadRequestException({
        code: 'PRINT_JOB_CANCEL_INVALID',
        message: 'Completed jobs cannot be cancelled.',
      });
    }

    return this.prisma.printJob.update({
      where: { id: jobId },
      data: { status: PrintJobStatus.CANCELLED },
    });
  }

  private async enqueue(jobId: string) {
    try {
      await this.printQueue.add('print', { jobId }, { jobId });
      return;
    } catch (err) {
      this.logger.warn(
        `Print queue add failed; falling back to inline: ${this.formatError(err)}`,
      );
    }

    setImmediate(() => {
      this.processJob(jobId).catch((err) =>
        this.logger.error(`Print job ${jobId} failed`, err?.stack ?? err),
      );
    });
  }

  async processJob(jobId: string) {
    const job = await this.prisma.printJob.findUnique({
      where: { id: jobId },
      include: {
        items: {
          orderBy: { orderIndex: 'asc' },
          include: { question: true },
        },
      },
    });

    if (!job) return;
    if (
      job.status === PrintJobStatus.CANCELLED ||
      job.status === PrintJobStatus.DONE
    ) {
      return;
    }

    await this.prisma.printJob.update({
      where: { id: jobId },
      data: {
        status: PrintJobStatus.RUNNING,
        startedAt: new Date(),
        errorMessage: null,
      },
    });

    try {
      const html = await this.renderJobHtml(job);
      const pdfBuffer = this.useFakePdf
        ? this.buildFakePdf(job)
        : await this.renderPdf(html);

      const asset = await this.storePdf(job, pdfBuffer);

      await this.prisma.printJob.update({
        where: { id: jobId },
        data: {
          status: PrintJobStatus.DONE,
          outputFileAssetId: asset.id,
          completedAt: new Date(),
          errorMessage: null,
        },
      });
    } catch (err: any) {
      await this.prisma.printJob.update({
        where: { id: jobId },
        data: {
          status: PrintJobStatus.FAILED,
          errorMessage: this.formatError(err),
          completedAt: new Date(),
        },
      });
      throw err;
    }
  }

  private async renderJobHtml(job: {
    id: string;
    type: PrintJobType;
    configJson: Prisma.JsonValue;
    items: Array<{ question: any; orderIndex: number }>;
  }) {
    const config = (job.configJson ?? {}) as PrintJobConfig;
    const title = config.title ?? 'Question Paper';
    const subtitle = config.subtitle ?? '';

    const assets = await this.buildAssetMap(
      job.items.map((item) => item.question),
    );
    const questionsHtml = job.items
      .map((item, index) =>
        this.renderQuestion(item.question, index + 1, assets),
      )
      .join('');

    const paperHtml = this.renderTemplate(this.paperTemplate, {
      title: this.escapeHtml(title),
      subtitle: this.escapeHtml(subtitle),
      content: questionsHtml,
    });

    if (!config.includeAnswerKey) {
      return paperHtml;
    }

    const answersHtml = job.items
      .map((item, index) => this.renderAnswer(item.question, index + 1))
      .join('');

    const answerHtml = this.renderTemplate(this.answerTemplate, {
      answers: answersHtml,
    });
    const answerBody = this.extractBody(answerHtml);

    return paperHtml.replace(
      '</body>',
      `<div class="page-break"></div>${answerBody}</body>`,
    );
  }

  private renderQuestion(
    question: any,
    index: number,
    assets: Map<string, string>,
  ) {
    if (!question) {
      return `<li class="question"><strong>Question ${index} missing.</strong></li>`;
    }

    const statement = this.renderContent(question.statementJson, assets);
    const options = this.renderOptions(question.optionsJson, assets);

    return `<li class="question">
      <div class="statement">${statement}</div>
      ${options ? `<ol class="options" type="A">${options}</ol>` : ''}
    </li>`;
  }

  private renderOptions(value: unknown, assets: Map<string, string>) {
    if (!value) return '';
    if (Array.isArray(value)) {
      return value
        .map((item) => `<li>${this.renderContent(item, assets)}</li>`)
        .join('');
    }

    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const options = obj.options;
      if (Array.isArray(options)) {
        return options
          .map((item) => `<li>${this.renderContent(item, assets)}</li>`)
          .join('');
      }
    }

    return `<li>${this.renderContent(value, assets)}</li>`;
  }

  private renderAnswer(question: any, index: number) {
    if (!question) {
      return `<li>${index}. Missing question</li>`;
    }
    const answer = question.correctAnswerJson;
    let answerText = '';
    if (typeof answer === 'string') {
      answerText = answer;
    } else if (answer !== null && answer !== undefined) {
      answerText = JSON.stringify(answer);
    }
    const safeText = this.escapeHtml(answerText || '—');
    return `<li>${index}. ${safeText}</li>`;
  }

  private renderContent(value: unknown, assets: Map<string, string>): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return `<p>${this.escapeHtml(String(value))}</p>`;
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.renderContent(item, assets)).join('');
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const assetId =
        (obj.imageAssetId as string | undefined) ??
        (obj.assetId as string | undefined);
      const text = typeof obj.text === 'string' ? obj.text : undefined;
      const blocks = obj.blocks;

      let html = '';
      if (text) {
        html += `<p>${this.escapeHtml(text)}</p>`;
      }
      if (assetId) {
        const src = assets.get(assetId);
        if (src) {
          html += `<img src="${src}" />`;
        }
      }
      if (Array.isArray(blocks)) {
        html += blocks
          .map((block) => this.renderContent(block, assets))
          .join('');
      }

      if (html) {
        return html;
      }

      return Object.values(obj)
        .map((item) => this.renderContent(item, assets))
        .join('');
    }

    return '';
  }

  private async buildAssetMap(questions: any[]) {
    const assetIds = this.extractAssetIds(
      questions.flatMap((question) => [
        question?.statementJson,
        question?.optionsJson,
        question?.explanationJson,
      ]),
    );

    if (assetIds.length === 0) {
      return new Map<string, string>();
    }

    const assets = await this.prisma.fileAsset.findMany({
      where: { id: { in: assetIds } },
    });
    if (assets.length !== assetIds.length) {
      throw new BadRequestException({
        code: 'PRINT_ASSET_INVALID',
        message: 'One or more embedded assets are missing.',
      });
    }

    const assetMap = new Map<string, string>();
    let totalBytes = 0;

    for (const asset of assets) {
      if (!asset.confirmedAt) {
        throw new BadRequestException({
          code: 'PRINT_ASSET_UNCONFIRMED',
          message: 'Asset must be confirmed before printing.',
        });
      }
      const stream = await this.minioService.getObjectStream(asset.objectKey);
      const buffer = await this.streamToBuffer(stream);
      totalBytes += buffer.length;

      if (totalBytes > this.maxEmbeddedBytes) {
        throw new BadRequestException({
          code: 'PRINT_JOB_EMBED_LIMIT',
          message: 'Embedded images exceed max size.',
        });
      }

      const dataUri = `data:${asset.contentType};base64,${buffer.toString('base64')}`;
      assetMap.set(asset.id, dataUri);
    }

    return assetMap;
  }

  private async renderPdf(html: string) {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    const buffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();
    return buffer;
  }

  private buildFakePdf(job: { id: string }) {
    const text = `Print job ${job.id} generated without PDF engine.`;
    const parts: string[] = [];
    const offsets: number[] = [];

    const push = (chunk: string) => {
      offsets.push(Buffer.byteLength(parts.join('')));
      parts.push(chunk);
    };

    parts.push('%PDF-1.4\n');
    push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
    push(
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    );
    const stream = `BT /F1 18 Tf 72 720 Td (${this.escapePdf(text)}) Tj ET`;
    push(
      `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    );
    push(
      '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    );

    const xrefStart = Buffer.byteLength(parts.join(''));
    parts.push('xref\n0 6\n0000000000 65535 f \n');
    offsets.forEach((offset) => {
      parts.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
    });
    parts.push(
      `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`,
    );

    return Buffer.from(parts.join(''), 'utf8');
  }

  private async storePdf(
    job: { id: string; createdByUserId: string | null },
    buffer: Buffer,
  ) {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const fileName = `print-job-${job.id}.pdf`;
    const objectKey = `${FileAssetPurpose.PRINT_PDF.toLowerCase()}/${year}/${month}/${randomUUID()}-${fileName}`;

    const asset = await this.prisma.fileAsset.create({
      data: {
        objectKey,
        fileName,
        contentType: 'application/pdf',
        sizeBytes: buffer.length,
        purpose: FileAssetPurpose.PRINT_PDF,
        createdByUserId: job.createdByUserId ?? undefined,
      },
    });

    await this.minioService.uploadObject(objectKey, buffer, 'application/pdf');

    await this.prisma.fileAsset.update({
      where: { id: asset.id },
      data: { confirmedAt: new Date(), sizeBytes: buffer.length },
    });

    await this.prisma.assetReference.create({
      data: {
        assetId: asset.id,
        resourceType: AssetResourceType.PRINT_JOB,
        resourceId: job.id,
      },
    });

    return asset;
  }

  private async resolveJobItems(
    dto: PrintJobCreateDto,
  ): Promise<{ config: PrintJobConfig; items: PrintJobItemInput[] }> {
    if (dto.type === PrintJobType.TEST) {
      if (!dto.testId) {
        throw new BadRequestException({
          code: 'PRINT_TEST_REQUIRED',
          message: 'testId is required for TEST print jobs.',
        });
      }

      const test = await this.prisma.test.findUnique({
        where: { id: dto.testId },
      });
      if (!test) {
        throw new NotFoundException({
          code: 'TEST_NOT_FOUND',
          message: 'Test not found.',
        });
      }

      const config = (test.configJson ?? {}) as TestConfig;
      const items = await this.resolveTestItems(
        test.id,
        test.subjectId,
        config,
      );

      return {
        config: {
          type: dto.type,
          includeAnswerKey: dto.includeAnswerKey ?? false,
          title: dto.title ?? test.title,
          subtitle: dto.subtitle ?? test.description ?? undefined,
          testId: test.id,
        } as PrintJobConfig,
        items,
      };
    }

    const questionIds = dto.questionIds ?? [];
    if (questionIds.length === 0) {
      throw new BadRequestException({
        code: 'PRINT_QUESTIONS_REQUIRED',
        message: 'questionIds are required for practice/custom print jobs.',
      });
    }

    const questions = await this.prisma.question.findMany({
      where: { id: { in: questionIds } },
      select: { id: true },
    });
    if (questions.length !== questionIds.length) {
      throw new BadRequestException({
        code: 'PRINT_QUESTIONS_INVALID',
        message: 'One or more questions are invalid.',
      });
    }

    return {
      config: {
        type: dto.type,
        includeAnswerKey: dto.includeAnswerKey ?? false,
        title: dto.title,
        subtitle: dto.subtitle,
        questionIds,
      } as PrintJobConfig,
      items: questionIds.map((questionId, index) => ({
        questionId,
        orderIndex: index,
      })),
    };
  }

  private async resolveTestItems(
    testId: string,
    subjectId: string | null,
    config: TestConfig,
  ): Promise<PrintJobItemInput[]> {
    const fixedItems = await this.prisma.testQuestion.findMany({
      where: { testId },
      orderBy: { orderIndex: 'asc' },
    });

    if (fixedItems.length > 0) {
      return fixedItems.map((item, index) => ({
        questionId: item.questionId,
        orderIndex: item.orderIndex ?? index,
        marks: item.marks ?? null,
      }));
    }

    if (Array.isArray(config.items) && config.items.length > 0) {
      return config.items.map((item, index) => ({
        questionId: item.questionId,
        orderIndex: index,
        marks: item.marks ?? null,
      }));
    }

    if (Array.isArray(config.questionIds) && config.questionIds.length > 0) {
      return config.questionIds.map((questionId, index) => ({
        questionId,
        orderIndex: index,
      }));
    }

    if (!config.mixer || !config.mixer.count) {
      throw new BadRequestException({
        code: 'PRINT_TEST_CONFIG_INVALID',
        message: 'Test configuration missing question selection.',
      });
    }

    const where = {
      isPublished: true,
      subjectId: config.mixer.subjectId ?? subjectId ?? undefined,
      topicId: config.mixer.topicIds?.length
        ? { in: config.mixer.topicIds }
        : undefined,
      difficulty: config.mixer.difficulty ?? undefined,
    };

    const pool = await this.prisma.question.findMany({
      where,
      select: { id: true },
    });

    if (pool.length === 0) {
      throw new BadRequestException({
        code: 'PRINT_TEST_POOL_EMPTY',
        message: 'No questions available for this test.',
      });
    }

    const picked = this.pickRandom(
      pool.map((item) => item.id),
      config.mixer.count,
    );
    return picked.map((questionId, index) => ({
      questionId,
      orderIndex: index,
    }));
  }

  private pickRandom(ids: string[], count: number) {
    const pool = [...ids];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, Math.min(count, pool.length));
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
        Object.entries(value as Record<string, unknown>).forEach(
          ([key, val]) => {
            if (
              typeof val === 'string' &&
              (key === 'imageAssetId' || key === 'assetId')
            ) {
              ids.add(val);
            }
            walk(val);
          },
        );
      }
    };
    values.forEach(walk);
    return Array.from(ids);
  }

  private async streamToBuffer(stream: NodeJS.ReadableStream) {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  // BullMQ queue setup handled by @nestjs/bullmq module.

  private renderTemplate(template: string, values: Record<string, string>) {
    return Object.entries(values).reduce(
      (acc, [key, val]) => acc.replaceAll(`{{${key}}}`, val),
      template,
    );
  }

  private extractBody(html: string) {
    const match = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    return match ? match[1] : html;
  }

  private loadTemplate(fileName: string, fallback: string) {
    const candidates = [
      join(
        process.cwd(),
        'src',
        'modules',
        'print-engine',
        'templates',
        fileName,
      ),
      join(__dirname, 'templates', fileName),
    ];

    for (const filePath of candidates) {
      try {
        return readFileSync(filePath, 'utf8');
      } catch {
        // Try next path.
      }
    }

    return fallback;
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private escapePdf(value: string) {
    return value.replace(/[()\\]/g, (match) => `\\${match}`);
  }

  private formatError(err: any) {
    const message = err?.message ?? String(err);
    return message.length > 500 ? `${message.slice(0, 497)}...` : message;
  }
}
