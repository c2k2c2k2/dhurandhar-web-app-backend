import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes } from 'crypto';
import { NoteSecuritySignalType, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MinioService } from '../files/minio.service';
import { EntitlementService } from '../payments/entitlement.service';

@Injectable()
export class NoteAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly minioService: MinioService,
    private readonly entitlementService: EntitlementService,
  ) {}

  async createViewSession(noteId: string, userId: string, meta: { ip?: string; userAgent?: string }) {
    const note = await this.prisma.note.findUnique({
      where: { id: noteId },
    });

    if (!note || !note.isPublished) {
      throw new NotFoundException({
        code: 'NOTE_NOT_FOUND',
        message: 'Note not found.',
      });
    }

    await this.assertNotBanned(noteId, userId);

    if (note.isPremium) {
      const canAccess = await this.entitlementService.canAccessNote(userId, {
        id: note.id,
        subjectId: note.subjectId,
        isPremium: note.isPremium,
        topics: await this.getNoteTopics(note.id),
      });
      if (!canAccess) {
        throw new ForbiddenException({
          code: 'NOTE_PREMIUM_LOCKED',
          message: 'Premium note access denied.',
        });
      }
    }

    const maxSessions = Number(this.configService.get('NOTE_VIEW_MAX_SESSIONS') ?? 2);
    const activeCount = await this.prisma.noteViewSession.count({
      where: {
        noteId,
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (activeCount >= maxSessions) {
      throw new ForbiddenException({
        code: 'NOTE_SESSION_LIMIT',
        message: 'View session limit exceeded.',
      });
    }

    const ttlMinutes = Number(this.configService.get('NOTE_VIEW_SESSION_TTL_MINUTES') ?? 30);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
    const viewToken = randomBytes(32).toString('hex');
    const tokenHash = this.hash(viewToken);
    const watermarkSeed = randomBytes(16).toString('hex');

    const session = await this.prisma.noteViewSession.create({
      data: {
        noteId,
        userId,
        tokenHash,
        watermarkSeed,
        expiresAt,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    return {
      viewToken,
      sessionId: session.id,
      expiresAt,
    };
  }

  async getWatermark(noteId: string, userId: string, token: string, meta: { ip?: string; userAgent?: string }) {
    if (!token) {
      throw new BadRequestException({
        code: 'NOTE_TOKEN_REQUIRED',
        message: 'View token is required.',
      });
    }
    await this.assertNotBanned(noteId, userId);
    const session = await this.validateSession(noteId, userId, token, meta);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
    }

    const payload = {
      displayName: user.fullName ?? user.email,
      maskedEmail: user.email ? this.maskEmail(user.email) : undefined,
      maskedPhone: user.phone ? this.maskPhone(user.phone) : undefined,
      userHash: this.sign(`${user.id}:${user.email}`),
      viewSessionId: session.id,
      watermarkSeed: session.watermarkSeed,
    };

    const signature = this.sign(JSON.stringify(payload));

    return { payload, signature };
  }

  async streamContent(
    noteId: string,
    userId: string,
    token: string,
    meta: { ip?: string; userAgent?: string; range?: string },
  ) {
    if (!token) {
      throw new BadRequestException({
        code: 'NOTE_TOKEN_REQUIRED',
        message: 'View token is required.',
      });
    }
    await this.assertNotBanned(noteId, userId);
    const session = await this.validateSession(noteId, userId, token, meta);

    const note = await this.prisma.note.findUnique({ where: { id: noteId } });
    if (!note || !note.fileAssetId) {
      throw new NotFoundException({
        code: 'NOTE_CONTENT_NOT_FOUND',
        message: 'Note content not found.',
      });
    }

    await this.checkRateLimit(noteId, userId);

    const asset = await this.prisma.fileAsset.findUnique({ where: { id: note.fileAssetId } });
    if (!asset) {
      throw new NotFoundException({
        code: 'FILE_NOT_FOUND',
        message: 'File asset not found.',
      });
    }

    const stat = await this.minioService.statObject(asset.objectKey);
    const size = stat.size;

    const range = meta.range;
    if (!range) {
      const stream = await this.minioService.getObjectStream(asset.objectKey);
      await this.logAccess(noteId, userId, session.id, undefined, undefined, size, meta);
      return {
        stream,
        contentType: asset.contentType,
        contentLength: size,
        statusCode: 200,
      };
    }

    const { start, end } = this.parseRange(range, size);
    const length = end - start + 1;
    const stream = await this.minioService.getPartialObject(asset.objectKey, start, length);

    await this.logAccess(noteId, userId, session.id, start, end, length, meta);

    return {
      stream,
      contentType: asset.contentType,
      contentLength: length,
      statusCode: 206,
      contentRange: `bytes ${start}-${end}/${size}`,
    };
  }

  private async validateSession(noteId: string, userId: string, token: string, meta: { ip?: string; userAgent?: string }) {
    const sessions = await this.prisma.noteViewSession.findMany({
      where: {
        noteId,
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (sessions.length === 0) {
      throw new ForbiddenException({
        code: 'NOTE_SESSION_INVALID',
        message: 'View session is invalid or expired.',
      });
    }
    const session = sessions.find((item) => this.compare(token, item.tokenHash));
    if (!session) {
      throw new ForbiddenException({
        code: 'NOTE_SESSION_INVALID',
        message: 'View session token invalid.',
      });
    }

    if (session.ip && meta.ip && session.ip !== meta.ip) {
      await this.logSecuritySignal(noteId, userId, NoteSecuritySignalType.TOKEN_REUSE, {
        ip: meta.ip,
      });
    }

    if (session.userAgent && meta.userAgent && session.userAgent !== meta.userAgent) {
      await this.logSecuritySignal(noteId, userId, NoteSecuritySignalType.TOKEN_REUSE, {
        userAgent: meta.userAgent,
      });
    }

    await this.prisma.noteViewSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });

    return session;
  }

  private async checkRateLimit(noteId: string, userId: string) {
    const limit = Number(this.configService.get('NOTE_ACCESS_RATE_LIMIT') ?? 60);
    const windowSeconds = Number(this.configService.get('NOTE_ACCESS_RATE_WINDOW_SECONDS') ?? 120);
    const since = new Date(Date.now() - windowSeconds * 1000);

    const count = await this.prisma.noteAccessLog.count({
      where: { noteId, userId, createdAt: { gt: since } },
    });

    if (count >= limit) {
      await this.logSecuritySignal(noteId, userId, NoteSecuritySignalType.RATE_LIMIT, {
        count,
        windowSeconds,
      });
      throw new ForbiddenException({
        code: 'NOTE_RATE_LIMIT',
        message: 'Note access rate limit exceeded.',
      });
    }
  }

  private parseRange(range: string, size: number) {
    const match = /bytes=(\d+)-(\d+)?/.exec(range);
    if (!match) {
      throw new BadRequestException({
        code: 'NOTE_RANGE_INVALID',
        message: 'Invalid range header.',
      });
    }

    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : Math.min(start + 1024 * 1024, size - 1);

    if (start >= size || end >= size) {
      throw new BadRequestException({
        code: 'NOTE_RANGE_INVALID',
        message: 'Range out of bounds.',
      });
    }

    return { start, end };
  }

  private async logAccess(
    noteId: string,
    userId: string,
    sessionId: string,
    rangeStart: number | undefined,
    rangeEnd: number | undefined,
    bytesSent: number,
    meta: { ip?: string; userAgent?: string },
  ) {
    await this.prisma.noteAccessLog.create({
      data: {
        noteId,
        userId,
        viewSessionId: sessionId,
        rangeStart,
        rangeEnd,
        bytesSent,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    await this.detectRangeScrape(noteId, userId);
  }

  private async logSecuritySignal(
    noteId: string,
    userId: string | undefined,
    signalType: NoteSecuritySignalType,
    metaJson?: Record<string, unknown>,
  ) {
    await this.prisma.noteSecuritySignal.create({
      data: {
        noteId,
        userId: userId ?? undefined,
        signalType,
        metaJson: metaJson as Prisma.InputJsonValue | undefined,
      },
    });
  }

  private sign(data: string) {
    const secret = this.configService.get<string>('WATERMARK_SECRET') ?? 'change_me_watermark';
    return createHmac('sha256', secret).update(data).digest('hex');
  }

  private hash(value: string) {
    return this.sign(value);
  }

  private compare(value: string, hash: string) {
    return this.sign(value) === hash;
  }

  private maskEmail(email: string) {
    const [name, domain] = email.split('@');
    if (!name || !domain) {
      return email;
    }
    return `${name[0]}***@${domain}`;
  }

  private maskPhone(phone: string) {
    if (phone.length < 4) {
      return '****';
    }
    return `${'*'.repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`;
  }

  private async assertNotBanned(noteId: string, userId: string) {
    const ban = await this.prisma.noteAccessBan.findUnique({
      where: { noteId_userId: { noteId, userId } },
    });

    if (ban && !ban.revokedAt) {
      throw new ForbiddenException({
        code: 'NOTE_ACCESS_BANNED',
        message: 'Access to this note has been revoked.',
      });
    }
  }

  async revokeUserSessions(noteId: string, userId: string) {
    const result = await this.prisma.noteViewSession.updateMany({
      where: { noteId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { success: true, revoked: result.count };
  }

  private async getNoteTopics(noteId: string) {
    return this.prisma.noteTopic.findMany({
      where: { noteId },
    });
  }

  private async detectRangeScrape(noteId: string, userId: string) {
    const windowSeconds = 60;
    const since = new Date(Date.now() - windowSeconds * 1000);
    const recent = await this.prisma.noteAccessLog.findMany({
      where: { noteId, userId, createdAt: { gt: since } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    if (recent.length < 4) {
      return;
    }

    const sorted = [...recent].reverse();
    const sequential = sorted.every((log, index) => {
      if (index === 0) return true;
      const prev = sorted[index - 1];
      if (prev.rangeEnd == null || log.rangeStart == null) return false;
      return log.rangeStart === prev.rangeEnd + 1;
    });

    if (sequential) {
      await this.logSecuritySignal(noteId, userId, NoteSecuritySignalType.RANGE_SCRAPE, {
        count: recent.length,
        windowSeconds,
      });
    }
  }
}
