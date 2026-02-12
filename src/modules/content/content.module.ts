import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AdminSubjectsController } from './admin-subjects.controller';
import { AdminTopicsController } from './admin-topics.controller';
import { SubjectsController } from './subjects.controller';
import { TaxonomyController } from './taxonomy.controller';
import { TopicsController } from './topics.controller';
import { SubjectsService } from './subjects.service';
import { TaxonomyService } from './taxonomy.service';
import { TopicsService } from './topics.service';

@Module({
  imports: [PrismaModule, AuthModule, AuthorizationModule],
  controllers: [
    SubjectsController,
    TopicsController,
    TaxonomyController,
    AdminSubjectsController,
    AdminTopicsController,
  ],
  providers: [SubjectsService, TopicsService, TaxonomyService],
})
export class ContentModule {}
