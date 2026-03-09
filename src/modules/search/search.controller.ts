import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { seconds, Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators';
import { SiteSettingsService } from '../site-settings/site-settings.service';
import { SearchQueryDto } from './dto';
import { SearchService } from './search.service';

const SEARCH_THROTTLE_TTL_SECONDS = 60;
const searchThrottleLimit = () =>
  SiteSettingsService.getCachedNumber(
    'SEARCH_THROTTLE_LIMIT',
    Number(process.env.SEARCH_THROTTLE_LIMIT ?? 60),
    {
      integer: true,
      min: 1,
    },
  );

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Public()
  @Get()
  @Throttle({
    default: {
      limit: searchThrottleLimit,
      ttl: seconds(SEARCH_THROTTLE_TTL_SECONDS),
    },
  })
  search(@Query() query: SearchQueryDto) {
    return this.searchService.searchPublic(query);
  }
}
