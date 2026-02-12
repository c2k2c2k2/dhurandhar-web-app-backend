import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { FilesModule } from '../files/files.module';
import { PaymentsModule } from '../payments/payments.module';
import { AdminNotesController } from './admin-notes.controller';
import { NoteAccessService } from './note-access.service';
import { NoteProgressService } from './note-progress.service';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuthModule,
    AuthorizationModule,
    FilesModule,
    PaymentsModule,
  ],
  controllers: [NotesController, AdminNotesController],
  providers: [NotesService, NoteAccessService, NoteProgressService],
  exports: [NotesService],
})
export class NotesModule {}
