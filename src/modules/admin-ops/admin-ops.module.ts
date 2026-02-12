import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AdminExportsController } from './admin-exports.controller';
import { AdminOpsController } from './admin-ops.controller';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminOpsService } from './admin-ops.service';

@Module({
  imports: [PrismaModule, AuthModule, AuthorizationModule],
  controllers: [AdminOpsController, AdminExportsController, AdminDashboardController],
  providers: [AdminOpsService],
})
export class AdminOpsModule {}
