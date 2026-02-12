import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Policy, RequireUserType } from '../authorization/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { PolicyGuard } from '../authorization/guards';
import { SubjectCreateDto, SubjectUpdateDto } from './dto';
import { SubjectsService } from './subjects.service';

@ApiTags('admin-subjects')
@ApiBearerAuth()
@Controller('admin/subjects')
@UseGuards(JwtAuthGuard, PolicyGuard)
export class AdminSubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Post()
  @RequireUserType('ADMIN')
  @Policy('content.manage')
  createSubject(@Body() dto: SubjectCreateDto) {
    return this.subjectsService.createSubject(dto);
  }

  @Patch(':subjectId')
  @RequireUserType('ADMIN')
  @Policy('content.manage')
  updateSubject(@Param('subjectId') subjectId: string, @Body() dto: SubjectUpdateDto) {
    return this.subjectsService.updateSubject(subjectId, dto);
  }
}
