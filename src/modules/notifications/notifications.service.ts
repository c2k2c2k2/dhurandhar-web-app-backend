import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import {
  BroadcastStatus,
  NotificationChannel,
  NotificationStatus,
  Prisma,
  UserStatus,
  UserType,
} from '@prisma/client';
import { Job, Queue } from 'bullmq';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  BroadcastCreateDto,
  BroadcastQueryDto,
  BroadcastScheduleDto,
  NotificationMessageQueryDto,
  NotificationPreferenceUpdateDto,
  NotificationTemplateCreateDto,
  NotificationTemplateQueryDto,
  NotificationTemplateUpdateDto,
} from './dto';

type RenderedTemplate = {
  subject?: string;
  text?: string;
  html?: string;
};

type BroadcastAudience = {
  userType?: UserType;
  status?: UserStatus;
  userIds?: string[];
  createdFrom?: string;
  createdTo?: string;
};

type TemplatePayload = Record<string, unknown> & { subject?: string };

type NotificationTarget = {
  email?: string | null;
  fullName?: string | null;
};

const OTP_FALLBACK: RenderedTemplate = {
  subject: 'Your OTP code',
  text: 'Your {{appName}} OTP is {{otp}}. It expires in {{expiresInMinutes}} minutes.',
  html: '<p>Your {{appName}} OTP is <strong>{{otp}}</strong>. It expires in {{expiresInMinutes}} minutes.</p>',
};

const RESET_FALLBACK: RenderedTemplate = {
  subject: 'Reset your password',
  text: 'Reset your {{appName}} password using this link: {{resetLink}}. This link expires in {{expiresInMinutes}} minutes.',
  html: '<p>Reset your {{appName}} password using this link: <a href="{{resetLink}}">Reset Password</a>. This link expires in {{expiresInMinutes}} minutes.</p>',
};

const PAYMENT_SUCCESS_FALLBACK: RenderedTemplate = {
  subject: 'Payment received',
  text: 'We received your payment of {{amount}} for {{planName}}. Order ID: {{orderId}}.',
  html: '<p>We received your payment of <strong>{{amount}}</strong> for {{planName}}.</p><p>Order ID: {{orderId}}</p>',
};

const SUBSCRIPTION_FALLBACK: RenderedTemplate = {
  subject: 'Subscription activated',
  text: 'Your {{planName}} subscription is now active until {{endsAt}}.',
  html: '<p>Your {{planName}} subscription is now active until <strong>{{endsAt}}</strong>.</p>',
};

const AUTOPAY_ENABLED_FALLBACK: RenderedTemplate = {
  subject: 'AutoPay enabled',
  text: 'AutoPay is enabled for {{planName}}. Next charge on {{nextChargeAt}}.',
  html: '<p>AutoPay is enabled for <strong>{{planName}}</strong>.</p><p>Next charge on {{nextChargeAt}}.</p>',
};

const AUTOPAY_RENEWAL_REMINDER_FALLBACK: RenderedTemplate = {
  subject: 'AutoPay renewal reminder',
  text: 'Your {{planName}} renewal of {{amount}} is scheduled on {{chargeAt}}.',
  html: '<p>Your {{planName}} renewal of <strong>{{amount}}</strong> is scheduled on {{chargeAt}}.</p>',
};

const AUTOPAY_RENEWAL_SUCCESS_FALLBACK: RenderedTemplate = {
  subject: 'AutoPay renewal successful',
  text: '{{amount}} has been charged for {{planName}} on {{chargedAt}}. Next charge on {{nextChargeAt}}.',
  html: '<p><strong>{{amount}}</strong> has been charged for {{planName}} on {{chargedAt}}.</p><p>Next charge on {{nextChargeAt}}.</p>',
};

