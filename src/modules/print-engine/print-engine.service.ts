import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
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
import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import { constants as fsConstants, readFileSync } from 'fs';
import { access } from 'fs/promises';
import { join } from 'path';
import { promisify } from 'util';
import { MinioService } from '../files/minio.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { renderQuestionHtmlWithMath } from '../question-bank/utils/rich-content.util';
import {
  PrintJobCreateDto,
  PrintJobQueryDto,
  PrintPracticeJobDto,
} from './dto';

type TestConfig = {
  questionIds?: string[];
  items?: { questionId: string; marks?: number }[];
  sections?: Array<{
    count?: number;
    durationMinutes?: number;
    marksPerQuestion?: number;
  }>;
  mixer?: {
    subjectId?: string;
    topicIds?: string[];
    difficulty?: QuestionDifficulty;
    count: number;
  };
  durationMinutes?: number;
  marksPerQuestion?: number;
};

type PrintJobConfig = {
  type: PrintJobType;
  title?: string;
  subtitle?: string;
  includeAnswerKey?: boolean;
  testId?: string;
  questionIds?: string[];
  durationMinutes?: number;
  marksPerQuestion?: number;
  sections?: TestConfig['sections'];
};

type PrintJobItemInput = {
  questionId: string;
  orderIndex: number;
  marks?: number | null;
};

type PlaywrightChromium = {
  executablePath: () => string;
  launch: (options: {
    args?: string[];
    channel?: string;
    headless?: boolean;
  }) => Promise<any>;
};

type PdfLaunchMode = {
  channel?: 'chromium';
  waitUntil?: 'domcontentloaded' | 'networkidle';
};

type PrintJobRuntime = {
  id: string;
  type: PrintJobType;
  configJson: Prisma.JsonValue;
  createdAt: Date;
  items: Array<{
    question: any;
    orderIndex: number;
    metaJson?: Prisma.JsonValue | null;
  }>;
};

const execFileAsync = promisify(execFile);
const PRINT_CONTENT_IGNORED_KEYS = new Set([
  'imageAssetId',
  'assetId',
  'format',
  'languageMode',
  'primaryLanguage',
  'translations',
  'en',
  'mr',
]);
const PRINT_FONT_MARKER_VALUES = new Set([
  'dvbw-ttsurekhen',
  'dvbwttsurekhen',
  'ttsurekhen',
  'web-surekh-en',
  'isfoc-devanagari-bilingual-web-surekh-en-normal',
]);

