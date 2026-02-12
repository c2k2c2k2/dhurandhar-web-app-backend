import { IsInt, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class HomeSectionOrderItem {
  @IsString()
  id!: string;

  @IsInt()
  orderIndex!: number;
}

export class HomeSectionReorderDto {
  @ValidateNested({ each: true })
  @Type(() => HomeSectionOrderItem)
  items!: HomeSectionOrderItem[];
}
