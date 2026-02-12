import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId = request.requestId;
    const timestamp = new Date().toISOString();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'HTTP_500';
    let message = 'Internal server error';
    let details: unknown = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = `HTTP_${status}`;
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (exceptionResponse && typeof exceptionResponse === 'object') {
        const responseBody = exceptionResponse as Record<string, unknown>;
        if (Array.isArray(responseBody.message)) {
          message = 'Validation failed';
        } else if (typeof responseBody.message === 'string') {
          message = responseBody.message;
        } else if (exception.message) {
          message = exception.message;
        }
        if (typeof responseBody.code === 'string') {
          code = responseBody.code;
        }
        details = responseBody;
      } else if (exception.message) {
        message = exception.message;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const payload = {
      code,
      message,
      details,
      requestId,
      timestamp,
    };

    this.logger.error(JSON.stringify({ ...payload, status }));

    response.status(status).json(payload);
  }
}
