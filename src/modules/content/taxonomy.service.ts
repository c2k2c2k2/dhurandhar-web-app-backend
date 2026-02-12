import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface TopicNode {
  id: string;
  name: string;
  subjectId: string;
  parentId?: string | null;
  orderIndex: number;
  children: TopicNode[];
}

export interface SubjectTopicTree {
  id: string;
  key: string;
  name: string;
  orderIndex: number;
  topics: TopicNode[];
}

@Injectable()
export class TaxonomyService {
  constructor(private readonly prisma: PrismaService) {}

  async getTree(): Promise<SubjectTopicTree[]> {
    const subjects = await this.prisma.subject.findMany({
      where: { isActive: true },
      orderBy: { orderIndex: 'asc' },
    });

    const topics = await this.prisma.topic.findMany({
      where: { isActive: true },
      orderBy: { orderIndex: 'asc' },
    });

    const topicMap = new Map<string, TopicNode>();
    topics.forEach((topic) => {
      topicMap.set(topic.id, {
        id: topic.id,
        name: topic.name,
        subjectId: topic.subjectId,
        parentId: topic.parentId,
        orderIndex: topic.orderIndex,
        children: [],
      });
    });

    const rootsBySubject = new Map<string, TopicNode[]>();
    subjects.forEach((subject) => rootsBySubject.set(subject.id, []));

    topicMap.forEach((node) => {
      if (node.parentId && topicMap.has(node.parentId)) {
        topicMap.get(node.parentId)?.children.push(node);
      } else {
        const list = rootsBySubject.get(node.subjectId);
        if (list) {
          list.push(node);
        }
      }
    });

    const sortTree = (nodes: TopicNode[]) => {
      nodes.sort((a, b) => a.orderIndex - b.orderIndex);
      nodes.forEach((node) => sortTree(node.children));
    };

    rootsBySubject.forEach((nodes) => sortTree(nodes));

    return subjects.map((subject) => ({
      id: subject.id,
      key: subject.key,
      name: subject.name,
      orderIndex: subject.orderIndex,
      topics: rootsBySubject.get(subject.id) ?? [],
    }));
  }
}
