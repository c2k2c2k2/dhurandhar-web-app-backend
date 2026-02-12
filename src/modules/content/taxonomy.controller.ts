import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { TaxonomyService, type SubjectTopicTree } from './taxonomy.service';

@ApiTags('taxonomy')
@Controller('taxonomy')
export class TaxonomyController {
  constructor(private readonly taxonomyService: TaxonomyService) {}

  @Public()
  @Get('tree')
  getTree(): Promise<SubjectTopicTree[]> {
    return this.taxonomyService.getTree();
  }
}
