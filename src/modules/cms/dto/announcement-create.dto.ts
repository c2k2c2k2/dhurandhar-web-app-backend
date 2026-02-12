import { IsBoolean, IsDateString, IsObject, IsOptional, IsString } from 'class-validator';

export class AnnouncementCreateDto {
  @IsString()
  title!: string;

  @IsObject()
  bodyJson!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
