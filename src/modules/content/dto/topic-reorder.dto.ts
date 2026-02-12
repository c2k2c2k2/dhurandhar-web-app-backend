import { IsArray, IsInt, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class TopicOrderItemDto {
  @IsString()
  id!: string;

  @IsInt()
  orderIndex!: number;
}

export class TopicReorderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TopicOrderItemDto)
  items!: TopicOrderItemDto[];
}