const DEFAULT_PAPER_TEMPLATE = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: legal portrait; margin: 12mm 10mm 12mm 10mm; }

      * { box-sizing: border-box; }
      html, body { width: 100%; }
      body {
        margin: 0;
        color: #111;
        font-family: "Times New Roman", "Noto Sans Devanagari", serif;
        font-size: 13px;
        line-height: 1.36;
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
      }

      {{fontFaceStyles}}

      .paper-shell { width: 100%; }

      .paper-header {
        border: 1.6px solid #0f172a;
        border-radius: 14px;
        padding: 10px 14px 8px;
        margin-bottom: 10px;
      }

      .paper-header-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }

      .paper-meta {
        width: 26%;
        font-size: 13px;
        line-height: 1.35;
      }

      .paper-meta.right {
        text-align: right;
      }

      .paper-meta-label {
        font-weight: 700;
      }

      .paper-brand {
        width: 48%;
        text-align: center;
      }

      .paper-brand-name {
        margin: 0;
        font-size: 30px;
        line-height: 1.05;
        font-style: italic;
        font-weight: 700;
      }

      .paper-brand-meta {
        margin: 2px 0 0;
        font-size: 11.5px;
        letter-spacing: 0.15px;
      }

      .paper-title {
        margin: 8px 0 0;
        text-align: center;
        font-size: 25px;
        line-height: 1.25;
        font-weight: 700;
      }

      .paper-subtitle {
        margin: 2px 0 0;
        text-align: center;
        font-size: 12px;
      }

      .questions {
        margin: 0;
        padding-left: 22px;
        column-count: 2;
        column-gap: 16px;
        column-fill: auto;
      }

      .question {
        break-inside: avoid-column;
        page-break-inside: avoid;
        margin: 0 0 7px;
        padding-right: 4px;
      }

      .question::marker {
        font-weight: 700;
      }

      .statement p {
        margin: 0 0 3px;
      }

      .statement p:last-child {
        margin-bottom: 0;
      }

      .statement ul,
      .statement ol {
        margin: 0 0 3px;
        padding-left: 16px;
      }

      .statement li {
        margin-bottom: 2px;
      }

      .statement table {
        width: 100%;
        border-collapse: collapse;
        margin: 4px 0;
        table-layout: fixed;
      }

      .statement table th,
      .statement table td {
        border: 1px solid #a5b4c3;
        padding: 3px 5px;
        vertical-align: top;
        word-break: break-word;
      }

      .statement table th {
        background: #f1f5f9;
      }

      .statement img {
        display: block;
        max-width: 100%;
        max-height: 160px;
        height: auto;
        object-fit: contain;
        margin: 4px 0;
      }

      .question .options {
        margin: 3px 0 0;
        padding: 0;
        list-style: none;
        counter-reset: option;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 2px 12px;
      }

      .question .options > li {
        margin: 0;
        break-inside: avoid;
        display: flex;
        align-items: flex-start;
        gap: 4px;
      }

      .question .options > li::before {
        counter-increment: option;
        content: counter(option) ") ";
        font-weight: 700;
        min-width: 14px;
      }

      .question .options > li > p {
        margin: 0;
      }

      .statement .font-marathi-shree-dev,
      .statement .font-legacy-marathi,
      .statement [data-question-font="shree-dev"],
      .question .options .font-marathi-shree-dev,
      .question .options .font-legacy-marathi,
      .question .options [data-question-font="shree-dev"] {
        font-family: "Shree-Dev", "Shree Dev 0708", "Noto Sans Devanagari", serif;
        font-size: 1.14em;
        line-height: 1.56;
      }

      .statement .font-marathi-surekh,
      .statement .font-marathi-sulekha,
      .statement [data-question-font="surekh"],
      .statement [data-question-font="sulekha"],
      .question .options .font-marathi-surekh,
      .question .options .font-marathi-sulekha,
      .question .options [data-question-font="surekh"],
      .question .options [data-question-font="sulekha"] {
        font-family: "Surekh", "Sulekha", "Noto Sans Devanagari", serif;
        font-size: 1.14em;
        line-height: 1.56;
      }

      .question-math-inline .katex {
        font-size: 1.05em;
      }

      .question-math-block {
        margin: 4px 0;
      }

      .question-math-block .katex-display {
        margin: 0.3em 0;
      }

      .page-break {
        page-break-before: always;
        break-before: page;
      }

      .answer-key {
        font-size: 13px;
      }

      .answer-key h2 {
        margin: 0 0 8px;
        font-size: 20px;
      }

      .answer-key ol {
        margin: 0;
        padding-left: 20px;
        columns: 2;
        column-gap: 16px;
      }

      .answer-key li {
        break-inside: avoid;
        margin-bottom: 4px;
      }

      {{katexStyles}}
    </style>
  </head>
  <body>
    <main class="paper-shell">
      <header class="paper-header">
        <div class="paper-header-row">
          <div class="paper-meta">
            <div><span class="paper-meta-label">Time:</span> {{durationLabel}}</div>
            <div><span class="paper-meta-label">Marks:</span> {{marksLabel}}</div>
          </div>
          <div class="paper-brand">
            <h1 class="paper-brand-name">{{brandName}}</h1>
            {{brandMetaBlock}}
          </div>
          <div class="paper-meta right">
            <div><span class="paper-meta-label">Date:</span> {{paperDate}}</div>
            <div><span class="paper-meta-label">Questions:</span> {{questionCountLabel}}</div>
          </div>
        </div>
        <h2 class="paper-title">{{title}}</h2>
        {{subtitleBlock}}
      </header>
      <ol class="questions">
        {{content}}
      </ol>
    </main>
  </body>
</html>`;

const DEFAULT_ANSWER_TEMPLATE = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: legal portrait; margin: 12mm 10mm 12mm 10mm; }
      body {
        margin: 0;
        color: #111;
        font-family: "Times New Roman", "Noto Sans Devanagari", serif;
      }
      {{fontFaceStyles}}
    </style>
  </head>
  <body>
    <section class="answer-key">
      <h2>Answer Key</h2>
      <ol>
        {{answers}}
      </ol>
    </section>
  </body>
</html>`;

@Injectable()
export class PrintEngineService implements OnModuleInit {
  private static playwrightInstallPromise: Promise<void> | null = null;
  private readonly logger = new Logger(PrintEngineService.name);
  private readonly maxQuestions: number;
  private readonly maxEmbeddedBytes: number;
  private readonly useFakePdf: boolean;
  private readonly forceInlineProcessing: boolean;
  private readonly autoInstallPlaywrightChromium: boolean;
  private readonly requeueOnBootLimit: number;
  private readonly paperTemplate: string;
  private readonly answerTemplate: string;
  private readonly katexStyles: string;
  private readonly embeddedFontStyles: string;
  private readonly paperBrandName: string;
  private readonly paperBrandMeta: string;

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
    const forceInlineEnv = this.configService.get<boolean | string>(
      'PRINT_FORCE_INLINE_PROCESSING',
    );
    this.forceInlineProcessing =
      typeof forceInlineEnv === 'boolean'
        ? forceInlineEnv
        : forceInlineEnv === 'true';
    const autoInstallEnv = this.configService.get<boolean | string>(
      'PRINT_AUTO_INSTALL_PLAYWRIGHT_CHROMIUM',
    );
    this.autoInstallPlaywrightChromium =
      typeof autoInstallEnv === 'boolean'
        ? autoInstallEnv
        : autoInstallEnv !== 'false';
    this.requeueOnBootLimit =
      this.configService.get<number>('PRINT_REQUEUE_ON_BOOT_LIMIT') ?? 100;
    this.paperBrandName = this.resolvePaperBrandName();
    this.paperBrandMeta =
      this.configService.get<string>('PRINT_PAPER_BRAND_META')?.trim() ?? '';

