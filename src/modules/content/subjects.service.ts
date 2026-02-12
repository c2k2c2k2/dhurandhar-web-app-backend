import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { SubjectCreateDto, SubjectUpdateDto } from './dto';

@Injectable()
export class SubjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async listSubjects() {
    return this.prisma.subject.findMany({
      where: { isActive: true },
      orderBy: { orderIndex: 'asc' },
    });
  }

  async createSubject(dto: SubjectCreateDto) {
    const exists = await this.prisma.subject.findUnique({ where: { key: dto.key } });
    if (exists) {
      throw new BadRequestException({
        code: 'SUBJECT_KEY_EXISTS',
        message: 'Subject key already exists.',
      });
    }

    return this.prisma.subject.create({
      data: {
        key: dto.key,
        name: dto.name,
        isActive: dto.isActive ?? true,
        orderIndex: dto.orderIndex ?? 0,
      },
    });
  }

  async updateSubject(subjectId: string, dto: SubjectUpdateDto) {
    const subject = await this.prisma.subject.findUnique({ where: { id: subjectId } });
    if (!subject) {
      throw new NotFoundException({
        code: 'SUBJECT_NOT_FOUND',
        message: 'Subject not found.',
      });
    }

    return this.prisma.subject.update({
      where: { id: subjectId },
      data: {
        name: dto.name ?? undefined,
        isActive: dto.isActive ?? undefined,
        orderIndex: dto.orderIndex ?? undefined,
      },
    });
  }
}
