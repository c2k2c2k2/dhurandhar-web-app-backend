# Authentication

**Strategy**
1. JWT access + refresh tokens for microservices readiness.
2. Provider-agnostic Auth Adapter interface for future IdP migration.
3. Single users table with `type=STUDENT|ADMIN`.

**Core endpoints**
1. `POST /auth/register` for students.
2. `POST /auth/login` for students and admins.
3. `POST /auth/refresh` for token rotation.
4. `POST /auth/logout` to revoke session.
5. `GET /auth/me` returns current user.

**Refresh rotation**
1. Create `RefreshSession` model with hashed token, user agent, ip, revocation, replacedBySessionId.
2. Revoke old session and create new on refresh.
3. Add `GET /auth/sessions` for current user.

**Guards and decorators**
1. `JwtAuthGuard` attaches `req.user` with userId, type, roles.
2. `@CurrentUser()` decorator.
3. `@Public()` decorator to bypass auth.

**Password and OTP**
1. Bcrypt for password hashing.
2. OTP request/verify endpoints for login or reset.
3. Password reset via token and email.

**Future migration readiness**
1. Implement `IAuthSessionService.validateRequest`.
2. Implement `IAuthTokenService.issueTokens`.
3. Keep domain tables keyed by internal `users.id` only.
