import { forwardRef, Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { EntitlementService } from './entitlement.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PlansController } from './plans.controller';
import { AdminPlansController } from './admin-plans.controller';
import { PlansService } from './plans.service';
import { SubscriptionsService } from './subscriptions.service';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PhonepeService } from './phonepe/phonepe.service';
import { PaymentsReconcileService } from './payments.reconcile.service';
import { CouponsService } from './coupons.service';
import { AdminCouponsController } from './admin-coupons.controller';
import { AdminPaymentsController } from './admin-payments.controller';
import { PaymentsAutopayService } from './payments.autopay.service';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    forwardRef(() => AuthModule),
    forwardRef(() => AuthorizationModule),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [
    PaymentsController,
    PlansController,
    AdminPlansController,
    AdminCouponsController,
    AdminPaymentsController,
  ],
  providers: [
    PaymentsService,
    EntitlementService,
    PlansService,
    SubscriptionsService,
    PhonepeService,
    PaymentsReconcileService,
    PaymentsAutopayService,
    CouponsService,
  ],
  exports: [EntitlementService, SubscriptionsService, PlansService, PhonepeService],
})
export class PaymentsModule {}
