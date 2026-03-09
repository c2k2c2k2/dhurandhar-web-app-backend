import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CmsConfigStatus } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

type NumberOptions = {
  min?: number;
  max?: number;
  integer?: boolean;
};

@Injectable()
export class SiteSettingsService implements OnModuleInit, OnModuleDestroy {
  private static readonly APP_CONFIG_KEY = 'app.site_settings';
  private static readonly REFRESH_INTERVAL_MS = 30_000;
  private static snapshot: Record<string, unknown> = {};

  private readonly logger = new Logger(SiteSettingsService.name);
  private refreshTimer: NodeJS.Timeout | null = null;
  private lastRefreshAt = 0;
  private refreshPromise: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.refreshSettings(true);
    this.refreshTimer = setInterval(() => {
      void this.refreshSettings(false);
    }, SiteSettingsService.REFRESH_INTERVAL_MS);
    this.refreshTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  getString(key: string, fallback = '') {
    this.scheduleRefreshIfStale();
    return SiteSettingsService.parseString(
      SiteSettingsService.snapshot[key],
      this.readEnvFallback(key, fallback),
    );
  }

  getBoolean(key: string, fallback: boolean) {
    this.scheduleRefreshIfStale();
    return SiteSettingsService.parseBoolean(
      SiteSettingsService.snapshot[key],
      this.readEnvFallback(key, fallback),
    );
  }

  getNumber(key: string, fallback: number, options?: NumberOptions) {
    this.scheduleRefreshIfStale();
    return SiteSettingsService.parseNumber(
      SiteSettingsService.snapshot[key],
      this.readEnvFallback(key, fallback),
      options,
    );
  }

  getCsv(key: string, fallback: string[] = []) {
    this.scheduleRefreshIfStale();
    const fromDb = SiteSettingsService.snapshot[key];
    if (Array.isArray(fromDb)) {
      return fromDb
        .map((item) => String(item).trim())
        .filter((item) => item.length > 0);
    }
    const stringValue = SiteSettingsService.parseString(
      fromDb,
      this.readEnvFallback(key, ''),
    ).trim();
    if (!stringValue) {
      return fallback;
    }
    return stringValue
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  static getCachedString(key: string, fallback = '') {
    return SiteSettingsService.parseString(
      SiteSettingsService.snapshot[key],
      fallback,
    );
  }

  static getCachedBoolean(key: string, fallback: boolean) {
    return SiteSettingsService.parseBoolean(
      SiteSettingsService.snapshot[key],
      fallback,
    );
  }

  static getCachedNumber(
    key: string,
    fallback: number,
    options?: NumberOptions,
  ) {
    return SiteSettingsService.parseNumber(
      SiteSettingsService.snapshot[key],
      fallback,
      options,
    );
  }

  private readEnvFallback<T>(key: string, fallback: T) {
    const envValue = this.configService.get<T>(key);
    return envValue ?? fallback;
  }

  private scheduleRefreshIfStale() {
    const now = Date.now();
    const staleFor = now - this.lastRefreshAt;
    if (staleFor < SiteSettingsService.REFRESH_INTERVAL_MS) {
      return;
    }
    void this.refreshSettings(false);
  }

  private async refreshSettings(force: boolean) {
    const now = Date.now();
    if (
      !force &&
      now - this.lastRefreshAt < SiteSettingsService.REFRESH_INTERVAL_MS
    ) {
      return;
    }

    if (this.refreshPromise) {
      await this.refreshPromise;
      return;
    }

    this.refreshPromise = (async () => {
      try {
        const latest = await this.prisma.appConfig.findFirst({
          where: {
            key: SiteSettingsService.APP_CONFIG_KEY,
            status: CmsConfigStatus.PUBLISHED,
          },
          orderBy: { version: 'desc' },
          select: { configJson: true },
        });

        const parsed =
          latest?.configJson &&
          typeof latest.configJson === 'object' &&
          !Array.isArray(latest.configJson)
            ? (latest.configJson as Record<string, unknown>)
            : {};

        SiteSettingsService.snapshot = parsed;
        this.lastRefreshAt = Date.now();
      } catch (err) {
        this.logger.warn(
          `Failed to refresh ${SiteSettingsService.APP_CONFIG_KEY}: ${this.formatError(err)}`,
        );
      }
    })();

    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private static parseString(value: unknown, fallback: string) {
    if (typeof value === 'string') {
      return value;
    }
    if (value == null) {
      return fallback;
    }
    return String(value);
  }

  private static parseBoolean(value: unknown, fallback: boolean) {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(normalized)) {
        return true;
      }
      if (['false', '0', 'no', 'off'].includes(normalized)) {
        return false;
      }
    }
    return fallback;
  }

  private static parseNumber(
    value: unknown,
    fallback: number,
    options?: NumberOptions,
  ) {
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : Number.NaN;
    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    if (options?.integer && !Number.isInteger(parsed)) {
      return fallback;
    }
    if (typeof options?.min === 'number' && parsed < options.min) {
      return fallback;
    }
    if (typeof options?.max === 'number' && parsed > options.max) {
      return fallback;
    }
    return parsed;
  }

  private formatError(err: unknown) {
    if (err instanceof Error) {
      return err.message;
    }
    return String(err);
  }
}
