import { UserType } from '@prisma/client';

export interface IAuthTokenService {
  issueTokens(
    userId: string,
    type: UserType,
    roles?: string[],
  ): Promise<{ accessToken: string; refreshToken: string; sessionId: string }>;
}
