import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { TopicCreateDto, TopicQueryDto, TopicReorderDto, TopicUpdateDto } from './dto';

@Injectable()
export class TopicsService {
  constructor(private readonly prisma: PrismaService) {}

  async listTopics(query: TopicQueryDto) {
    return this.prisma.topic.findMany({
      where: {
        isActive: true,
        ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      },
      orderBy: { orderIndex: 'asc' },
    });
  }

  async createTopic(dto: TopicCreateDto) {
    const subject = await this.prisma.subject.findUnique({ where: { id: dto.subjectId } });
    if (!subject) {
      throw new NotFoundException({
        code: 'SUBJECT_NOT_FOUND',
        message: 'Subject not found.',
      });
    }

    if (dto.parentId) {
      const parent = await this.prisma.topic.findUnique({ where: { id: dto.parentId } });
      if (!parent || parent.subjectId !== dto.subjectId) {
        throw new BadRequestException({
          code: 'TOPIC_PARENT_INVALID',
          message: 'Parent topic must belong to the same subject.',
        });
      }
    }

    return this.prisma.topic.create({
      data: {
        subjectId: dto.subjectId,
        parentId: dto.parentId ?? undefined,
        name: dto.name,
        isActive: dto.isActive ?? true,
        orderIndex: dto.orderIndex ?? 0,
      },
    });
  }

  async updateTopic(topicId: string, dto: TopicUpdateDto) {
    const topic = await this.prisma.topic.findUnique({ where: { id: topicId } });
    if (!topic) {
      throw new NotFoundException({
        code: 'TOPIC_NOT_FOUND',
        message: 'Topic not found.',
      });
    }

    if (dto.parentId) {
      const parent = await this.prisma.topic.findUnique({ where: { id: dto.parentId } });
      if (!parent || parent.subjectId !== topic.subjectId) {
        throw new BadRequestException({
          code: 'TOPIC_PARENT_INVALID',
          message: 'Parent topic must belong to the same subject.',
        });
      }
      if (parent.id === topicId) {
        throw new BadRequestException({
          code: 'TOPIC_PARENT_SELF',
          message: 'Topic cannot be its own parent.',
        });
      }
      await this.assertNoCycle(topicId, parent.id);
    }

    return this.prisma.topic.update({
      where: { id: topicId },
      data: {
        name: dto.name ?? undefined,
        parentId: dto.parentId ?? undefined,
        isActive: dto.isActive ?? undefined,
        orderIndex: dto.orderIndex ?? undefined,
      },
    });
  }

  private async assertNoCycle(topicId: string, parentId: string) {
    let currentId: string | null = parentId;
    let safety = 0;

    while (currentId) {
      if (currentId === topicId) {
        throw new BadRequestException({
          code: 'TOPIC_PARENT_CYCLE',
          message: 'Parent assignment would create a cycle.',
        });
      }

      const parent = await this.prisma.topic.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });

      currentId = parent?.parentId ?? null;
      safety += 1;
      if (safety > 1000) {
        throw new BadRequestException({
          code: 'TOPIC_PARENT_CYCLE',
          message: 'Parent assignment would create a cycle.',
        });
      }
    }
  }

  async reorderTopics(dto: TopicReorderDto) {
    const updates = dto.items.map((item) =>
      this.prisma.topic.update({
        where: { id: item.id },
        data: { orderIndex: item.orderIndex },
      }),
    );

    await this.prisma.$transaction(updates);

    return { success: true };
  }
}
