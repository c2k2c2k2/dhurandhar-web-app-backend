import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { CurrentUser, Public } from '../../common/decorators';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../auth/guards';
import { NoteProgressDto, NoteQueryDto } from './dto';
import { NoteAccessService } from './note-access.service';
import { NoteProgressService } from './note-progress.service';
import { NotesService } from './notes.service';

@ApiTags('notes')
@Controller('notes')
export class NotesController {
  constructor(
    private readonly notesService: NotesService,
    private readonly noteAccessService: NoteAccessService,
    private readonly noteProgressService: NoteProgressService,
  ) {}

  @Public()
  @Get()
  listNotes(@Query() query: NoteQueryDto) {
    return this.notesService.listNotes(query);
  }

  @Public()
  @Get('tree')
  getTree() {
    return this.notesService.getNotesTree();
  }

  @Public()
  @Get(':noteId')
  getNote(@Param('noteId') noteId: string) {
    return this.notesService.getNote(noteId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post(':noteId/view-session')
  createViewSession(
    @Param('noteId') noteId: string,
    @CurrentUser() user: { userId: string },
    @Req() req: Request,
  ) {
    return this.noteAccessService.createViewSession(noteId, user.userId, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post(':noteId/view-session/reset')
  resetViewSessions(@Param('noteId') noteId: string, @CurrentUser() user: { userId: string }) {
    return this.noteAccessService.revokeUserSessions(noteId, user.userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get(':noteId/watermark')
  getWatermark(
    @Param('noteId') noteId: string,
    @CurrentUser() user: { userId: string },
    @Query('token') token: string,
    @Req() req: Request,
  ) {
    return this.noteAccessService.getWatermark(noteId, user.userId, token, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  @ApiBearerAuth()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':noteId/content')
  async getContent(
    @Param('noteId') noteId: string,
    @CurrentUser() user: { userId: string } | undefined,
    @Query('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!user?.userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { stream, contentType, contentLength, statusCode, contentRange } =
      await this.noteAccessService.streamContent(noteId, user.userId, token, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        range: req.headers.range,
      });

    res.status(statusCode);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Length', contentLength);
    if (contentRange) {
      res.setHeader('Content-Range', contentRange);
    }

    stream.pipe(res);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post(':noteId/progress')
  updateProgress(
    @Param('noteId') noteId: string,
    @CurrentUser() user: { userId: string },
    @Body() dto: NoteProgressDto,
  ) {
    return this.noteProgressService.updateProgress(noteId, user.userId, dto);
  }
}