const AUTOPAY_RENEWAL_FAILURE_FALLBACK: RenderedTemplate = {
  subject: 'AutoPay renewal failed',
  text: 'We could not renew {{planName}} on {{failedAt}}. We will retry in {{retryAfterMinutes}} minutes.',
  html: '<p>We could not renew {{planName}} on {{failedAt}}.</p><p>We will retry in {{retryAfterMinutes}} minutes.</p>',
};

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private transporter?: Transporter;
  private fromAddress?: string;
  private readonly maxAttempts: number;
  private readonly broadcastBatchSize: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {
    this.maxAttempts =
      this.configService.get<number>('NOTIFICATIONS_MAX_ATTEMPTS') ?? 3;
    this.broadcastBatchSize =
      this.configService.get<number>('NOTIFICATIONS_BROADCAST_BATCH_SIZE') ?? 250;
  }

  onModuleInit(): void {
    this.initEmailTransport();
  }

  async listPreferences(userId: string | undefined) {
    if (!userId) {
      throw new BadRequestException({
        code: 'NOTIFICATIONS_USER_REQUIRED',
        message: 'User id is required.',
      });
    }

    const prefs = await this.prisma.notificationPreference.findMany({ where: { userId } });
    const prefMap = new Map(prefs.map((pref) => [pref.channel, pref.isEnabled]));

    return Object.values(NotificationChannel).map((channel) => ({
      channel,
      isEnabled: prefMap.get(channel) ?? true,
    }));
  }

  async updatePreference(userId: string | undefined, dto: NotificationPreferenceUpdateDto) {
    if (!userId) {
      throw new BadRequestException({
        code: 'NOTIFICATIONS_USER_REQUIRED',
        message: 'User id is required.',
      });
    }

    return this.prisma.notificationPreference.upsert({
      where: { userId_channel: { userId, channel: dto.channel } },
      create: {
        userId,
        channel: dto.channel,
        isEnabled: dto.isEnabled,
      },
      update: {
        isEnabled: dto.isEnabled,
      },
    });
  }

  async listTemplates(query: NotificationTemplateQueryDto) {
    const where: Prisma.NotificationTemplateWhereInput = {
      channel: query.channel ?? undefined,
      isActive: this.parseOptionalBoolean(query.isActive),
    };

    if (query.search) {
      where.OR = [
        { key: { contains: query.search, mode: 'insensitive' } },
        { subject: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.notificationTemplate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTemplate(dto: NotificationTemplateCreateDto) {
    return this.prisma.notificationTemplate.create({
      data: {
        key: dto.key,
        channel: dto.channel,
        subject: dto.subject ?? undefined,
        bodyJson: dto.bodyJson as Prisma.InputJsonValue,
        variablesJson: dto.variablesJson ? (dto.variablesJson as Prisma.InputJsonValue) : undefined,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateTemplate(templateId: string, dto: NotificationTemplateUpdateDto) {
    const template = await this.prisma.notificationTemplate.findUnique({
      where: { id: templateId },
    });
    if (!template) {
      throw new NotFoundException({
        code: 'NOTIFICATIONS_TEMPLATE_NOT_FOUND',
        message: 'Template not found.',
      });
    }

    return this.prisma.notificationTemplate.update({
      where: { id: templateId },
      data: {
        channel: dto.channel ?? undefined,
        subject: dto.subject ?? undefined,
        bodyJson: dto.bodyJson ? (dto.bodyJson as Prisma.InputJsonValue) : undefined,
        variablesJson: dto.variablesJson
          ? (dto.variablesJson as Prisma.InputJsonValue)
          : undefined,
        isActive: dto.isActive ?? undefined,
      },
    });
  }

  async listMessages(query: NotificationMessageQueryDto) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);

    const where: Prisma.NotificationMessageWhereInput = {
      status: query.status ? (query.status as NotificationStatus) : undefined,
      channel: query.channel ?? undefined,
      userId: query.userId ?? undefined,
      templateId: query.templateId ?? undefined,
      createdAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.notificationMessage.count({ where }),
      this.prisma.notificationMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          template: { select: { id: true, key: true, subject: true, channel: true } },
          user: { select: { id: true, email: true, fullName: true } },
        },
      }),
    ]);

    return { data, total, page, pageSize };
  }

  async resendMessage(messageId: string) {
    const message = await this.prisma.notificationMessage.findUnique({
      where: { id: messageId },
    });
    if (!message) {
      throw new NotFoundException({
        code: 'NOTIFICATIONS_MESSAGE_NOT_FOUND',
        message: 'Notification message not found.',
      });
    }

    const duplicate = await this.prisma.notificationMessage.create({
      data: {
        templateId: message.templateId ?? undefined,
        userId: message.userId ?? undefined,
        channel: message.channel,
        payloadJson: message.payloadJson as Prisma.InputJsonValue | undefined,
        renderedText: message.renderedText ?? undefined,
        renderedHtml: message.renderedHtml ?? undefined,
        status: NotificationStatus.PENDING,
        attempts: 0,
      },
    });

    await this.enqueueMessage(duplicate.id);
    return duplicate;
  }

  async createBroadcast(userId: string | undefined, dto: BroadcastCreateDto) {
    if (!userId) {
      throw new BadRequestException({
        code: 'NOTIFICATIONS_USER_REQUIRED',
        message: 'User id is required.',
      });
    }

    if (!dto.templateId) {
      throw new BadRequestException({
        code: 'BROADCAST_TEMPLATE_REQUIRED',
        message: 'templateId is required for broadcasts.',
      });
    }

    const template = await this.prisma.notificationTemplate.findUnique({
      where: { id: dto.templateId },
    });
    if (!template || !template.isActive) {
      throw new BadRequestException({
        code: 'BROADCAST_TEMPLATE_INVALID',
        message: 'Template is missing or inactive.',
      });
    }

    if (template.channel !== dto.channel) {
      throw new BadRequestException({
        code: 'BROADCAST_TEMPLATE_CHANNEL',
        message: 'Template channel does not match broadcast channel.',
      });
    }

    const status =
      dto.status ?? (dto.scheduledAt ? BroadcastStatus.SCHEDULED : BroadcastStatus.DRAFT);
    const scheduledAt = dto.scheduledAt
      ? new Date(dto.scheduledAt)
      : status === BroadcastStatus.SCHEDULED
        ? new Date()
        : undefined;

    if (status === BroadcastStatus.SENT || status === BroadcastStatus.CANCELLED) {
      throw new BadRequestException({
        code: 'BROADCAST_STATUS_INVALID',
        message: 'Broadcast status must be DRAFT or SCHEDULED.',
      });
    }

    return this.prisma.broadcast.create({
      data: {
        title: dto.title,
        channel: dto.channel,
        status,
        audienceJson: dto.audienceJson as Prisma.InputJsonValue,
        templateId: dto.templateId,
        scheduledAt,
        createdByUserId: userId,
      },
    });
  }

  async listBroadcasts(query: BroadcastQueryDto) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);

    const where: Prisma.BroadcastWhereInput = {
      status: query.status ?? undefined,
      channel: query.channel ?? undefined,
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.broadcast.count({ where }),
      this.prisma.broadcast.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          template: { select: { id: true, key: true, subject: true, channel: true } },
          creator: { select: { id: true, email: true, fullName: true } },
        },
      }),
    ]);

    return { data, total, page, pageSize };
  }

  async scheduleBroadcast(broadcastId: string, dto: BroadcastScheduleDto) {
    const broadcast = await this.prisma.broadcast.findUnique({ where: { id: broadcastId } });
    if (!broadcast) {
      throw new NotFoundException({
        code: 'BROADCAST_NOT_FOUND',
        message: 'Broadcast not found.',
      });
    }

    if (broadcast.status === BroadcastStatus.SENT) {
      throw new BadRequestException({
        code: 'BROADCAST_ALREADY_SENT',
        message: 'Broadcast has already been sent.',
      });
    }

    if (broadcast.status === BroadcastStatus.CANCELLED) {
      throw new BadRequestException({
        code: 'BROADCAST_CANCELLED',
        message: 'Cancelled broadcasts cannot be scheduled.',
      });
    }

    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : new Date();

    return this.prisma.broadcast.update({
      where: { id: broadcastId },
      data: {
        status: BroadcastStatus.SCHEDULED,
        scheduledAt,
      },
    });
  }

  async cancelBroadcast(broadcastId: string) {
    const broadcast = await this.prisma.broadcast.findUnique({ where: { id: broadcastId } });
    if (!broadcast) {
      throw new NotFoundException({
        code: 'BROADCAST_NOT_FOUND',
        message: 'Broadcast not found.',
      });
    }

    if (broadcast.status === BroadcastStatus.SENT) {
      throw new BadRequestException({
        code: 'BROADCAST_ALREADY_SENT',
        message: 'Broadcast has already been sent.',
      });
    }

    return this.prisma.broadcast.update({
      where: { id: broadcastId },
      data: { status: BroadcastStatus.CANCELLED },
    });
  }

  async sendOtpEmail(params: {
    userId: string;
    email: string;
    otp: string;
    expiresAt: Date;
    purpose: string;
  }) {
    const appName = this.configService.get<string>('APP_NAME') ?? 'our app';
    const expiresInMinutes = Math.max(
      1,
      Math.round((params.expiresAt.getTime() - Date.now()) / 60000),
    );

    return this.sendTemplateToUser({
      userId: params.userId,
      channel: NotificationChannel.EMAIL,
      templateKey: 'auth.otp',
      payload: {
        appName,
        otp: params.otp,
        expiresInMinutes,
        purpose: params.purpose,
      },
      fallback: OTP_FALLBACK,
      respectPreference: false,
      overrideEmail: params.email,
    });
  }

  async sendOtpEmailToAddress(params: {
    email: string;
    otp: string;
    expiresAt: Date;
    purpose: string;
  }) {
    const appName = this.configService.get<string>('APP_NAME') ?? 'our app';
    const expiresInMinutes = Math.max(
      1,
      Math.round((params.expiresAt.getTime() - Date.now()) / 60000),
    );

    const rendered = this.renderTemplate(
      null,
      {
        appName,
        otp: params.otp,
        expiresInMinutes,
        purpose: params.purpose,
      },
      OTP_FALLBACK,
    );

    await this.sendEmail(params.email, rendered);
  }

  async sendPasswordResetEmail(params: {
    userId: string;
    email: string;
    token: string;
    redirectUrl: string;
    expiresAt: Date;
  }) {
    const appName = this.configService.get<string>('APP_NAME') ?? 'our app';
    const expiresInMinutes = Math.max(
      1,
      Math.round((params.expiresAt.getTime() - Date.now()) / 60000),
    );
    const resetLink = this.buildResetLink(params.redirectUrl, params.token);

    return this.sendTemplateToUser({
      userId: params.userId,
      channel: NotificationChannel.EMAIL,
      templateKey: 'auth.password-reset',
      payload: {
        appName,
        resetLink,
        expiresInMinutes,
      },
      fallback: RESET_FALLBACK,
      respectPreference: false,
      overrideEmail: params.email,
    });
  }

  async sendPaymentSuccessEmail(params: {
    userId: string;
    email: string;
    amountPaise: number;
    planName?: string | null;
    orderId: string;
  }) {
    const appName = this.configService.get<string>('APP_NAME') ?? 'our app';
    const amount = this.formatCurrency(params.amountPaise);

    return this.sendTemplateToUser({
      userId: params.userId,
      channel: NotificationChannel.EMAIL,
      templateKey: 'payments.success',
      payload: {
        appName,
        amount,
        planName: params.planName ?? 'Subscription',
        orderId: params.orderId,
      },
      fallback: PAYMENT_SUCCESS_FALLBACK,
      respectPreference: false,
      overrideEmail: params.email,
    });
  }

  async sendSubscriptionActivatedEmail(params: {
    userId: string;
    email: string;
    planName?: string | null;
    endsAt: Date | null;
  }) {
    const appName = this.configService.get<string>('APP_NAME') ?? 'our app';
    const endsAt = params.endsAt ? params.endsAt.toISOString().split('T')[0] : '—';

    return this.sendTemplateToUser({
      userId: params.userId,
      channel: NotificationChannel.EMAIL,
      templateKey: 'payments.subscription-activated',
      payload: {
        appName,
        planName: params.planName ?? 'Subscription',
        endsAt,
      },
      fallback: SUBSCRIPTION_FALLBACK,
      respectPreference: false,
      overrideEmail: params.email,
    });
  }

  async sendAutopayEnabledEmail(params: {
    userId: string;
    email: string;
    planName?: string | null;
    nextChargeAt: Date;
  }) {
    const appName = this.configService.get<string>('APP_NAME') ?? 'our app';

    return this.sendTemplateToUser({
      userId: params.userId,
      channel: NotificationChannel.EMAIL,
      templateKey: 'payments.autopay-enabled',
      payload: {
        appName,
        planName: params.planName ?? 'Subscription',
        nextChargeAt: this.formatDateTime(params.nextChargeAt),
      },
      fallback: AUTOPAY_ENABLED_FALLBACK,
      respectPreference: false,
      overrideEmail: params.email,
    });
  }

  async sendAutopayRenewalReminderEmail(params: {
    userId: string;
    email: string;
    planName?: string | null;
    amountPaise: number;
    chargeAt: Date;
  }) {
    const appName = this.configService.get<string>('APP_NAME') ?? 'our app';

    return this.sendTemplateToUser({
      userId: params.userId,
      channel: NotificationChannel.EMAIL,
      templateKey: 'payments.autopay-reminder',
      payload: {
        appName,
        planName: params.planName ?? 'Subscription',
        amount: this.formatCurrency(params.amountPaise),
        chargeAt: this.formatDateTime(params.chargeAt),
      },
      fallback: AUTOPAY_RENEWAL_REMINDER_FALLBACK,
      respectPreference: false,
      overrideEmail: params.email,
    });
  }

  async sendAutopayRenewalSuccessEmail(params: {
    userId: string;
    email: string;
    planName?: string | null;
    amountPaise: number;
    chargedAt: Date;
    nextChargeAt: Date;
  }) {
    const appName = this.configService.get<string>('APP_NAME') ?? 'our app';

    return this.sendTemplateToUser({
      userId: params.userId,
      channel: NotificationChannel.EMAIL,
      templateKey: 'payments.autopay-success',
      payload: {
        appName,
        planName: params.planName ?? 'Subscription',
        amount: this.formatCurrency(params.amountPaise),
        chargedAt: this.formatDateTime(params.chargedAt),
        nextChargeAt: this.formatDateTime(params.nextChargeAt),
      },
      fallback: AUTOPAY_RENEWAL_SUCCESS_FALLBACK,
      respectPreference: false,
      overrideEmail: params.email,
    });
  }

  async sendAutopayRenewalFailureEmail(params: {
    userId: string;
    email: string;
    planName?: string | null;
    failedAt: Date;
    retryAfterMinutes: number;
  }) {
    const appName = this.configService.get<string>('APP_NAME') ?? 'our app';

    return this.sendTemplateToUser({
      userId: params.userId,
      channel: NotificationChannel.EMAIL,
      templateKey: 'payments.autopay-failure',
      payload: {
        appName,
        planName: params.planName ?? 'Subscription',
        failedAt: this.formatDateTime(params.failedAt),
        retryAfterMinutes: params.retryAfterMinutes,
      },
      fallback: AUTOPAY_RENEWAL_FAILURE_FALLBACK,
      respectPreference: false,
      overrideEmail: params.email,
    });
  }

  @Interval(60000)
  async broadcastTick() {
    const now = new Date();
    const due = await this.prisma.broadcast.findMany({
      where: {
        status: BroadcastStatus.SCHEDULED,
        scheduledAt: { lte: now },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 5,
    });

    for (const broadcast of due) {
      try {
        await this.dispatchBroadcast(broadcast.id);
      } catch (err) {
        this.logger.error(
          `Broadcast ${broadcast.id} dispatch failed`,
          (err as Error)?.stack ?? String(err),
        );
      }
    }
  }

  private async sendTemplateToUser(params: {
    userId: string;
    channel: NotificationChannel;
    templateKey: string;
    payload: TemplatePayload;
    fallback?: RenderedTemplate;
    respectPreference?: boolean;
    overrideEmail?: string;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true, email: true, fullName: true },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'NOTIFICATIONS_USER_NOT_FOUND',
        message: 'User not found.',
      });
    }

    const respectPreference = params.respectPreference ?? true;
    if (respectPreference) {
      const allowed = await this.isChannelEnabled(user.id, params.channel);
      if (!allowed) {
        const skipped = await this.prisma.notificationMessage.create({
          data: {
            userId: user.id,
            channel: params.channel,
            payloadJson: params.payload as Prisma.InputJsonValue,
            status: NotificationStatus.FAILED,
            lastError: 'PREFERENCE_DISABLED',
          },
        });
        return skipped;
      }
    }

    const template = await this.prisma.notificationTemplate.findFirst({
      where: { key: params.templateKey, channel: params.channel, isActive: true },
    });

    const payload: TemplatePayload = {
      fullName: user.fullName ?? undefined,
      email: user.email ?? undefined,
      ...params.payload,
    };

    const rendered = this.renderTemplate(template, payload, params.fallback);
    const payloadWithSubject = {
      ...payload,
      subject: rendered.subject ?? payload.subject,
    };

    const message = await this.prisma.notificationMessage.create({
      data: {
        templateId: template?.id ?? undefined,
        userId: user.id,
        channel: params.channel,
        payloadJson: payloadWithSubject as Prisma.InputJsonValue,
        renderedText: rendered.text ?? undefined,
        renderedHtml: rendered.html ?? undefined,
        status: NotificationStatus.PENDING,
      },
    });

    await this.enqueueMessage(message.id, params.overrideEmail ?? undefined);
    return message;
  }

  private async dispatchBroadcast(broadcastId: string) {
    const broadcast = await this.prisma.broadcast.findUnique({
      where: { id: broadcastId },
    });
    if (!broadcast) {
      return;
    }

    if (broadcast.status !== BroadcastStatus.SCHEDULED) {
      return;
    }

    const template = broadcast.templateId
      ? await this.prisma.notificationTemplate.findUnique({
          where: { id: broadcast.templateId },
        })
      : null;

    if (!template || !template.isActive) {
      this.logger.warn(`Broadcast ${broadcast.id} missing active template.`);
      await this.prisma.broadcast.update({
        where: { id: broadcast.id },
        data: { status: BroadcastStatus.CANCELLED },
      });
      return;
    }

    const audience = this.normalizeAudience(broadcast.audienceJson);
    const userWhere = this.buildUserFilter(audience);

    const appName = this.configService.get<string>('APP_NAME') ?? 'our app';
    let cursor: string | undefined = undefined;
    let queued = 0;

    for (;;) {
      const users = await this.prisma.user.findMany({
        where: userWhere,
        orderBy: { id: 'asc' },
        take: this.broadcastBatchSize,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, email: true, fullName: true },
      });

      if (!users.length) {
        break;
      }

      const disabled = await this.loadDisabledPreferences(
        users.map((user) => user.id),
        broadcast.channel,
      );

      for (const user of users) {
        if (!user.email && broadcast.channel === NotificationChannel.EMAIL) {
          continue;
        }
        if (disabled.has(user.id)) {
          continue;
        }

        const payload: TemplatePayload = {
          appName,
          broadcastTitle: broadcast.title,
          fullName: user.fullName ?? undefined,
          email: user.email ?? undefined,
        };

        const rendered = this.renderTemplate(template, payload, {
          subject: broadcast.title,
        });

        const message = await this.prisma.notificationMessage.create({
          data: {
            templateId: template.id,
            userId: user.id,
            channel: broadcast.channel,
            payloadJson: {
              ...payload,
              broadcastId: broadcast.id,
              broadcastTitle: broadcast.title,
            } as Prisma.InputJsonValue,
            renderedText: rendered.text ?? undefined,
            renderedHtml: rendered.html ?? undefined,
            status: NotificationStatus.PENDING,
          },
        });

        await this.enqueueMessage(message.id, user.email ?? undefined);
        queued += 1;
      }

      cursor = users[users.length - 1].id;
    }

    await this.prisma.broadcast.update({
      where: { id: broadcast.id },
      data: { status: BroadcastStatus.SENT, sentAt: new Date() },
    });

    if (queued > 0) {
      this.logger.log(`Broadcast ${broadcast.id} queued ${queued} messages.`);
    }
  }

  private async enqueueMessage(messageId: string, overrideEmail?: string) {
    try {
      await this.notificationsQueue.add(
        'send',
        { messageId, overrideEmail },
        {
          jobId: messageId,
          attempts: this.maxAttempts,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );
      return;
    } catch (err) {
      this.logger.warn(
        `Notifications queue add failed; falling back to inline: ${this.formatError(err)}`,
      );
    }

    setImmediate(() => {
      this.processMessage(messageId, overrideEmail).catch((err) =>
        this.logger.error(`Notification ${messageId} failed`, err?.stack ?? err),
      );
    });
  }

  async processMessage(messageId: string, overrideEmail?: string, job?: Job) {
    const message = await this.prisma.notificationMessage.findUnique({
      where: { id: messageId },
      include: {
        template: true,
        user: { select: { id: true, email: true, fullName: true } },
      },
    });

    if (!message) {
      return;
    }

    if (message.status === NotificationStatus.SENT) {
      return;
    }

    const maxAttempts = job?.opts.attempts ?? this.maxAttempts;
    const attemptNumber = (job?.attemptsMade ?? 0) + 1;

    await this.prisma.notificationMessage.update({
      where: { id: messageId },
      data: {
        attempts: attemptNumber,
        lastError: null,
      },
    });

    const payload = (message.payloadJson ?? {}) as TemplatePayload;
    const rendered = this.renderTemplate(message.template, payload, undefined);
    const subject =
      rendered.subject ||
      (typeof payload.subject === 'string' ? payload.subject : undefined) ||
      'Notification';
    const renderedPayload: RenderedTemplate = {
      subject,
      text: rendered.text ?? message.renderedText ?? undefined,
      html: rendered.html ?? message.renderedHtml ?? undefined,
    };

    try {
      if (message.channel === NotificationChannel.EMAIL) {
        const recipient = this.resolveEmailTarget(message, overrideEmail);
        if (!recipient) {
          throw new Error('EMAIL_RECIPIENT_MISSING');
        }
        await this.sendEmail(recipient, renderedPayload);
      } else {
        throw new Error(`CHANNEL_UNSUPPORTED:${message.channel}`);
      }

      await this.prisma.notificationMessage.update({
        where: { id: messageId },
        data: {
          status: NotificationStatus.SENT,
          renderedText: renderedPayload.text ?? undefined,
          renderedHtml: renderedPayload.html ?? undefined,
          sentAt: new Date(),
          lastError: null,
        },
      });
    } catch (err: any) {
      const errorMessage = this.formatError(err);
      const shouldRetry = Boolean(job) && attemptNumber < maxAttempts;

      await this.prisma.notificationMessage.update({
        where: { id: messageId },
        data: {
          status: shouldRetry ? NotificationStatus.PENDING : NotificationStatus.FAILED,
          renderedText: renderedPayload.text ?? undefined,
          renderedHtml: renderedPayload.html ?? undefined,
          lastError: errorMessage,
        },
      });

      if (shouldRetry && job) {
        throw err;
      }
    }
  }

  private resolveEmailTarget(message: {
    user?: NotificationTarget | null;
    payloadJson: Prisma.JsonValue | null;
  }, overrideEmail?: string) {
    if (overrideEmail) {
      return overrideEmail;
    }

    const userEmail = message.user?.email;
    if (userEmail) {
      return userEmail;
    }

    const payload = message.payloadJson as TemplatePayload | null;
    const payloadEmail = payload && typeof payload.email === 'string' ? payload.email : undefined;
    return payloadEmail;
  }

  private async sendEmail(to: string, rendered: RenderedTemplate) {
    if (!this.transporter || !this.fromAddress) {
      throw new Error('SMTP_NOT_CONFIGURED');
    }

    await this.transporter.sendMail({
      from: this.fromAddress,
      to,
      subject: rendered.subject ?? 'Notification',
      text: rendered.text ?? undefined,
      html: rendered.html ?? undefined,
    });
  }

  private renderTemplate(
    template: { subject?: string | null; bodyJson?: Prisma.JsonValue | null } | null | undefined,
    payload: TemplatePayload,
    fallback?: RenderedTemplate,
  ): RenderedTemplate {
    const bodyJson = template?.bodyJson ?? null;
    const parsed = this.parseBodyJson(bodyJson);

    const subject = this.interpolate(template?.subject ?? fallback?.subject ?? '', payload);
    const text = this.interpolate(parsed.text ?? fallback?.text ?? '', payload);
    const html = this.interpolate(parsed.html ?? fallback?.html ?? '', payload);

    return {
      subject: subject || fallback?.subject,
      text: text || fallback?.text,
      html: html || fallback?.html,
    };
  }

  private parseBodyJson(bodyJson: Prisma.JsonValue | null): RenderedTemplate {
    if (bodyJson === null || bodyJson === undefined) {
      return {};
    }

    if (typeof bodyJson === 'string') {
      return { text: bodyJson };
    }

    if (typeof bodyJson === 'object') {
      if (Array.isArray(bodyJson)) {
        return { text: JSON.stringify(bodyJson) };
      }

      const record = bodyJson as Record<string, unknown>;
      const text = typeof record.text === 'string' ? record.text : undefined;
      const html = typeof record.html === 'string' ? record.html : undefined;

      if (text || html) {
        return { text, html };
      }

      return { text: JSON.stringify(record) };
    }

    return { text: String(bodyJson) };
  }

  private interpolate(template: string, payload: TemplatePayload) {
    if (!template) {
      return '';
    }

    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const value = payload[key];
      if (value === null || value === undefined) {
        return '';
      }
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
      }
      return JSON.stringify(value);
    });
  }

  private buildResetLink(redirectUrl: string, token: string) {
    const separator = redirectUrl.includes('?') ? '&' : '?';
    return `${redirectUrl}${separator}token=${encodeURIComponent(token)}`;
  }

  private async isChannelEnabled(userId: string, channel: NotificationChannel) {
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { userId_channel: { userId, channel } },
    });
    return pref?.isEnabled ?? true;
  }

  private async loadDisabledPreferences(userIds: string[], channel: NotificationChannel) {
    if (userIds.length === 0) {
      return new Set<string>();
    }

    const prefs = await this.prisma.notificationPreference.findMany({
      where: { userId: { in: userIds }, channel, isEnabled: false },
    });
    return new Set(prefs.map((pref) => pref.userId));
  }

  private normalizeAudience(value: Prisma.JsonValue): BroadcastAudience {
    if (!value || typeof value !== 'object') {
      return {};
    }

    const record = value as Record<string, unknown>;
    const userIds = Array.isArray(record.userIds)
      ? record.userIds.filter((item) => typeof item === 'string')
      : undefined;

    return {
      userType: record.userType as UserType | undefined,
      status: record.status as UserStatus | undefined,
      userIds,
      createdFrom: typeof record.createdFrom === 'string' ? record.createdFrom : undefined,
      createdTo: typeof record.createdTo === 'string' ? record.createdTo : undefined,
    };
  }

  private buildUserFilter(audience: BroadcastAudience): Prisma.UserWhereInput {
    const andConditions: Prisma.UserWhereInput[] = [];

    if (audience.userIds?.length) {
      andConditions.push({ id: { in: audience.userIds } });
    }

    if (audience.userType) {
      andConditions.push({ type: audience.userType });
    }

    if (audience.status) {
      andConditions.push({ status: audience.status });
    }

    if (audience.createdFrom || audience.createdTo) {
      andConditions.push({
        createdAt: {
          gte: audience.createdFrom ? new Date(audience.createdFrom) : undefined,
          lte: audience.createdTo ? new Date(audience.createdTo) : undefined,
        },
      });
    }

    return andConditions.length ? { AND: andConditions } : {};
  }

  private formatCurrency(amountPaise: number) {
    const amount = (amountPaise / 100).toFixed(2);
    return `INR ${amount}`;
  }

  private formatDateTime(value: Date) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      return '—';
    }
    return value.toISOString().replace('T', ' ').slice(0, 16);
  }

  private parseOptionalBoolean(value?: string) {
    if (!value) return undefined;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  }

  private initEmailTransport() {
    const host = this.configService.get<string>('SMTP_HOST');
    if (!host) {
      this.logger.warn('SMTP not configured; email notifications disabled.');
      return;
    }

    const port = this.configService.get<number>('SMTP_PORT') ?? 587;
    const secure = this.parseBoolean(this.configService.get<string>('SMTP_SECURE'));
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    const from = this.configService.get<string>('SMTP_FROM') ?? user;

    if (!from) {
      this.logger.warn('SMTP_FROM missing; email notifications disabled.');
      return;
    }

    this.fromAddress = from;
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  private parseBoolean(value?: string | boolean) {
    if (typeof value === 'boolean') return value;
    if (!value) return false;
    return value === 'true' || value === '1';
  }

  private formatError(err: any) {
    const message = err?.message ?? String(err);
    return message.length > 500 ? `${message.slice(0, 497)}...` : message;
  }
}
