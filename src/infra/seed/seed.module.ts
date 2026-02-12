import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { SeedService } from './seed.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [SeedService],
})
export class SeedModule {}
