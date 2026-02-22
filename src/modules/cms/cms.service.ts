import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AssetResourceType,
  CmsConfigStatus,
  PageStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  AppConfigCreateDto,
  AppConfigQueryDto,
  AnnouncementCreateDto,
  AnnouncementUpdateDto,
  BannerCreateDto,
  BannerUpdateDto,
  HomeSectionCreateDto,
  HomeSectionReorderDto,
  HomeSectionUpdateDto,
  PageCreateDto,
  PageQueryDto,
  PageUpdateDto,
} from './dto';

@Injectable()
export class CmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async listAppConfigs(query: AppConfigQueryDto) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);

    const where = {
      key: query.key ?? undefined,
      status: query.status as CmsConfigStatus | undefined,
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.appConfig.count({ where }),
      this.prisma.appConfig.findMany({
        where,
        orderBy: [{ key: 'asc' }, { version: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data, total, page, pageSize };
  }

  async createAppConfig(userId: string, dto: AppConfigCreateDto) {
    const latest = await this.prisma.appConfig.findFirst({
      where: { key: dto.key },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = latest ? latest.version + 1 : 1;

    return this.prisma.appConfig.create({
      data: {
        key: dto.key,
        version: nextVersion,
        status: CmsConfigStatus.DRAFT,
        configJson: dto.configJson as Prisma.InputJsonValue,
        createdByUserId: userId,
      },
    });
  }

  async publishAppConfig(configId: string) {
    const config = await this.prisma.appConfig.findUnique({
      where: { id: configId },
    });
    if (!config) {
      throw new NotFoundException({
        code: 'CMS_CONFIG_NOT_FOUND',
        message: 'Config not found.',
      });
    }

    await this.prisma.$transaction([
      this.prisma.appConfig.updateMany({
        where: {
          key: config.key,
          status: CmsConfigStatus.PUBLISHED,
          id: { not: config.id },
        },
        data: { status: CmsConfigStatus.ARCHIVED },
      }),
      this.prisma.appConfig.update({
        where: { id: config.id },
        data: { status: CmsConfigStatus.PUBLISHED, publishedAt: new Date() },
      }),
    ]);

    return { success: true };
  }

  async listBannersAdmin(page = 1, pageSize = 20) {
    const [total, data] = await this.prisma.$transaction([
      this.prisma.banner.count(),
      this.prisma.banner.findMany({
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data, total, page, pageSize };
  }

  async createBanner(userId: string, dto: BannerCreateDto) {
    const assetIds = this.extractAssetIds([dto.bodyJson]);
    await this.validateAssets(assetIds);

    return this.prisma.$transaction(async (tx) => {
      const banner = await tx.banner.create({
        data: {
          title: dto.title,
          bodyJson: dto.bodyJson as Prisma.InputJsonValue | undefined,
          linkUrl: dto.linkUrl,
          target: dto.target,
          priority: dto.priority ?? 0,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
          isActive: dto.isActive ?? true,
          createdByUserId: userId,
        },
      });

      await this.syncAssetReferences(
        AssetResourceType.BANNER,
        banner.id,
        assetIds,
        tx,
      );

      return banner;
    });
  }

  async updateBanner(bannerId: string, dto: BannerUpdateDto) {
    const banner = await this.prisma.banner.findUnique({ where: { id: bannerId } });
    if (!banner) {
      throw new NotFoundException({
        code: 'CMS_BANNER_NOT_FOUND',
        message: 'Banner not found.',
      });
    }

    const bodyJson = (dto.bodyJson ?? banner.bodyJson) as Prisma.JsonValue | null;
    const assetIds = this.extractAssetIds([bodyJson]);
    await this.validateAssets(assetIds);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.banner.update({
        where: { id: bannerId },
        data: {
          title: dto.title ?? undefined,
          bodyJson: dto.bodyJson ? (dto.bodyJson as Prisma.InputJsonValue) : undefined,
          linkUrl: dto.linkUrl ?? undefined,
          target: dto.target ?? undefined,
          priority: dto.priority ?? undefined,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
          isActive: dto.isActive ?? undefined,
        },
      });

      await this.syncAssetReferences(
        AssetResourceType.BANNER,
        bannerId,
        assetIds,
        tx,
      );

      return updated;
    });
  }

  async listAnnouncementsAdmin(page = 1, pageSize = 20) {
    const [total, data] = await this.prisma.$transaction([
      this.prisma.announcement.count(),
      this.prisma.announcement.findMany({
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data, total, page, pageSize };
  }

  async createAnnouncement(userId: string, dto: AnnouncementCreateDto) {
    const assetIds = this.extractAssetIds([dto.bodyJson]);
    await this.validateAssets(assetIds);

    return this.prisma.$transaction(async (tx) => {
      const announcement = await tx.announcement.create({
        data: {
          title: dto.title,
          bodyJson: dto.bodyJson as Prisma.InputJsonValue,
          pinned: dto.pinned ?? false,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
          isActive: dto.isActive ?? true,
          createdByUserId: userId,
        },
      });

      await this.syncAssetReferences(
        AssetResourceType.ANNOUNCEMENT,
        announcement.id,
        assetIds,
        tx,
      );

      return announcement;
    });
  }

  async updateAnnouncement(announcementId: string, dto: AnnouncementUpdateDto) {
    const announcement = await this.prisma.announcement.findUnique({
      where: { id: announcementId },
    });
    if (!announcement) {
      throw new NotFoundException({
        code: 'CMS_ANNOUNCEMENT_NOT_FOUND',
        message: 'Announcement not found.',
      });
    }

    const bodyJson = (dto.bodyJson ?? announcement.bodyJson) as Prisma.JsonValue | null;
    const assetIds = this.extractAssetIds([bodyJson]);
    await this.validateAssets(assetIds);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.announcement.update({
        where: { id: announcementId },
        data: {
          title: dto.title ?? undefined,
          bodyJson: dto.bodyJson ? (dto.bodyJson as Prisma.InputJsonValue) : undefined,
          pinned: dto.pinned ?? undefined,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
          isActive: dto.isActive ?? undefined,
        },
      });

      await this.syncAssetReferences(
        AssetResourceType.ANNOUNCEMENT,
        announcementId,
        assetIds,
        tx,
      );

      return updated;
    });
  }

  async listHomeSectionsAdmin(page = 1, pageSize = 50) {
    const [total, data] = await this.prisma.$transaction([
      this.prisma.homeSection.count(),
      this.prisma.homeSection.findMany({
        orderBy: { orderIndex: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data, total, page, pageSize };
  }

  async createHomeSection(userId: string, dto: HomeSectionCreateDto) {
    const assetIds = this.extractAssetIds([dto.configJson]);
    await this.validateAssets(assetIds);

    return this.prisma.$transaction(async (tx) => {
      const section = await tx.homeSection.create({
        data: {
          type: dto.type,
          configJson: dto.configJson as Prisma.InputJsonValue,
          orderIndex: dto.orderIndex ?? 0,
          isActive: dto.isActive ?? true,
          createdByUserId: userId,
        },
      });

      await this.syncAssetReferences(
        AssetResourceType.HOME_SECTION,
        section.id,
        assetIds,
        tx,
      );

      return section;
    });
  }

  async updateHomeSection(sectionId: string, dto: HomeSectionUpdateDto) {
    const section = await this.prisma.homeSection.findUnique({
      where: { id: sectionId },
    });
    if (!section) {
      throw new NotFoundException({
        code: 'CMS_HOME_SECTION_NOT_FOUND',
        message: 'Home section not found.',
      });
    }

    const configJson = (dto.configJson ?? section.configJson) as Prisma.JsonValue | null;
    const assetIds = this.extractAssetIds([configJson]);
    await this.validateAssets(assetIds);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.homeSection.update({
        where: { id: sectionId },
        data: {
          type: dto.type ?? undefined,
          configJson: dto.configJson ? (dto.configJson as Prisma.InputJsonValue) : undefined,
          orderIndex: dto.orderIndex ?? undefined,
          isActive: dto.isActive ?? undefined,
        },
      });

      await this.syncAssetReferences(
        AssetResourceType.HOME_SECTION,
        sectionId,
        assetIds,
        tx,
      );

      return updated;
    });
  }

  async reorderHomeSections(dto: HomeSectionReorderDto) {
    const updates = dto.items.map((item) =>
      this.prisma.homeSection.update({
        where: { id: item.id },
        data: { orderIndex: item.orderIndex },
      }),
    );

    await this.prisma.$transaction(updates);
    return { success: true };
  }

  async listPagesAdmin(query: PageQueryDto) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);

    const where = {
      status: query.status as PageStatus | undefined,
      slug: query.slug ?? undefined,
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.page.count({ where }),
      this.prisma.page.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data, total, page, pageSize };
  }

  async createPage(userId: string, dto: PageCreateDto) {
    const assetIds = this.extractAssetIds([dto.bodyJson]);
    await this.validateAssets(assetIds);

    return this.prisma.$transaction(async (tx) => {
      const page = await tx.page.create({
        data: {
          slug: dto.slug,
          title: dto.title,
          bodyJson: dto.bodyJson as Prisma.InputJsonValue,
          status: dto.status ?? PageStatus.DRAFT,
          publishedAt: dto.status === PageStatus.PUBLISHED ? new Date() : undefined,
          createdByUserId: userId,
        },
      });

      await this.syncAssetReferences(AssetResourceType.PAGE, page.id, assetIds, tx);

      return page;
    });
  }

  async updatePage(pageId: string, dto: PageUpdateDto) {
    const pageRecord = await this.prisma.page.findUnique({ where: { id: pageId } });
    if (!pageRecord) {
      throw new NotFoundException({
        code: 'CMS_PAGE_NOT_FOUND',
        message: 'Page not found.',
      });
    }

    if (dto.slug && dto.slug !== pageRecord.slug) {
      const existing = await this.prisma.page.findUnique({ where: { slug: dto.slug } });
      if (existing) {
        throw new BadRequestException({
          code: 'CMS_PAGE_SLUG_EXISTS',
          message: 'Slug already exists.',
        });
      }
    }

    const bodyJson = (dto.bodyJson ?? pageRecord.bodyJson) as Prisma.JsonValue | null;
    const assetIds = this.extractAssetIds([bodyJson]);
    await this.validateAssets(assetIds);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.page.update({
        where: { id: pageId },
        data: {
          slug: dto.slug ?? undefined,
          title: dto.title ?? undefined,
          bodyJson: dto.bodyJson ? (dto.bodyJson as Prisma.InputJsonValue) : undefined,
          status: dto.status ?? undefined,
          publishedAt:
            dto.status === PageStatus.PUBLISHED
              ? new Date()
              : dto.status === PageStatus.DRAFT
                ? null
                : undefined,
        },
      });

      await this.syncAssetReferences(AssetResourceType.PAGE, pageId, assetIds, tx);

      return updated;
    });
  }

  async publishPage(pageId: string) {
    return this.prisma.page.update({
      where: { id: pageId },
      data: { status: PageStatus.PUBLISHED, publishedAt: new Date() },
    });
  }

  async unpublishPage(pageId: string) {
    return this.prisma.page.update({
      where: { id: pageId },
      data: { status: PageStatus.DRAFT, publishedAt: null },
    });
  }

  async getPublicPage(slug: string) {
    const page = await this.prisma.page.findUnique({
      where: { slug },
    });
    if (!page || page.status !== PageStatus.PUBLISHED) {
      throw new NotFoundException({
        code: 'CMS_PAGE_NOT_FOUND',
        message: 'Page not found.',
      });
    }
    return page;
  }

  async getPublicContent(keys?: string[]) {
    const configKeys = this.resolveAllowedKeys('CMS_PUBLIC_KEYS', keys);
    const configs = await this.getPublishedConfigs(configKeys);
    const banners = await this.listActiveBanners();
    const pages = await this.listPublicPages();

    return {
      cmsVersion: this.computeCmsVersion(configs),
      configs,
      banners,
      pages,
      generatedAt: new Date().toISOString(),
    };
  }

  async getStudentContent(keys?: string[]) {
    const configKeys = this.resolveAllowedKeys('CMS_STUDENT_KEYS', keys);
    const configs = await this.getPublishedConfigs(configKeys);
    const banners = await this.listActiveBanners();
    const announcements = await this.listActiveAnnouncements();
    const sections = await this.resolveHomeSections();

    return {
      cmsVersion: this.computeCmsVersion(configs),
      configs,
      banners,
      announcements,
      homeSections: sections,
      generatedAt: new Date().toISOString(),
    };
  }

  private async getPublishedConfigs(keys?: string[]) {
    const where = {
      status: CmsConfigStatus.PUBLISHED,
      key: keys?.length ? { in: keys } : undefined,
    };

    const configs = await this.prisma.appConfig.findMany({
      where,
      orderBy: [{ key: 'asc' }, { version: 'desc' }],
    });

    const latestByKey = new Map<string, (typeof configs)[number]>();
    for (const config of configs) {
      if (!latestByKey.has(config.key)) {
        latestByKey.set(config.key, config);
      }
    }

    return Array.from(latestByKey.values());
  }

  private computeCmsVersion(configs: { version: number; publishedAt?: Date | null }[]) {
    const maxVersion = configs.reduce((max, item) => Math.max(max, item.version), 0);
    const maxPublishedAt = configs.reduce<Date | null>((current, item) => {
      if (!item.publishedAt) return current;
      if (!current || item.publishedAt > current) {
        return item.publishedAt;
      }
      return current;
    }, null);
    return {
      version: maxVersion,
      publishedAt: maxPublishedAt?.toISOString() ?? null,
    };
  }

  private resolveAllowedKeys(envKey: 'CMS_PUBLIC_KEYS' | 'CMS_STUDENT_KEYS', requested?: string[]) {
    const raw = this.configService.get<string>(envKey);
    if (!raw || raw.trim() === '*' || raw.trim() === '') {
      return requested && requested.length ? requested : undefined;
    }

    const allowed = raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    if (envKey === 'CMS_STUDENT_KEYS' && !allowed.includes('app.languages')) {
      allowed.push('app.languages');
    }

    if (!requested || requested.length === 0) {
      return allowed;
    }

    return requested.filter((key) => allowed.includes(key));
  }

  private async listActiveBanners() {
    const now = new Date();
    return this.prisma.banner.findMany({
      where: {
        isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private async listActiveAnnouncements() {
    const now = new Date();
    return this.prisma.announcement.findMany({
      where: {
        isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private async listPublicPages() {
    return this.prisma.page.findMany({
      where: { status: PageStatus.PUBLISHED },
      orderBy: { publishedAt: 'desc' },
      select: { id: true, slug: true, title: true, publishedAt: true },
    });
  }

  private async resolveHomeSections() {
    const sections = await this.prisma.homeSection.findMany({
      where: { isActive: true },
      orderBy: { orderIndex: 'asc' },
    });

    const resolved: Array<Awaited<ReturnType<CmsService['resolveHomeSection']>>> = [];
    for (const section of sections) {
      const resolvedSection = await this.resolveHomeSection(section);
      resolved.push(resolvedSection);
    }

    return resolved;
  }

  private async resolveHomeSection(section: {
    id: string;
    type: string;
    configJson: Prisma.JsonValue;
  }) {
    const config = (section.configJson ?? {}) as Record<string, unknown>;
    const type = section.type.toUpperCase();

    if (type === 'NOTES') {
      const subjectId = config.subjectId as string | undefined;
      const topicId = config.topicId as string | undefined;
      const noteIds = Array.isArray(config.noteIds) ? (config.noteIds as string[]) : undefined;
      const limit = typeof config.limit === 'number' ? config.limit : 12;

      const notes = await this.prisma.note.findMany({
        where: {
          isPublished: true,
          subjectId: subjectId ?? undefined,
          topics: topicId ? { some: { topicId } } : undefined,
          id: noteIds?.length ? { in: noteIds } : undefined,
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          subjectId: true,
          title: true,
          description: true,
          isPremium: true,
          pageCount: true,
          publishedAt: true,
        },
      });

      return { ...section, resolved: { items: notes } };
    }

    if (type === 'TOPICS') {
      const subjectId = config.subjectId as string | undefined;
      const topics = await this.prisma.topic.findMany({
        where: { isActive: true, subjectId: subjectId ?? undefined },
        orderBy: { orderIndex: 'asc' },
      });

      return { ...section, resolved: { items: topics } };
    }

    if (type === 'SUBJECTS') {
      const subjects = await this.prisma.subject.findMany({
        where: { isActive: true },
        orderBy: { orderIndex: 'asc' },
      });
      return { ...section, resolved: { items: subjects } };
    }

    if (type === 'TESTS') {
      const subjectId = config.subjectId as string | undefined;
      const limit = typeof config.limit === 'number' ? config.limit : 10;
      const now = new Date();
      const tests = await this.prisma.test.findMany({
        where: {
          isPublished: true,
          subjectId: subjectId ?? undefined,
          OR: [{ startsAt: null }, { startsAt: { lte: now } }],
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          subjectId: true,
          title: true,
          description: true,
          type: true,
          startsAt: true,
          endsAt: true,
          publishedAt: true,
        },
      });

      return { ...section, resolved: { items: tests } };
    }

    return { ...section, resolved: { items: [] } };
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

  private async validateAssets(assetIds: string[], tx: PrismaService | Prisma.TransactionClient = this.prisma) {
    if (assetIds.length === 0) {
      return;
    }

    const assets = await tx.fileAsset.findMany({ where: { id: { in: assetIds } } });
    if (assets.length !== assetIds.length) {
      throw new BadRequestException({
        code: 'CMS_ASSET_INVALID',
        message: 'One or more assets are invalid.',
      });
    }

    assets.forEach((asset) => {
      if (!asset.confirmedAt) {
        throw new BadRequestException({
          code: 'CMS_ASSET_NOT_CONFIRMED',
          message: 'Asset must be confirmed before use.',
        });
      }
    });
  }

  private async syncAssetReferences(
    resourceType: AssetResourceType,
    resourceId: string,
    assetIds: string[],
    tx: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    await tx.assetReference.deleteMany({
      where: { resourceType, resourceId },
    });

    if (assetIds.length === 0) {
      return;
    }

    await tx.assetReference.createMany({
      data: assetIds.map((assetId) => ({
        assetId,
        resourceType,
        resourceId,
      })),
      skipDuplicates: true,
    });
  }
}
