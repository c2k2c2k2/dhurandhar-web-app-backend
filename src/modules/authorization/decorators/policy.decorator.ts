import { applyDecorators, SetMetadata } from '@nestjs/common';

export const POLICY_KEY = 'policyKey';
export const POLICY_OPTIONS_KEY = 'policyOptions';

export const Policy = (policyKey: string, options?: Record<string, unknown>) => {
  if (options) {
    return applyDecorators(
      SetMetadata(POLICY_KEY, policyKey),
      SetMetadata(POLICY_OPTIONS_KEY, options),
    );
  }

  return SetMetadata(POLICY_KEY, policyKey);
};
