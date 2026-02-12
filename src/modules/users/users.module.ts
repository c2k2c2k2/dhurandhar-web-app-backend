import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AdminAuditController } from './admin-audit.controller';
import { AdminAuditAliasController } from './admin-audit-alias.controller';
import { AuditService } from './audit.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [PrismaModule, AuthModule, AuthorizationModule],
  controllers: [UsersController, AdminAuditController, AdminAuditAliasController],
  providers: [UsersService, AuditService],
})
export class UsersModule {}
