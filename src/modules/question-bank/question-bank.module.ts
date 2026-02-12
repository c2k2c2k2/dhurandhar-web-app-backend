import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AdminQuestionsController } from './admin-questions.controller';
import { QuestionBankService } from './question-bank.service';
import { QuestionsController } from './questions.controller';

@Module({
  imports: [PrismaModule, AuthModule, AuthorizationModule],
  controllers: [AdminQuestionsController, QuestionsController],
  providers: [QuestionBankService],
})
export class QuestionBankModule {}
