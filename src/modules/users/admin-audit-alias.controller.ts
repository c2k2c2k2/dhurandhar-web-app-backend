import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Policy, RequireUserType } from '../authorization/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { PolicyGuard } from '../authorization/guards';
import { AdminAuditQueryDto } from './dto';
import { AuditService } from './audit.service';

@ApiTags('admin-audit')
@ApiBearerAuth()
@Controller('admin/audit')
@UseGuards(JwtAuthGuard, PolicyGuard)
export class AdminAuditAliasController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequireUserType('ADMIN')
  @Policy('admin.audit.read')
  listAuditLogs(@Query() query: AdminAuditQueryDto) {
    return this.auditService.listAuditLogs(query);
  }
}
