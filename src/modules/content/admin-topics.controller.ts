import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Policy, RequireUserType } from '../authorization/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { PolicyGuard } from '../authorization/guards';
import { TopicCreateDto, TopicReorderDto, TopicUpdateDto } from './dto';
import { TopicsService } from './topics.service';

@ApiTags('admin-topics')
@ApiBearerAuth()
@Controller('admin/topics')
@UseGuards(JwtAuthGuard, PolicyGuard)
export class AdminTopicsController {
  constructor(private readonly topicsService: TopicsService) {}

  @Post()
  @RequireUserType('ADMIN')
  @Policy('content.manage')
  createTopic(@Body() dto: TopicCreateDto) {
    return this.topicsService.createTopic(dto);
  }

  @Patch(':topicId')
  @RequireUserType('ADMIN')
  @Policy('content.manage')
  updateTopic(@Param('topicId') topicId: string, @Body() dto: TopicUpdateDto) {
    return this.topicsService.updateTopic(topicId, dto);
  }

  @Post('reorder')
  @RequireUserType('ADMIN')
  @Policy('content.manage')
  reorderTopics(@Body() dto: TopicReorderDto) {
    return this.topicsService.reorderTopics(dto);
  }
}
