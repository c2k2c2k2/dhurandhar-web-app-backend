import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AUDIT_META_KEY, AuditMeta } from '../decorators';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const auditMeta = this.reflector.getAllAndOverride<AuditMeta | undefined>(AUDIT_META_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!auditMeta) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const actorUserId = request.user?.userId;
    const resourceParam =
      request.params?.userId ??
      request.params?.noteId ??
      request.params?.topicId ??
      request.params?.subjectId ??
      request.params?.id ??
      null;
    const resourceId = Array.isArray(resourceParam) ? resourceParam[0] : resourceParam;

    return next.handle().pipe(
      tap(() => {
        void this.prisma.auditLog.create({
          data: {
            actorUserId,
            action: auditMeta.action,
            resourceType: auditMeta.resourceType,
            resourceId: resourceId ?? undefined,
            metaJson: {
              path: request.originalUrl ?? request.url,
              method: request.method,
              requestId: request.requestId,
            } as Prisma.InputJsonValue,
          },
        });
      }),
    );
  }
}
