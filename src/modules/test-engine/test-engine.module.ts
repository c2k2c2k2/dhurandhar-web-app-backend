import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { TestEngineController } from './test-engine.controller';
import { TestEngineService } from './test-engine.service';
import { AdminTestsController } from './admin-tests.controller';

@Module({
  imports: [PrismaModule, AuthModule, AuthorizationModule],
  controllers: [TestEngineController, AdminTestsController],
  providers: [TestEngineService],
})
export class TestEngineModule {}
