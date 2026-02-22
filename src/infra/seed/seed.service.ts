import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  AttemptEventType,
  AttemptStatus,
  BroadcastStatus,
  CmsConfigStatus,
  CouponType,
  EntitlementKind,
  NoteSecuritySignalType,
  NotificationChannel,
  NotificationStatus,
  PageStatus,
  PaymentOrderStatus,
  PaymentProvider,
  Permission,
  PracticeEventType,
  PracticeSessionStatus,
  PrintJobStatus,
  PrintJobType,
  Prisma,
  QuestionDifficulty,
  QuestionType,
  SubscriptionStatus,
  TestType,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { DEFAULT_TEST_PRESETS } from '../../modules/test-engine/test-presets';

interface SeedPermission {
  key: string;
  description: string;
}

interface SeedRole {
  key: string;
  name: string;
  description: string;
  permissions: string[];
}

interface SeedNotificationTemplate {
  key: string;
  channel: NotificationChannel;
  subject?: string;
  bodyJson: Record<string, unknown>;
  variablesJson?: string[];
  isActive?: boolean;
}

interface DefaultPlanSeed {
  key: string;
  name: string;
  tier: string;
  pricePaise: number;
  durationDays: number;
  validity: {
    unit: 'DAYS' | 'MONTHS' | 'YEARS' | 'LIFETIME';
    value: number | null;
    label: string;
  };
  features: string[];
  boundaries: Record<string, unknown>;
}

interface DefaultCouponSeed {
  code: string;
  type: CouponType;
  value: number;
  minAmountPaise?: number;
  maxRedemptions?: number;
  maxRedemptionsPerUser?: number;
}

