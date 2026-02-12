import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AdminSearchController } from './admin-search.controller';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [PrismaModule, ConfigModule, AuthModule, AuthorizationModule],
  controllers: [SearchController, AdminSearchController],
  providers: [SearchService],
})
export class SearchModule {}
