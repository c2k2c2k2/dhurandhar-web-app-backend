import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { seconds, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { envValidationSchema } from './config/env.validation';
import { PrismaModule } from './infra/prisma/prisma.module';
import { SeedModule } from './infra/seed/seed.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthorizationModule } from './modules/authorization/authorization.module';
import { CmsModule } from './modules/cms/cms.module';
import { ContentModule } from './modules/content/content.module';
import { AdminOpsModule } from './modules/admin-ops/admin-ops.module';
import { FilesModule } from './modules/files/files.module';
import { HealthModule } from './modules/health/health.module';
import { NotesModule } from './modules/notes/notes.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PracticeModule } from './modules/practice/practice.module';
import { PrintEngineModule } from './modules/print-engine/print-engine.module';
import { QuestionBankModule } from './modules/question-bank/question-bank.module';
import { SearchModule } from './modules/search/search.module';
import { StudentEventsModule } from './modules/student-events/student-events.module';
import { TestEngineModule } from './modules/test-engine/test-engine.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const defaults = {
          maxRetriesPerRequest: null,
          enableOfflineQueue: true,
          lazyConnect: false,
          connectTimeout: 10000,
        };

        const decode = (value?: string) => {
          if (!value) return undefined;
          try {
            return decodeURIComponent(value);
          } catch {
            return value;
          }
        };

        const redisUrl = configService.get<string>('REDIS_URL');
        if (redisUrl) {
          const parsed = new URL(redisUrl);
          const dbValue = parsed.pathname?.replace('/', '');
          const db = dbValue ? Number(dbValue) : undefined;

          return {
            connection: {
              host: parsed.hostname,
              port: parsed.port ? Number(parsed.port) : 6379,
              username: decode(parsed.username),
              password: decode(parsed.password),
              db: Number.isFinite(db ?? NaN) ? db : undefined,
              ...defaults,
            },
          };
        }

        const host = configService.get<string>('REDIS_HOST') ?? '127.0.0.1';
        const port = configService.get<number>('REDIS_PORT') ?? 6379;
        const password = configService.get<string>('REDIS_PASSWORD') || undefined;

        return {
          connection: {
            host,
            port,
            password,
            ...defaults,
          },
        };
      },
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const ttlSeconds = configService.get<number>('THROTTLE_TTL_SECONDS') ?? 60;
        const limit = configService.get<number>('THROTTLE_LIMIT') ?? 120;
        return [
          {
            ttl: seconds(ttlSeconds),
            limit,
          },
        ];
      },
    }),
    PrismaModule,
    SeedModule,
    AuthModule,
    AuthorizationModule,
    UsersModule,
    ContentModule,
    NotesModule,
    FilesModule,
    PaymentsModule,
    QuestionBankModule,
    TestEngineModule,
    PracticeModule,
    PrintEngineModule,
    NotificationsModule,
    CmsModule,
    AdminOpsModule,
    AnalyticsModule,
    StudentEventsModule,
    SearchModule,
    HealthModule,
  ],
  providers: [
    RequestIdMiddleware,
    AuditLogInterceptor,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
