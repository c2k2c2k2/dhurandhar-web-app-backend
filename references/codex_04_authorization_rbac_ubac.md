# Authorization (RBAC + UBAC)

**Models**
1. Role, Permission, UserRole, RolePermission.
2. Optional: direct UserPermission overrides.
3. AuditLog for admin actions.

**Policy system**
1. `@Policy(policyKey, options?)` decorator.
2. `PolicyGuard` evaluates policy by key.
3. Policy engine supports RBAC checks and UBAC resolvers.

**UBAC hooks**
1. Ownership checks: only own profile/attempts.
2. Entitlement checks: premium notes, tests, practice.
3. Org/branch membership if multi-tenant later.

**Admin protection**
1. Require `type=ADMIN` and permission for `/admin/*` routes.
2. `@RequireUserType('ADMIN')` decorator or integrated guard.

**Seeding**
1. Seed roles: ADMIN_SUPER, ADMIN_CONTENT, ADMIN_TEST, ADMIN_FINANCE, STUDENT.
2. Seed permissions: notes:write/read/publish, questions:crud/publish, tests:crud/publish, users:read/manage, payments:read/refund, admin:config:write, content.manage, analytics.read, security.manage.
3. Seed a superadmin user from env.

**Caching**
1. Cache role/permission lookups per request.
2. Placeholder for Redis cache.
