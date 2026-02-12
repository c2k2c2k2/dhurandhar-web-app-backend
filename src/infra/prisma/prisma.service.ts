import { INestApplication, Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async enableShutdownHooks(_app: INestApplication): Promise<void> {
    // Prisma library engine no longer supports beforeExit hooks (Prisma >=5).
    // Nest's app.enableShutdownHooks() and onModuleDestroy handle cleanup.
  }
}