    this.paperTemplate = this.loadTemplate(
      'paper.html',
      DEFAULT_PAPER_TEMPLATE,
    );
    this.answerTemplate = this.loadTemplate(
      'answer-key.html',
      DEFAULT_ANSWER_TEMPLATE,
    );
    this.katexStyles = this.loadKatexStyles();
    this.embeddedFontStyles = this.loadEmbeddedFontStyles();
  }

  // BullMQ worker is managed via @nestjs/bullmq Processor.

  async onModuleInit() {
    await this.requeueQueuedJobsOnBoot();
  }

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

    await this.enqueue(jobId, { forceReset: true });
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

    const updated = await this.prisma.printJob.update({
      where: { id: jobId },
      data: { status: PrintJobStatus.CANCELLED },
    });
    await this.removeExistingQueueJob(jobId);
    return updated;
  }

  async deleteJob(jobId: string) {
    const job = await this.prisma.printJob.findUnique({
      where: { id: jobId },
      select: { id: true, status: true },
    });
    if (!job) {
      throw new NotFoundException({
        code: 'PRINT_JOB_NOT_FOUND',
        message: 'Print job not found.',
      });
    }

    if (job.status === PrintJobStatus.RUNNING) {
      throw new BadRequestException({
        code: 'PRINT_JOB_DELETE_INVALID',
        message: 'Running print jobs cannot be deleted. Cancel it first.',
      });
    }

    await this.removeExistingQueueJob(jobId);

    await this.prisma.$transaction([
      this.prisma.assetReference.deleteMany({
        where: {
          resourceType: AssetResourceType.PRINT_JOB,
          resourceId: jobId,
        },
      }),
      this.prisma.printJob.delete({
        where: { id: jobId },
      }),
    ]);

    return { success: true };
  }

  private async enqueue(jobId: string, options?: { forceReset?: boolean }) {
    if (this.forceInlineProcessing) {
      setImmediate(() => {
        this.processJob(jobId).catch((err) =>
          this.logger.error(`Inline print job ${jobId} failed`, err?.stack ?? err),
        );
      });
      return;
    }

    const addToQueue = () =>
      this.printQueue.add('print', { jobId }, this.getQueueJobOptions(jobId));

    if (options?.forceReset) {
      await this.removeExistingQueueJob(jobId);
    }

    try {
      let queued = await addToQueue();
      const state = await queued.getState();
      if (state === 'failed' || state === 'completed') {
        this.logger.warn(
          `Queue job ${jobId} is ${state}; removing stale entry and re-enqueueing.`,
        );
        await this.removeExistingQueueJob(jobId);
        queued = await addToQueue();
      }
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

  private getQueueJobOptions(jobId: string) {
    return {
      jobId,
      removeOnComplete: 1000,
      removeOnFail: 1000,
    };
  }

  private async removeExistingQueueJob(jobId: string) {
    try {
      const existing = await this.printQueue.getJob(jobId);
      if (!existing) return;
      const state = await existing.getState();
      if (state === 'active') {
        this.logger.warn(
          `Queue job ${jobId} is active and cannot be removed safely.`,
        );
        return;
      }
      await existing.remove();
      this.logger.debug(`Removed existing queue job ${jobId} (${state}).`);
    } catch (err) {
      this.logger.warn(
        `Failed removing existing queue job ${jobId}: ${this.formatError(err)}`,
      );
    }
  }

  private async requeueQueuedJobsOnBoot() {
    try {
      const queued = await this.prisma.printJob.findMany({
        where: { status: PrintJobStatus.QUEUED },
        orderBy: { createdAt: 'asc' },
        take: this.requeueOnBootLimit,
        select: { id: true },
      });
      if (queued.length === 0) return;

      this.logger.log(
        `Re-enqueueing ${queued.length} queued print jobs on boot.`,
      );
      for (const item of queued) {
        await this.enqueue(item.id, { forceReset: true });
      }
    } catch (err) {
      this.logger.warn(
        `Unable to re-enqueue queued print jobs on boot: ${this.formatError(err)}`,
      );
    }
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

  private async renderJobHtml(job: PrintJobRuntime) {
    const config = (job.configJson ?? {}) as PrintJobConfig;
    const title = config.title ?? 'Question Paper';
    const subtitle = config.subtitle?.trim() ?? '';
    const subtitleBlock = subtitle
      ? `<p class="paper-subtitle">${this.escapeHtml(subtitle)}</p>`
      : '';
    const brandMetaBlock = this.paperBrandMeta
      ? `<p class="paper-brand-meta">${this.escapeHtml(this.paperBrandMeta)}</p>`
      : '';
    const headerMeta = this.buildHeaderMeta(job, config);

    const assets = await this.buildAssetMap(
      job.items.map((item) => item.question),
    );
    const questionsHtml = job.items
      .map((item, index) =>
        this.renderQuestion(item.question, index + 1, assets),
      )
      .join('');

    const paperHtml = this.renderTemplate(this.paperTemplate, {
      brandName: this.escapeHtml(this.paperBrandName),
      brandMetaBlock,
      durationLabel: this.escapeHtml(headerMeta.durationLabel),
      marksLabel: this.escapeHtml(headerMeta.marksLabel),
      paperDate: this.escapeHtml(headerMeta.paperDate),
      questionCountLabel: this.escapeHtml(headerMeta.questionCountLabel),
      title: this.escapeHtml(title),
      subtitleBlock,
      content: questionsHtml,
      fontFaceStyles: this.embeddedFontStyles,
      katexStyles: this.katexStyles,
    });

    if (!config.includeAnswerKey) {
      return paperHtml;
    }

    const answersHtml = job.items
      .map((item, index) => this.renderAnswer(item.question, index + 1))
      .join('');

    const answerHtml = this.renderTemplate(this.answerTemplate, {
      answers: answersHtml,
      fontFaceStyles: this.embeddedFontStyles,
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
      ${options ? `<ol class="options">${options}</ol>` : ''}
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
      return `<li>Missing question ${index}</li>`;
    }
    const answer = question.correctAnswerJson;
    let answerText = '';
    if (typeof answer === 'string') {
      answerText = answer;
    } else if (answer !== null && answer !== undefined) {
      answerText = JSON.stringify(answer);
    }
    const safeText = this.escapeHtml(answerText || '—');
    return `<li>${safeText}</li>`;
  }

  private buildHeaderMeta(job: PrintJobRuntime, config: PrintJobConfig) {
    const durationMinutes = this.resolveDurationMinutes(config);
    const totalMarks = this.resolveTotalMarks(config, job.items);
    return {
      durationLabel:
        durationMinutes != null
          ? `${this.formatNumericLabel(durationMinutes)} Min`
          : '—',
      marksLabel:
        totalMarks != null ? this.formatNumericLabel(totalMarks) : '—',
      paperDate: this.formatDateLabel(job.createdAt),
      questionCountLabel: this.formatNumericLabel(job.items.length),
    };
  }

  private resolveDurationMinutes(config: PrintJobConfig): number | null {
    if (config.type !== PrintJobType.TEST) {
      return null;
    }
    const testConfig = config as unknown as TestConfig;
    if (
      typeof testConfig.durationMinutes === 'number' &&
      Number.isFinite(testConfig.durationMinutes) &&
      testConfig.durationMinutes > 0
    ) {
      return testConfig.durationMinutes;
    }

    if (
      !Array.isArray(testConfig.sections) ||
      testConfig.sections.length === 0
    ) {
      return null;
    }

    const sectionDurations = testConfig.sections
      .map((section) => section?.durationMinutes)
      .filter(
        (value): value is number =>
          typeof value === 'number' && Number.isFinite(value) && value > 0,
      );
    if (sectionDurations.length === 0) {
      return null;
    }
    return sectionDurations.reduce((sum, value) => sum + value, 0);
  }

  private resolveTotalMarks(
    config: PrintJobConfig,
    items: PrintJobRuntime['items'],
  ) {
    const explicitMarks = items
      .map((item) => this.readItemMarks(item.metaJson))
      .filter((value): value is number => value !== null);

    if (explicitMarks.length > 0) {
      return explicitMarks.reduce((sum, value) => sum + value, 0);
    }

    if (config.type === PrintJobType.TEST) {
      const testConfig = config as unknown as TestConfig;
      if (
        typeof testConfig.marksPerQuestion === 'number' &&
        Number.isFinite(testConfig.marksPerQuestion) &&
        testConfig.marksPerQuestion > 0
      ) {
        return testConfig.marksPerQuestion * items.length;
      }

      if (
        Array.isArray(testConfig.sections) &&
        testConfig.sections.length > 0
      ) {
        const sectionTotal = testConfig.sections.reduce((sum, section) => {
          if (
            !section ||
            typeof section.count !== 'number' ||
            !Number.isFinite(section.count) ||
            section.count <= 0 ||
            typeof section.marksPerQuestion !== 'number' ||
            !Number.isFinite(section.marksPerQuestion) ||
            section.marksPerQuestion <= 0
          ) {
            return sum;
          }
          return sum + section.count * section.marksPerQuestion;
        }, 0);
        if (sectionTotal > 0) {
          return sectionTotal;
        }
      }
    }

    return items.length > 0 ? items.length : null;
  }

  private readItemMarks(metaJson: Prisma.JsonValue | null | undefined) {
    if (!metaJson || typeof metaJson !== 'object' || Array.isArray(metaJson)) {
      return null;
    }

    const rawValue = (metaJson as Record<string, unknown>).marks;
    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      return rawValue;
    }

    if (typeof rawValue === 'string') {
      const parsed = Number(rawValue);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return null;
  }

  private formatNumericLabel(value: number) {
    if (!Number.isFinite(value)) {
      return '—';
    }

    if (Number.isInteger(value)) {
      return String(value);
    }

    return value
      .toFixed(2)
      .replace(/\.00$/, '')
      .replace(/(\.\d)0$/, '$1');
  }

  private formatDateLabel(value: Date) {
    const day = String(value.getDate()).padStart(2, '0');
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const year = String(value.getFullYear());
    return `${day}/${month}/${year}`;
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
      const textValue = String(value);
      if (this.shouldSuppressArtifactText(textValue)) {
        return '';
      }
      return `<p>${this.renderPlainTextWithFontHints(textValue)}</p>`;
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.renderContent(item, assets)).join('');
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const localized = this.resolveLocalizedObjectValue(obj);
      if (localized && localized !== obj) {
        return this.renderContent(localized, assets);
      }
      const assetId =
        (obj.imageAssetId as string | undefined) ??
        (obj.assetId as string | undefined);
      const richHtml = this.sanitizeRichHtmlForPrint(
        typeof obj.html === 'string' ? obj.html : undefined,
        assetId,
      );
      const text = this.sanitizePlainTextForPrint(
        typeof obj.text === 'string' ? obj.text : undefined,
        assetId,
      );
      const blocks = obj.blocks;

      let html = '';
      if (richHtml) {
        html += this.renderRichHtml(richHtml);
      } else if (text) {
        const legacyMathHtml = this.renderLegacyMathFromText(text);
        html += legacyMathHtml || `<p>${this.renderPlainTextWithFontHints(text)}</p>`;
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

      return Object.entries(obj)
        .filter(([key]) => !PRINT_CONTENT_IGNORED_KEYS.has(key))
        .map(([, item]) => this.renderContent(item, assets))
        .join('');
    }

    return '';
  }

  private resolveLocalizedObjectValue(obj: Record<string, unknown>) {
    const primaryLanguage =
      typeof obj.primaryLanguage === 'string' ? obj.primaryLanguage : null;
    const fallbackOrder = primaryLanguage === 'mr' ? ['mr', 'en'] : ['en', 'mr'];
    for (const key of fallbackOrder) {
      const value = obj[key];
      if (value !== null && value !== undefined) {
        return value;
      }
    }

    const translations = obj.translations;
    if (
      translations &&
      typeof translations === 'object' &&
      !Array.isArray(translations)
    ) {
      const record = translations as Record<string, unknown>;
      for (const key of fallbackOrder) {
        const value = record[key];
        if (value !== null && value !== undefined) {
          return value;
        }
      }
    }

    return null;
  }

  private sanitizeRichHtmlForPrint(value: string | undefined, assetId?: string) {
    if (!value) {
      return '';
    }

    if (this.isArtifactOnlyContent(value, assetId)) {
      return '';
    }

    const withoutMarkers = value.replace(
      /<(p|div)[^>]*>\s*(?:<span[^>]*>\s*)*(DVBW-?TTSurekhEN|Web-Surekh-EN|ISFOC-Devanagari-Bilingual-Web-Surekh-EN-Normal|TTSurekhEN)\s*(?:<\/span>\s*)*<\/\1>/gi,
      '',
    );

    return withoutMarkers.trim();
  }

  private sanitizePlainTextForPrint(value: string | undefined, assetId?: string) {
    if (!value) {
      return '';
    }

    if (this.isArtifactOnlyContent(value, assetId)) {
      return '';
    }

    const cleaned = value
      .split('\n')
      .filter((line) => !this.isKnownFontMarker(line))
      .join('\n')
      .trim();
    if (!cleaned) {
      return '';
    }
    return cleaned;
  }

  private renderPlainTextWithFontHints(value: string) {
    const escaped = this.escapeHtml(value);
    if (!this.looksLikeSurekhEncodedText(value)) {
      return escaped;
    }
    return `<span class="font-marathi-encoded font-marathi-surekh font-marathi-sulekha" data-question-font="surekh">${escaped}</span>`;
  }

  private isArtifactOnlyContent(value: string, assetId?: string) {
    const normalized = this.extractPlainTextForPrint(value);
    if (!normalized) {
      return true;
    }

    if (assetId && normalized === assetId) {
      return true;
    }

    if (this.isKnownFontMarker(normalized)) {
      return true;
    }

    if (assetId && this.isLikelyAssetId(normalized)) {
      return true;
    }

    return false;
  }

  private shouldSuppressArtifactText(value: string) {
    const normalized = value.trim();
    if (!normalized) {
      return true;
    }
    if (this.isLikelyAssetId(normalized)) {
      return true;
    }
    if (this.isKnownFontMarker(normalized)) {
      return true;
    }
    return false;
  }

  private isLikelyAssetId(value: string) {
    return /^[a-z0-9]{20,40}$/i.test(value);
  }

  private isKnownFontMarker(value: string) {
    const compact = value.replace(/\s+/g, '').toLowerCase();
    return PRINT_FONT_MARKER_VALUES.has(compact);
  }

  private looksLikeSurekhEncodedText(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      return false;
    }

    if (/[\u0900-\u097F]/.test(trimmed)) {
      return false;
    }

    const surekhGlyphs =
      trimmed.match(
        /[\u00A1-\u00FF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u02C6\u02DC\u2013-\u2022\u2026\u2030\u2039\u203A\u20AC]/g,
      ) || [];

    return surekhGlyphs.length >= Math.max(3, Math.floor(trimmed.length * 0.12));
  }

  private extractPlainTextForPrint(value: string) {
    const source = value.includes('&lt;') ? this.decodeHtmlEntities(value) : value;
    const withoutTags = source
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ');
    return this.decodeHtmlEntities(withoutTags).replace(/\s+/g, ' ').trim();
  }

  private renderRichHtml(value: string) {
    return renderQuestionHtmlWithMath(value);
  }

  private renderLegacyMathFromText(value: string) {
    const hasMathPlaceholder =
      /(?:<|&lt;)(span|div)[^>]*data-question-math-(inline|block)\s*=/i.test(
        value,
      );
    if (!hasMathPlaceholder) {
      return '';
    }
    const source = value.includes('&lt;')
      ? this.decodeHtmlEntities(value)
      : value;
    return this.renderRichHtml(source);
  }

  private decodeHtmlEntities(value: string) {
    return value
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
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
    const browserType = chromium as PlaywrightChromium;
    await this.ensurePlaywrightChromium(browserType);

    try {
      return await this.tryRenderPdfWithRecovery(browserType, html, {
        channel: 'chromium',
        waitUntil: 'networkidle',
      });
    } catch (firstErr) {
      if (!this.isPdfPrintingFailedError(firstErr)) {
        throw firstErr;
      }
      this.logger.warn(
        'Playwright printToPDF failed in Chromium channel; retrying in headless shell mode.',
      );
    }

    try {
      return await this.tryRenderPdfWithRecovery(browserType, html, {
        waitUntil: 'domcontentloaded',
      });
    } catch (secondErr) {
      if (!this.isPdfPrintingFailedError(secondErr)) {
        throw secondErr;
      }
      this.logger.warn(
        'Playwright printToPDF failed again; retrying without embedded images in Chromium channel.',
      );
    }

    const fallbackHtml = this.stripImagesFromHtml(html);
    return this.tryRenderPdfWithRecovery(browserType, fallbackHtml, {
      channel: 'chromium',
      waitUntil: 'domcontentloaded',
    });
  }

  private async tryRenderPdfWithRecovery(
    chromium: PlaywrightChromium,
    html: string,
    mode: PdfLaunchMode,
  ) {
    try {
      return await this.renderPdfWithChromium(chromium, html, mode);
    } catch (err) {
      if (this.isMissingDependenciesError(err)) {
        throw new Error(
          'Playwright Chromium dependencies are missing on this host. On Linux/Coolify, run "pnpm exec playwright install --with-deps chromium" during build.',
        );
      }
      if (
        !this.autoInstallPlaywrightChromium ||
        !this.isMissingExecutableError(err)
      ) {
        throw err;
      }

      this.logger.warn(
        'Chromium executable missing during launch; reinstalling Playwright Chromium and retrying once.',
      );
      await this.installPlaywrightChromium();
      await this.ensurePlaywrightChromium(chromium);
      return this.renderPdfWithChromium(chromium, html, mode);
    }
  }

  private async renderPdfWithChromium(
    chromium: PlaywrightChromium,
    html: string,
    mode: PdfLaunchMode = {},
  ) {
    const { channel, waitUntil = 'networkidle' } = mode;
    const browser = await chromium.launch({
      channel,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil });
      await this.waitForPrintPageAssets(page);
      const buffer = await page.pdf({
        format: 'Legal',
        printBackground: true,
        preferCSSPageSize: true,
      });
      return buffer;
    } finally {
      await browser.close();
    }
  }

  private async waitForPrintPageAssets(page: any) {
    await page.evaluate(async () => {
      const fonts = document.fonts;
      if (fonts) {
        try {
          await fonts.ready;
        } catch {
          // Ignore and continue; PDF render may still succeed with fallbacks.
        }
      }

      const imagePromises = Array.from(document.images || []).map((image) => {
        if (image.complete) {
          return Promise.resolve();
        }
        return new Promise<void>((resolve) => {
          image.addEventListener('load', () => resolve(), { once: true });
          image.addEventListener('error', () => resolve(), { once: true });
        });
      });

      if (imagePromises.length > 0) {
        await Promise.all(imagePromises);
      }
    });
  }

  private stripImagesFromHtml(html: string) {
    return html.replace(
      /<img\b[^>]*>/gi,
      '<div style="font-style:italic;color:#64748b;">[Image omitted in fallback PDF]</div>',
    );
  }

  private async ensurePlaywrightChromium(chromium: PlaywrightChromium) {
    const executablePath = this.getChromiumExecutablePath(chromium);
    if (executablePath && (await this.pathExists(executablePath))) {
      return;
    }

    if (!this.autoInstallPlaywrightChromium) {
      const location = executablePath ? ` at ${executablePath}` : '';
      throw new Error(
        `Playwright Chromium executable is missing${location}. Run "pnpm run playwright:install".`,
      );
    }

    const location = executablePath ? ` at ${executablePath}` : '';
    this.logger.warn(
      `Playwright Chromium executable missing${location}; installing browser binaries.`,
    );
    await this.installPlaywrightChromium();

    const installedPath = this.getChromiumExecutablePath(chromium);
    if (installedPath && (await this.pathExists(installedPath))) {
      return;
    }

    const installedLocation = installedPath ? ` at ${installedPath}` : '';
    throw new Error(
      `Playwright Chromium installation completed, but executable is still missing${installedLocation}.`,
    );
  }

  private getChromiumExecutablePath(chromium: PlaywrightChromium) {
    try {
      const executablePath = chromium.executablePath();
      return executablePath?.trim() ? executablePath : null;
    } catch {
      return null;
    }
  }

  private async installPlaywrightChromium() {
    if (!PrintEngineService.playwrightInstallPromise) {
      PrintEngineService.playwrightInstallPromise =
        this.runPlaywrightChromiumInstall().finally(() => {
          PrintEngineService.playwrightInstallPromise = null;
        });
    }
    return PrintEngineService.playwrightInstallPromise;
  }

  private async runPlaywrightChromiumInstall() {
    const cliPath = require.resolve('playwright/cli');
    try {
      const result = await execFileAsync(
        process.execPath,
        [cliPath, 'install', 'chromium'],
        {
          maxBuffer: 10 * 1024 * 1024,
        },
      );
      const stderr = result.stderr?.trim();
      if (stderr) {
        this.logger.debug(`Playwright install stderr: ${stderr}`);
      }
    } catch (err: any) {
      const stderr = err?.stderr ? String(err.stderr).trim() : '';
      const stdout = err?.stdout ? String(err.stdout).trim() : '';
      const details = [stderr, stdout].filter(Boolean).join(' | ');
      throw new Error(
        `Failed to install Playwright Chromium automatically.${details ? ` ${details}` : ''}`,
      );
    }
  }

  private async pathExists(path: string) {
    try {
      await access(path, fsConstants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private isMissingExecutableError(err: any) {
    const message = this.formatError(err).toLowerCase();
    return (
      message.includes(`executable doesn't exist`) ||
      (message.includes('failed to launch') && message.includes('browser')) ||
      message.includes('browser executable')
    );
  }

  private isMissingDependenciesError(err: any) {
    const message = this.formatError(err).toLowerCase();
    return message.includes('host system is missing dependencies');
  }

  private isPdfPrintingFailedError(err: any) {
    const message = this.formatError(err).toLowerCase();
    return (
      message.includes('printing failed') || message.includes('page.printtopdf')
    );
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
          durationMinutes: config.durationMinutes,
          marksPerQuestion: config.marksPerQuestion,
          sections: config.sections,
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

  private resolvePaperBrandName() {
    const explicit =
      this.configService.get<string>('PRINT_PAPER_BRAND_NAME')?.trim() ?? '';
    if (explicit) {
      return explicit;
    }

    const appName = this.configService.get<string>('APP_NAME')?.trim() ?? '';
    if (!appName) {
      return 'Question Paper';
    }

    return appName.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  private loadKatexStyles() {
    try {
      const cssPath = require.resolve('katex/dist/katex.min.css');
      return readFileSync(cssPath, 'utf8');
    } catch {
      this.logger.warn('Unable to load KaTeX CSS for print rendering.');
      return '';
    }
  }

  private loadEmbeddedFontStyles() {
    const fontFaces: Array<{
      family: string;
      style: 'normal' | 'italic';
      weight: number;
      sources: Array<{
        relativePath: string;
        format: 'woff' | 'truetype';
        mimeType: string;
      }>;
    }> = [
      {
        family: 'Shree Dev 0708',
        style: 'normal',
        weight: 400,
        sources: [
          {
            relativePath: 'S0708892-nohint.woff',
            format: 'woff',
            mimeType: 'font/woff',
          },
          {
            relativePath: 'S0708892.woff',
            format: 'woff',
            mimeType: 'font/woff',
          },
          {
            relativePath: 'S0708892-nohint.ttf',
            format: 'truetype',
            mimeType: 'font/ttf',
          },
          {
            relativePath: 'S0708892.ttf',
            format: 'truetype',
            mimeType: 'font/ttf',
          },
        ],
      },
      {
        family: 'Shree-Dev',
        style: 'normal',
        weight: 400,
        sources: [
          {
            relativePath: 'S0708892-nohint.woff',
            format: 'woff',
            mimeType: 'font/woff',
          },
          {
            relativePath: 'S0708892.woff',
            format: 'woff',
            mimeType: 'font/woff',
          },
          {
            relativePath: 'S0708892-nohint.ttf',
            format: 'truetype',
            mimeType: 'font/ttf',
          },
          {
            relativePath: 'S0708892.ttf',
            format: 'truetype',
            mimeType: 'font/ttf',
          },
        ],
      },
      {
        family: 'Sulekha',
        style: 'normal',
        weight: 400,
        sources: [
          {
            relativePath: 'sulekha/DVBWSR3N.TTF',
            format: 'truetype',
            mimeType: 'font/ttf',
          },
        ],
      },
      {
        family: 'Sulekha',
        style: 'italic',
        weight: 400,
        sources: [
          {
            relativePath: 'sulekha/DVBWSR3I.TTF',
            format: 'truetype',
            mimeType: 'font/ttf',
          },
        ],
      },
      {
        family: 'Sulekha',
        style: 'normal',
        weight: 700,
        sources: [
          {
            relativePath: 'sulekha/DVBWSR3B.TTF',
            format: 'truetype',
            mimeType: 'font/ttf',
          },
        ],
      },
      {
        family: 'Surekh',
        style: 'normal',
        weight: 400,
        sources: [
          {
            relativePath: 'sulekha/DVBWSR3N.TTF',
            format: 'truetype',
            mimeType: 'font/ttf',
          },
        ],
      },
      {
        family: 'Surekh',
        style: 'italic',
        weight: 400,
        sources: [
          {
            relativePath: 'sulekha/DVBWSR3I.TTF',
            format: 'truetype',
            mimeType: 'font/ttf',
          },
        ],
      },
      {
        family: 'Surekh',
        style: 'normal',
        weight: 700,
        sources: [
          {
            relativePath: 'sulekha/DVBWSR3B.TTF',
            format: 'truetype',
            mimeType: 'font/ttf',
          },
        ],
      },
    ];

    const cssBlocks: string[] = [];
    const missingFaces: string[] = [];

    for (const face of fontFaces) {
      const sources = face.sources
        .map((source) =>
          this.buildEmbeddedFontSource(
            source.relativePath,
            source.mimeType,
            source.format,
          ),
        )
        .filter((source): source is string => Boolean(source));

      if (sources.length === 0) {
        missingFaces.push(
          `${face.family} (${face.style}, ${face.weight.toString()})`,
        );
        continue;
      }

      cssBlocks.push(
        `@font-face { font-family: "${face.family}"; src: ${sources.join(', ')}; font-style: ${face.style}; font-weight: ${face.weight}; font-display: swap; }`,
      );
    }

    if (missingFaces.length > 0) {
      this.logger.warn(
        `Unable to embed some Marathi print fonts: ${missingFaces.join(', ')}. PDF may fall back to host fonts.`,
      );
    }

    return cssBlocks.join('\n');
  }

  private buildEmbeddedFontSource(
    relativePath: string,
    mimeType: string,
    format: string,
  ) {
    for (const candidatePath of this.getPrintFontPathCandidates(relativePath)) {
      try {
        const buffer = readFileSync(candidatePath);
        return `url("data:${mimeType};base64,${buffer.toString('base64')}") format("${format}")`;
      } catch {
        // Continue through candidates.
      }
    }
    return null;
  }

  private getPrintFontPathCandidates(relativePath: string) {
    const configuredRoot =
      this.configService.get<string>('PRINT_FONTS_DIR')?.trim() ?? '';
    const roots = [
      configuredRoot,
      join(process.cwd(), 'src', 'modules', 'print-engine', 'fonts'),
      join(process.cwd(), 'public', 'fonts'),
      join(
        process.cwd(),
        '..',
        'dhurandhar-web-app-frontend',
        'public',
        'fonts',
      ),
      join(__dirname, 'fonts'),
    ].filter((entry): entry is string => Boolean(entry));

    return Array.from(new Set(roots)).map((root) => join(root, relativePath));
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
