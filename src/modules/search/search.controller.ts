import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { seconds, Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators';
import { SearchQueryDto } from './dto';
import { SearchService } from './search.service';

const SEARCH_THROTTLE_LIMIT = Number(process.env.SEARCH_THROTTLE_LIMIT ?? 60);

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Public()
  @Get()
  @Throttle({ default: { limit: SEARCH_THROTTLE_LIMIT, ttl: seconds(60) } })
  search(@Query() query: SearchQueryDto) {
    return this.searchService.searchPublic(query);
  }
}
