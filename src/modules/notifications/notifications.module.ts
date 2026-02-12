import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AdminBroadcastsController } from './admin-broadcasts.controller';
import { AdminNotificationsController } from './admin-notifications.controller';
import { NotificationsConsumer } from './notifications.consumer';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    forwardRef(() => AuthModule),
    AuthorizationModule,
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  controllers: [
    NotificationsController,
    AdminNotificationsController,
    AdminBroadcastsController,
  ],
  providers: [NotificationsService, NotificationsConsumer],
  exports: [NotificationsService],
})
export class NotificationsModule {}
