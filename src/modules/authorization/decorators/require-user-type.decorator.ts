import { SetMetadata } from '@nestjs/common';

export const REQUIRE_USER_TYPE_KEY = 'requireUserType';

export const RequireUserType = (...userTypes: string[]) =>
  SetMetadata(REQUIRE_USER_TYPE_KEY, userTypes);
