import { type CurrentUserPayload } from '../common/decorators/current-user.decorator';

declare global {
  namespace Express {
    interface Request {
      user?: CurrentUserPayload;
      requestId?: string;
      permissions?: Set<string>;
    }
  }
}

export {};
