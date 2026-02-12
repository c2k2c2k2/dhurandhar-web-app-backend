import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AssetResourceType, Prisma } from '@prisma/client';
import {
  CreateNoteDto,
  NoteQueryDto,
  NoteSecurityQueryDto,
  NoteSecuritySummaryQueryDto,
  UpdateNoteDto,
} from './dto';

type PrismaWriter = PrismaService | Prisma.TransactionClient;

@Injectable()
export class NotesService {
  constructor(private readonly prisma: PrismaService) {}

  async createNote(userId: string, dto: CreateNoteDto) {
    const subject = await this.assertSubjectExists(dto.subjectId);
    const topics = await this.validateTopics(dto.subjectId, dto.topicIds ?? []);
    const searchText = this.buildSearchText(
      dto.title,
      dto.description,
      subject.name,
      topics.map((topic) => topic.name),
    );

    const note = await this.prisma.note.create({
      data: {
        subjectId: dto.subjectId,
        createdByUserId: userId,
        title: dto.title,
        description: dto.description,
        isPremium: dto.isPremium ?? false,
        isPublished: false,
        fileAssetId: dto.fileAssetId,
        pageCount: dto.pageCount,
        searchText,
      },
    });

    if (topics.length) {
      await this.prisma.noteTopic.createMany({
        data: topics.map((topic) => ({ noteId: note.id, topicId: topic.id })),
      });
    }

    if (dto.fileAssetId) {
      await this.createAssetReference(dto.fileAssetId, note.id);
    }

    await this.refreshNoteSearchVector(note.id);

    return note;
  }

  async updateNote(noteId: string, dto: UpdateNoteDto) {
    const note = await this.prisma.note.findUnique({ where: { id: noteId } });
    if (!note) {
      throw new NotFoundException({
        code: 'NOTE_NOT_FOUND',
        message: 'Note not found.',
      });
    }

    const subject = await this.assertSubjectExists(note.subjectId);
    const resolvedTopics = dto.topicIds
      ? await this.validateTopics(note.subjectId, dto.topicIds)
      : await this.getNoteTopics(noteId);
    const searchText = this.buildSearchText(
      dto.title ?? note.title,
      dto.description ?? note.description ?? '',
      subject.name,
      resolvedTopics.map((topic) => topic.name),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.note.update({
        where: { id: noteId },
        data: {
          title: dto.title ?? undefined,
          description: dto.description ?? undefined,
          isPremium: dto.isPremium ?? undefined,
          isPublished: dto.isPublished ?? undefined,
          fileAssetId: dto.fileAssetId ?? undefined,
          pageCount: dto.pageCount ?? undefined,
          searchText,
        },
      });

      if (dto.topicIds) {
        await tx.noteTopic.deleteMany({ where: { noteId } });
        if (resolvedTopics.length) {
          await tx.noteTopic.createMany({
            data: resolvedTopics.map((topic) => ({ noteId, topicId: topic.id })),
          });
        }
      }

      if (dto.fileAssetId) {
        await tx.assetReference.deleteMany({
          where: { resourceType: AssetResourceType.NOTE, resourceId: noteId },
        });
        await this.createAssetReference(dto.fileAssetId, noteId, tx);
      }

      await this.refreshNoteSearchVector(noteId, tx);
    });

