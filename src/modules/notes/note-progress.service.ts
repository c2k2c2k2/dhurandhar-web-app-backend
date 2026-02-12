import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { NoteProgressDto } from './dto';

@Injectable()
export class NoteProgressService {
  constructor(private readonly prisma: PrismaService) {}

  async updateProgress(noteId: string, userId: string, dto: NoteProgressDto) {
    return this.prisma.noteProgress.upsert({
      where: { noteId_userId: { noteId, userId } },
      update: {
        lastPage: dto.lastPage ?? undefined,
        completionPercent: dto.completionPercent ?? undefined,
      },
      create: {
        noteId,
        userId,
        lastPage: dto.lastPage ?? undefined,
        completionPercent: dto.completionPercent ?? 0,
      },
    });
  }
}
