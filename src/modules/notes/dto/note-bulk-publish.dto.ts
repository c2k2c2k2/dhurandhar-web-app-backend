import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsString } from 'class-validator';

export class NoteBulkPublishDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  noteIds!: string[];
}
