import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AdminSearchQueryDto, SearchQueryDto } from './dto';

type NoteSearchRow = {
  id: string;
  title: string;
  description: string | null;
  subjectId: string;
  isPremium: boolean;
  pageCount: number | null;
  publishedAt: Date | null;
  rank: number;
  snippet: string | null;
};

type QuestionSearchRow = {
  id: string;
  subjectId: string;
  topicId: string | null;
  type: string;
  difficulty: string;
  hasMedia: boolean;
  rank: number;
  snippet: string | null;
};

type SearchResult<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
};

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  private readonly maxQueryLength = 120;
  private readonly minQueryLength = 2;
  private readonly maxPageSize = 50;
  private readonly enableTrgm: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.enableTrgm = this.parseBoolean(this.configService.get<string>('ENABLE_PG_TRGM'));
  }

  async onModuleInit(): Promise<void> {
    if (!this.enableTrgm) {
      return;
    }

    try {
      await this.prisma.$executeRaw(
        Prisma.sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`,
      );
      await this.prisma.$executeRaw(
        Prisma.sql`CREATE INDEX IF NOT EXISTS "Note_title_trgm_idx" ON "Note" USING GIN ("title" gin_trgm_ops)`,
      );
      await this.prisma.$executeRaw(
        Prisma.sql`CREATE INDEX IF NOT EXISTS "Note_searchText_trgm_idx" ON "Note" USING GIN ("searchText" gin_trgm_ops)`,
      );
      await this.prisma.$executeRaw(
        Prisma.sql`CREATE INDEX IF NOT EXISTS "Question_searchText_trgm_idx" ON "Question" USING GIN ("searchText" gin_trgm_ops)`,
      );
    } catch (err) {
      this.logger.warn(`pg_trgm enable failed: ${this.formatError(err)}`);
    }
  }

  async searchPublic(query: SearchQueryDto) {
    const term = this.normalizeQuery(query.q);
    const { page, pageSize } = this.resolvePagination(query.page, query.pageSize);
    const type = query.type ?? 'all';

    if (type === 'notes') {
      return {
        query: term,
        notes: await this.searchNotes(term, {
          page,
          pageSize,
          subjectId: query.subjectId,
          topicId: query.topicId,
          isPublished: true,
        }),
      };
    }

    if (type === 'questions') {
      return {
        query: term,
        questions: await this.searchQuestions(term, {
          page,
          pageSize,
          subjectId: query.subjectId,
          topicId: query.topicId,
          isPublished: true,
        }),
      };
    }

    const [notes, questions] = await Promise.all([
      this.searchNotes(term, {
        page,
        pageSize,
        subjectId: query.subjectId,
        topicId: query.topicId,
        isPublished: true,
      }),
      this.searchQuestions(term, {
        page,
        pageSize,
        subjectId: query.subjectId,
        topicId: query.topicId,
        isPublished: true,
      }),
    ]);

    return { query: term, notes, questions };
  }

  async searchAdminNotes(query: AdminSearchQueryDto) {
    const term = this.normalizeQuery(query.q);
    const { page, pageSize } = this.resolvePagination(query.page, query.pageSize);
    const isPublished = this.parseOptionalBoolean(query.isPublished);

    return this.searchNotes(term, {
      page,
      pageSize,
      subjectId: query.subjectId,
      topicId: query.topicId,
      isPublished,
    });
  }

  async searchAdminQuestions(query: AdminSearchQueryDto) {
    const term = this.normalizeQuery(query.q);
    const { page, pageSize } = this.resolvePagination(query.page, query.pageSize);
    const isPublished = this.parseOptionalBoolean(query.isPublished);

    return this.searchQuestions(term, {
      page,
      pageSize,
      subjectId: query.subjectId,
      topicId: query.topicId,
      isPublished,
    });
  }

  private async searchNotes(
    term: string,
    options: {
      page: number;
      pageSize: number;
      subjectId?: string;
      topicId?: string;
      isPublished?: boolean;
    },
  ): Promise<SearchResult<NoteSearchRow>> {
    const useTrigram = term.length < 3;
    if (useTrigram) {
      return this.searchNotesTrigram(term, options);
    }

    const fts = await this.searchNotesFts(term, options);
    if (fts.total === 0) {
      return this.searchNotesTrigram(term, options);
    }

    return fts;
  }

  private async searchQuestions(
    term: string,
    options: {
      page: number;
      pageSize: number;
      subjectId?: string;
      topicId?: string;
      isPublished?: boolean;
    },
  ): Promise<SearchResult<QuestionSearchRow>> {
    const useTrigram = term.length < 3;
    if (useTrigram) {
      return this.searchQuestionsTrigram(term, options);
    }

    const fts = await this.searchQuestionsFts(term, options);
    if (fts.total === 0) {
      return this.searchQuestionsTrigram(term, options);
    }

    return fts;
  }

  private async searchNotesFts(
    term: string,
    options: {
      page: number;
      pageSize: number;
      subjectId?: string;
      topicId?: string;
      isPublished?: boolean;
    },
  ): Promise<SearchResult<NoteSearchRow>> {
    const offset = (options.page - 1) * options.pageSize;
    const tsQuery = Prisma.sql`websearch_to_tsquery('simple', ${term})`;

    const filters: Prisma.Sql[] = [
      Prisma.sql`coalesce(n."searchVector", to_tsvector('simple', coalesce(n."searchText", ''))) @@ q`,
    ];

    if (options.isPublished !== undefined) {
      filters.push(Prisma.sql`n."isPublished" = ${options.isPublished}`);
    }

    if (options.subjectId) {
      filters.push(Prisma.sql`n."subjectId" = ${options.subjectId}`);
    }

    if (options.topicId) {
      filters.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "NoteTopic" nt WHERE nt."noteId" = n.id AND nt."topicId" = ${options.topicId})`,
      );
    }

    const whereClause = Prisma.join(filters, ' AND ');

    const data = await this.prisma.$queryRaw<NoteSearchRow[]>(
      Prisma.sql`
        SELECT
          n.id,
          n.title,
          n.description,
          n."subjectId",
          n."isPremium",
          n."pageCount",
          n."publishedAt",
          ts_rank_cd(coalesce(n."searchVector", to_tsvector('simple', coalesce(n."searchText", ''))), q) AS rank,
          ts_headline('simple', coalesce(n."searchText", ''), q, 'StartSel=<mark>,StopSel=</mark>,MaxWords=20,MinWords=5') AS snippet
        FROM "Note" n,
          ${tsQuery} AS q
        WHERE ${whereClause}
        ORDER BY rank DESC
        LIMIT ${options.pageSize} OFFSET ${offset}
      `,
    );

    const countRows = await this.prisma.$queryRaw<{ total: number }[]>(
      Prisma.sql`
        SELECT COUNT(*)::int AS total
        FROM "Note" n,
          ${tsQuery} AS q
        WHERE ${whereClause}
      `,
    );

    return {
      data,
      total: countRows[0]?.total ?? 0,
      page: options.page,
      pageSize: options.pageSize,
    };
  }

  private async searchQuestionsFts(
    term: string,
    options: {
      page: number;
      pageSize: number;
      subjectId?: string;
      topicId?: string;
      isPublished?: boolean;
    },
  ): Promise<SearchResult<QuestionSearchRow>> {
    const offset = (options.page - 1) * options.pageSize;
    const tsQuery = Prisma.sql`websearch_to_tsquery('simple', ${term})`;

    const filters: Prisma.Sql[] = [
      Prisma.sql`coalesce(qs."searchVector", to_tsvector('simple', coalesce(qs."searchText", ''))) @@ q`,
    ];

    if (options.isPublished !== undefined) {
      filters.push(Prisma.sql`qs."isPublished" = ${options.isPublished}`);
    }

    if (options.subjectId) {
      filters.push(Prisma.sql`qs."subjectId" = ${options.subjectId}`);
    }

    if (options.topicId) {
      filters.push(Prisma.sql`qs."topicId" = ${options.topicId}`);
    }

    const whereClause = Prisma.join(filters, ' AND ');

    const data = await this.prisma.$queryRaw<QuestionSearchRow[]>(
      Prisma.sql`
        SELECT
          qs.id,
          qs."subjectId",
          qs."topicId",
          qs.type,
          qs.difficulty,
          qs."hasMedia",
          ts_rank_cd(coalesce(qs."searchVector", to_tsvector('simple', coalesce(qs."searchText", ''))), q) AS rank,
          ts_headline('simple', coalesce(qs."searchText", ''), q, 'StartSel=<mark>,StopSel=</mark>,MaxWords=20,MinWords=5') AS snippet
        FROM "Question" qs,
          ${tsQuery} AS q
        WHERE ${whereClause}
        ORDER BY rank DESC
        LIMIT ${options.pageSize} OFFSET ${offset}
      `,
    );

    const countRows = await this.prisma.$queryRaw<{ total: number }[]>(
      Prisma.sql`
        SELECT COUNT(*)::int AS total
        FROM "Question" qs,
          ${tsQuery} AS q
        WHERE ${whereClause}
      `,
    );

    return {
      data,
      total: countRows[0]?.total ?? 0,
      page: options.page,
      pageSize: options.pageSize,
    };
  }

  private async searchNotesTrigram(
    term: string,
    options: {
      page: number;
      pageSize: number;
      subjectId?: string;
      topicId?: string;
      isPublished?: boolean;
    },
  ): Promise<SearchResult<NoteSearchRow>> {
    if (!this.enableTrgm) {
      return this.searchNotesLike(term, options);
    }

    const offset = (options.page - 1) * options.pageSize;
    const filters: Prisma.Sql[] = [
      Prisma.sql`(n."title" % ${term} OR coalesce(n."searchText", '') % ${term})`,
    ];

    if (options.isPublished !== undefined) {
      filters.push(Prisma.sql`n."isPublished" = ${options.isPublished}`);
    }

    if (options.subjectId) {
      filters.push(Prisma.sql`n."subjectId" = ${options.subjectId}`);
    }

    if (options.topicId) {
      filters.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "NoteTopic" nt WHERE nt."noteId" = n.id AND nt."topicId" = ${options.topicId})`,
      );
    }

    const whereClause = Prisma.join(filters, ' AND ');

    const data = await this.prisma.$queryRaw<NoteSearchRow[]>(
      Prisma.sql`
        SELECT
          n.id,
          n.title,
          n.description,
          n."subjectId",
          n."isPremium",
          n."pageCount",
          n."publishedAt",
          GREATEST(similarity(n."title", ${term}), similarity(coalesce(n."searchText", ''), ${term})) AS rank,
          ts_headline('simple', coalesce(n."searchText", ''), websearch_to_tsquery('simple', ${term}), 'StartSel=<mark>,StopSel=</mark>,MaxWords=20,MinWords=5') AS snippet
        FROM "Note" n
        WHERE ${whereClause}
        ORDER BY rank DESC
        LIMIT ${options.pageSize} OFFSET ${offset}
      `,
    );

    const countRows = await this.prisma.$queryRaw<{ total: number }[]>(
      Prisma.sql`
        SELECT COUNT(*)::int AS total
        FROM "Note" n
        WHERE ${whereClause}
      `,
    );

    return {
      data,
      total: countRows[0]?.total ?? 0,
      page: options.page,
      pageSize: options.pageSize,
    };
  }

  private async searchNotesLike(
    term: string,
    options: {
      page: number;
      pageSize: number;
      subjectId?: string;
      topicId?: string;
      isPublished?: boolean;
    },
  ): Promise<SearchResult<NoteSearchRow>> {
    const offset = (options.page - 1) * options.pageSize;
    const likeTerm = `%${term}%`;
    const filters: Prisma.Sql[] = [
      Prisma.sql`(n."title" ILIKE ${likeTerm} OR coalesce(n."searchText", '') ILIKE ${likeTerm})`,
    ];

    if (options.isPublished !== undefined) {
      filters.push(Prisma.sql`n."isPublished" = ${options.isPublished}`);
    }

    if (options.subjectId) {
      filters.push(Prisma.sql`n."subjectId" = ${options.subjectId}`);
    }

    if (options.topicId) {
      filters.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "NoteTopic" nt WHERE nt."noteId" = n.id AND nt."topicId" = ${options.topicId})`,
      );
    }

    const whereClause = Prisma.join(filters, ' AND ');

    const data = await this.prisma.$queryRaw<NoteSearchRow[]>(
      Prisma.sql`
        SELECT
          n.id,
          n.title,
          n.description,
          n."subjectId",
          n."isPremium",
          n."pageCount",
          n."publishedAt",
          0.0 AS rank,
          ts_headline('simple', coalesce(n."searchText", ''), websearch_to_tsquery('simple', ${term}), 'StartSel=<mark>,StopSel=</mark>,MaxWords=20,MinWords=5') AS snippet
        FROM "Note" n
        WHERE ${whereClause}
        ORDER BY n."updatedAt" DESC
        LIMIT ${options.pageSize} OFFSET ${offset}
      `,
    );

    const countRows = await this.prisma.$queryRaw<{ total: number }[]>(
      Prisma.sql`
        SELECT COUNT(*)::int AS total
        FROM "Note" n
        WHERE ${whereClause}
      `,
    );

    return {
      data,
      total: countRows[0]?.total ?? 0,
      page: options.page,
      pageSize: options.pageSize,
    };
  }

  private async searchQuestionsTrigram(
    term: string,
    options: {
      page: number;
      pageSize: number;
      subjectId?: string;
      topicId?: string;
      isPublished?: boolean;
    },
  ): Promise<SearchResult<QuestionSearchRow>> {
    if (!this.enableTrgm) {
      return this.searchQuestionsLike(term, options);
    }

    const offset = (options.page - 1) * options.pageSize;
    const filters: Prisma.Sql[] = [
      Prisma.sql`(coalesce(qs."searchText", '') % ${term})`,
    ];

    if (options.isPublished !== undefined) {
      filters.push(Prisma.sql`qs."isPublished" = ${options.isPublished}`);
    }

    if (options.subjectId) {
      filters.push(Prisma.sql`qs."subjectId" = ${options.subjectId}`);
    }

    if (options.topicId) {
      filters.push(Prisma.sql`qs."topicId" = ${options.topicId}`);
    }

    const whereClause = Prisma.join(filters, ' AND ');

    const data = await this.prisma.$queryRaw<QuestionSearchRow[]>(
      Prisma.sql`
        SELECT
          qs.id,
          qs."subjectId",
          qs."topicId",
          qs.type,
          qs.difficulty,
          qs."hasMedia",
          similarity(coalesce(qs."searchText", ''), ${term}) AS rank,
          ts_headline('simple', coalesce(qs."searchText", ''), websearch_to_tsquery('simple', ${term}), 'StartSel=<mark>,StopSel=</mark>,MaxWords=20,MinWords=5') AS snippet
        FROM "Question" qs
        WHERE ${whereClause}
        ORDER BY rank DESC
        LIMIT ${options.pageSize} OFFSET ${offset}
      `,
    );

    const countRows = await this.prisma.$queryRaw<{ total: number }[]>(
      Prisma.sql`
        SELECT COUNT(*)::int AS total
        FROM "Question" qs
        WHERE ${whereClause}
      `,
    );

    return {
      data,
      total: countRows[0]?.total ?? 0,
      page: options.page,
      pageSize: options.pageSize,
    };
  }

  private async searchQuestionsLike(
    term: string,
    options: {
      page: number;
      pageSize: number;
      subjectId?: string;
      topicId?: string;
      isPublished?: boolean;
    },
  ): Promise<SearchResult<QuestionSearchRow>> {
    const offset = (options.page - 1) * options.pageSize;
    const likeTerm = `%${term}%`;
    const filters: Prisma.Sql[] = [
      Prisma.sql`coalesce(qs."searchText", '') ILIKE ${likeTerm}`,
    ];

    if (options.isPublished !== undefined) {
      filters.push(Prisma.sql`qs."isPublished" = ${options.isPublished}`);
    }

    if (options.subjectId) {
      filters.push(Prisma.sql`qs."subjectId" = ${options.subjectId}`);
    }

    if (options.topicId) {
      filters.push(Prisma.sql`qs."topicId" = ${options.topicId}`);
    }

    const whereClause = Prisma.join(filters, ' AND ');

    const data = await this.prisma.$queryRaw<QuestionSearchRow[]>(
      Prisma.sql`
        SELECT
          qs.id,
          qs."subjectId",
          qs."topicId",
          qs.type,
          qs.difficulty,
          qs."hasMedia",
          0.0 AS rank,
          ts_headline('simple', coalesce(qs."searchText", ''), websearch_to_tsquery('simple', ${term}), 'StartSel=<mark>,StopSel=</mark>,MaxWords=20,MinWords=5') AS snippet
        FROM "Question" qs
        WHERE ${whereClause}
        ORDER BY qs."updatedAt" DESC
        LIMIT ${options.pageSize} OFFSET ${offset}
      `,
    );

    const countRows = await this.prisma.$queryRaw<{ total: number }[]>(
      Prisma.sql`
        SELECT COUNT(*)::int AS total
        FROM "Question" qs
        WHERE ${whereClause}
      `,
    );

    return {
      data,
      total: countRows[0]?.total ?? 0,
      page: options.page,
      pageSize: options.pageSize,
    };
  }

  private normalizeQuery(query: string) {
    const term = query?.trim() ?? '';
    if (!term) {
      throw new BadRequestException({
        code: 'SEARCH_QUERY_REQUIRED',
        message: 'Search query is required.',
      });
    }
    if (term.length < this.minQueryLength) {
      throw new BadRequestException({
        code: 'SEARCH_QUERY_TOO_SHORT',
        message: `Search query must be at least ${this.minQueryLength} characters.`,
      });
    }
    if (term.length > this.maxQueryLength) {
      throw new BadRequestException({
        code: 'SEARCH_QUERY_TOO_LONG',
        message: `Search query must be less than ${this.maxQueryLength} characters.`,
      });
    }
    return term;
  }

  private resolvePagination(pageRaw?: string, pageSizeRaw?: string) {
    const page = Math.max(Number(pageRaw ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(pageSizeRaw ?? 20), 1), this.maxPageSize);
    return { page, pageSize };
  }

  private parseOptionalBoolean(value?: string) {
    if (!value) return undefined;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  }

  private parseBoolean(value?: string | boolean) {
    if (typeof value === 'boolean') return value;
    if (!value) return false;
    return value === 'true' || value === '1';
  }

  private formatError(err: any) {
    const message = err?.message ?? String(err);
    return message.length > 500 ? `${message.slice(0, 497)}...` : message;
  }
}
