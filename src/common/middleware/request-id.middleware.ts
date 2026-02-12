import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  constructor(private readonly configService: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const headerName = this.configService.get<string>('REQUEST_ID_HEADER') ?? 'X-Request-Id';
    const existing = req.header(headerName);
    const requestId = existing ?? randomUUID();

    req.requestId = requestId;
    res.setHeader(headerName, requestId);

    next();
  }
}
