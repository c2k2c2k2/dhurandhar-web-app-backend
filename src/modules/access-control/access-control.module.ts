import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AdminAccessControlController } from './admin-access-control.controller';
import { AccessControlService } from './access-control.service';

@Module({
  imports: [PrismaModule, AuthModule, AuthorizationModule],
  controllers: [AdminAccessControlController],
  providers: [AccessControlService],
  exports: [AccessControlService],
})
export class AccessControlModule {}