    return this.prisma.note.findUnique({ where: { id: noteId }, include: { topics: true } });
  }

  async publishNote(noteId: string) {
    return this.prisma.note.update({
      where: { id: noteId },
      data: { isPublished: true, publishedAt: new Date() },
    });
  }

  async unpublishNote(noteId: string) {
    return this.prisma.note.update({
      where: { id: noteId },
      data: { isPublished: false, publishedAt: null },
    });
  }

  async listAdminNotes(query: NoteQueryDto) {
    const where = {
      subjectId: query.subjectId ?? undefined,
      isPublished: query.isPublished ? query.isPublished === 'true' : undefined,
      isPremium: query.isPremium ? query.isPremium === 'true' : undefined,
      topics: query.topicId ? { some: { topicId: query.topicId } } : undefined,
    };

    return this.prisma.note.findMany({
      where,
      include: { topics: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async listNotes(query: NoteQueryDto) {
    const where = {
      isPublished: true,
      subjectId: query.subjectId ?? undefined,
      isPremium: query.isPremium ? query.isPremium === 'true' : undefined,
      topics: query.topicId ? { some: { topicId: query.topicId } } : undefined,
    };

    return this.prisma.note.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
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
  }

  async listSecuritySignals(query: NoteSecurityQueryDto) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);

    const where = {
      noteId: query.noteId ?? undefined,
      userId: query.userId ?? undefined,
      signalType: query.signalType ?? undefined,
      createdAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.noteSecuritySignal.count({ where }),
      this.prisma.noteSecuritySignal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          note: { select: { id: true, title: true, subjectId: true } },
          user: { select: { id: true, email: true, fullName: true } },
        },
      }),
    ]);

    return { data, total, page, pageSize };
  }

  async getSecuritySummary(query: NoteSecuritySummaryQueryDto) {
    const parsedLimit = Number(query.limit ?? 5);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 25) : 5;
    const where = {
      createdAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };

    const [total, byType, topUsers, topNotes] = await this.prisma.$transaction([
      this.prisma.noteSecuritySignal.count({ where }),
      this.prisma.noteSecuritySignal.groupBy({
        by: ['signalType'],
        where,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      this.prisma.noteSecuritySignal.groupBy({
        by: ['userId'],
        where: { ...where, userId: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit,
      }),
      this.prisma.noteSecuritySignal.groupBy({
        by: ['noteId'],
        where,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit,
      }),
    ]);

    const userIds = topUsers.map((item) => item.userId).filter((id): id is string => !!id);
    const noteIds = topNotes.map((item) => item.noteId);

    const [users, notes] = await Promise.all([
      userIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, email: true, fullName: true },
          })
        : Promise.resolve([]),
      noteIds.length
        ? this.prisma.note.findMany({
            where: { id: { in: noteIds } },
            select: { id: true, title: true, subjectId: true },
          })
        : Promise.resolve([]),
    ]);

    const userMap = new Map(users.map((user) => [user.id, user] as const));
    const noteMap = new Map(notes.map((note) => [note.id, note] as const));

    return {
      total,
      byType: byType.map((item) => ({
        signalType: item.signalType,
        count:
          typeof item._count === 'object' && item._count
            ? (item._count.id ?? 0)
            : 0,
      })),
      topUsers: topUsers.map((item) => ({
        userId: item.userId,
        count:
          typeof item._count === 'object' && item._count
            ? (item._count.id ?? 0)
            : 0,
        user: item.userId ? userMap.get(item.userId) ?? null : null,
      })),
      topNotes: topNotes.map((item) => ({
        noteId: item.noteId,
        count:
          typeof item._count === 'object' && item._count
            ? (item._count.id ?? 0)
            : 0,
        note: noteMap.get(item.noteId) ?? null,
      })),
    };
  }

  async getUserSecurityProfile(userId: string, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 100);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        type: true,
        status: true,
        lastLoginAt: true,
        lastActiveAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
    }

    const [signals, activeSessions, activeBans, totalSignals] = await this.prisma.$transaction([
      this.prisma.noteSecuritySignal.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take,
        include: { note: { select: { id: true, title: true } } },
      }),
      this.prisma.noteViewSession.findMany({
        where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
        take,
        include: { note: { select: { id: true, title: true } } },
      }),
      this.prisma.noteAccessBan.findMany({
        where: { userId, revokedAt: null },
        include: { note: { select: { id: true, title: true } } },
      }),
      this.prisma.noteSecuritySignal.count({ where: { userId } }),
    ]);

    return {
      user,
      summary: {
        totalSignals,
        activeSessions: activeSessions.length,
        activeBans: activeBans.length,
      },
      signals,
      activeSessions,
      activeBans,
    };
  }

  async bulkPublish(noteIds: string[], publish: boolean) {
    const uniqueIds = Array.from(new Set(noteIds.filter(Boolean)));
    if (uniqueIds.length === 0) {
      throw new BadRequestException({
        code: 'NOTE_BULK_EMPTY',
        message: 'No notes provided for bulk publish.',
      });
    }
    if (uniqueIds.length > 50) {
      throw new BadRequestException({
        code: 'NOTE_BULK_LIMIT',
        message: 'Bulk publish limit is 50 notes.',
      });
    }

    const data = publish
      ? { isPublished: true, publishedAt: new Date() }
      : { isPublished: false, publishedAt: null };

    const result = await this.prisma.note.updateMany({
      where: { id: { in: uniqueIds } },
      data,
    });

    return { count: result.count };
  }

  async getNote(noteId: string, allowUnpublished = false) {
    const note = await this.prisma.note.findUnique({
      where: { id: noteId },
      include: { topics: true, subject: true },
    });

    if (!note || (!allowUnpublished && !note.isPublished)) {
      throw new NotFoundException({
        code: 'NOTE_NOT_FOUND',
        message: 'Note not found.',
      });
    }

    return note;
  }

  async getNotesTree() {
    const subjects = await this.prisma.subject.findMany({
      where: { isActive: true },
      orderBy: { orderIndex: 'asc' },
    });

    const topics = await this.prisma.topic.findMany({
      where: { isActive: true },
      orderBy: { orderIndex: 'asc' },
    });

    const notes = await this.prisma.note.findMany({
      where: { isPublished: true },
      include: { topics: true },
    });

    const notesByTopic = new Map<string, typeof notes>();
    notes.forEach((note) => {
      note.topics.forEach((topic) => {
        if (!notesByTopic.has(topic.topicId)) {
          notesByTopic.set(topic.topicId, []);
        }
        notesByTopic.get(topic.topicId)?.push(note);
      });
    });

    const topicMap = new Map<string, any>();
    topics.forEach((topic) => {
      topicMap.set(topic.id, {
        id: topic.id,
        name: topic.name,
        subjectId: topic.subjectId,
        parentId: topic.parentId,
        orderIndex: topic.orderIndex,
        notes: notesByTopic.get(topic.id) ?? [],
        children: [],
      });
    });

    const rootsBySubject = new Map<string, any[]>();
    subjects.forEach((subject) => rootsBySubject.set(subject.id, []));

    topicMap.forEach((node) => {
      if (node.parentId && topicMap.has(node.parentId)) {
        topicMap.get(node.parentId).children.push(node);
      } else {
        const list = rootsBySubject.get(node.subjectId);
        if (list) list.push(node);
      }
    });

    return subjects.map((subject) => ({
      id: subject.id,
      key: subject.key,
      name: subject.name,
      topics: rootsBySubject.get(subject.id) ?? [],
    }));
  }

  async revokeSessions(noteId: string) {
    await this.prisma.noteViewSession.updateMany({
      where: { noteId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { success: true };
  }

  async revokeSession(sessionId: string) {
    const session = await this.prisma.noteViewSession.findUnique({
      where: { id: sessionId },
      select: { id: true, revokedAt: true },
    });

    if (!session) {
      throw new NotFoundException({
        code: 'NOTE_SESSION_NOT_FOUND',
        message: 'Note session not found.',
      });
    }

    if (session.revokedAt) {
      return { success: true, alreadyRevoked: true };
    }

    await this.prisma.noteViewSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });

    return { success: true };
  }

  async banUser(noteId: string, userId: string, reason?: string) {
    return this.prisma.noteAccessBan.upsert({
      where: { noteId_userId: { noteId, userId } },
      update: { revokedAt: null, reason },
      create: { noteId, userId, reason },
    });
  }

  async unbanUser(noteId: string, userId: string) {
    return this.prisma.noteAccessBan.update({
      where: { noteId_userId: { noteId, userId } },
      data: { revokedAt: new Date() },
    });
  }

  private async assertSubjectExists(subjectId: string) {
    const subject = await this.prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true, name: true },
    });
    if (!subject) {
      throw new NotFoundException({
        code: 'SUBJECT_NOT_FOUND',
        message: 'Subject not found.',
      });
    }
    return subject;
  }

  private async validateTopics(subjectId: string, topicIds: string[]) {
    if (topicIds.length === 0) {
      return [];
    }

    const topics = await this.prisma.topic.findMany({
      where: {
        id: { in: topicIds },
        subjectId,
      },
      select: { id: true, name: true },
    });

    if (topics.length !== topicIds.length) {
      throw new BadRequestException({
        code: 'TOPIC_INVALID',
        message: 'One or more topics are invalid for this subject.',
      });
    }

    return topics;
  }

  private async getNoteTopics(noteId: string) {
    const links = await this.prisma.noteTopic.findMany({
      where: { noteId },
      include: { topic: { select: { id: true, name: true } } },
    });

    return links.map((link) => link.topic);
  }

  private async createAssetReference(
    fileAssetId: string,
    noteId: string,
    tx: PrismaWriter = this.prisma,
  ) {
    const asset = await tx.fileAsset.findUnique({ where: { id: fileAssetId } });
    if (!asset || !asset.confirmedAt) {
      throw new BadRequestException({
        code: 'FILE_NOT_CONFIRMED',
        message: 'File asset must be confirmed before attaching to a note.',
      });
    }

    await tx.assetReference.create({
      data: {
        assetId: fileAssetId,
        resourceType: AssetResourceType.NOTE,
        resourceId: noteId,
      },
    });
  }

  private buildSearchText(
    title: string,
    description?: string,
    subjectName?: string,
    topicNames: string[] = [],
  ) {
    return [title, description, subjectName, ...topicNames].filter(Boolean).join(' ');
  }

  private async refreshNoteSearchVector(noteId: string, tx: PrismaWriter = this.prisma) {
    await tx.$executeRaw(
      Prisma.sql`UPDATE "Note" SET "searchVector" = to_tsvector('simple', coalesce("searchText", '')) WHERE id = ${noteId}`,
    );
  }
}