const DEFAULT_RENEWAL_WINDOW_DAYS = 7;
const DEFAULT_LIFETIME_DAYS = 36500;

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.shouldSeedOnBoot()) {
      this.logger.log('Skipping startup seed (SEED_ON_BOOT=false).');
      return;
    }

    await this.seedRolesAndPermissions();
    await this.seedSuperAdmin();
    await this.seedNotificationTemplates();
    await this.seedDefaultCatalog();
    await this.seedSampleData();
  }

  private getPermissions(): SeedPermission[] {
    return [
      { key: 'content.manage', description: 'Manage subjects and topics.' },
      { key: 'notes.read', description: 'Read notes.' },
      { key: 'notes.write', description: 'Create or update notes.' },
      { key: 'notes.publish', description: 'Publish notes.' },
      { key: 'questions.read', description: 'Read question bank.' },
      { key: 'questions.crud', description: 'Create/update questions.' },
      { key: 'questions.publish', description: 'Publish questions.' },
      { key: 'tests.crud', description: 'Create/update tests.' },
      { key: 'tests.publish', description: 'Publish tests.' },
      { key: 'users.read', description: 'View users.' },
      { key: 'users.manage', description: 'Manage users and entitlements.' },
      { key: 'payments.read', description: 'View payments and orders.' },
      { key: 'payments.refund', description: 'Issue refunds.' },
      { key: 'admin.config.write', description: 'Modify admin settings.' },
      { key: 'analytics.read', description: 'View analytics.' },
      { key: 'admin.audit.read', description: 'View audit logs.' },
      { key: 'security.read', description: 'View security signals and sessions.' },
      { key: 'security.manage', description: 'Manage security actions.' },
      { key: 'notifications.read', description: 'View notification templates and logs.' },
      { key: 'notifications.manage', description: 'Manage notification templates and broadcasts.' },
    ];
  }

  private getRoles(): SeedRole[] {
    const permissions = this.getPermissions().map((item) => item.key);

    return [
      {
        key: 'ADMIN_SUPER',
        name: 'Super Admin',
        description: 'Full access to all admin operations.',
        permissions,
      },
      {
        key: 'ADMIN_CONTENT',
        name: 'Content Admin',
        description: 'Manage subjects, notes, and questions.',
        permissions: [
          'content.manage',
          'notes.read',
          'notes.write',
          'notes.publish',
          'questions.read',
          'questions.crud',
          'questions.publish',
          'notifications.read',
          'notifications.manage',
        ],
      },
      {
        key: 'ADMIN_TEST',
        name: 'Test Admin',
        description: 'Manage tests and questions.',
        permissions: ['tests.crud', 'tests.publish', 'questions.read', 'questions.crud'],
      },
      {
        key: 'ADMIN_FINANCE',
        name: 'Finance Admin',
        description: 'Manage payments and refunds.',
        permissions: ['payments.read', 'payments.refund'],
      },
      {
        key: 'STUDENT',
        name: 'Student',
        description: 'Default student role.',
        permissions: [],
      },
    ];
  }

  private getNotificationTemplates(): SeedNotificationTemplate[] {
    return [
      {
        key: 'auth.otp',
        channel: NotificationChannel.EMAIL,
        subject: 'Your OTP code',
        bodyJson: {
          text: 'Your {{appName}} OTP is {{otp}}. It expires in {{expiresInMinutes}} minutes.',
          html: '<p>Your {{appName}} OTP is <strong>{{otp}}</strong>. It expires in {{expiresInMinutes}} minutes.</p>',
        },
        variablesJson: ['appName', 'otp', 'expiresInMinutes', 'purpose', 'fullName', 'email'],
        isActive: true,
      },
      {
        key: 'auth.password-reset',
        channel: NotificationChannel.EMAIL,
        subject: 'Reset your password',
        bodyJson: {
          text: 'Reset your {{appName}} password using this link: {{resetLink}}. This link expires in {{expiresInMinutes}} minutes.',
          html: '<p>Reset your {{appName}} password using this link: <a href="{{resetLink}}">Reset Password</a>. This link expires in {{expiresInMinutes}} minutes.</p>',
        },
        variablesJson: ['appName', 'resetLink', 'expiresInMinutes', 'fullName', 'email'],
        isActive: true,
      },
      {
        key: 'payments.success',
        channel: NotificationChannel.EMAIL,
        subject: 'Payment received',
        bodyJson: {
          text: 'We received your payment of {{amount}} for {{planName}}. Order ID: {{orderId}}.',
          html: '<p>We received your payment of <strong>{{amount}}</strong> for {{planName}}.</p><p>Order ID: {{orderId}}</p>',
        },
        variablesJson: ['appName', 'amount', 'planName', 'orderId', 'fullName', 'email'],
        isActive: true,
      },
      {
        key: 'payments.subscription-activated',
        channel: NotificationChannel.EMAIL,
        subject: 'Subscription activated',
        bodyJson: {
          text: 'Your {{planName}} subscription is now active until {{endsAt}}.',
          html: '<p>Your {{planName}} subscription is now active until <strong>{{endsAt}}</strong>.</p>',
        },
        variablesJson: ['appName', 'planName', 'endsAt', 'fullName', 'email'],
        isActive: true,
      },
    ];
  }

  private async seedRolesAndPermissions(): Promise<void> {
    const permissions = this.getPermissions();
    const roles = this.getRoles();

    await Promise.all(
      permissions.map((permission) =>
        this.prisma.permission.upsert({
          where: { key: permission.key },
          create: { key: permission.key, description: permission.description },
          update: { description: permission.description },
        }),
      ),
    );

    await Promise.all(
      roles.map((role) =>
        this.prisma.role.upsert({
          where: { key: role.key },
          create: { key: role.key, name: role.name, description: role.description },
          update: { name: role.name, description: role.description },
        }),
      ),
    );

    const permissionMap = await this.mapPermissionsByKey(permissions);

    for (const role of roles) {
      const roleRecord = await this.prisma.role.findUnique({ where: { key: role.key } });
      if (!roleRecord || role.permissions.length === 0) {
        continue;
      }

      const permissionIds = role.permissions
        .map((key) => permissionMap.get(key)?.id)
        .filter((id): id is string => Boolean(id));

      if (permissionIds.length === 0) {
        continue;
      }

      await this.prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: roleRecord.id,
          permissionId,
        })),
        skipDuplicates: true,
      });
    }

    this.logger.log('Seeded roles and permissions.');
  }

  private async seedSuperAdmin(): Promise<void> {
    const email = this.configService.get<string>('SUPERADMIN_EMAIL');
    const password = this.configService.get<string>('SUPERADMIN_PASSWORD');

    if (!email || !password) {
      this.logger.warn('Skipping superadmin seed: SUPERADMIN_EMAIL or SUPERADMIN_PASSWORD missing.');
      return;
    }

    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      const passwordHash = await bcrypt.hash(password, 10);
      user = await this.prisma.user.create({
        data: {
          email,
          fullName: email.split('@')[0],
          passwordHash,
          type: UserType.ADMIN,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
        },
      });
    } else if (user.type !== UserType.ADMIN) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { type: UserType.ADMIN, status: UserStatus.ACTIVE },
      });
    }

    const superRole = await this.prisma.role.findUnique({ where: { key: 'ADMIN_SUPER' } });
    if (superRole) {
      await this.prisma.userRole.createMany({
        data: [{ userId: user.id, roleId: superRole.id }],
        skipDuplicates: true,
      });
    }

    this.logger.log('Ensured superadmin user exists.');
  }

  private async seedNotificationTemplates(): Promise<void> {
    const templates = this.getNotificationTemplates();
    if (!templates.length) {
      return;
    }

    const existing = await this.prisma.notificationTemplate.findMany({
      where: { key: { in: templates.map((template) => template.key) } },
      select: { key: true },
    });
    const existingKeys = new Set(existing.map((item) => item.key));
    const missing = templates.filter((template) => !existingKeys.has(template.key));

    if (!missing.length) {
      return;
    }

    await this.prisma.notificationTemplate.createMany({
      data: missing.map((template) => ({
        key: template.key,
        channel: template.channel,
        subject: template.subject ?? undefined,
        bodyJson: template.bodyJson as Prisma.InputJsonValue,
        variablesJson: template.variablesJson
          ? (template.variablesJson as Prisma.InputJsonValue)
          : undefined,
        isActive: template.isActive ?? true,
      })),
      skipDuplicates: true,
    });

    this.logger.log(`Seeded ${missing.length} notification templates.`);
  }

  private async seedDefaultCatalog(): Promise<void> {
    if (!this.shouldSeedDefaultCatalog()) {
      return;
    }

    const admin = await this.prisma.user.findFirst({
      where: { type: UserType.ADMIN },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    const adminId = admin?.id;

    const renewalWindowDays = this.resolveRenewalWindowDays();
    const lifetimeDays = this.resolveLifetimeDays();

    let plansCreated = 0;
    const planSeeds = this.getDefaultPlanSeeds(lifetimeDays, renewalWindowDays);
    for (const seed of planSeeds) {
      const existing = await this.prisma.plan.findUnique({
        where: { key: seed.key },
        select: { id: true },
      });
      if (existing) {
        continue;
      }

      await this.prisma.plan.create({
        data: {
          key: seed.key,
          name: seed.name,
          tier: seed.tier,
          pricePaise: seed.pricePaise,
          durationDays: seed.durationDays,
          isActive: true,
          metadataJson: {
            region: 'IN-MH',
            examCategory: 'competitive',
            renewalWindowDays,
            boundaries: seed.boundaries,
            validity: {
              unit: seed.validity.unit,
              value: seed.validity.value,
              durationDays: seed.durationDays,
              label: seed.validity.label,
            },
          } as Prisma.InputJsonValue,
          featuresJson: seed.features as Prisma.InputJsonValue,
        },
      });
      plansCreated += 1;
    }

    let couponsCreated = 0;
    const couponSeeds = this.getDefaultCouponSeeds();
    for (const seed of couponSeeds) {
      const existing = await this.prisma.coupon.findUnique({
        where: { code: seed.code },
        select: { id: true },
      });
      if (existing) {
        continue;
      }

      await this.prisma.coupon.create({
        data: {
          code: seed.code,
          type: seed.type,
          value: seed.value,
          minAmountPaise: seed.minAmountPaise,
          maxRedemptions: seed.maxRedemptions,
          maxRedemptionsPerUser: seed.maxRedemptionsPerUser,
          isActive: true,
          metadataJson: {
            region: 'IN-MH',
            seededBy: 'default-catalog',
          } as Prisma.InputJsonValue,
        },
      });
      couponsCreated += 1;
    }

    const seededLanguageConfig = await this.ensurePublishedAppConfig(
      'app.languages',
      {
        enabledLanguages: ['en', 'hi', 'mr'],
        defaultLanguage: 'mr',
        fallbackLanguage: 'en',
        labels: {
          en: 'English',
          hi: 'Hindi',
          mr: 'Marathi',
        },
      },
      adminId,
    );

    const seededPresetConfig = await this.ensurePublishedAppConfig(
      'test.presets',
      {
        region: 'IN-MH',
        presets: DEFAULT_TEST_PRESETS,
      },
      adminId,
    );

    if (
      plansCreated > 0 ||
      couponsCreated > 0 ||
      seededLanguageConfig ||
      seededPresetConfig
    ) {
      this.logger.log(
        `Seeded default catalog (plans=${plansCreated}, coupons=${couponsCreated}, app.languages=${seededLanguageConfig ? 'created' : 'kept'}, test.presets=${seededPresetConfig ? 'created' : 'kept'}).`,
      );
    }
  }

  private getDefaultPlanSeeds(
    lifetimeDays: number,
    renewalWindowDays: number,
  ): DefaultPlanSeed[] {
    return [
      {
        key: 'maha-starter-1m',
        name: 'Maharashtra Starter - 1 Month',
        tier: 'starter',
        pricePaise: 79900,
        durationDays: 30,
        validity: {
          unit: 'MONTHS',
          value: 1,
          label: '1 month',
        },
        features: [
          'Unlimited notes access',
          'Daily practice sets',
          'Section-wise mock tests',
          'English, Hindi and Marathi interface',
        ],
        boundaries: {
          notesAccess: true,
          testsAccess: true,
          practiceAccess: true,
          downloadEnabled: false,
          renewalWindowDays,
        },
      },
      {
        key: 'maha-smart-3m',
        name: 'Maharashtra Smart - 3 Months',
        tier: 'standard',
        pricePaise: 199900,
        durationDays: 90,
        validity: {
          unit: 'MONTHS',
          value: 3,
          label: '3 months',
        },
        features: [
          'Everything in Starter',
          'Full-length weekly mock tests',
          'Topic analytics and weak-area insights',
          'Priority support',
        ],
        boundaries: {
          notesAccess: true,
          testsAccess: true,
          practiceAccess: true,
          printPapersAccess: true,
          renewalWindowDays,
        },
      },
      {
        key: 'maha-pro-1y',
        name: 'Maharashtra Pro - 1 Year',
        tier: 'pro',
        pricePaise: 549900,
        durationDays: 365,
        validity: {
          unit: 'YEARS',
          value: 1,
          label: '1 year',
        },
        features: [
          'Everything in Smart',
          'Unlimited full mock attempts',
          'Exam strategy booster modules',
          'Premium doubt support',
        ],
        boundaries: {
          notesAccess: true,
          testsAccess: true,
          practiceAccess: true,
          printPapersAccess: true,
          downloadEnabled: true,
          renewalWindowDays,
        },
      },
      {
        key: 'maha-lifetime',
        name: 'Maharashtra Lifetime',
        tier: 'lifetime',
        pricePaise: 999900,
        durationDays: lifetimeDays,
        validity: {
          unit: 'LIFETIME',
          value: null,
          label: 'Lifetime access',
        },
        features: [
          'Lifetime access to notes, tests and practice',
          'All future preset updates included',
          'Highest priority support',
          'One-time purchase, no recurring renewals',
        ],
        boundaries: {
          notesAccess: true,
          testsAccess: true,
          practiceAccess: true,
          printPapersAccess: true,
          downloadEnabled: true,
          renewalWindowDays: null,
        },
      },
    ];
  }

  private getDefaultCouponSeeds(): DefaultCouponSeed[] {
    return [
      {
        code: 'WELCOME10',
        type: CouponType.PERCENT,
        value: 10,
        minAmountPaise: 49900,
        maxRedemptionsPerUser: 1,
      },
      {
        code: 'MAHA250',
        type: CouponType.FLAT,
        value: 25000,
        minAmountPaise: 99900,
      },
      {
        code: 'EXAM20',
        type: CouponType.PERCENT,
        value: 20,
        minAmountPaise: 199900,
        maxRedemptions: 5000,
        maxRedemptionsPerUser: 2,
      },
    ];
  }

  private async ensurePublishedAppConfig(
    key: string,
    configJson: Record<string, unknown>,
    createdByUserId?: string,
  ) {
    const existingPublished = await this.prisma.appConfig.findFirst({
      where: { key, status: CmsConfigStatus.PUBLISHED },
      select: { id: true },
    });
    if (existingPublished) {
      return false;
    }

    const latest = await this.prisma.appConfig.findFirst({
      where: { key },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    await this.prisma.appConfig.create({
      data: {
        key,
        version: (latest?.version ?? 0) + 1,
        status: CmsConfigStatus.PUBLISHED,
        publishedAt: new Date(),
        createdByUserId,
        configJson: configJson as Prisma.InputJsonValue,
      },
    });

    return true;
  }

  private shouldSeedDefaultCatalog() {
    const explicit = this.configService.get<string | boolean>('SEED_DEFAULT_CATALOG');
    if (explicit === undefined || explicit === null || explicit === '') {
      const env = this.configService.get<string>('NODE_ENV') ?? 'development';
      return env !== 'production';
    }
    return this.parseBoolean(explicit);
  }

  private shouldSeedOnBoot() {
    const explicit = this.configService.get<string | boolean>('SEED_ON_BOOT');
    if (explicit === undefined || explicit === null || explicit === '') {
      const env = this.configService.get<string>('NODE_ENV') ?? 'development';
      return env !== 'production';
    }
    return this.parseBoolean(explicit);
  }

  private async seedSampleData(): Promise<void> {
    const enabled = this.parseBoolean(this.configService.get<string>('SEED_SAMPLE_DATA'));
    if (!enabled) {
      return;
    }

    const env = this.configService.get<string>('NODE_ENV') ?? 'development';
    if (env === 'production') {
      this.logger.warn('Skipping sample data seed in production.');
      return;
    }

    const existingMarker = await this.prisma.subject.findUnique({
      where: { key: 'seed-math' },
      select: { id: true },
    });
    if (existingMarker) {
      this.logger.log('Sample data already seeded. Skipping.');
      return;
    }

    const adminUser = await this.prisma.user.findFirst({
      where: { type: UserType.ADMIN },
      orderBy: { createdAt: 'asc' },
    });
    const adminId = adminUser?.id ?? null;

    const student = await this.ensureDemoStudent();
    const studentId = student.id;

    const subjectSeeds = [
      { key: 'seed-math', name: 'Mathematics', orderIndex: 1 },
      { key: 'seed-physics', name: 'Physics', orderIndex: 2 },
    ];

    const subjects = await Promise.all(
      subjectSeeds.map((seed) =>
        this.prisma.subject.upsert({
          where: { key: seed.key },
          create: {
            key: seed.key,
            name: seed.name,
            orderIndex: seed.orderIndex,
            isActive: true,
          },
          update: {
            name: seed.name,
            orderIndex: seed.orderIndex,
            isActive: true,
          },
        }),
      ),
    );
    const subjectMap = new Map(subjects.map((subject) => [subject.key, subject]));

    const topicSeeds = [
      { subjectKey: 'seed-math', name: 'Algebra', orderIndex: 1 },
      { subjectKey: 'seed-math', name: 'Geometry', orderIndex: 2 },
      { subjectKey: 'seed-physics', name: 'Mechanics', orderIndex: 1 },
      { subjectKey: 'seed-physics', name: 'Optics', orderIndex: 2 },
    ];

    const topicMap = new Map<string, string>();
    for (const seed of topicSeeds) {
      const subject = subjectMap.get(seed.subjectKey);
      if (!subject) continue;
      const existing = await this.prisma.topic.findFirst({
        where: { subjectId: subject.id, name: seed.name },
      });
      const topic =
        existing ??
        (await this.prisma.topic.create({
          data: {
            subjectId: subject.id,
            name: seed.name,
            orderIndex: seed.orderIndex,
            isActive: true,
          },
        }));
      topicMap.set(`${seed.subjectKey}:${seed.name}`, topic.id);
    }

    const noteSeeds = [
      {
        title: 'Linear Equations Cheat Sheet',
        description: 'Quick revision notes for linear equations.',
        subjectKey: 'seed-math',
        topicNames: ['Algebra'],
        isPremium: false,
        pageCount: 12,
      },
      {
        title: 'Geometry Formula Pack',
        description: 'Essential geometry formulas and theorems.',
        subjectKey: 'seed-math',
        topicNames: ['Geometry'],
        isPremium: true,
        pageCount: 18,
      },
      {
        title: 'Newton Laws Summary',
        description: 'A concise summary of Newton’s laws of motion.',
        subjectKey: 'seed-physics',
        topicNames: ['Mechanics'],
        isPremium: false,
        pageCount: 10,
      },
    ];

    const noteMap = new Map<string, string>();
    for (const seed of noteSeeds) {
      const subject = subjectMap.get(seed.subjectKey);
      if (!subject) continue;
      const existing = await this.prisma.note.findFirst({
        where: { subjectId: subject.id, title: seed.title },
      });

      const searchText = this.buildSearchText(
        seed.title,
        seed.description,
        subject.name,
        seed.topicNames,
      );

      const note =
        existing ??
        (await this.prisma.note.create({
          data: {
            subjectId: subject.id,
            createdByUserId: adminId ?? undefined,
            title: seed.title,
            description: seed.description,
            isPremium: seed.isPremium,
            isPublished: true,
            publishedAt: new Date(),
            pageCount: seed.pageCount,
            searchText,
          },
        }));

      const topicIds = seed.topicNames
        .map((name) => topicMap.get(`${seed.subjectKey}:${name}`))
        .filter((id): id is string => Boolean(id));

      if (topicIds.length) {
        await this.prisma.noteTopic.createMany({
          data: topicIds.map((topicId) => ({ noteId: note.id, topicId })),
          skipDuplicates: true,
        });
      }

      noteMap.set(seed.title, note.id);
    }

    const firstNoteId = noteMap.get('Linear Equations Cheat Sheet');
    if (firstNoteId) {
      await this.prisma.noteProgress.upsert({
        where: { noteId_userId: { noteId: firstNoteId, userId: studentId } },
        create: {
          noteId: firstNoteId,
          userId: studentId,
          lastPage: 4,
          completionPercent: 0.35,
        },
        update: {
          lastPage: 4,
          completionPercent: 0.35,
        },
      });

      const existingAccessLog = await this.prisma.noteAccessLog.findFirst({
        where: { noteId: firstNoteId, userId: studentId },
      });
      if (!existingAccessLog) {
        await this.prisma.noteAccessLog.create({
          data: {
            noteId: firstNoteId,
            userId: studentId,
            rangeStart: 0,
            rangeEnd: 2048,
            bytesSent: 2048,
            ip: '127.0.0.1',
            userAgent: 'SeedBot/1.0',
          },
        });
      }

      const existingSession = await this.prisma.noteViewSession.findFirst({
        where: { noteId: firstNoteId, userId: studentId },
      });
      if (!existingSession) {
        await this.prisma.noteViewSession.create({
          data: {
            noteId: firstNoteId,
            userId: studentId,
            tokenHash: 'seed_token_hash',
            watermarkSeed: 'seed_watermark',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            lastSeenAt: new Date(),
            ip: '127.0.0.1',
            userAgent: 'SeedBot/1.0',
          },
        });
      }

      const existingSignal = await this.prisma.noteSecuritySignal.findFirst({
        where: { noteId: firstNoteId },
      });
      if (!existingSignal) {
        await this.prisma.noteSecuritySignal.create({
          data: {
            noteId: firstNoteId,
            userId: studentId,
            signalType: NoteSecuritySignalType.RATE_LIMIT,
            metaJson: { reason: 'Seed sample signal' } as Prisma.InputJsonValue,
          },
        });
      }
    }

    const questionSeeds = [
      {
        key: 'seed-q1',
        subjectKey: 'seed-math',
        topicName: 'Algebra',
        type: QuestionType.SINGLE_CHOICE,
        difficulty: QuestionDifficulty.EASY,
        statement: 'Solve 2x + 3 = 7.',
        options: ['x = 1', 'x = 2', 'x = 3', 'x = 4'],
        answer: 'x = 2',
      },
      {
        key: 'seed-q2',
        subjectKey: 'seed-math',
        topicName: 'Geometry',
        type: QuestionType.TRUE_FALSE,
        difficulty: QuestionDifficulty.MEDIUM,
        statement: 'Sum of interior angles of a triangle is 180°.',
        options: ['True', 'False'],
        answer: 'True',
      },
      {
        key: 'seed-q3',
        subjectKey: 'seed-physics',
        topicName: 'Mechanics',
        type: QuestionType.SINGLE_CHOICE,
        difficulty: QuestionDifficulty.MEDIUM,
        statement: 'Which law explains inertia?',
        options: ["Newton's First Law", "Newton's Second Law", "Newton's Third Law", 'Hooke’s Law'],
        answer: "Newton's First Law",
      },
      {
        key: 'seed-q4',
        subjectKey: 'seed-physics',
        topicName: 'Optics',
        type: QuestionType.SINGLE_CHOICE,
        difficulty: QuestionDifficulty.EASY,
        statement: 'Speed of light in vacuum is approximately?',
        options: ['3×10^8 m/s', '3×10^6 m/s', '3×10^4 m/s', '3×10^2 m/s'],
        answer: '3×10^8 m/s',
      },
    ];

    const questionMap = new Map<string, string>();
    for (const seed of questionSeeds) {
      const subject = subjectMap.get(seed.subjectKey);
      if (!subject) continue;
      const topicId = seed.topicName
        ? topicMap.get(`${seed.subjectKey}:${seed.topicName}`)
        : undefined;
      const searchText = `Seed question ${seed.key} ${seed.statement}`;
      const existing = await this.prisma.question.findFirst({
        where: { searchText },
      });

      const question =
        existing ??
        (await this.prisma.question.create({
          data: {
            subjectId: subject.id,
            topicId: topicId ?? undefined,
            createdByUserId: adminId ?? undefined,
            type: seed.type,
            difficulty: seed.difficulty,
            statementJson: { text: seed.statement } as Prisma.InputJsonValue,
            optionsJson: seed.options as Prisma.InputJsonValue,
            correctAnswerJson: seed.answer as Prisma.InputJsonValue,
            hasMedia: false,
            isPublished: true,
            searchText,
          },
        }));

      questionMap.set(seed.key, question.id);
    }

    const testTitle = 'Seed Test - Basics';
    let test = await this.prisma.test.findFirst({ where: { title: testTitle } });
    if (!test) {
      const questionIds = [
        questionMap.get('seed-q1'),
        questionMap.get('seed-q2'),
      ].filter((id): id is string => Boolean(id));
      const config = {
        questionIds,
        marksPerQuestion: 1,
      };
      test = await this.prisma.test.create({
        data: {
          subjectId: subjectMap.get('seed-math')?.id,
          createdByUserId: adminId ?? undefined,
          title: testTitle,
          description: 'A short seed test for demo purposes.',
          type: TestType.SUBJECT,
          configJson: config as Prisma.InputJsonValue,
          isPublished: true,
          publishedAt: new Date(),
        },
      });

      if (questionIds.length) {
        await this.prisma.testQuestion.createMany({
          data: questionIds.map((questionId, index) => ({
            testId: test!.id,
            questionId,
            orderIndex: index,
            marks: 1,
          })),
          skipDuplicates: true,
        });
      }
    }

    if (test) {
      const existingAttempt = await this.prisma.attempt.findFirst({
        where: { userId: studentId, testId: test.id },
      });
      if (!existingAttempt) {
        const attempt = await this.prisma.attempt.create({
          data: {
            testId: test.id,
            userId: studentId,
            status: AttemptStatus.SUBMITTED,
            startedAt: new Date(Date.now() - 60 * 60 * 1000),
            submittedAt: new Date(),
            answersJson: { seeded: true } as Prisma.InputJsonValue,
            scoreJson: { total: 2, correct: 2 } as Prisma.InputJsonValue,
            totalScore: 2,
          },
        });

        const testQuestionIds = await this.prisma.testQuestion.findMany({
          where: { testId: test.id },
          orderBy: { orderIndex: 'asc' },
          select: { questionId: true },
        });

        if (testQuestionIds.length) {
          await this.prisma.attemptQuestion.createMany({
            data: testQuestionIds.map((item, index) => ({
              attemptId: attempt.id,
              questionId: item.questionId,
              orderIndex: index,
            })),
            skipDuplicates: true,
          });
        }

        await this.prisma.attemptEventLog.createMany({
          data: [
            {
              attemptId: attempt.id,
              eventType: AttemptEventType.START,
              metaJson: { seeded: true } as Prisma.InputJsonValue,
            },
            {
              attemptId: attempt.id,
              eventType: AttemptEventType.SUBMIT,
              metaJson: { seeded: true } as Prisma.InputJsonValue,
            },
          ],
        });
      }
    }

    const practiceSession = await this.prisma.practiceSession.findFirst({
      where: { userId: studentId },
    });
    if (!practiceSession) {
      const session = await this.prisma.practiceSession.create({
        data: {
          userId: studentId,
          subjectId: subjectMap.get('seed-math')?.id,
          topicId: topicMap.get('seed-math:Algebra'),
          status: PracticeSessionStatus.ENDED,
          startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          endedAt: new Date(Date.now() - 90 * 60 * 1000),
          configJson: { seeded: true } as Prisma.InputJsonValue,
        },
      });

      const q1 = questionMap.get('seed-q1');
      if (q1) {
        await this.prisma.practiceQuestionEvent.createMany({
          data: [
            {
              sessionId: session.id,
              userId: studentId,
              questionId: q1,
              eventType: PracticeEventType.ANSWERED,
              isCorrect: true,
              payloadJson: { answer: 'x = 2' } as Prisma.InputJsonValue,
            },
          ],
        });
      }
    }

    const plan = await this.prisma.plan.upsert({
      where: { key: 'seed-basic' },
      create: {
        key: 'seed-basic',
        name: 'Seed Basic',
        tier: 'basic',
        pricePaise: 49900,
        durationDays: 30,
        isActive: true,
        metadataJson: { highlight: 'Best for beginners' } as Prisma.InputJsonValue,
        featuresJson: ['Notes access', 'Practice quizzes'] as Prisma.InputJsonValue,
      },
      update: {
        name: 'Seed Basic',
        tier: 'basic',
        pricePaise: 49900,
        durationDays: 30,
        isActive: true,
      },
    });

    const coupon = await this.prisma.coupon.upsert({
      where: { code: 'SEED10' },
      create: {
        code: 'SEED10',
        type: CouponType.PERCENT,
        value: 10,
        isActive: true,
        metadataJson: { seeded: true } as Prisma.InputJsonValue,
      },
      update: { value: 10, isActive: true },
    });

    const successOrder = await this.prisma.paymentOrder.findFirst({
      where: { merchantTransactionId: 'seed-order-success' },
    });
    const now = new Date();
    if (!successOrder) {
      await this.prisma.paymentOrder.create({
        data: {
          userId: studentId,
          planId: plan.id,
          couponId: coupon.id,
          merchantTransactionId: 'seed-order-success',
          provider: PaymentProvider.PHONEPE,
          currency: 'INR',
          amountPaise: 49900,
          finalAmountPaise: 44910,
          status: PaymentOrderStatus.SUCCESS,
          completedAt: now,
          metadataJson: { seeded: true } as Prisma.InputJsonValue,
        },
      });
    }

    const pendingOrder = await this.prisma.paymentOrder.findFirst({
      where: { merchantTransactionId: 'seed-order-pending' },
    });
    if (!pendingOrder) {
      await this.prisma.paymentOrder.create({
        data: {
          userId: studentId,
          planId: plan.id,
          merchantTransactionId: 'seed-order-pending',
          provider: PaymentProvider.PHONEPE,
          currency: 'INR',
          amountPaise: 49900,
          finalAmountPaise: 49900,
          status: PaymentOrderStatus.PENDING,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          metadataJson: { seeded: true } as Prisma.InputJsonValue,
        },
      });
    }

    let subscription = await this.prisma.subscription.findFirst({
      where: { userId: studentId, planId: plan.id },
    });
    if (!subscription) {
      subscription = await this.prisma.subscription.create({
        data: {
          userId: studentId,
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          startsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
          endsAt: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000),
        },
      });
    }

    const existingEntitlement = await this.prisma.entitlement.findFirst({
      where: { userId: studentId, subscriptionId: subscription.id },
    });
    if (!existingEntitlement) {
      await this.prisma.entitlement.create({
        data: {
          userId: studentId,
          kind: EntitlementKind.ALL,
          subscriptionId: subscription.id,
          reason: 'Seed subscription',
          startsAt: subscription.startsAt ?? undefined,
          endsAt: subscription.endsAt ?? undefined,
        },
      });
    }

    const appConfigExists = await this.prisma.appConfig.findUnique({
      where: { key_version: { key: 'landing.home', version: 1 } },
    });
    if (!appConfigExists) {
      await this.prisma.appConfig.create({
        data: {
          key: 'landing.home',
          version: 1,
          status: CmsConfigStatus.PUBLISHED,
          publishedAt: now,
          createdByUserId: adminId ?? undefined,
          configJson: {
            hero: {
              title: 'Seed Academy',
              subtitle: 'Prepare smarter with curated notes, tests, and practice.',
              imageUrl:
                'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=1200&q=80',
            },
            features: [
              { title: 'Practice Engine', body: 'Adaptive practice to boost scores.' },
              { title: 'Notes Library', body: 'Premium notes with watermarking.' },
            ],
          } as Prisma.InputJsonValue,
        },
      });
    }

    const studentConfigExists = await this.prisma.appConfig.findUnique({
      where: { key_version: { key: 'student.home', version: 1 } },
    });
    if (!studentConfigExists) {
      await this.prisma.appConfig.create({
        data: {
          key: 'student.home',
          version: 1,
          status: CmsConfigStatus.PUBLISHED,
          publishedAt: now,
          createdByUserId: adminId ?? undefined,
          configJson: {
            highlight: 'Welcome back!',
            imageUrl:
              'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=1200&q=80',
          } as Prisma.InputJsonValue,
        },
      });
    }

    const bannerExists = await this.prisma.banner.findFirst({
      where: { title: 'Seed Banner' },
    });
    if (!bannerExists) {
      await this.prisma.banner.create({
        data: {
          title: 'Seed Banner',
          bodyJson: { text: 'Seed promo is live.' } as Prisma.InputJsonValue,
          linkUrl: 'https://example.com',
          target: '_blank',
          priority: 10,
          isActive: true,
          createdByUserId: adminId ?? undefined,
        },
      });
    }

    const announcementExists = await this.prisma.announcement.findFirst({
      where: { title: 'Seed Announcement' },
    });
    if (!announcementExists) {
      await this.prisma.announcement.create({
        data: {
          title: 'Seed Announcement',
          bodyJson: { text: 'Welcome to the seeded environment.' } as Prisma.InputJsonValue,
          pinned: true,
          isActive: true,
          createdByUserId: adminId ?? undefined,
        },
      });
    }

    const homeSectionExists = await this.prisma.homeSection.findFirst({
      where: { type: 'seed-highlights' },
    });
    if (!homeSectionExists) {
      await this.prisma.homeSection.create({
        data: {
          type: 'seed-highlights',
          orderIndex: 1,
          isActive: true,
          createdByUserId: adminId ?? undefined,
          configJson: {
            title: 'Why Seed Academy',
            items: [
              {
                title: 'Curated tests',
                imageUrl:
                  'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=80',
              },
            ],
          } as Prisma.InputJsonValue,
        },
      });
    }

    const pageExists = await this.prisma.page.findFirst({ where: { slug: 'about' } });
    if (!pageExists) {
      await this.prisma.page.create({
        data: {
          slug: 'about',
          title: 'About Seed Academy',
          status: PageStatus.PUBLISHED,
          publishedAt: now,
          bodyJson: {
            blocks: [
              {
                type: 'paragraph',
                text: 'Seed Academy helps you prepare faster with structured content.',
              },
            ],
          } as Prisma.InputJsonValue,
          createdByUserId: adminId ?? undefined,
        },
      });
    }

    const template = await this.prisma.notificationTemplate.findFirst({
      where: { key: 'auth.otp' },
    });
    if (template) {
      const existingMessage = await this.prisma.notificationMessage.findFirst({
        where: { templateId: template.id },
      });
      if (!existingMessage) {
        await this.prisma.notificationMessage.create({
          data: {
            templateId: template.id,
            userId: studentId,
            channel: NotificationChannel.EMAIL,
            payloadJson: { otp: '123456' } as Prisma.InputJsonValue,
            renderedText: 'Your OTP is 123456.',
            status: NotificationStatus.SENT,
            attempts: 1,
            sentAt: now,
          },
        });
      }

      const existingBroadcast = await this.prisma.broadcast.findFirst({
        where: { title: 'Seed Broadcast' },
      });
      if (!existingBroadcast) {
        await this.prisma.broadcast.create({
          data: {
            title: 'Seed Broadcast',
            channel: NotificationChannel.EMAIL,
            status: BroadcastStatus.DRAFT,
            audienceJson: { type: 'all' } as Prisma.InputJsonValue,
            templateId: template.id,
            createdByUserId: adminId ?? undefined,
          },
        });
      }
    }

    const auditLogExists = await this.prisma.auditLog.findFirst({
      where: { action: 'seed.setup' },
    });
    if (!auditLogExists) {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: adminId ?? undefined,
          action: 'seed.setup',
          resourceType: 'Seed',
          resourceId: studentId,
          metaJson: { note: 'Seeded sample data' } as Prisma.InputJsonValue,
        },
      });
    }

    const printJobExists = await this.prisma.printJob.findFirst({
      where: { configJson: { path: ['seeded'], equals: true } },
    });
    if (!printJobExists) {
      const practiceQuestionIds = [
        questionMap.get('seed-q1'),
        questionMap.get('seed-q3'),
      ].filter((id): id is string => Boolean(id));

      const job = await this.prisma.printJob.create({
        data: {
          type: PrintJobType.PRACTICE,
          status: PrintJobStatus.QUEUED,
          createdByUserId: adminId ?? undefined,
          configJson: {
            seeded: true,
            title: 'Seed Practice Sheet',
            questionIds: practiceQuestionIds,
          } as Prisma.InputJsonValue,
        },
      });

      if (practiceQuestionIds.length) {
        await this.prisma.printJobItem.createMany({
          data: practiceQuestionIds.map((questionId, index) => ({
            jobId: job.id,
            questionId,
            orderIndex: index,
          })),
          skipDuplicates: true,
        });
      }
    }

    this.logger.log('Seeded sample data for demo usage.');
  }

  private async ensureDemoStudent() {
    const email =
      this.configService.get<string>('DEMO_STUDENT_EMAIL') ?? 'student@seed.local';
    const password =
      this.configService.get<string>('DEMO_STUDENT_PASSWORD') ?? 'SeedPass@123';

    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      const passwordHash = await bcrypt.hash(password, 10);
      user = await this.prisma.user.create({
        data: {
          email,
          fullName: 'Seed Student',
          passwordHash,
          type: UserType.STUDENT,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
        },
      });
    } else if (user.type !== UserType.STUDENT) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { type: UserType.STUDENT, status: UserStatus.ACTIVE },
      });
    }

    const studentRole = await this.prisma.role.findUnique({ where: { key: 'STUDENT' } });
    if (studentRole) {
      await this.prisma.userRole.createMany({
        data: [{ userId: user.id, roleId: studentRole.id }],
        skipDuplicates: true,
      });
    }

    return user;
  }

  private buildSearchText(
    title: string,
    description?: string | null,
    subjectName?: string | null,
    topicNames: string[] = [],
  ) {
    return [title, description, subjectName, ...topicNames].filter(Boolean).join(' ');
  }

  private parseBoolean(value?: string | boolean) {
    if (typeof value === 'boolean') return value;
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return ['true', '1', 'yes', 'on'].includes(normalized);
  }

  private resolveRenewalWindowDays() {
    const value = Number(
      this.configService.get<number>('SUBSCRIPTION_RENEWAL_WINDOW_DAYS') ??
        DEFAULT_RENEWAL_WINDOW_DAYS,
    );
    if (!Number.isFinite(value) || value < 0) {
      return DEFAULT_RENEWAL_WINDOW_DAYS;
    }
    return value;
  }

  private resolveLifetimeDays() {
    const value = Number(
      this.configService.get<number>('SUBSCRIPTION_LIFETIME_DAYS') ??
        DEFAULT_LIFETIME_DAYS,
    );
    if (!Number.isFinite(value) || value <= 0) {
      return DEFAULT_LIFETIME_DAYS;
    }
    return value;
  }

  private async mapPermissionsByKey(items: SeedPermission[]): Promise<Map<string, Permission>> {
    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: items.map((item) => item.key) } },
    });

    return new Map(permissions.map((permission) => [permission.key, permission]));
  }
}
