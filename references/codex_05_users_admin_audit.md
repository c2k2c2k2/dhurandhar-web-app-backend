# Users, Admin Controls, and Audit

**Users**
1. `GET /users/me` and `PATCH /users/me` for student profile.
2. Admin endpoints: list users with filters, block/unblock.
3. Admin profile view with last activity metadata.

**Audit logging**
1. AuditLog model with actorUserId, action, resourceType, resourceId, metaJson.
2. `@Audit(action, resourceType)` decorator for admin actions.
3. Admin audit log viewer endpoint with filters.

**Support actions**
1. Force logout user (revoke refresh and view sessions).
2. Manual entitlement grant/revoke with reason.
3. Admin user search by status and subscription state.
