import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards';
import { PolicyGuard } from '../authorization/guards';
import { Policy, RequireUserType } from '../authorization/decorators';
import { AdminSearchQueryDto } from './dto';
import { SearchService } from './search.service';

@ApiTags('admin-search')
@ApiBearerAuth()
@Controller('admin/search')
@UseGuards(JwtAuthGuard, PolicyGuard)
export class AdminSearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('notes')
  @RequireUserType('ADMIN')
  @Policy('notes.read')
  searchNotes(@Query() query: AdminSearchQueryDto) {
    return this.searchService.searchAdminNotes(query);
  }

  @Get('questions')
  @RequireUserType('ADMIN')
  @Policy('questions.read')
  searchQuestions(@Query() query: AdminSearchQueryDto) {
    return this.searchService.searchAdminQuestions(query);
  }
}
