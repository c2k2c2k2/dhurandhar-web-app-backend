import { IsOptional, IsString } from 'class-validator';
import { SearchQueryDto } from './search-query.dto';

export class AdminSearchQueryDto extends SearchQueryDto {
  @IsOptional()
  @IsString()
  isPublished?: string;
}
