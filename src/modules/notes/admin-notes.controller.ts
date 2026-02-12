import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Audit, CurrentUser } from '../../common/decorators';
import { Policy, RequireUserType } from '../authorization/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { PolicyGuard } from '../authorization/guards';
import {
  CreateNoteDto,
  NoteBulkPublishDto,
  NoteQueryDto,
  NoteSecurityProfileDto,
  NoteSecurityQueryDto,
  NoteSecuritySummaryQueryDto,
  UpdateNoteDto,
} from './dto';
import { NotesService } from './notes.service';

@ApiTags('admin-notes')
@ApiBearerAuth()
@Controller('admin/notes')
@UseGuards(JwtAuthGuard, PolicyGuard)
export class AdminNotesController {
  constructor(private readonly notesService: NotesService) {}

  @Post()
  @RequireUserType('ADMIN')
  @Policy('notes.write')
  @Audit('notes.create', 'Note')
  createNote(@Body() dto: CreateNoteDto, @CurrentUser() user: { userId: string }) {
    return this.notesService.createNote(user.userId, dto);
  }

  @Patch(':noteId')
  @RequireUserType('ADMIN')
  @Policy('notes.write')
  @Audit('notes.update', 'Note')
  updateNote(@Param('noteId') noteId: string, @Body() dto: UpdateNoteDto) {
    return this.notesService.updateNote(noteId, dto);
  }

  @Post(':noteId/publish')
  @RequireUserType('ADMIN')
  @Policy('notes.publish')
  @Audit('notes.publish', 'Note')
  publish(@Param('noteId') noteId: string) {
    return this.notesService.publishNote(noteId);
  }

  @Post(':noteId/unpublish')
  @RequireUserType('ADMIN')
  @Policy('notes.publish')
  @Audit('notes.unpublish', 'Note')
  unpublish(@Param('noteId') noteId: string) {
    return this.notesService.unpublishNote(noteId);
  }

  @Post('bulk-publish')
  @RequireUserType('ADMIN')
  @Policy('notes.publish')
  @Audit('notes.bulk_publish', 'Note')
  bulkPublish(@Body() dto: NoteBulkPublishDto) {
    return this.notesService.bulkPublish(dto.noteIds, true);
  }

  @Post('bulk-unpublish')
  @RequireUserType('ADMIN')
  @Policy('notes.publish')
  @Audit('notes.bulk_unpublish', 'Note')
  bulkUnpublish(@Body() dto: NoteBulkPublishDto) {
    return this.notesService.bulkPublish(dto.noteIds, false);
  }

  @Get()
  @RequireUserType('ADMIN')
  @Policy('notes.read')
  listNotes(@Query() query: NoteQueryDto) {
    return this.notesService.listAdminNotes(query);
  }

  @Get('security-signals')
  @RequireUserType('ADMIN')
  @Policy('security.read')
  listSecuritySignals(@Query() query: NoteSecurityQueryDto) {
    return this.notesService.listSecuritySignals(query);
  }

  @Get('security-summary')
  @RequireUserType('ADMIN')
  @Policy('security.read')
  getSecuritySummary(@Query() query: NoteSecuritySummaryQueryDto) {
    return this.notesService.getSecuritySummary(query);
  }

  @Get('security/users/:userId')
  @RequireUserType('ADMIN')
  @Policy('security.read')
  getUserSecurityProfile(
    @Param('userId') userId: string,
    @Query() query: NoteSecurityProfileDto,
  ) {
    const limit = query.limit ? Number(query.limit) : undefined;
    return this.notesService.getUserSecurityProfile(
      userId,
      Number.isNaN(limit ?? NaN) ? undefined : limit,
    );
  }

  @Post(':noteId/revoke-sessions')
  @RequireUserType('ADMIN')
  @Policy('notes.write')
  @Audit('notes.revoke_sessions', 'Note')
  revokeSessions(@Param('noteId') noteId: string) {
    return this.notesService.revokeSessions(noteId);
  }

  @Post('security/sessions/:sessionId/revoke')
  @RequireUserType('ADMIN')
  @Policy('notes.write')
  @Audit('notes.revoke_session', 'Note')
  revokeSession(@Param('sessionId') sessionId: string) {
    return this.notesService.revokeSession(sessionId);
  }

  @Post(':noteId/ban/:userId')
  @RequireUserType('ADMIN')
  @Policy('notes.write')
  @Audit('notes.ban_user', 'Note')
  banUser(@Param('noteId') noteId: string, @Param('userId') userId: string) {
    return this.notesService.banUser(noteId, userId);
  }

  @Post(':noteId/unban/:userId')
  @RequireUserType('ADMIN')
  @Policy('notes.write')
  @Audit('notes.unban_user', 'Note')
  unbanUser(@Param('noteId') noteId: string, @Param('userId') userId: string) {
    return this.notesService.unbanUser(noteId, userId);
  }
}
