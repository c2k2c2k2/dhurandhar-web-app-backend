import { IsObject, IsString } from 'class-validator';

export class AppConfigCreateDto {
  @IsString()
  key!: string;

  @IsObject()
  configJson!: Record<string, unknown>;
}
