import { Request } from 'express';

export interface IAuthSessionService {
  validateRequest(
    request: Request,
    options?: { optional?: boolean },
  ): Promise<{ userId: string; type: string; roles: string[]; sid?: string } | undefined>;
}
