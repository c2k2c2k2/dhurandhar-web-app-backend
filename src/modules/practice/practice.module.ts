import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { PracticeController } from './practice.controller';
import { PracticeService } from './practice.service';

@Module({
  imports: [PrismaModule, AuthModule, AuthorizationModule],
  controllers: [PracticeController],
  providers: [PracticeService],
})
export class PracticeModule {}
