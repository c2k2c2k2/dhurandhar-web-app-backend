import { forwardRef, Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { PaymentsModule } from '../payments/payments.module';
import { AuthorizationController } from './authorization.controller';
import { AuthorizationService } from './authorization.service';
import { PolicyGuard } from './guards';
import { PolicyService } from './policy.service';

@Module({
  imports: [PrismaModule, forwardRef(() => PaymentsModule)],
  controllers: [AuthorizationController],
  providers: [AuthorizationService, PolicyService, PolicyGuard],
  exports: [AuthorizationService, PolicyService, PolicyGuard],
})
export class AuthorizationModule {}
