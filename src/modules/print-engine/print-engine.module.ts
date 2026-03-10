import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { FilesModule } from '../files/files.module';
import { AdminPrintController } from './admin-print.controller';
import { PrintJobsConsumer } from './print-jobs.consumer';
import { PrintEngineController } from './print-engine.controller';
import { PrintEngineService } from './print-engine.service';
import { PRINT_QUEUE_NAME } from './print-queue.constants';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    FilesModule,
    AuthModule,
    AuthorizationModule,
    BullModule.registerQueue({ name: PRINT_QUEUE_NAME }),
  ],
  controllers: [PrintEngineController, AdminPrintController],
  providers: [PrintEngineService, PrintJobsConsumer],
})
export class PrintEngineModule {}
