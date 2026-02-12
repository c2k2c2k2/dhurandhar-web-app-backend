# Foundation Bootstrap

**Repo and structure**
1. Create NestJS project for modular monolith.
2. Add modules: Auth, Authorization, Users, Admin, Content, Files, Payments, TestEngine, QuestionBank, Practice, PrintEngine, Notifications, CMS, Analytics, Search, Health.
3. Establish clean boundaries: controllers, services, repositories, dto, guards, decorators.

**Infra utilities**
1. ConfigModule with env validation.
2. Global ValidationPipe with whitelist and transform.
3. Global exception filter with consistent error shape.
4. Request-id middleware and structured logger interceptor.
5. Swagger setup with auth placeholder.
6. Health endpoint `/health` with DB readiness placeholder.

**Database and ORM**
1. Integrate Prisma, PrismaModule, and PrismaService shutdown hooks.
2. Add `DATABASE_URL` env and scripts: `prisma generate`, `migrate dev`, `studio`.
3. Add Redis config for queues and rate limiting.

**Security and hygiene**
1. Global rate limiter defaults and per-endpoint throttles later.
2. Max body size limits for large JSON payloads.
3. Standard error response: `{code, message, details, requestId, timestamp}`.
