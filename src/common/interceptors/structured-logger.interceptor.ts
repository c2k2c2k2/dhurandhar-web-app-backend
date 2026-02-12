import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, catchError, tap, throwError } from 'rxjs';

@Injectable()
export class StructuredLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger(StructuredLoggerInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();

    const startedAt = Date.now();
    const requestId = request.requestId;
    const method = request.method;
    const path = request.originalUrl ?? request.url;
    const ip = request.ip;
    const userAgent = request.get('user-agent');

    return next.handle().pipe(
      tap(() => {
        const durationMs = Date.now() - startedAt;
        this.logger.log(
          JSON.stringify({
            type: 'http_request',
            requestId,
            method,
            path,
            statusCode: response.statusCode,
            durationMs,
            ip,
            userAgent,
          }),
        );
      }),
      catchError((error: { status?: number; message?: string }) => {
        const durationMs = Date.now() - startedAt;
        this.logger.error(
          JSON.stringify({
            type: 'http_error',
            requestId,
            method,
            path,
            statusCode: error?.status ?? 500,
            durationMs,
            ip,
            userAgent,
            message: error?.message,
          }),
        );
        return throwError(() => error);
      }),
    );
  }
}
