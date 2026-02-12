import { SetMetadata } from '@nestjs/common';

export const AUDIT_META_KEY = 'auditMeta';

export interface AuditMeta {
  action: string;
  resourceType: string;
}

export const Audit = (action: string, resourceType: string) =>
  SetMetadata(AUDIT_META_KEY, { action, resourceType } satisfies AuditMeta);
