# Project Decisions and Architecture

**Objective**
Build a production-ready backend API for a competitive-exam learning platform with notes, practice, tests, admin CMS, payments, and anti-piracy protections. Launch with a modular monolith that can later split into services or external IdP.

**Core decisions**
1. Backend: NestJS, modular monolith.
2. Database: PostgreSQL.
3. ORM: Prisma (default). Drizzle only if team strongly prefers SQL-first.
4. Auth: In-app auth for now, designed with provider-agnostic adapter for future IdP (Keycloak/SuperTokens/etc).
5. Authorization: Central policy engine (RBAC + UBAC). Never mix with auth.
6. Payments: PhonePe Standard Checkout, mobile-friendly redirect flow. Verify via Status API; webhook is not sole truth.
7. Storage: MinIO for PDFs and assets, never publicly exposed.
8. Queue: BullMQ + Redis for async jobs (webhooks, print engine, notifications).
9. Anti-piracy: client-side watermark overlay + server-side access controls and logging.
10. Frontend strategy: dynamic CMS-driven content for landing + app home; backend provides resolved sections.

**Design principles**
1. Separate Identity, Authorization, and Domain modules from day one.
2. Provider-agnostic auth adapter interface to enable later IdP migration.
3. JWT access + refresh tokens to be microservices-ready.
4. Centralized PolicyGuard for every route; no ad-hoc role checks.
5. Event-driven and idempotent payments.
6. No direct file URLs; all access through controlled streaming endpoints.

**Milestones**
1. Foundation: project structure, config, logging, DB connectivity, health, Swagger.
2. Auth + Authorization: JWT, refresh rotation, RBAC/UBAC policy guard.
3. Core content: subjects/topics, notes, question bank, tests, practice.
4. Payments: PhonePe flow, entitlements, subscriptions.
5. Anti-piracy: view sessions, watermark, security signals.
6. CMS: dynamic landing/app content.
7. Analytics, print engine, notifications, search.
