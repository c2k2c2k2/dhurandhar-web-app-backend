import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators';
import { JwtAuthGuard } from '../auth/guards';

@ApiTags('student-events')
@ApiBearerAuth()
@Controller('student/events')
@UseGuards(JwtAuthGuard)
export class StudentEventsController {
  @Post()
  recordEvent(
    @CurrentUser() user: { userId: string },
    @Body() payload: Record<string, unknown>,
  ) {
    // Best-effort event intake (no persistence yet).
    return {
      success: true,
      userId: user.userId,
      receivedAt: new Date().toISOString(),
      payload,
    };
  }
}
