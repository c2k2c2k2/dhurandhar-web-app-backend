import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { TopicQueryDto } from './dto';
import { TopicsService } from './topics.service';

@ApiTags('topics')
@Controller('topics')
export class TopicsController {
  constructor(private readonly topicsService: TopicsService) {}

  @Public()
  @Get()
  listTopics(@Query() query: TopicQueryDto) {
    return this.topicsService.listTopics(query);
  }
}
