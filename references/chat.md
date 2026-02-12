This is a copy of a convReersportation conv betwerseaetni (^) onChatGPT & Anonymous.
If I am using nestjs and I want to create a centralize auth
system / service of my entire project using better auth
package.
Here there are two types of users application user and
admin users.
I also want to implement RBAC and UBAC in centralize
manner so that I can control the access on policy level.
I am planning to use sql as database whether mysql or
postgres both are okay. Suggest me the best orm for
this.
There will be payment integrations as well in this
application so the solution should be future and scalable
proof.
Add the missing points and let me know how to achieve
this
Below is a solid, “future-proof” way to do this inNestJSwithBetter Auth+centralized
authorization (RBAC + UBAC/policy checks)+SQL+payments, without painting
yourself into a corner later.

## 1) High-level architecture (what youʼre actually building)

### A. Central Auth service/module (Authentication)

```
Better Authas the source of truth for:
users, sessions, password/social login, etc.
session resolution (cookie-based or token-based)
Expose asingle auth entryin your backend:
/api/auth/* handler mounted in NestJS (Better Auth supports node handlers;
NestJS integration exists)
```
### B. Central Authorization layer (RBAC + UBAC)

Better Auth handles _who you are_ (authentication).
Your app needs a consistent way to decide _what you can do_ (authorization).


So you add anAuthorizationModulein NestJS that supports:

RBAC: roles → permissions
UBAC(often means user-based / ownership-based checks): “user can only access
their own records”
(Optionally)ABAC-stylechecks: conditions based on attributes (orgId, branchId,
plan, feature flags, etc.)
This is enforced inone placevia:
decorators (@Policy(...),@Roles(...))
a single Guard (or Interceptor) that evaluates policies
a policy engine + adapters to fetch “facts” (ownership/org membership)

## 2) Two user types (application users + admin users): best practice

You have two clean options. Pick one:

### Option 1 (recommended):Single users table, user “domain/type” + roles

```
users.type = 'APP' | 'ADMIN'
Admins just get admin-scoped roles/permissions.
Pros: simplest, one identity, shared sessions, easiest for “admin acts on behalf of
user” flows.
Cons: you must be strict with policies (admin routes must require admin privileges).
```
### Option 2: Separate user stores

app_users and admin_users separated.
Pros: stronger separation.
Cons: more complexity (two auth configs or custom user model mapping), cross-
domain features become harder.
In most real SaaS apps,Option 1 wins for speed + maintainability.

## 3) Database choice: MySQL vs Postgres

If “future + scalable + payments + policy-heavy backend” is the goal:

### ✅ PreferPostgreSQL

```
Better fit for:
```

richer constraints, transactions, indexing options
JSONB for “policy context” / metadata when needed
reporting & complex queries that usually appear later
Better Auth supports both Postgres and MySQL (either via drivers or ORM adapters).

## 4) Best ORM for this setup (and why)

Better Auth hasbuilt-in adapters for Prisma and Drizzle.

### Recommendation

✅ If you want maximum long-term productivity + team velocity:Prisma + Postgres
Strong schema/migrations, great DX, excellent for product apps.
Easy to integrate with NestJS.
Plays nicely with payment workflows (lots of relational operations, idempotency
records, ledger tables, etc.).

✅ If you want more SQL control + performance tuning + “backend engineer
feel”:Drizzle + Postgres
Very good if your team likes SQL and tighter runtime control.
Slightly more manual than Prisma, but very solid.

Avoid as “best default” in 2026 for _new_ NestJS builds:
TypeORM (works, but usually not the best default for future-proofing unless youʼre
already deep into it)

## 5) Implementing Better Auth in NestJS (centralized)

### Core setup

Create auth.ts (Better Auth instance)
UsePrisma adapterorDrizzle adapter
Generate/migrate schema with Better Auth CLI
Better Auth supports DB configuration for Postgres/MySQL and adapters for
Prisma/Drizzle.

### NestJS integration


Better Auth has a NestJS integration guide and community-maintained libraries to
mount handlers/guards cleanly.

Key point:your NestJS app should exposeoneauth route group like /api/auth/*, and
your frontend(s) (student app + admin panel) use the same auth service.

## 6) Centralized RBAC + UBAC (policy-level control)

### A. Data model youʼll want (simple and scalable)

Minimum:
roles (e.g., ADMIN_SUPER, ADMIN_STAFF, STUDENT, TEACHER)
permissions (e.g., course:create, course:read, payment:refund)
role_permissions join
user_roles join
(optional) user_permissions for exceptions (direct grants/denies)
(optional) orgs, org_memberships if multi-tenant / branch based
Better Auth has anOrganizationplugin conceptually helpful if youʼre doing org/team
membership.

### B. Enforcement pattern in NestJS (what you actually code)

1. AuthGuard: resolves session/user using Better Auth (attach req.user)
2. PolicyGuard: evaluates _policies_ :
    RBAC check (role → permission)
    UBAC checks (ownership / same org / assigned counselor / same branch)
3. Controller usage:
    @Policy('student.read', { ownerParam: 'studentId' })
    @Policy('admin.users.manage')

### C. UBAC examples (common in your type of app)

“Student can only read their own profile”
“Staff can read students assigned to their center”
“Admin can do anything in their org, but not other orgs”
“Refunds require ADMIN_FINANCE role + transaction age < 24 h”
That last one is exactly why apolicy engineis worth it.

### D. Policy engine choice (practical)


If you truly want “policy-level centralized control”, donʼt hardcode everything in
decorators.

Two practical routes:

CASL(abilities in code, very NestJS-friendly)
Casbin / Oso(externalized policies; stronger “policy as data” story)
If you want admin-panel-driven policy edits later,Casbin/Oso styleusually scales
better.

(You can start with CASL-style in code, then migrate to externalized policies later if
needed.)

## 7) Payments: missing things you should plan now

Payments add “systems” concerns more than “ORM” concerns. Donʼt skip these:

### Must-haves

Webhook processing(Stripe/Razorpay/etc.)
verify signatures
store raw event payload (auditable)
process asynchronously (queue)
Idempotency
table payment_events with unique constraints on provider_event_id
Ledger-style records
transactions, refunds, invoices, credits
Authorization around payments
refunds, manual adjustments, invoice regeneration should be strict policy-
gated
Multi-environment
separate keys + webhook endpoints per env
Audit logs
who did what (especially in admin panel)
This is where Postgres + Prisma/Drizzle both do great—just make sure your design is
event-driven and idempotent.


## 8) Concrete “Plan of Action” (step-by-step)

1. Pick Postgres
2. Pick ORM:
    default:Prisma
    if SQL-centric team:Drizzle
3. Implement Better Auth:
    auth.ts with^ Prisma/Drizzle^ adapter
    mount /api/auth/* in NestJS
    run Better Auth CLI generate/migrate
4. Implement AuthorizationModule:
    tables for roles/permissions/user_roles
       PolicyGuard + decorators
    “policy context” resolvers (ownership/org checks)
5. Split route domains cleanly:
    /admin/* controllers^ must^ require^ admin^ policy
    app routes require user policy
6. Add Payments module:
    webhook controller + signature verification
    queue worker for processing
    idempotency + ledger tables
    strict policies on sensitive actions
7. Add audit logging + rate limiting for auth endpoints

## My direct recommendations (so you can decide fast)

DB:PostgreSQL
ORM:Prisma (unless you strongly prefer SQL-first → Drizzle)
Auth:Better Auth + NestJS integration guide
Authorization:NestJS PolicyGuard approach + RBAC tables + UBAC ownership
checks (optionally add Casbin/Oso later)
Payments:event-driven + idempotent + audited + policy-gated
If you want, I can draft theexact DB schema (roles/permissions/user_roles + org
memberships)and theNestJS guard/decorator structurein a way that fits your


```
Sources
```
“student app + admin panel” layout.

```
is there any other option better than better-auth?
```
Yes—depending on what you mean by “better”, there arestrong alternativestoBetter
Auth. The best choice comes down to whether you want:
alibrary you own(runs inside your NestJS app), or
adedicated Identity Provider (IdP)(self-hosted or SaaS), or
“roll-your-own” with Passport (not recommended for your scope unless you already
have deep auth expertise).
Also note:Auth.jsis now part of Better Auth(so itʼs not really a separate alternative
anymore).

## Options that can be “better” than Better Auth (by category)

### 1) Best if you want a true centralized auth service (enterprise-

### grade):Keycloak

What it is:Full IdP (SSO, OIDC/OAuth2, user management, MFA, realms/tenants,
groups, roles).
Why it can be better:Itʼs built to be acentral auth serverfor multiple
apps/services (exactly your “centralized system” goal).
Tradeoff:More ops/config than an in-app library; youʼll integrate via OIDC in
NestJS.
If you expect multiple apps, admin portals, mobile apps, or future third-party
integrations, Keycloak is often the most future-proof.

(Referenced as a top open-source auth tool in 2026 lists.)

### 2) Best if you want a modern, headless “auth platform” you can self-

### host:Ory(Ory Kratos+Ory Hydra)

```
What it is:
Kratos = identity + login/registration flows
```

```
Hydra = OAuth2/OIDC provider
Why it can be better:Very powerful, “auth as infrastructure”, clean separation,
scalable. Hydra is positioned for low-latency/high-throughput OAuth/OIDC.
Tradeoff:Itʼs a bigger system (more moving pieces). Great if you want a real IdP but
are okay operating it.
```
### 3) Best “drop-in” SaaS (fastest to ship, least ops):Auth 0 /Clerk/Amazon

### Cognito

Why they can be better:Fast rollout, built-in security features, MFA, social logins,
device flows, dashboards.
Tradeoff:Cost + vendor lock-in, and you still needyour ownRBAC/UBAC policy
layer for app data.
Auth 0 is often highlighted for extensibility via Rules/Hooks/Actions.

### 4) Open-source “auth in your DB” but more “productized” than hand-

### rolling:SuperTokens

What it is:Open-source auth solution you can self-host; provides prebuilt flows,
sessions, etc.
Why it can be better:Middle ground between “library” and “IdP”—more complete
than a small library, less heavy than Keycloak/Ory.
Tradeoff:You still build/own your authorization model (RBAC/UBAC).
(Also commonly listed among top open-source auth tools.)

### 5) If you were thinking “Lucia”: donʼt.

Luciav 3 was planned for deprecation by March 2025 and repositioned as a learning
resource.
So itʼs not a good “future-proof” base for a new project.

## What I would pick for your NestJS centralized auth + RBAC/UBAC +

## payments

### If you wantone centralized auth servicefor everything (best long-term):


```
Sources
```
Keycloak(self-host)
NestJS uses OIDC/JWT validation
Admin panel + student app both use same IdP
Works great with a separate policy engine for RBAC/UBAC

### If you wantfaster and simpler, but still open-source and scalable:

SuperTokens(self-host)
Fewer moving parts than Keycloak/Ory
Good for teams that want speed but still ownership

### If you wantthe fastest time-to-marketand donʼt mind SaaS:

Auth 0 or Clerk
Ship quickly, outsource security hard parts
Keep RBAC/UBAC in your backend policy layer (recommended anyway)

## Important “missing point” regardless of which auth you choose

Do NOT mix authentication with authorization.
Even if an IdP provides “roles”, youʼll still want acentral policy layerin your NestJS
backend for:
RBAC permissions like course:create
UBAC checks like “can access only own records”
payment actions: refunds/adjustments (audit + policy gating)
That policy layer stays the same whether you use Better Auth, Keycloak, Auth0, etc.

## Bottom line

Better Auth is goodif you want “auth inside your app”.
But if “centralized auth service for the entire system” is the real
goal,KeycloakorOryis often “better” architecturally.
If you want balanced speed + ownership:SuperTokens.
If you tell meself-host vs SaaSand whether you needmulti-tenant
(institutes/branches), Iʼll recommend one option and map the exact NestJS integration
pattern (guards, token validation, session strategy) plus RBAC/UBAC design.


```
is it okay to handle the authentication and authorization
in backend app itself as I'll be going for single backend
as of now for admin as well as the actual application?
I am just starting the project and auth is the entry point of
every project so I was just curious how to get started and
then if the project grows I'll be able to to break this
monolith into microservices as well or even use external
keycloak or any other opensource auth providers like
supertokens, etc
```
Yes—itʼs absolutely okay (and common) to handleauthentication + authorization
inside the backend app itselfwhen youʼre starting with asingle NestJS
backendserving both the app and admin.

The trick is: build it _as if youʼll split it later_ , so you donʼt weld auth/authorization deep
into business code.

Hereʼs the approach that keeps you fastnowand gives you clean exit paths
tomicroservicesorexternal IdP(Keycloak/SuperTokens/Auth0/etc.) later.

## What to do now (monolith) so you can evolve later

### 1) Separate “Identity” from “App domain” from day 1

Even in one repo, keep these boundaries:
Identity/Auth(login, sessions/tokens, password reset, MFA later)
Authorization(RBAC/permissions + UBAC/policies)
Domain modules(students, courses, payments, etc.)
In NestJS terms:
AuthModule (authentication)
AuthorizationModule (policies/permissions)
UsersModule (your app user profile, not auth mechanics)
domain modules
This separation is what lets you later replace the auth provider without rewriting all
controllers/services.


### 2) Use “provider-agnostic” user identity in your DB

Whatever you use today (Better Auth / custom / Passport), store and pass around a
stable identifier like:
user.id (UUID)
user.type = APP | ADMIN
user.status (active, blocked)
user.orgId (if youʼll ever be multi-tenant)
user.createdAt
Important:Donʼt let “auth provider internal IDs” leak into your domain tables.
If later you move to Keycloak, you map Keycloak subject (sub) → your users.id.

### 3) Choose a token/session strategy that supports future microservices

If you plan to split into services later, choose one of these early:

Option A (best for microservices later):JWT access token + refresh token
Resource services validate JWT locally (no network call).
Refresh token rotation happens in auth module/service.
Works great when you later externalize to Keycloak/Auth0.

Option B (simpler monolith now):Server-side sessions (cookies)
Very convenient for web apps.
But for microservices later, youʼll either:
centralize session validation (shared session store), or
migrate to JWT.
Recommendation for you:JWT + refresh token (even in monolith) if microservices is
likely.

### 4) Treat authorization as your long-term “core”, not authentication

Auth provider can change later. Your policies should not.

Implement:

```
RBAC(role → permission)
UBAC(ownership/org membership checks)
```

A single NestJS mechanism to enforce it:
@Policy('student.read')
@Policy('payment.refund')
PolicyGuard evaluates.
Later, whether the caller is authenticated by Better Auth, Keycloak, or SuperTokens,
your req.user contains:
userId
type
roles
orgId
...and the policies keep working.

## How to design it so switching to Keycloak/SuperTokens later is easy

### Build an “Auth Adapter” interface now

In code, your app should depend on an interface like:
IAuthSessionService.validateRequest(req) -> Principal
IAuthTokenService.issueTokens(userId)
IUserProvisioningService.createOrLinkIdentity(...)
Today you implement it using in-app auth.
Tomorrow you swap it with Keycloak OIDC validation or SuperTokens middleware.

This keeps the migration mostly in AuthModule, not across your entire app.

## Microservices-ready evolution plan (no rewrites)

### Stage 1: Monolith (today)

```
Auth + Authorization inside NestJS
Domain modules call internal services
One DB (Postgres recommended)
```
### Stage 2: Modular monolith

```
Keep modules isolated
Use events internally for cross-domain actions (e.g., “PaymentSucceeded”)
```

### Stage 3: Split “Auth service” first (if needed)

```
Extract AuthModule into a separate service
Domain services validate JWT
Authorization can remain centralized or duplicated as a library
```
### Stage 4: Externalize to IdP (Keycloak/SuperTokens/Auth0)

Replace token issuance/login flows
Keep your policy engine (RBAC/UBAC) in backend
Optionally sync roles/groups from IdP → your DB
This is a very common real-world path.

## Practical starter recommendation for your project

If you want the cleanest start that still scales:

1. Postgres + Prisma (or Drizzle)
2. JWT access + refresh token rotation
3. Auth in backend(Better Auth / SuperTokens / custom Passport) — pick based on
    your speed preference
4. Central PolicyGuardfor RBAC + UBAC
5. Addaudit logsearly (admin actions + payment actions)
If your immediate goal is speed and youʼll likely self-host later:
SuperTokenscan be a great “middle ground”.
If you want minimal moving parts now:
in-app auth (Better Auth or custom) is fine, _as long as you keep boundaries_.

## Key warnings (things that make migrations painful later)

Avoid these early:
Hardcoding role checks in services (if (user.role === 'ADMIN')) everywhere.
Using auth-provider-specific user IDs in your domain tables.
Mixing “who are you?” (auth) with “can you do this?” (policies) in controllers.
Not planning forwebhooks + idempotencyin payments (this becomes security-
critical).


If you tell me which direction you leanright now(in-app auth library vs SuperTokens), Iʼll
give you a concrete NestJS folder/module structure + token strategy + a clean
RBAC/UBAC schema thatʼs migration-friendly.

```
Uploaded a file
If this is my basic project requirement and I want to build
a full proof backend starting with authentication and
authorization module give me plan of action here.
Consider it as client's project which will be going to
production soon and there will be moderate traffic from
launch itself.
I need to make the frontend as dynamic as possible here
so that the admin can change anything on the app easily
from admin panel.
Application user is majorly students who are preparing
from competitive examination we need to build a platform
where they can access the notes on paid subscribtion
basis along with practice questions as well as timely
combined tests.
I am planning to make two repos here one is for frontend
app (landing page + actual application for students) and
admin panel using nextjs
And entire backend api server with nest js with postgres
sql
Hostinger kvm 8 plan will be the server with coolify for
server management
Planning to use minio to store the files.
Let me know if I am missing anything so far and guide me
how can I work on this entire application as we are having
a tight dealine to complete it.
```
Hereʼs aplan of actionto build a production-ready backend (starting fromauth +
authorization) for your academy platform, aligned with the requirements in your doc:
notes library, question bank, subject tests + combined “Mixer” tests, results, admin
CMS, payments, and print-ready PDFs.

Youʼre on the right track with:

```
Project
```

2 repos:Next.js frontend(landing + student app + admin panel) andNestJS
backend
PostgreSQL
Hostinger KVM 8 + Coolify
MinIOfor PDFs/files
Below is what youʼre missing + the full execution sequence.

## What youʼre missing (critical for “moderate traffic from day 1”)

### Infrastructure & reliability

```
Redis(caching + rate-limit + session/token blacklists if needed)
Queue/worker(BullMQ + Redis) for:
PDF “print engine” generation
payment webhook processing
email/OTP/sms jobs
Backups:
Postgres automated backups + restore test
MinIO bucket replication or scheduled snapshots
Observability:
structured logs, error tracking, basic metrics (CPU/RAM, DB, API latency)
CDNfor file delivery (even simple Cloudflare in front helps a lot)
```
### Security & compliance basics

```
Rate-limiting + request validation
Webhook signature verification (payments)
Audit logs for admin actions (content edits, refunds, user changes)
Secrets management (Coolify secrets / env; avoid storing in repo)
```
### Product/ops

```
Email provider (transactional email for OTP/password reset)
A plan forcontent versioning(notes updated, keep previous versions?)
A plan forentitlements(subscription-based access control)
```

## Architecture overview (modular monolith that can split later)

```
Even if you stay monolith now, design modules as if they can become services later:
```
### Backend modules (NestJS)

1. AuthModule(authentication, sessions/tokens)
2. AuthorizationModule(RBAC + UBAC policy engine)
3. UsersModule(students/admin profiles)
4. ContentModule(subjects, notes metadata, categories/tags)
5. QuestionBankModule(questions, options, difficulty, topics)
6. TestEngineModule(attempts, evaluation, results)
7. AdminModule(admin-only orchestration endpoints)
8. PaymentsModule(plans, subscriptions, webhooks, entitlements)
9. FilesModule(MinIO upload, signed URLs, access checks)
10. PrintEngineModule(print-ready PDF generation)

```
This maps exactly to your required Admin and Student features.
```
## Phase-by-phase plan of action (tight deadline friendly)

### Phase 0 — Foundations (Day 1–2)

```
Goal:you can deploy a skeleton and iterate fast.
Repo setup
backend-api (NestJS)
frontend (Next.js: landing + student + admin routes)
CI/CD basics (build + deploy viaCoolify)
Environments:
dev/stage/prod env files and secrets
Infra containers onHostinger:
PostgreSQL
MinIO
Redis
Common NestJS layers:
config module, validation pipe, global exception filter, logger, swagger
health checks /health
```
```
Project
Project
```

Deliverable:deployed “hello world” API + DB connectivity + basic logging.

### Phase 1 — Authentication (Day 2–5)

Goal:login works; everything else builds on this.

Decisions:

UseJWT access + refresh(microservice-friendly later)
Single users table with type = STUDENT | ADMIN
Implement:
Signup/login (student)
Admin creation flow (seed superadmin, invite-based admin creation)
Password reset / OTP (email)
Session security:
refresh token rotation
device/session list + revoke session
Deliverable:students + admins can authenticate; user identity available as req.user.

### Phase 2 — Authorization (RBAC + UBAC) (Day 5–8)

Your doc explicitly needs admin-controlled features + student access control.

So implement authorization early and enforce it everywhere.

RBAC model

roles: ADMIN_SUPER, ADMIN_CONTENT, ADMIN_TEST, ADMIN_FINANCE, STUDENT
permissions: notes:write, questions:write, tests:publish, users:read, pa
yments:refund, etc.
UBAC (policy rules) examples
student can read only:
own profile
allowed notes/tests based on subscription/entitlement
admins can access based on role scope
NestJS enforcement:

```
Project
```

@Policy('notes.create') / @Policy('tests.publish')
PolicyGuard resolves:
RBAC permissions
UBAC conditions (ownership/entitlement)
Deliverable:all routes protected with policies, not ad-hoc checks.

### Phase 3 — “Dynamic app” backend (CMS-style) (Day 8–14)

You want the app to be as dynamic as possible from admin panel. That means:avoid
hardcodinglanding/app content in frontend.

Create “configuration-driven” models:

Subjects, categories
Notes metadata (title, subjectId, tags, isPremium, previewAllowed)
App banners/announcements
Home page sections (order, visibility flags)
Pricing plans (shown to students)
Feature flags (enable/disable modules, e.g., tests during downtime)
Pattern to follow
“Content schema” stored in DB (JSON where appropriate)
Admin APIs mutate it
Frontend consumes it and renders dynamically
Deliverable:admin can rearrange categories/sections and publish content without
redeploying frontend.

### Phase 4 — Notes library + MinIO file pipeline (Day 12–18)

Requirement: upload and categorize PDF notes; students browse/read.

Implement:

```
Admin upload:
generate signed upload URL to MinIO
store metadata in DB
Student access:
```
```
Project
```

authorization check (free/premium)
serve via signed download URL (short expiry)
Optional but useful:
PDF preview pages/thumbnails generation (async job)
file antivirus scan hook (if you want to be extra safe)
Deliverable:PDF notes pipeline complete and scalable.

### Phase 5 — Question bank + Test engine (Day 16–26)

Requirement: question bank, subject tests, combined “Mixer”, results/analytics.

Core entities:

questions (subjectId,^ topicId,^ difficulty,^ correctAnswer,^ explanation)
tests (type: SUBJECT|COMBINED, config JSON)
test_rules for mixer (e.g., 20 maths + 10 history)
attempts (userId, startedAt, submittedAt, answers JSON)
results (score,^ breakdown,^ rank^ if^ needed)
Key system rules:
Immutablepublished tests (copy questions into a snapshot table or version
questions)
Timer handling
Anti-cheat basics (tab switch detection is frontend; backend enforces time window)
Deliverable:students can take tests; admins can publish subject/combine tests.

### Phase 6 — Payments + entitlements (Day 22–30)

Requirement: subscription/access control with gateway like Razorpay/Stripe.

Use a clean “entitlements” model:

```
plans
subscriptions
entitlements (what user can access)
payment_events (idempotency + audit)
```
```
Project
```
```
Project
```

Workflow:

1. student chooses plan → create order/session
2. payment success → webhook comes
3. webhook verified + idempotent processing
4. entitlements granted
5. access checks enforced via PolicyGuard/EntitlementService
Gateway choices:
If India-first:Razorpayis usually easiest.
If global + subscriptions strong:Stripe.
Deliverable:paid subscription unlocks notes/tests reliably, even under retries.

### Phase 7 — Print engine (Day 28–34)

Requirement: print-ready PDFs for papers.

Do this asynchronously:

Admin triggers “generate printable paper”
enqueue job → worker generates PDF
store PDF in MinIO
return download link
Implementation options:
HTML template → headless chromium (playwright) → PDF
Or a PDF library (more work for formatting)
Deliverable:admins can generate printable papers without blocking API.

### Phase 8 — Production hardening (parallel throughout, final 5–7 days)

Checklist:
Rate limiting (especially auth + payment endpoints)
Validation + DTOs everywhere
DB indexes (attempts by userId, tests by publish status, notes by subject)
E 2 E tests for critical flows:
signup/login
subscription purchase + webhook

```
Project
```

test submission
Backups and restore drill
Monitoring and alerts
Admin audit logs
Deliverable:stable launch-ready system.

## Recommended tech choices (for your stack)

```
ORM: Prisma (fast dev, safe migrations) or Drizzle (more SQL control). For tight
deadline, Prisma usually wins.
Redis + BullMQ for jobs
MinIO signed URLs for file upload/download
Cloudflare in front of your domain (CDN + basic protection)
Modular monolith structure in NestJS so you can split later
```
## Deployment layout on KVM 8 (simple but solid)

frontend container^ (Next.js)
backend container (NestJS)
postgres container
redis container
minio container
worker container^ (BullMQ^ consumers^ for^ PDF/webhooks)
All managed via Coolify, with separate staging if possible.

## Final note: you can switch to Keycloak/SuperTokens later

Yes—if you:
keep auth isolated in AuthModule
use provider-agnostic userId in domain tables
enforce access via policy layer (AuthorizationModule)
Then later replacing auth becomes mostly “swap token validation + login flows”, not a
rewrite.


If you want, I can turn this into:

1. aweek-by-week delivery timelinebased on your actual deadline, and
2. aDB schema draft(users/roles/permissions/notes/tests/attempts/subscriptions)
    that matches your requirement doc.
Sources

```
Also we need to consider here the piracy protection of
the notes.
I know it is not possible to prevent it 100 % but can we
take some measures to minimize it and make if way to
difficult for students to take the material out of the
application
like pdf shouldn't be downloadable
there should be realtime watermark so piracy can be
detected later
or any other measures.
I want to do it as much as on client side instead of
changing the pdf on server before serving to the client
application
```
Youʼre thinking in theright direction👍
Youʼre also correct about the uncomfortable truth:you cannot prevent piracy 100 %.
But you _can_ make itpainful, traceable, and risky enoughthat 95 % of users wonʼt even
try—and the remaining 5 % can be identified.

Below is apractical, production-ready anti-piracy strategythat works well
foreducation platforms, keeps most logicclient-side, and fits yourtight timeline.

# The right mindset (very important)

Instead of:

Think:

```
“How do I completely stop piracy?”
```

Your goal is:

1. No raw PDF downloads
2. Strong friction against screenshots / screen recording
3. Real-time, user-specific watermarking
4. Traceability(who leaked it)
5. Legal + behavioral deterrence

# Layered Anti-Piracy Strategy (Best ROI)

## Layer 1 — Never serve PDFs directly ❌📄

This is non-negotiable.

### What NOT to do

```
❌ href="notes.pdf"
❌ direct MinIO signed PDF URLs
❌ iframe pointing to PDF
```
### What to do instead

```
StorePDF only on server (MinIO)
Never expose raw PDF URLs to the browser
Render content using acontrolled viewer
```
### Practical approach

UsePDF.js(or similar)
Load PDF asbinary stream via authenticated API
Render pages into <canvas>
Result:
Browser never “downloads” a PDF
“Save as PDF” becomes impossible
Casual piracy blocked
✅ This alone stops ~70% piracy attempts.

```
“How do I prevent casual piracy and strongly deter intentional piracy?”
```

## Layer 2 — Real-time dynamic watermark (CLIENT-SIDE) 🔥

This is the most important part of your question.

### What watermark should include

Render dynamicallyon top of the content, not inside the PDF:
Student full name
Email / phone (masked partially)
User ID
Date + time
Optional: IP / session ID
Optional: diagonal repeating pattern

### Why client-side overlay is powerful

```
No need to modify PDF on server
Watermark changesevery session
Screenshots/videos always contain identity
Even cropped screenshots usually reveal parts
```
### How to implement (recommended)

PDF pages rendered on <canvas>
Overlay watermark layer:
semi-transparent
diagonal
repeated
animated slightly (slow drift)
Example behaviors:
opacity ~0.1–0.15
random rotation per session
watermark text shifts position every 20–30 seconds
⚠ Important
Do NOT embed watermark into the PDF file itself.
Overlay it at render time.

This keeps your MinIO PDFs clean and reusable.


## Layer 3 — Disable “easy” copying (client-side friction) 🧱

You canʼt stop a determined attacker—but you _can_ block casual misuse.

### Implement:

Disable text selection
Disable right-click
Block copy/paste
Block print shortcuts (Ctrl+P)
Block save shortcuts (Ctrl+S)
Hide context menus
Yes, this can be bypassed by dev tools.
Thatʼs fine—weʼre targeting behavior, not hackers.

## Layer 4 — Screenshot & screen recording deterrence 📵

You cannot fully block screenshots on the web, but you can:

### 1. Detect suspicious behavior

```
Page visibility API (tab switch)
Window blur / focus
Resize anomalies
Frequent zoom changes
```
### 2. Respond intelligently

When detected:
Temporarily blur content
Increase watermark opacity
Show warning banner:

This alone scares most users.

### 3. For mobile apps (future)

If you later wrap with Capacitor:
Android: FLAG_SECURE
iOS: screen capture detection

```
“Unauthorized copying detected. Activity logged.”
```

## Layer 5 — Streaming-like content access (advanced, optional)

Instead of loading the full PDF:
Fetchpage-by-page
Only keep 1–2 pages in memory
Clear canvas on navigation
Result:
DevTools dump wonʼt give the whole document
Memory scraping becomes harder
This is optional but powerful.

## Layer 6 — Session-bound access tokens 🔐

Each note access:
Issueshort-lived access token(2–5 min)
Token bound to:
userId
noteId
sessionId
If token expires:
viewer refreshes token silently
copying network requests becomes useless

## Layer 7 — Forensic watermarking (lightweight version)

Without touching the PDF file, you can still do this:
Slightly vary:
line spacing
letter spacing
page margins
Based on user hash
This createsvisual fingerprintsunique per user.

This is advanced but doable later.


## Layer 8 — Legal + UX deterrents (donʼt skip this)

These matter more than tech.

### In app:

```
Show message before opening notes:
```
### Terms:

```
Explicit anti-piracy clause
Mention watermarking & logging
```
### Admin tooling:

Upload leaked screenshot → search watermark → identify user
Immediate account ban + legal notice (even if symbolic)
Fear + traceability works.

# What NOT to do (common mistakes)

```
❌ Encrypt PDF and send to client (keys leak)
❌ Rely only on “disable download” flags
❌ Server-side watermarking per user per request (slow + costly)
❌ Trying DRM like Widevine for PDFs (overkill, not worth it)
```
# Recommended final stack for notes viewing

Backend
MinIO (raw PDFs only)
API endpoint: stream PDF bytes (authenticated)
Short-lived access tokens
Access logs per note
Frontend (Next.js)
PDF.js rendering to canvas
Watermark overlay layer (React component)

```
“This content is watermarked and traceable to you. Unauthorized sharing may
lead to account termination.”
```

```
Behavior detection hooks
Access token refresh
No raw file URLs ever
```
# Realistic outcome

With this setup:
Casual piracy: ❌ blocked
Screenshot piracy: ✅ traceable
Screen recording: ✅ watermarked
Mass leaks: 🚨 attributable
Honest students: 😌 unaffected
This isexactlywhat most serious ed-tech platforms do.

## If you want next

I can:

1. Design thePDF viewer architecture(component-level)
2. Give youwatermark rendering logic(pseudo-code)
3. DefineAPI contractsfor secure note streaming
4. Help you decidewhen server-side watermarking is worth it
Just tell me what you want to go deep into first.

```
Now you know the entire project.
Give me entire step by step prompts in short blocks or
tasks format so that I can start working on it on very
minute level without missing the important parts.
Consider focusing on development phase here only
deployment will be handled later once the application
runs smoothly on local machines.
I need distinctive approach here for landing page, actual
application frontend, admin panel frontend and entire
backend application.
Maybe I'll use some vibe coding tools to accelerate my
```

```
development speed here. Most probably codex only. So, I
need detailed approach.
Here you can go with app by app one by one so that chat
limits won't exceed and then I can prompt you again to
jump to next app like first landing page, then application,
then admin panel, then backend apis, etc
you can choose what to start first as per development is
concerned
even in backend apis you can split on the basis of groups
of work needs to be done
```
Cool — Iʼll start with theBackend first(because auth + entitlements + content APIs
dictate how fast you can build the student app + admin panel). This will beminute-level
“Codex prompts”you can copy/paste as tasks. Each task is intentionally short and
actionable.

When you say “next”, Iʼll move to the next app (Landing Page → Student App → Admin
Panel), and later backend groups (Notes, Tests, Payments, Print, etc.).

# BACKEND (NestJS + Postgres + MinIO) — Task Prompts

# Set 1

### Goal of this set

Get aproduction-shaped local backendwith:
project skeleton
DB schema baseline
auth (student + admin)
authorization framework (RBAC + policy guard)
foundational utilities (logging, validation, swagger, errors)

## 0) Repo bootstrap + conventions

### TASK B0.1 — Create NestJS project + folder structure

```
Use these prompts one-by-one in Codex.
```

### TASK B0.2 — Add standard infra utilities

## 1) Database & ORM baseline (Prisma + Postgres)

### TASK B1.1 — Setup Prisma + Postgres connection

### TASK B1.2 — Define core auth/user/role schema

### TASK B1.3 — Seed script for initial roles/permissions + superadmin

```
Act as a senior NestJS architect. Create a new NestJS backend project
structure for a modular monolith. Modules required: Auth, Authorization,
Users, Admin, Content, Files, Payments, TestEngine, QuestionBank,
PrintEngine, Health. Use clean architecture boundaries: controllers,
services, repositories, dto, entities (or prisma models), guards,
decorators. Add standard global pipes/filters/interceptors. Use env-
based config with validation. Do not implement business logic yet, only
scaffolding + module wiring.
```
```
Add: ConfigModule (env validation), global ValidationPipe with
whitelist+transform, global exception filter with consistent error
shape, request-id middleware, structured logger interceptor. Add /health
endpoint with basic readiness checks (db later). Add Swagger setup with
auth support placeholder.
```
```
Integrate Prisma ORM in NestJS. Create PrismaModule with PrismaService
(with shutdown hooks). Add .env keys for DATABASE_URL. Add a sample
model and a migration to verify the pipeline. Provide scripts: prisma
generate, migrate dev, studio.
```
```
Design Prisma schema for: - User: id(uuid), email(unique),
phone(optional), name, passwordHash(optional), type(STUDENT|ADMIN),
status(ACTIVE|BLOCKED), createdAt, updatedAt - Role: id, key(unique),
name - Permission: id, key(unique), description - UserRole: userId,
roleId (unique pair) - RolePermission: roleId, permissionId (unique
pair) Also add AuditLog: id, actorUserId, action, resourceType,
resourceId, metaJson, createdAt. Create migrations.
```
```
Create a seed script that: - creates baseline roles: ADMIN_SUPER,
ADMIN_CONTENT, ADMIN_TEST, ADMIN_FINANCE, STUDENT - creates baseline
permissions (grouped): notes:read/write/publish, questions:crud,
tests:crud/publish, users:read/manage, payments:read/refund,
```

## 2) Authentication module (JWT access + refresh)

### TASK B2.1 — Auth module skeleton (register/login/refresh/logout/me)

### TASK B2.2 — Refresh token storage & rotation

### TASK B2.3 — Guards + decorators for current user

## 3) Authorization module (RBAC + Policy Guard + UBAC hooks)

### TASK B3.1 — Authorization service to resolve permissions

### TASK B3.2 — Policy system (decorator + guard)

```
admin:config:write - assigns ADMIN_SUPER to a seeded admin user from env
SUPERADMIN_EMAIL + SUPERADMIN_PASSWORD Make seed idempotent.
```
```
Implement AuthModule with endpoints: POST /auth/register (student) POST
/auth/login (student/admin) POST /auth/refresh POST /auth/logout GET
/auth/me Use JWT access tokens (short TTL) + refresh tokens (long TTL).
Return tokens in httpOnly cookies AND also return in body
(configurable). Use bcrypt for password hashing. Add DTO validation.
```
```
Implement refresh token rotation with DB persistence: Create model
RefreshSession: id, userId, hashedToken, userAgent, ip, createdAt,
revokedAt, replacedBySessionId(optional) On refresh: revoke old session
and create new. On logout: revoke the active session. Add endpoint GET
/auth/sessions to list sessions for current user (admin optional).
```
```
Create JwtAuthGuard to validate access token and attach req.user with:
userId, type, roles (keys), permissions (keys optional). Create
@CurrentUser() decorator. Create @Public() decorator to bypass auth.
Ensure Swagger shows bearer auth.
```
```
Implement AuthorizationModule with service that: - given userId returns
role keys and permission keys - caches results with in-memory cache (or
placeholder for Redis later) - supports direct permission checks Add
repository methods using Prisma with efficient queries.
```
```
Implement a policy-based authorization framework: - @Policy(policyKey,
options?) decorator - PolicyGuard that reads metadata and calls
```

### TASK B3.3 — Admin route protection pattern

## 4) Users module (minimal, but needed for everything)

### TASK B4.1 — Users service + profile endpoints

### TASK B4.2 — Audit logging middleware/helper

## 5) “Dynamic app” config foundation (so frontend can be CMS-driven)

### TASK B5.1 — AppConfig model + endpoints

```
PolicyEngine - PolicyEngine supports: 1) RBAC permission checks
(policyKey maps to required permission) 2) UBAC checks via pluggable
resolvers (ownership, subscription entitlement placeholder) Return 403
with consistent error shape. Provide examples for policies like:
"notes.write", "tests.publish", "payments.refund".
```
```
Implement a pattern for admin-only APIs: - @RequireUserType('ADMIN')
decorator + guard (or integrate into PolicyGuard) Ensure ADMIN routes
require both: type ADMIN + required permission. Create example
AdminController endpoint GET /admin/ping restricted to ADMIN_SUPER.
```
```
Create UsersModule with: GET /users/me -> returns profile PATCH
/users/me -> update name, phone (student) Admin endpoints: GET
/admin/users?type=STUDENT|ADMIN&search=... PATCH /admin/users/:id/status
(block/unblock) All admin endpoints protected by policies.
```
```
Implement audit logging helper: - When admin performs actions (block
user, change config, publish notes/tests), create AuditLog entry. Create
a decorator @Audit(action, resourceType) to help controllers log
actions.
```
```
Create ContentConfigModule (or AppConfigModule) with DB model:
AppConfig: key(unique), valueJson, updatedByUserId, updatedAt Endpoints:
GET /config/public (returns whitelisted public config keys for
landing/app) Admin: GET /admin/config PUT /admin/config/:key (validate
json schema per key - basic) Protect admin endpoints by policy
"admin:config:write".
```

# Stop point (for this message)

If you execute TasksB 0 → B 5 , youʼll have areal foundation:
working auth
admin + student separation
policy enforcement
config system for dynamic frontends
seeds + audit logs

# What Iʼll send next when you say “next”

You can choose what to continue:

### Option A (recommended next): Backend group 2

```
MinIO Files module (secure streaming + signed URLs)
Notes metadata + piracy-friendly viewer pipeline API
Entitlements placeholder (subscription checks)
QuestionBank + Test Engine scaffolding
```
### Option B: Start frontend work

Landing page (CMS-driven)
Student app pages
Admin panel foundations
Just reply with one word:
“next backend”or“start landing”or“start student app”or“start admin panel.”

```
This becomes the backbone for “dynamic landing page + dynamic student app home
+ banners + featured subjects” later.
```
```
next backend
```
Alright —Backend Set 2. This one focuses on the “core monetized value” of your
platform:


MinIO Files module(secure, no direct PDF URLs)
Notes module(metadata + access control + anti-piracy-friendly delivery)
Entitlements module(subscription gating, used by policies)
Question Bank module(CRUD + imports)
Test Engine module(attempts + evaluation + results)
Foundations for Print Engine(async job shape, no deployment yet)
Copy/paste these into Codex one-by-one.

# BACKEND — Task Prompts Set 2 (Files → Notes →

# Entitlements → QBank → Tests)

## 6) Files module (MinIO) — secure pipeline

### TASK B6.1 — MinIO integration + config + bucket bootstrap

### TASK B6.2 — DB models for file assets + ownership metadata

### TASK B6.3 — Admin upload flow (two-step) for PDFs

### TASK B6.4 — Confirm upload endpoint + integrity checks

```
Act as a senior NestJS backend engineer. Implement FilesModule
integrating MinIO. Add config: MINIO_ENDPOINT, MINIO_ACCESS_KEY,
MINIO_SECRET_KEY, MINIO_BUCKET, MINIO_REGION(optional), MINIO_USE_SSL.
Create MinioService with methods: - ensureBucketExists() -
getPresignedPutUrl(objectKey, contentType, expiresSeconds) -
getPresignedGetUrl(objectKey, expiresSeconds, responseHeaders optional)
```
- statObject(objectKey) Do NOT expose MinIO directly to client from
controllers yet. Add a bootstrap hook to ensure bucket exists on app
start in dev.

```
Add Prisma models: FileAsset: id(uuid), objectKey(unique), fileName,
contentType, sizeBytes, checksum(optional), createdByUserId, createdAt
Add indexes and relations to User. Implement FileAssetsRepository and
FileAssetsService CRUD helpers.
```
```
Implement admin endpoints: POST /admin/files/init-upload -> returns
{fileAssetId, objectKey, presignedPutUrl} Body: fileName, contentType,
sizeBytes Validate contentType is application/pdf (for notes). Generate
objectKey like: notes/{yyyy}/{mm}/{uuid}.pdf Create FileAsset row first,
then return presigned PUT URL. Add policy: "notes.write" required.
```

## 7) Entitlements module (subscription gating foundation)

### TASK B7.1 — Entitlement schema (minimal but scalable)

### TASK B7.2 — EntitlementService + helpers for policy checks

### TASK B7.3 — Plug entitlements into PolicyEngine (UBAC hook)

## 8) Notes module (metadata + access + anti-piracy friendly delivery)

### TASK B8.1 — Notes schema + categories/subjects/tags

```
Implement: POST /admin/files/confirm-upload/:fileAssetId This should
call MinIO statObject(objectKey), verify sizeBytes matches, then mark
asset as confirmed (add confirmedAt field). If mismatch, return 400. Add
AuditLog entry.
```
```
Add Prisma models: Plan: id, key(unique), name, pricePaise/int,
durationDays, isActive, createdAt Subscription: id, userId, planId,
status(ACTIVE|EXPIRED|CANCELLED), startsAt, endsAt, createdAt
Entitlement: id, userId, kind(NOTES|TESTS|ALL), scopeJson (e.g.,
subjectIds, noteIds, featureFlags), startsAt, endsAt, createdAt Add
indexes on userId and endsAt.
```
```
Create EntitlementsModule with EntitlementService: -
hasActiveSubscription(userId, now) - canAccessNote(userId, noteId)
(placeholder: checks entitlement kind=NOTES or ALL or noteId in
scopeJson) - canAccessTests(userId) (kind=TESTS or ALL) Return boolean
and also provide a method explainDenyReason() for debugging/admin. No
payment integration yet.
```
```
Extend PolicyEngine: Add UBAC resolver for policies: -
notes.read.premium -> requires EntitlementService.canAccessNote(...) -
tests.attempt -> requires EntitlementService.canAccessTests(...) Make
PolicyGuard able to pass contextual IDs from route params, e.g. noteId,
testId.
```
```
Add Prisma models: Subject: id, key(unique), name, orderIndex, isActive
Note: id(uuid), subjectId, title, description(optional),
isPremium(boolean), isPublished(boolean), fileAssetId,
pageCount(optional), publishedAt(optional), createdByUserId, createdAt,
```

### TASK B8.2 — Admin notes CRUD + publish workflow

### TASK B8.3 — Student notes listing APIs (public + gated)

### TASK B8.4 — Secure “PDF streaming for viewer” endpoint (NO direct PDF

### URL)

### TASK B8.5 — “Viewer session token” endpoint for short-lived access

### TASK B8.6 — Watermark “facts” endpoint (client-side overlay support)

```
updatedAt Tag: id, key(unique), name NoteTag: noteId, tagId (unique
pair) Add indexes: subjectId, isPublished, isPremium.
```
```
Implement AdminNotesController: POST /admin/notes (create draft:
subjectId, title, isPremium, fileAssetId) PATCH /admin/notes/:id (edit
metadata) POST /admin/notes/:id/publish (sets isPublished=true,
publishedAt=now) POST /admin/notes/:id/unpublish GET /admin/notes?
subjectId=&q=&published=&premium= All protected by policies: notes.write
+ notes.publish Add audit logs on create/publish/unpublish.
```
```
Implement NotesController: GET /notes/subjects -> list active subjects
GET /notes?subjectId=&q= -> list published notes with minimal fields GET
/notes/:id -> note details For premium notes, still allow metadata but
do not allow content access without entitlement. Use PolicyGuard for:
notes.read (published) and notes.read.premium for premium content
actions later.
```
```
Implement: GET /notes/:id/content This endpoint must NOT return a MinIO
URL. Instead, stream the PDF bytes from MinIO to the client with: -
Content-Type: application/pdf - Content-Disposition: inline;
filename="..." - Cache-Control: no-store - Accept-Ranges: bytes (support
range requests) Authorization: - note must be published - if
isPremium=true, require entitlement via policy notes.read.premium Also
add access logging: NoteAccessLog {id, userId, noteId, ip, userAgent,
createdAt}
```
```
Implement: POST /notes/:id/view-session Returns short-lived token (e.g.
JWT or random) bound to {userId, noteId, expiresAt, watermarkSeed}.
Client uses it to call /notes/:id/content with header X-View-Token.
Store token hash in DB: NoteViewSession {id, userId, noteId, tokenHash,
expiresAt, revokedAt} Validate on content endpoint in addition to access
JWT. Purpose: makes sharing API calls harder and lets us revoke viewing
sessions.
```

## 9) Question Bank module (practice questions + test composition)

### TASK B9.1 — Question bank schema

### TASK B9.2 — Admin question CRUD + bulk import (JSON)

### TASK B9.3 — Student practice APIs (read-only)

## 10) Test Engine module (subject tests + combined “Mixer”)

### TASK B10.1 — Test schema (supports subject + mixer rules)

```
Implement: GET /notes/:id/watermark Returns: - displayName -
maskedEmail or maskedPhone - userId short hash - issuedAt - sessionId
(view session id) This should require a valid view session token. Do NOT
embed watermark into PDF. This endpoint only gives data for client-side
overlay.
```
```
Add Prisma models: Topic: id, subjectId, name, orderIndex, isActive
Question: id(uuid), subjectId, topicId(optional),
type(MCQ|TRUE_FALSE|NUMERIC), difficulty(EASY|MEDIUM|HARD), statement,
optionsJson(for MCQ), correctAnswerJson, explanation(optional),
isPublished(boolean), createdByUserId, createdAt, updatedAt Add indexes:
subjectId, topicId, difficulty, isPublished.
```
```
Implement AdminQuestionsController: POST /admin/questions PATCH
/admin/questions/:id POST /admin/questions/:id/publish GET
/admin/questions?subjectId=&topicId=&difficulty=&q=&published= POST
/admin/questions/bulk-import (accept array of questions JSON, validate,
insert in transaction, return report) Protect with policy:
questions.crud and questions.publish Audit log create/publish/bulk
import.
```
```
Implement QuestionsController: GET /questions?
subjectId=&topicId=&difficulty= GET /questions/:id Only return published
questions. Protect with auth; optionally gate practice behind
entitlement later.
```
```
Add Prisma models: Test: id(uuid), title, description(optional),
type(SUBJECT|COMBINED|CUSTOM), configJson (durationSec, negativeMarking,
sections, mixerRules), isPublished(boolean), startsAt(optional),
```

### TASK B10.2 — Admin tests CRUD + publish

### TASK B10.3 — Student tests list + start attempt (gated)

### TASK B10.4 — Save answers + submit attempt + evaluation

### TASK B10.5 — Results APIs

## 11) Print Engine foundation (local-only queue shape)

### TASK B11.1 — Queue skeleton (BullMQ) for async jobs

```
endsAt(optional), createdByUserId, createdAt, updatedAt,
publishedAt(optional) TestQuestion (optional): testId, questionId,
orderIndex (unique pair) Attempt: id(uuid), testId, userId, startedAt,
submittedAt(optional), status(IN_PROGRESS|SUBMITTED|EXPIRED),
answersJson, scoreJson(optional), totalScore(optional) AttemptEventLog:
id, attemptId, type(START|SAVE|SUBMIT|EXPIRE), metaJson, createdAt
Indexes on testId, userId, status.
```
```
Implement AdminTestsController: POST /admin/tests (create draft with
configJson) PATCH /admin/tests/:id POST /admin/tests/:id/publish POST
/admin/tests/:id/unpublish GET /admin/tests?type=&published=&q= Policy:
tests.crud + tests.publish. Add audit logs.
```
```
Implement TestsController: GET /tests -> list published tests that are
active in time window (startsAt/endsAt) GET /tests/:id -> details
(excluding correct answers) POST /tests/:id/start -> creates Attempt
with startedAt, status IN_PROGRESS, returns attemptId Authorization:
require auth, and policy tests.attempt (entitlement check placeholder).
Log AttemptEventLog on start.
```
```
Implement: PATCH /attempts/:id/save (partial answersJson merge) POST
/attempts/:id/submit On submit: - validate attempt belongs to user and
is IN_PROGRESS - evaluate answers by loading correct answers for
involved questions - compute score breakdown and totalScore - store
scoreJson + totalScore + submittedAt + status SUBMITTED Return result
summary. Ensure correct answers never leak in test details APIs.
```
```
Implement: GET /attempts/me?testId= GET /attempts/:id (owner only)
Admin: GET /admin/attempts?testId=&userId= Add policies for admin
reads.
```

### TASK B11.2 — Print job APIs scaffold

# Stop point

After Set 2, you will have:
✅ secure MinIO upload
✅ notes publishing +no direct PDF download
✅ entitlement checks integrated into policy system
✅ question bank + test engine end-to-end (basic)
✅ print pipeline skeleton ready for later

## Next choices (tell me what to send next)

Reply with one of these:
“next backend payments”(Razorpay/Stripe webhooks + subscription activation +
idempotency)
“next backend anti-piracy hardening”(range streaming, token binding, access
logs, anomaly detection, watermark seeds)
“start landing”
“start student app”
“start admin panel”

```
Integrate BullMQ with Redis (local). Create QueueModule and a worker
process entrypoint (separate Nest application or standalone bootstrap).
Add queue named "print". Provide simple sample job processor and a
health endpoint for worker. Do not implement PDF generation yet.
```
```
Create PrintEngineModule with: POST /admin/print/tests/:testId ->
enqueue job to generate printable PDF for a test DB model PrintJob: id,
testId, status(QUEUED|RUNNING|DONE|FAILED), outputFileAssetId(optional),
error(optional), createdAt Admin can poll: GET /admin/print/jobs/:id
Protect by policy tests.publish or print.generate (create a
permission).
```
```
are considering the topics as well while considering the
notes handling here?
```

Short answer:yes, topics absolutely should be first-class here, and youʼre right to call
it out 👍
Long answer: we should bevery intentionalabout _how_ topics relate tonotes,
questions, and tests, otherwise the admin UX and student discoverability will get
messy fast.

Let me clarify what we already covered, whatʼs missing, and thecorrect modelI
recommend.

## 1️⃣ What we already have vs whatʼs missing

### Already covered

```
Subjects→ top-level grouping (e.g. Polity, History, Maths)
Notes→ PDFs tied to subjects
Questions→ tied to subjects (and optionally topics)
Tests→ built from questions
```
### Missing / under-specified

Topics as a first-class entity for Notes
Topic hierarchy (optional but very useful)
Consistent taxonomy across Notes, Questions, Tests
Right now, if we donʼt fix this:
Admins will struggle to organize content
Students wonʼt find notes aligned with syllabus
Combined tests wonʼt map cleanly to syllabus coverage
So yes —topics must be considered explicitly for notes handling.

## 2️⃣ Correct content taxonomy (battle-tested for ed-tech)

### Recommended hierarchy

```
Subject
└── Topic
└── SubTopic (optional, can be depth = 1 initially)
├── Notes
```

Examples:

This maps perfectly to:
competitive exam syllabi
admin mental model
student revision flow

## 3️⃣ How Topics should be modeled (DB-level)

### Topic model (shared across notes & questions)

You already saw a Topic model in Question Bank.
Wereuse and extend it, not duplicate.

## 4️⃣ Notes + Topics relationship (VERY IMPORTANT)

### ❌ What NOT to do

```
One note = one topic only
(real notes often cover multiple topics)
```
### ✅ Correct approach

```
├── Questions
└── Test coverage
```
```
Subject: Indian Polity
├── Constitution
│ ├── Fundamental Rights
│ └── Directive Principles
├── Parliament
└── Judiciary
```
```
model Topic { id String @id @default(uuid()) subjectId String parentId
String? // for subtopics (nullable) name String orderIndex Int isActive
Boolean @default(true) subject Subject @relation(fields: [subjectId],
references: [id]) parent Topic? @relation("TopicHierarchy", fields:
[parentId], references: [id]) children Topic[]
@relation("TopicHierarchy") notes Note[] questions Question[] createdAt
DateTime @default(now()) updatedAt DateTime @updatedAt
@@index([subjectId]) @@index([parentId]) }
```

Many-to-manybetween Notes and Topics

This gives you:
one note → multiple topics
one topic → multiple notes
Perfect for revision-focused navigation.

## 5️⃣ Admin UX impact (why this matters a LOT)

With proper topic modeling, admin panel can support:
Subject → Topic tree view
Assign multiple topics to a note
Filter notes by:
subject
topic
subtopic
Analytics:
“Which topics have no notes?”
“Which topics have no tests?”
This is gold for content planning.

## 6️⃣ Student UX impact (this is how students actually think)

Students donʼt think:

They think:

```
model Note { id String @id @default(uuid()) subjectId String title
String description String? isPremium Boolean isPublished Boolean
fileAssetId String createdByUserId String subject Subject fileAsset
FileAsset topics NoteTopic[] createdAt DateTime @default(now())
updatedAt DateTime @updatedAt } model NoteTopic { noteId String topicId
String note Note @relation(fields: [noteId], references: [id]) topic
Topic @relation(fields: [topicId], references: [id]) @@id([noteId,
topicId]) }
```
```
“Show me all PDFs”
```
```
“I needFundamental Rightsnotes”
```

With topics:
Subject → Topic → Notes
Topic-wise progress (“completed notes for this topic”)
Topic-wise practice tests
Topic-wise revision bundles (future)

## 7️⃣ How topics integrate with anti-piracy (nice bonus)

Topics also help withforensic tracing:
Watermark can include:

```
If a screenshot leaks, you know:
exact topic
exact note
exact user
```
## 8️⃣ Updated Notes-related tasks (add these)

### 🔧 ADDITIONAL TASK — Topic management (Admin)

### 🔧 UPDATE TASK — Notes creation

### 🔧 UPDATE TASK — Student notes browsing

```
Subject: Polity
Topic: Fundamental Rights
Note: FR_Complete_Notes.pdf
User: John D
```
```
Implement AdminTopicsController: POST /admin/subjects/:subjectId/topics
PATCH /admin/topics/:id GET /admin/topics?subjectId= Allow parentId to
create subtopics. Support orderIndex for syllabus ordering. Protect with
policy: content.manage.
```
```
Update AdminNotesController: On create/update, accept topicIds[].
Persist via NoteTopic join table. Validate that all topics belong to the
same subject as the note.
```

## 9️⃣ Final recommendation (donʼt skip this)

```
Topics should be:
sharedbetween notes, questions, tests
hierarchical
admin-managed
Add themnow, not later — retrofitting taxonomy is painful.
```
If you want, next I can:
UpdateSet 2 tasksinto aclean v 2 with topics fully wired, or
Jump tostudent app UX flow using topics, or
Startadmin panel UI planning for topics + notes
Just tell me where to go next 👇

```
Update NotesController: GET /notes/tree -> returns subject -> topic ->
notes hierarchy GET /notes?topicId= Optimize queries to avoid N+1.
```
```
Update Set 2 tasks into a clean v 2 with topics fully wired
```
Done — hereʼsBackend Set 2 (v2)withtopics fully wired(hierarchical topics, shared
taxonomy across notes/questions/tests, topic-driven browsing APIs, and validation that
note topics belong to the same subject).

Copy/paste these tasks into Codex sequentially.

# BACKEND — Task Prompts Set 2 (v2)

## (Files → Taxonomy: Subjects/Topics → Notes → Entitlements →

## QBank → Tests → Print)

## 6) Files module (MinIO) — secure pipeline (unchanged)


### TASK B6.1 — MinIO integration + config + bucket bootstrap

### TASK B6.2 — DB models for file assets + ownership metadata

### TASK B6.3 — Admin init upload (two-step)

### TASK B6.4 — Confirm upload

## 7) Taxonomy module — Subjects + hierarchical Topics

## (NEW/UPDATED)

### TASK B7.1 — Subjects schema + admin CRUD

```
Implement FilesModule integrating MinIO with config: MINIO_ENDPOINT,
MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET, MINIO_USE_SSL. Create
MinioService methods: - ensureBucketExists() -
getPresignedPutUrl(objectKey, contentType, expiresSeconds) -
getPresignedGetUrl(objectKey, expiresSeconds, responseHeaders optional)
```
- statObject(objectKey) Add dev bootstrap to ensure bucket exists. No
controllers yet except used by admin upload flow.

```
Add Prisma model: FileAsset: id(uuid), objectKey(unique), fileName,
contentType, sizeBytes, checksum(optional), createdByUserId, createdAt,
confirmedAt(optional) Add indexes and relations to User. Implement
FileAssetsRepository + FileAssetsService.
```
```
Implement: POST /admin/files/init-upload Body: fileName, contentType,
sizeBytes, purpose (NOTES_PDF | PRINT_PDF) Validate: NOTES_PDF must be
application/pdf Generate objectKey: notes/{yyyy}/{mm}/{uuid}.pdf for
NOTES_PDF, prints/... for PRINT_PDF Create FileAsset row and return
{fileAssetId, objectKey, presignedPutUrl} Policy: notes.write for
NOTES_PDF, print.generate for PRINT_PDF
```
```
Implement: POST /admin/files/confirm-upload/:fileAssetId Call MinIO
statObject and verify sizeBytes matches. Set confirmedAt = now. Add
AuditLog entry.
```
```
Add Prisma model: Subject: id(uuid), key(unique), name, orderIndex,
isActive, createdAt, updatedAt Implement AdminSubjectsController: POST
/admin/subjects PATCH /admin/subjects/:id GET /admin/subjects Policy:
content.manage Add student endpoint: GET /subjects (only active,
ordered)
```

### TASK B7.2 — Topics schema (hierarchy) shared across Notes + Questions

### TASK B7.3 — Admin Topics CRUD + validations

### TASK B7.4 — Student topic browsing endpoints

## 8) Notes module — Topics wired (UPDATED)

### TASK B8.1 — Notes schema + NoteTopic join (many-to-many)

### TASK B8.2 — Admin notes create/update with topicIds[]

```
Create/extend Prisma model: Topic: id(uuid), subjectId,
parentId(nullable), key(optional unique per subject), name, orderIndex,
isActive, createdAt, updatedAt Relations: - subject (Subject) -
parent/children self-relation for hierarchy Add indexes: subjectId,
parentId Create migration.
```
```
Implement AdminTopicsController: POST /admin/subjects/:subjectId/topics
(create; body: name, parentId?, orderIndex, isActive) PATCH
/admin/topics/:id (edit) GET /admin/topics?subjectId= Rules: - if
parentId provided, parent.topic.subjectId must match subjectId - prevent
cycles in hierarchy Policy: content.manage
```
```
Implement TopicsController: GET /topics?subjectId= -> flat list (active
only) ordered by orderIndex GET /taxonomy/tree -> subjects -> topics ->
children (active only) Optimize to avoid N+1; return stable structure
for frontend navigation.
```
```
Add Prisma models: Note: id(uuid), subjectId, title,
description(optional), isPremium(boolean), isPublished(boolean),
fileAssetId, pageCount(optional), publishedAt(optional),
createdByUserId, createdAt, updatedAt NoteTopic: noteId, topicId
(composite PK) Add indexes: subjectId, isPublished, isPremium Relations:
```
- Note.subject -> Subject - Note.fileAsset -> FileAsset - Note.topics ->
NoteTopic -> Topic Migration.

```
Implement AdminNotesController: POST /admin/notes Body: subjectId,
title, description?, isPremium, fileAssetId, topicIds[] Rules: -
fileAsset must exist + confirmedAt not null - all topicIds must belong
to subjectId - allow empty topicIds but strongly recommended PATCH
/admin/notes/:id Allow update of topicIds (replace set), metadata,
```

### TASK B8.3 — Publish/unpublish workflow

### TASK B8.4 — Student notes list/filter by subject/topic

### TASK B8.5 — Secure PDF streaming endpoint (no MinIO url)

### TASK B8.6 — View session token (short-lived, bound to user+note)

### TASK B8.7 — Watermark facts endpoint for client overlay

```
isPremium GET /admin/notes?subjectId=&topicId=&q=&published=&premium=
Policies: - notes.write for create/update/list
```
```
Add: POST /admin/notes/:id/publish (isPublished=true, publishedAt=now)
POST /admin/notes/:id/unpublish Policy: notes.publish Audit logs on
publish/unpublish.
```
```
Implement NotesController: GET /notes?subjectId=&topicId=&q= Return
only published notes. If topicId is provided, filter notes having
NoteTopic.topicId=topicId. GET /notes/:id -> published note details +
topics (no file access) Authorization: auth required (so we can track
user); metadata allowed even if premium.
```
```
Implement: GET /notes/:id/content Behavior: - validate note is
published - if note.isPremium, require policy notes.read.premium
(entitlement check) - require valid view session token (next task) via
header X-View-Token - stream PDF bytes from MinIO to response Support
Range requests (bytes) for PDF.js. Headers: Content-Type
application/pdf, Content-Disposition inline, Cache-Control no-store Add
NoteAccessLog: userId, noteId, ip, userAgent, createdAt
```
```
Add Prisma model: NoteViewSession: id(uuid), userId, noteId, tokenHash,
watermarkSeed, expiresAt, revokedAt(optional), createdAt Implement: POST
/notes/:id/view-session Returns: {viewToken, expiresAt, viewSessionId}
Rules: - requires auth - note must be published - if premium, require
entitlement Token should be random or JWT; store only hash. On /content
and /watermark endpoints, validate viewToken -> active session not
expired. Allow revoke endpoint (optional) later.
```
```
Implement: GET /notes/:id/watermark Requires auth + valid view session
token. Returns: - displayName - maskedEmail/phone - userHash (short) -
noteId - issuedAt - viewSessionId - watermarkSeed No server-side PDF
modification.
```

### TASK B8.8 — Notes tree endpoint (topic-driven UI)

## 9) Entitlements module (UPDATED numbering but same logic)

### TASK B9.1 — Schema (plan/subscription/entitlement)

### TASK B9.2 — EntitlementService with topic-aware checks

### TASK B9.3 — Wire entitlements into PolicyEngine (UBAC)

## 10) Question Bank module — Topics shared (UPDATED)

### TASK B10.1 — Question schema referencing Topic (already exists, ensure it

### matches taxonomy)

```
Implement: GET /notes/tree?subjectId= Return: - subject - topic
hierarchy - for each topic: list of published notes under it Also
include "unassignedNotes" for notes with no topics. Must be optimized
(single query + grouping in memory).
```
```
Add Prisma models: Plan: id, key(unique), name, pricePaise,
durationDays, isActive, createdAt Subscription: id, userId, planId,
status(ACTIVE|EXPIRED|CANCELLED), startsAt, endsAt, createdAt
Entitlement: id, userId, kind(NOTES|TESTS|ALL), scopeJson (subjectIds[],
topicIds[], noteIds[] optional), startsAt, endsAt, createdAt Indexes on
userId, endsAt.
```
```
Implement EntitlementService: - hasActiveSubscription(userId) -
canAccessNote(userId, note) where note contains subjectId + topics
Logic: - if entitlement kind ALL and active -> true - if kind NOTES and
active: - if scopeJson.noteIds includes note.id -> true - else if
scopeJson.subjectIds includes note.subjectId -> true - else if
scopeJson.topicIds overlaps note.topicIds -> true -
canAccessTests(userId) similarly for TESTS/ALL Add method
denyReason(userId, noteId/testId) returning enum strings.
```
```
Extend PolicyEngine: Policy "notes.read.premium" -> calls
EntitlementService.canAccessNote(userId, note) Policy "tests.attempt" ->
calls EntitlementService.canAccessTests(userId) Ensure PolicyGuard can
fetch Note/Test by id when needed for evaluation. Cache note fetch per
request.
```

### TASK B10.2 — Admin questions CRUD + bulk import (topic-aware)

### TASK B10.3 — Student practice APIs (filter by topic)

## 11) Test Engine module — topic-based mixer rules supported

## (UPDATED)

### TASK B11.1 — Test schema supports mixer rules by subject/topic/difficulty

### TASK B11.2 — Admin tests CRUD + publish (mixer aware)

### TASK B11.3 — Build test questions at attempt-start for mixer tests

```
Update/ensure Prisma models: Question: id(uuid), subjectId,
topicId(optional), type, difficulty, statement, optionsJson,
correctAnswerJson, explanation(optional), isPublished, createdByUserId,
createdAt, updatedAt Validate: - if topicId present, topic.subjectId
must equal question.subjectId Add admin DTO validation accordingly.
```
```
Implement AdminQuestionsController: POST /admin/questions (allow
topicId) PATCH /admin/questions/:id POST /admin/questions/:id/publish
GET /admin/questions?subjectId=&topicId=&difficulty=&q=&published= POST
/admin/questions/bulk-import Rules: - validate topicId belongs to
subjectId - bulk import should return success/fail per item Policy:
questions.crud + questions.publish Audit logs for bulk import +
publish.
```
```
Implement QuestionsController: GET /questions?
subjectId=&topicId=&difficulty= GET /questions/:id Return only published
questions.
```
```
Ensure Test.configJson supports: - durationSec - negativeMarking -
sections (optional) - mixerRules: array of {subjectId, topicIds?,
difficulty?, count} TestQuestion join optional for fixed tests. Attempt,
AttemptEventLog as earlier.
```
```
AdminTestsController: POST /admin/tests (type SUBJECT/COMBINED/CUSTOM,
configJson) PATCH /admin/tests/:id POST /admin/tests/:id/publish
Validate on publish: - if mixerRules exist, all topicIds belong to
specified subjectId Policy: tests.crud + tests.publish Audit logs.
```

### TASK B11.4 — Save/submit/evaluate (uses attempt snapshot)

### TASK B11.5 — Results APIs + topic breakdown

## 12) Print Engine foundation (same as before)

### TASK B12.1 — Queue skeleton (BullMQ)

### TASK B12.2 — Print job APIs scaffold

# Notes about “topics fully wired”

✅ Notes can havemultiple topics
✅ Topics can behierarchical(parentId)

```
Implement attempt start: POST /tests/:id/start If test has mixerRules:
```
- select questions randomly based on rules: - subjectId required - if
topicIds provided, filter - if difficulty provided, filter - only
published questions - store selected questionIds snapshot inside Attempt
(e.g. attemptQuestionsJson or separate AttemptQuestion table) If fixed
test: - use TestQuestion list Return attemptId + question list without
answers.

```
PATCH /attempts/:id/save -> merge answersJson POST /attempts/:id/submit
-> evaluate using snapshot questionIds (not dynamic query) Compute score
breakdown per topic/subject as bonus in scoreJson. Ensure correct
answers never exposed.
```
```
Student: GET /attempts/me?testId= GET /attempts/:id -> includes
scoreJson breakdown (subject/topic) Admin: GET /admin/attempts?
testId=&userId= Policies for admin.
```
```
Integrate BullMQ with Redis for local dev. Create queue "print" and
worker bootstrap. Provide example processor that writes status updates
in DB.
```
```
PrintEngineModule: POST /admin/print/tests/:testId -> enqueue print job
DB PrintJob: id, testId, status, outputFileAssetId(optional),
error(optional), createdAt GET /admin/print/jobs/:id Policy:
print.generate
```

✅ Topics are shared taxonomy acrossnotes + questions + mixer test rules
✅ Student can browse notes viatreeendpoints (subject → topics → notes)
✅ Validation prevents topic/subject mismatch everywhere

If you want, the next backend set can be:
Payments v 1 (Razorpay/Stripe) + webhook idempotency + subscription
activation + entitlements grant
or
Anti-piracy hardening v 2 (range streaming, view-token binding, rate limiting per
note, anomaly detection, watermark seed rotation, view session revoke)
Just reply:“next backend payments”or“next backend anti-piracy”.

```
there is one more update here
we are handling tests here considering we'll mix the
questions of each topic based on certain scenarios.
But there should also be option to solve practice
questions based on subjects and topics.
Student can read the notes and also based on that
subject and topic, student can extensively solve
questions based on that topic.
It'll not a time based but practice based question solving
for the student.
We also need to record their answering metadata to
show the progress and analytics in future.
```
Got it — this is aseparate “Practice Engine”(untimed, topic-based drilling) alongside
“Tests” (timed, attempt-based). We should model it explicitly, otherwise youʼll end up
abusing the Attempt table for everything and analytics will become painful.

Below is thebackend update plan(minute-level tasks) to add:

```
subject/topic-based practice sessions
question delivery (adaptive or simple)
per-question answer telemetry
progress + analytics-ready aggregates
```

Iʼll keep it compatible with Set 2 v 2 taxonomy (Subjects/Topics shared).

# BACKEND UPDATE — Practice Questions + Progress

# Analytics (Tasks)

## A) Data model (analytics-first)

### TASK P 1 — Add practice schema (session + events + aggregates)

Why this structure is “future-proof”:
PracticeQuestionEvent is your raw telemetry (source of truth for analytics)
UserQuestionState lets you serve “unseen / wrong-only / spaced repetition” fast
UserTopicProgress makes^ dashboards^ instant^ (no^ heavy^ queries)

## B) Practice session APIs (student)

### TASK P 2 — Start/stop practice session

```
Add Prisma models: PracticeSession: - id(uuid) - userId - subjectId -
topicId(optional) // allow subject-wide practice too - mode
(TOPIC|SUBJECT|CUSTOM) - configJson (difficulty?, questionCountTarget?,
includePreviousWrong?, shuffle?, etc.) - status (ACTIVE|ENDED) -
startedAt, endedAt(optional) - createdAt PracticeQuestionEvent: -
id(uuid) - userId - questionId - subjectId - topicId(optional) // from
question.topicId at time of answering - sessionId(optional) // can be
null if answered outside session (future) - eventType
(SERVED|ANSWERED|SKIPPED|REVEALED|BOOKMARKED) - isCorrect(optional) //
only for ANSWERED - selectedAnswerJson(optional) - timeSpentMs(optional)
```
- attemptNo(optional) // for re-attempts in practice -
deviceMetaJson(optional) // lightweight - createdAt UserQuestionState
(aggregate per user per question): - userId - questionId - subjectId -
topicId(optional) - lastStatus
(UNSEEN|SEEN|ANSWERED_CORRECT|ANSWERED_WRONG|SKIPPED|BOOKMARKED) -
correctCount, wrongCount, skipCount - lastAnsweredAt(optional) -
lastTimeSpentMs(optional) - streakCorrect(optional) - updatedAt
Composite PK (userId, questionId) UserTopicProgress (aggregate per user
per topic): - userId - subjectId - topicId - totalSeen - totalCorrect -
totalWrong - totalSkipped - accuracyPct - updatedAt Composite PK
(userId, topicId) Add indexes: PracticeQuestionEvent(userId, createdAt),
(userId, topicId, createdAt), (questionId, createdAt)
UserTopicProgress(userId, subjectId) Migrate.


### TASK P 3 — Fetch next practice questions (topic/subject filter)

### TASK P 4 — Submit practice answer (records telemetry + updates

### aggregates)

### TASK P 5 — Batch answer endpoint (performance)

## C) Practice analytics APIs (student + admin)

### TASK P 6 — Student progress dashboards

```
Implement PracticeController endpoints: POST /practice/start Body:
subjectId, topicId(optional), mode (TOPIC|SUBJECT), configJson
(difficulty?, includePreviousWrong?, limit?) Rules: - subject exists and
active - if topicId provided, topic.subjectId must match Return:
sessionId POST /practice/:sessionId/end Sets endedAt and status ENDED.
Policy: practice.use (or reuse tests.attempt if you want, but better
create practice.use)
```
```
Implement: GET /practice/:sessionId/next?count=10 Logic (simple v1): -
Determine pool: published questions where subjectId matches and (topicId
matches if provided) - Prefer questions not yet mastered: 1) unseen
first (no UserQuestionState) 2) wrong more than correct 3) least
recently answered - Apply difficulty filter if configJson has it -
Return questions WITHOUT correct answers/explanations. Also create
PracticeQuestionEvent with eventType=SERVED for each served question.
```
```
Implement: POST /practice/:sessionId/answer Body: questionId,
selectedAnswerJson, timeSpentMs, action (ANSWER|SKIP|REVEAL|BOOKMARK)
Behavior: - Validate session belongs to user and ACTIVE - Load question
correctAnswerJson only for evaluation (do NOT return it) - If
action=ANSWER: compute isCorrect - Insert PracticeQuestionEvent with
correct fields - Update UserQuestionState (upsert) - Update
UserTopicProgress (upsert + recalc accuracyPct) Return: - isCorrect (if
answered) - optional explanation (ONLY if action=REVEAL or if you allow
showing after answer) Make explanation gating configurable.
```
```
Add: POST /practice/:sessionId/answer/batch Body: array of {questionId,
selectedAnswerJson?, timeSpentMs?, action} Process in a transaction (or
chunked) and update aggregates efficiently. This reduces API calls on
mobile.
```

### TASK P 7 — Admin analytics (optional v 1 but very useful)

## D) Frontend compatibility notes (so you donʼt paint yourself into a

## corner)

### Practice UX needs these API characteristics:

```
next?count= returns a batch (10/20) for smooth UX
answers can be submitted batch for poor networks
allow “reveal solution” event (so you know who is learning vs guessing)
progress endpoints should be cheap (use aggregates)
```
## E) Integrate with existing “Test Engine” cleanly

### Keep these separate:

Tests: timed attempts, fixed/mixer question snapshots, ranks etc.
Practice: infinite drill, not timed, telemetry-heavy, personalization later
They can share:
Question table
Topic taxonomy
Entitlements gating (if practice is paid feature too)

```
Implement endpoints: GET /practice/progress/subjects Returns per
subject: totalCorrect, totalWrong, accuracyPct, lastActivityAt GET
/practice/progress/topics?subjectId= Returns UserTopicProgress rows
ordered by topic orderIndex, include topic name. GET
/practice/progress/topic/:topicId Returns: - totals - accuracyPct trend
(simple: last 7 days from PracticeQuestionEvent grouped by day) -
weakest areas: top N questions wrong most times (from UserQuestionState)
All owner-only.
```
```
Admin endpoints: GET /admin/analytics/practice/overview?
subjectId=&topicId= Metrics: - active users last 7/30 days - questions
attempted count - average accuracy - top topics by engagement Use
PracticeQuestionEvent grouped queries. Protect with policy
analytics.read.
```

## F) Add to PolicyEngine (gating)

If practice is paid-only, add:
Policy: practice.use
Implementation: EntitlementService.canAccessPractice(userId) (reuse
TESTS/ALL or add PRACTICE kind)

# Minimal v 1 you can ship fast (without overengineering)

If deadline is tight, ship v 1 with:
PracticeSession
PracticeQuestionEvent
UserTopicProgress
Basic selection: random + exclude recently served
Then v2:
UserQuestionState for smarter selection
spaced repetition / wrong-only / bookmarks

If you want, I can now fold these into aSet 2 v 3 (so your prompts list stays clean), OR I
can create aSet 3 (Practice + Payments)next.

```
In mcq questions (test as well as practice) there are also
mental ability and reasoning questions. Those questions
often contains images in questions and answers as well.
Does our existing architecture and plan of action already
takes care of it?
```
Mostlyyes conceptually, butnot fully at the data/model level yet.
Right now our plan treats question content as mostly text
(statement, optionsJson, explanation). Forreasoning/mental abilityquestions
withimages in the question stem and/or options, we need to make two explicit
upgrades:

1. afirst-class “Asset” conceptfor images (stored in MinIO, referenced from
    questions/options/explanations), and


2. securedeliveryof those images (so we donʼt leak MinIO URLs or allow easy
    scraping).
Once you add these, the same approach works for bothTest EngineandPractice
Engine.

## What changes are needed

### 1) Extend Files module: support image uploads

Your FilesModule already supports PDFs; we need to allow image content types.

Add to init-upload:

purpose: QUESTION_IMAGE | OPTION_IMAGE | EXPLANATION_IMAGE | NOTE_PDF |
PRINT_PDF
allowed content types for
image: image/png, image/jpeg, image/webp (optional image/svg+xml only if
you trust your sanitization)
Add constraints:
max size (e.g., 1–2 MB per image)
optional checksum
✅ MinIO is fine for this.

### 2) Model rich question content (text + image)

We need options that can haveeither text or image or both.

Right now optionsJson can store “imageKey”, but that will get messy without a
standard format. The clean approach:

Option A (recommended for speed): structured JSON with Asset references
Keep Question table simple but standardize the JSON:
statementJson instead of plain statement
optionsJson contains objects with text + imageAssetId (optional)
explanationJson for mixed media explanation
Example JSON:


Options:

✅ Works for both tests and practice
✅ No schema explosion
✅ Easy to render in Next.js

Option B (more normalized): QuestionAsset table
Better long-term but heavier:
QuestionAsset join^ table^ linking^ assets^ to^ question^ +^ placement^ (STEM^ /
OPTION_A / EXPLANATION)
Great for querying, but slower to build
Given your tight deadline:Option A.

### 3) Securely serve images (donʼt expose MinIO)

Same principle as PDFs:
no direct MinIO URLsto browser
serve via an authenticated API endpoint
Add:
GET /assets/:id → streams the file bytes (image/png, etc.)
Cache-Control can^ be^ short-lived^ (e.g.,^ private,^ max-age=60)^ if^ you^ want
authorization rules:
Students can fetch assetsonly iftheyʼre part of content they have access to
(note/test/practice question)
Admin can fetch any
Important: For question images, you likely want to allow viewing if the question is
available (published + entitlement). This is much easier if your question JSON
references imageAssetId and you check access at question delivery time.

```
{ "text": "Find the next figure in the series", "imageAssetId": "uuid-
of-image"^ }
```
```
[ {"key":"A","text":null,"imageAssetId":"..."},
{"key":"B","text":null,"imageAssetId":"..."}, {"key":"C","text":"None of
these","imageAssetId":null},
{"key":"D","text":null,"imageAssetId":"..."}^ ]
```

## Does our current test/practice logic support it?

### ✅ Delivery and evaluation logic: yes

Test: question snapshot → evaluation uses correctAnswerJson
Practice: answer event → evaluation uses correctAnswerJson
Images donʼt affect evaluation; they only affectrendering.

### ❌ Data model and asset serving: needs the upgrades above

Without those, youʼll end up hardcoding image URLs in JSON, which becomes:
insecure (scrapable)
hard to rotate/revoke
inconsistent

## Add-on tasks (Codex prompts) to update architecture cleanly

### TASK U 1 — Extend Files upload to support images

### TASK U 2 — Update Question schema to rich content JSON

### TASK U 3 — Secure asset streaming endpoint

```
Update FilesModule init-upload to support image purposes:
QUESTION_IMAGE, OPTION_IMAGE, EXPLANATION_IMAGE. Allow content types:
image/png, image/jpeg, image/webp. Generate objectKey:
qassets/{yyyy}/{mm}/{uuid}.{ext} Add max size validation. Keep confirm-
upload flow unchanged.
```
```
Update Question model: - replace statement (string) with statementJson
(json) - keep optionsJson but standardize schema: [{key, text?,
imageAssetId?}] - add explanationJson (json) instead of explanation
string Write migration and update DTOs/validators. Ensure old format can
be migrated (if already created).
```
```
Create AssetsController: GET /assets/:id Stream bytes from MinIO using
FileAsset.objectKey. Authorization: - Admin allowed always (policy
content.manage) - Student allowed only if asset is referenced by a
question/note/test they can access. Implement a simple check v1: allow
if asset belongs to a published question being served in current session
(store served asset ids in session table or allow by published flag).
Return correct Content-Type.
```

### TASK U 4 — Update question delivery APIs to include asset ids

## Practical security note (important)

Even with secure endpoints, a determined user can still:
screenshot images
scrape via API if they reverse-engineer calls
So apply the same deterrence:
watermark overlay in viewer (for notes)
for questions: show watermark banner on question screen (name/userId hash)
rate-limit assets endpoint per user/session

## Bottom line

✅ Our architecture supports this direction (MinIO + controlled APIs + JSON content)
⚠ But we must explicitly implementimage assets + rich question content schema +
secured asset streaming.

If you want, I can merge these into yourSet 2 v 2 as aSet 2 v2.1 “Question Media
Upgrade”, so your prompts stay organized.

```
Update /practice/:sessionId/next and /tests/:id/start question payload
to include statementJson/optionsJson/explanationJson but do not include
correct answers. Frontend will render images by calling /assets/:id.
```
```
yes sure
```
Perfect — hereʼsSet 2 v2.1: “Question Media Upgrade”(images in question
stem/options/explanations) designed to plug into your existing Set 2 v 2 without breaking
anything.

Iʼm keeping itdeadline-friendly(JSON-based rich content + secure asset streaming),
and consistent with your anti-piracy approach (no direct MinIO URLs).


# BACKEND — Set 2 v2.1: Question Media Upgrade (Images

# in MCQs)

## U0) Quick decision (baked into tasks)

```
UseFileAssetfor images (already exists)
Userich JSON fieldsin Question:
statementJson, optionsJson, explanationJson
Serve images via backend: GET /assets/:id
Frontend renders images by calling /assets/:id (authenticated)
```
## U1) Extend Files upload to support question assets

### TASK U1.1 — Add upload purposes + image validation

### TASK U1.2 — Update FileAsset model for purpose + optional dimensions

## U2) Upgrade Question content to “rich blocks”

### TASK U2.1 — Update Question schema

### (statementJson/optionsJson/explanationJson)

```
Update POST /admin/files/init-upload: Add purposes: QUESTION_IMAGE,
OPTION_IMAGE, EXPLANATION_IMAGE Allow content types: image/png,
image/jpeg, image/webp Reject other content types. Add size limits: max
2MB per image (configurable via env MAX_IMAGE_BYTES). Generate
objectKey: qassets/{yyyy}/{mm}/{uuid}.{ext} Store purpose in FileAsset
(add field purpose enum). Return presignedPutUrl as before.
```
```
Update Prisma model FileAsset: Add fields: - purpose enum
(NOTES_PDF|PRINT_PDF|QUESTION_IMAGE|OPTION_IMAGE|EXPLANATION_IMAGE|OTHER)
```
- width(optional int), height(optional int) On confirm-upload for
images, optionally detect dimensions (use a lightweight node image
metadata lib). Migration + update confirm-upload logic.

```
Update Prisma Question model: - Replace statement (string) with
statementJson (Json) - Replace explanation (string?) with
explanationJson (Json) - Keep optionsJson (Json) but enforce a new
schema - Keep correctAnswerJson (Json) Add a boolean hasMedia default
false (optional optimization) Migration required. Define canonical
```

### TASK U2.2 — Backward compatibility migration (if existing text questions

### already created)

### TASK U2.3 — Update DTOs + validation for rich content

## U3) Secure asset delivery endpoint (no MinIO URL exposure)

### TASK U3.1 — Add AssetsModule + controller

### TASK U3.2 — Authorization rules for assets (important)

```
schemas: ContentBlock JSON: { "text": string|null, "imageAssetId":
string|null } MCQ optionsJson format: [ { "key": "A", "text":
string|null, "imageAssetId": string|null }, { "key": "B", "text":
string|null, "imageAssetId": string|null }, { "key": "C", "text":
string|null, "imageAssetId": string|null }, { "key": "D", "text":
string|null, "imageAssetId": string|null } ] ExplanationJson can be: {
"text": string|null, "imageAssetId": string|null, "blocks":
ContentBlock[] optional }
```
```
Write a migration script that: - For existing Question.statement
string, set statementJson = { text: oldStatement, imageAssetId: null } -
For existing Question.explanation string, set explanationJson = { text:
oldExplanation, imageAssetId: null } - Keep optionsJson as-is if it is
already structured; otherwise wrap text-only options into new schema.
Mark hasMedia=true if any imageAssetId present. Ensure migration is safe
and idempotent.
```
```
Update AdminQuestionsController DTOs: - statementJson must be valid
ContentBlock (text or imageAssetId required) - optionsJson must be array
with keys A/B/C/D and each option must have text or imageAssetId -
explanationJson optional but must match schema Validate that referenced
imageAssetIds exist, confirmedAt not null, and purpose is
QUESTION_IMAGE/OPTION_IMAGE/EXPLANATION_IMAGE (or allow any image
purpose). Also validate topicId belongs to subjectId (existing rule).
```
```
Create AssetsModule with AssetsController: GET /assets/:id Streams
bytes from MinIO using FileAsset.objectKey Sets Content-Type from
FileAsset.contentType Sets Cache-Control: private, max-age=60 (or no-
store if you prefer) Never returns MinIO URL.
```
```
Implement authorization in AssetsController: - If req.user is ADMIN:
allow (policy content.manage OR admin any) - If STUDENT: allow only if
asset is referenced by content the user is allowed to access. Implement
```

### TASK U3.3 — (Recommended) AssetReference mapping table for fast

### access checks

## U4) Update question delivery APIs to return rich content

### TASK U4.1 — Practice “next” payload includes JSON blocks

### TASK U4.2 — Test attempt start payload includes JSON blocks

### TASK U4.3 — Reveal explanation endpoint (optional, controlled)

```
v1 checks: A) If asset is used in a published Question
(Question.statementJson/optionsJson/explanationJson) AND the student has
access to practice/tests feature (entitlement if required) -> allow B)
If asset is used in a published Note (future use) and student can access
note -> allow To keep it fast: - Add helper queries that search Question
JSON for assetId using Prisma JSON contains (if supported) OR maintain a
mapping table (see next task). Return 403 otherwise.
```
```
To avoid expensive JSON searching, add Prisma model AssetReference: -
assetId - refType enum
(QUESTION_STEM|QUESTION_OPTION|QUESTION_EXPLANATION|NOTE|PRINT) - refId
(questionId/noteId) Composite unique (assetId, refType, refId) On
question create/update, compute asset references from JSON and upsert
into AssetReference. Then AssetsController can check: - find
AssetReference rows -> refType QUESTION_* -> ensure question is
published -> allow This makes auth checks fast and scalable. Implement
this mapping.
```
```
Update GET /practice/:sessionId/next: Return each question with: - id,
subjectId, topicId, type, difficulty - statementJson - optionsJson -
explanationJson excluded by default (unless you want reveal) No
correctAnswerJson ever. Frontend will call GET /assets/:id for images.
```
```
Update POST /tests/:id/start to return questions with
statementJson/optionsJson. Do not send explanationJson unless allowed.
Ensure snapshots store questionIds only; content loaded from Questions
table at serve time OR snapshot a sanitized copy of JSON (your choice).
```
```
Add: POST /practice/:sessionId/reveal Body: questionId Records
PracticeQuestionEvent eventType=REVEALED. Returns explanationJson (no
correctAnswerJson). Gate behind configuration (allowReveal boolean).
```

## U5) Minor but important: Admin question editor support

### TASK U5.1 — Admin endpoint to fetch question with asset metadata

### TASK U5.2 — Bulk import format supports images (future-proof)

## Result after v2.1

✅ MCQ question stem can have an image
✅ Each option can be text, image, or both
✅ Explanations can include images too
✅ Images stored in MinIO, never directly exposed
✅ Students fetch images through /assets/:id securely
✅ Works the same fortestsandpractice

## What to do next

If you say“next backend payments”, Iʼll give you a similar minute-level prompt set for:
plan creation
payment order/session creation
webhook verification
idempotency + ledger tables
subscription → entitlement granting
admin refund flow (policy-gated)
Or if you say“next backend analytics”, Iʼll give:
progress rollups
topic-wise accuracy trends

```
Update GET /admin/questions/:id to return: -
statementJson/optionsJson/explanationJson - For each imageAssetId,
include resolved metadata: {assetId, fileName, contentType, sizeBytes}
This helps admin panel render previews without extra calls.
```
```
Update bulk import schema to allow: - statementJson.imageAssetId -
option.imageAssetId - explanationJson.imageAssetId Import should
validate assets exist and are confirmed. Return per-item errors with
clear message if missing assets.
```

```
admin dashboards queries optimized for Postgres
```
```
next backend payments
```
Below isBackend Payments Set (v1)asminute-level Codex tasks. Itʼs designed to be:
production-safe(idempotent webhooks, audit trail, reconciliable)
scalable(clean separation: provider adapter + ledger tables)
easy to switch providers later(Razorpay now, Stripe later)
Iʼm assumingRazorpay(India-first). If you choose Stripe later, youʼll only swap the
provider adapter + webhook mapping.

# BACKEND — Payments Set v 1 (Razorpay)

## (Plans → Checkout → Webhooks → Subscriptions → Entitlements →

## Admin ops)

## 1) Payment foundations (DB + module boundaries)

### TASK PAY 1 — Create PaymentsModule + Provider Adapter interface

### TASK PAY 2 — Add DB models for ledger + idempotency

```
Create PaymentsModule with clean boundaries: - PaymentsService
(business orchestration) - PaymentsController (student endpoints) -
AdminPaymentsController (admin operations) - RazorpayProvider
implementing IPaymentProvider Define interface IPaymentProvider with
methods: - createOrder(amount, currency, receipt, notes) ->
{providerOrderId, payload} - verifyWebhook(headers, rawBody) -> boolean
```
- parseWebhook(rawBody) -> {eventId, eventType, providerOrderId,
providerPaymentId, providerSignature?, amount, currency, status,
notesJson} Do not implement Razorpay yet; only scaffold.

```
Add Prisma models: PaymentCustomer: - id(uuid) - userId (unique) -
provider (RAZORPAY|STRIPE) - providerCustomerId(optional) - createdAt
PaymentOrder: - id(uuid) - userId - planId - provider (RAZORPAY) -
providerOrderId (unique) - amountPaise - currency (default INR) - status
(CREATED|PAID|FAILED|CANCELLED|EXPIRED) - receipt (unique) - notesJson -
createdAt, updatedAt PaymentTransaction: - id(uuid) - orderId -
```

### TASK PAY 3 — Link payments to your existing subscription/entitlement

### models

## 2) Razorpay integration (provider adapter + verification)

### TASK PAY 4 — Implement RazorpayProvider (order creation + signature

### verification)

### TASK PAY 5 — Raw body capture middleware (required for webhook

### verification)

```
providerPaymentId (unique) - amountPaise - currency - status
(CAPTURED|AUTHORIZED|FAILED|REFUNDED|PARTIAL_REFUND) - rawJson -
createdAt PaymentEvent: - id(uuid) - provider (RAZORPAY) -
providerEventId (unique) // idempotency key - eventType -
providerOrderId(optional) - providerPaymentId(optional) - rawJson -
processedAt(optional) - createdAt Refund: - id(uuid) - orderId -
providerRefundId(unique) - amountPaise - status
(INITIATED|PROCESSED|FAILED) - reason(optional) - rawJson - createdAt
Add indexes: PaymentOrder(userId, createdAt),
PaymentTransaction(orderId), PaymentEvent(createdAt) Migrate.
```
```
Update Plan/Subscription/Entitlement models (from earlier set) to
integrate: - Plan.key unique, Plan.durationDays, Plan.isActive -
Subscription should reference PaymentOrderId(optional) for audit trail
Add relation: PaymentOrder.planId -> Plan.id Ensure Plan and
PaymentOrder foreign keys are correct.
```
```
Implement RazorpayProvider using official Razorpay Node SDK. Env vars:
RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET.
Implement: - createOrder(amountPaise, INR, receipt, notes) ->
providerOrderId - verifyWebhook(headers, rawBody) using webhook secret
signature - parseWebhook(rawBody) extracting: eventId, eventType,
providerOrderId, providerPaymentId, status, amount, currency, notes
Return a normalized object for PaymentsService.
```
```
Add middleware for webhook route to capture raw request body
(Buffer/string) without JSON parsing breaking signature verification.
Apply only to /payments/webhook/razorpay route. Ensure controller can
access rawBody and headers.
```

## 3) Plans + pricing APIs (admin-managed, student-readable)

### TASK PAY 6 — Admin plans CRUD

### TASK PAY 7 — Student plans list

## 4) Checkout flow (student initiates payment)

### TASK PAY 8 — Create payment order (student)

### TASK PAY 9 — Checkout “verify client success” endpoint (optional)

## 5) Webhook handling (idempotent + ledger updates)

```
Implement AdminPlansController: POST /admin/plans PATCH
/admin/plans/:id GET /admin/plans Policy: payments.manage (or
admin:config:write if you prefer, but better separate) Fields: key,
name, pricePaise, durationDays, isActive, metadataJson(optional) Audit
log on create/update.
```
```
Implement PlansController: GET /plans (only active, ordered) This is
public or auth-required depending on your preference. Return minimal
pricing + duration info.
```
```
Implement PaymentsController: POST /payments/checkout Body: planKey
Rules: - user must be authenticated - plan must be active - if user
already has active subscription, either block or allow renew/extend
(configurable) Create PaymentOrder in DB with: - status CREATED -
receipt = "rcpt_{userIdShort}_{timestamp}" Call provider.createOrder and
store providerOrderId. Return payload needed for frontend checkout:
{orderId (internal), providerOrderId, amountPaise, currency, keyId
(public), planSummary, receipt} Also create an AuditLog event
"payment.checkout.created".
```
```
Add POST /payments/checkout/confirm Body: providerOrderId,
providerPaymentId, providerSignature Verify signature using Razorpay
rules. Mark order status = PAID if valid (but do NOT grant entitlement
here unless you want double-safe). Primary truth should still be
webhook. Return "pending webhook" or "confirmed".
```
```
Best practice: grant subscription onwebhook, not only on client confirm.
```

### TASK PAY 10 — Razorpay webhook endpoint (idempotent processing)

### TASK PAY 11 — Grant subscription + entitlements on successful payment

### (atomic)

### TASK PAY 12 — Entitlement mapping strategy (plan -> entitlements)

## 6) Student subscription APIs

### TASK PAY 13 — Student subscription status endpoint

### TASK PAY 14 — Access gating integration check

```
Implement POST /payments/webhook/razorpay Steps: 1) Verify webhook
signature using rawBody + headers; if invalid return 401. 2) Parse
webhook into normalized event. 3) Upsert PaymentEvent by providerEventId
(unique). If exists and processedAt not null -> return 200 (idempotent).
4) Find PaymentOrder by providerOrderId; if missing store event anyway
and return 200. 5) Depending on eventType: - payment.captured /
order.paid -> mark PaymentOrder PAID, create PaymentTransaction (unique
providerPaymentId), store rawJson - payment.failed -> mark PaymentOrder
FAILED - refund.processed -> create/update Refund and update
PaymentTransaction status 6) Mark PaymentEvent.processedAt = now. Return
200.
```
```
In webhook processing when PaymentOrder becomes PAID: Run a DB
transaction: - If Subscription already created for this PaymentOrder ->
no-op (idempotent) - Create Subscription ACTIVE with startsAt=now,
endsAt=now + plan.durationDays - Create Entitlement for NOTES/TESTS/ALL
based on plan metadataJson mapping - Link Subscription.paymentOrderId =
PaymentOrder.id Also create AuditLog "subscription.activated".
```
```
Implement a simple mapping: Plan.metadataJson can define: {
"entitlementKind": "ALL" | "NOTES" | "TESTS", "scope": {"subjectIds":[],
"topicIds":[]} } PaymentsService translates this into Entitlement rows.
Ensure EntitlementService (from earlier) reads these scopes for gating.
```
```
Implement: GET /me/subscription Returns: - activeSubscription? (plan,
startsAt, endsAt, remainingDays) - entitlements summary -
lastPaymentOrder summary
```
```
Ensure PolicyEngine policies: - notes.read.premium checks
EntitlementService.canAccessNote - tests.attempt checks canAccessTests -
```

## 7) Admin operations (refunds + reconciliation)

### TASK PAY 15 — Admin list payments + details

### TASK PAY 16 — Refund endpoint (policy-gated, auditable)

### TASK PAY 17 — Reconciliation job (local script)

## 8) Security + reliability (must-have even in dev)

### TASK PAY 18 — Rate limiting + replay protection

### TASK PAY 19 — Webhook test harness

```
practice.use checks canAccessPractice (either reuse TESTS or add
PRACTICE/ALL) Add tests (unit/e2e) for these gates.
```
```
Admin endpoints: GET /admin/payments/orders?
status=&userId=&dateFrom=&dateTo= GET /admin/payments/orders/:id Include
transactions, refunds, events summary. Policy: payments.read
```
```
Implement: POST /admin/payments/orders/:id/refund Body:
amountPaise(optional for partial), reason Policy: payments.refund
Behavior: - call provider refund API (Razorpay) (if you implement now;
else mark as TODO) - create Refund record and update statuses -
optionally shorten subscription/entitlement (business decision) Audit
log "payment.refund.initiated".
```
```
Create a dev-only reconciliation script: - lists PaymentOrders in
CREATED state older than X minutes - marks them EXPIRED (no webhook
arrived) - logs results This prevents stuck orders.
```
```
Add rate limit rules: - /payments/checkout per user - webhook endpoint
per IP (light) Webhook replay protection: - PaymentEvent unique
providerEventId already handles idempotency Log suspicious failures
(invalid signature).
```
```
Create a local test utility: - reads a sample webhook payload JSON -
signs it (or mocks verification) - posts to /payments/webhook/razorpay
```

# Result after Payments Set v 1

✅ Plans managed by admin
✅ Student checkout creates provider order
✅ Webhooks verified with raw-body signature
✅ Idempotent event storage + ledger tables
✅ Subscription + entitlements granted reliably
✅ Admin can audit orders/events/transactions

## What you should ask me next (pick one)

```
“next backend payments v 2 subscriptions”→ auto-renewals, upgrades,
prorations (Stripe-like behavior), coupon codes
“next backend anti-piracy hardening”→ note streaming hardening + watermark
seed rotation + anomaly detection
“start student app”→ practice + tests UX + notes viewer with watermark overlay
```
```
Ensure processing is idempotent by sending the same event twice and
asserting no duplicates.
```
```
we are planning to use phonepay as payment gateway
here
```
Yep —PhonePeworks well for your use case. We just need to tweak the “Payments Set
v1” to matchPhonePeʼs flow, which is different from Razorpay:
You generate amerchantTransactionId(your order id)
You callPay APIwith aBase 64 payload
You computeX-VERIFYas: SHA256(base64Payload + apiPath + saltKey) + ###
+ saltIndex
PhonePe sends you acallback/webhook, and itʼs considered mandatory tocall
Check Status APIafter callback to confirm final status
Below is yourupdated minute-level task set(Codex-ready) for PhonePe.


# BACKEND — Payments Set v 1 (PhonePe)

## 0) Environment keys (PhonePe)

Create env vars:
PHONEPE_MERCHANT_ID
PHONEPE_SALT_KEY
PHONEPE_SALT_INDEX
PHONEPE_BASE_URL (UAT/PROD)
PHONEPE_CALLBACK_URL (your^ backend^ endpoint)
(Optional) PHONEPE_REDIRECT_URL (student frontend success/fail page)
PhonePe uses theX-VERIFYchecksum formula (base 64 payload + API path + salt key,
then append salt index).

## 1) DB models changes (align with PhonePe identifiers)

### TASK PP 1 — Update PaymentOrder + Event schema for PhonePe

## 2) PhonePe Provider adapter (core: X-VERIFY + Pay + Status)

### TASK PP 2 — Implement PhonePeProvider (pay + check-status + X-VERIFY)

```
Update Prisma models to fit PhonePe: PaymentOrder: - id(uuid) - userId
```
- planId - provider (PHONEPE) - merchantTransactionId (unique) //
generated by you - merchantUserId (string) // often userId or a short
token - amountPaise - currency (INR) - status
(CREATED|PENDING|SUCCESS|FAILED|EXPIRED) - paymentUrl(optional) //
redirect URL returned by PhonePe (if applicable) - notesJson -
createdAt, updatedAt PaymentTransaction: - id(uuid) - orderId -
providerTransactionId(optional unique) // PhonePe transaction / provider
reference if present - amountPaise - status (SUCCESS|FAILED|PENDING) -
rawJson - createdAt PaymentEvent: - id(uuid) - provider (PHONEPE) -
providerEventId (unique, if PhonePe provides) OR checksum of payload as
fallback idempotency key - eventType - merchantTransactionId - rawJson -
processedAt(optional) - createdAt

```
Implement PhonePeProvider: - buildBase64Payload(json) -> base64 string
```
- computeXVerify(base64Payload, apiPath, saltKey, saltIndex) -> string
formula: SHA256(base64Payload + apiPath + saltKey) + "###" + saltIndex -
initiatePayment(payloadJson) -> {paymentUrl or redirectUrl, rawResponse}
Calls PhonePe pay endpoint with headers: Content-Type: application/json


Reference for X-VERIFY computation and checksum format:
Reference that status API exists + is mandatory post callback:

## 3) Plans APIs (same as before)

No change needed from earlier plan:
Admin plan CRUD
Student plans list

## 4) Checkout flow (student)

### TASK PP 3 — Create PhonePe order + return redirect info

## 5) Callback/Webhook handling (idempotent + status confirmation)

PhonePe docs emphasize validating callbacks/webhooks and thenchecking
transaction statusvia status API.
(And their webhook docs describe callback validation patterns.)

### TASK PP 4 — Callback/Webhook endpoint + raw body capture

```
X-VERIFY: computed Body should include base64 payload in correct field
as per PhonePe docs. - checkStatus(merchantId, merchantTransactionId) ->
normalized status object Use PhonePe official docs for apiPath used in
checksum and for status API.
```
```
Implement POST /payments/checkout (PhonePe): Body: planKey Steps: 1)
validate user + plan is active 2) create PaymentOrder with
merchantTransactionId = "txn_{userIdShort}_{timestamp}_{rand}" 3) build
PhonePe payload including: - merchantId - merchantTransactionId -
merchantUserId - amount - callbackUrl - redirectUrl (optional) -
paymentInstrument (as required by PhonePe standard checkout) 4) call
PhonePeProvider.initiatePayment(...) 5) store paymentUrl/redirectUrl
into PaymentOrder 6) return payload for frontend to redirect user Mark
order status = PENDING (or CREATED -> PENDING)
```
```
PhonePe flows often redirect to their hosted payment page or UPI intent flow
depending on integration type; your backend should return the redirect/payment URL
and never expose secrets.
```

Status API mandate reference:

## 6) Grant subscription + entitlements (only after confirmed SUCCESS)

### TASK PP 5 — Atomic subscription/entitlement granting

## 7) Reconciliation (mandatory for real-world stability)

### TASK PP 6 — Scheduled reconciliation for PENDING orders

This aligns with PhonePeʼs emphasis on status checks.

## 8) Admin payments ops (same shape)

```
List orders
View order details
```
```
Implement POST /payments/webhook/phonepe (or
/payments/callback/phonepe): - Capture rawBody (buffer) + headers -
Store PaymentEvent (idempotent key = providerEventId if present; else
hash(rawBody)) - Do NOT grant subscription based only on callback
payload. Immediately call PhonePeProvider.checkStatus(merchantId,
merchantTransactionId) because it is mandatory to confirm status post
callback per docs. Update PaymentOrder status based on status API
response: - SUCCESS -> create PaymentTransaction, set order SUCCESS -
FAILED -> set order FAILED - PENDING -> keep pending and schedule
reconciliation (next task) Mark PaymentEvent.processedAt = now Return
200 quickly.
```
```
When PaymentOrder becomes SUCCESS (from status API confirmation): Run
DB transaction: - If subscription already linked to this PaymentOrder ->
no-op - Create Subscription ACTIVE: startsAt=now, endsAt=now +
plan.durationDays - Create Entitlement rows from plan.metadataJson
mapping (ALL/NOTES/TESTS + optional scopes) - Link
subscription.paymentOrderId Write AuditLog "subscription.activated"
```
```
Create a service method reconcilePendingOrders(): - Find PaymentOrders
with status PENDING older than X minutes - For each, call
PhonePeProvider.checkStatus(...) - Update statuses + grant subscription
on SUCCESS - Mark EXPIRED if too old and still no success This ensures
no user gets stuck due to missing callback.
```

```
Sources
```
```
(Refund support depends on which PhonePe PG product you use; we can add once
you confirm your refund API availability in your PhonePe merchant account/docs.)
```
# Important note about “PhonePay” spelling

Itʼs commonly spelledPhonePe(the company + gateway).

## What I need from you (so we donʼt build the wrong integration)

PhonePe has multiple integration “flavors” (standard checkout/web vs other flows).
Without slowing you down, Iʼll assumeWebsite Standard Checkout / Pay API + Status
API(most common for web apps).

If you tell me just this one thing, Iʼll tailor payload fields precisely:

Are you usingWebsite Standard Checkout(redirect to PhonePe hosted page)
orUPI intent / app flow?
If you reply “standard checkout”, Iʼll give you the exact request/response payload
structure prompts for the Pay + Status endpoints using the current docs.

```
Website Standard Checkout is okay but it should work
properly on mobile device's browsers as well. Most of the
users are going to use our application via mobile only
```
Yes —Website Standard Checkout works fine on mobile browsers, as long as you
implement it as afull-page redirect flow(not a popup) and you alwaysconfirm
payment via Status APIafter redirect/callback.

PhonePeʼs Standard Checkout is explicitly designed for website integrations (including
mobile web), and their docs show the flow as:Initiate → get redirect URL → open
redirect URL on client.

Below is the exact “make it work on mobile” guidance + what to change in your
plan/prompt set.


## What you must do for mobile web reliability

### 1) Use full-page redirect (never open in a popup)

Mobile browsers + in-app browsers often block popups or break window.open flows.
The most reliable method is:
backend returns redirectUrl
frontend does: window.location.href = redirectUrl
PhonePe docs literally describe opening the redirect URL client-side to show the
payment page.

✅ This works in Chrome/Android, Safari/iOS, and most in-app browsers.

### 2) Always use both: redirectUrl (frontend) + callbackUrl (backend)

PhonePeʼs Standard Checkout flow is built around redirecting the user back after
completion (success/failure) and also providing server-side status updates via
callbacks/webhooks.

Best practice:

```
redirectUrl → your Next.js route like /payment/return?txn=...
callbackUrl/webhook →^ your^ backend^ endpoint^ for^ server-to-server^ update
```
### 3) Confirm final status using the Status/Check API (donʼt trust redirect

### alone)

Redirects can be interrupted (user closes tab, network issues). Your return page
shouldpoll your backendfor the final order status until it becomes SUCCESS/FAILED
(or times out to “Pending”).

(PhonePe provides a “check status” API in their docs reference set; integrate it into your
backend reconciliation + post-callback verification.)

## Update to your backend plan (PhonePe Standard Checkout, mobile-

## safe)

### A) Add a “return status” endpoint for the frontend

You already have PaymentOrder table. Add:


GET /payments/orders/:merchantTransactionId/status
returns {status, planKey, amount, message}
Your Next.js return page calls this in a loop.

### B) Checkout endpoint should return a redirectUrl

Your backend should return:
merchantTransactionId
redirectUrl (PhonePe^ payment^ page^ url)
optionally returnUrl (your frontend route)
PhonePeʼs “integration steps” mention providing a redirection URL for after payment.

### C) Webhook/callback handler updates DB but frontend still polls

Your webhook/callback updates PaymentOrder to SUCCESS/FAILED/PENDING.
Frontend polling ensures the user sees correct state even if webhook is late.

PhonePe webhook handling docs mention setting up a webhook URL and authentication
(username/password) for secure communication.

## Codex prompts you should add/modify (payments set add-on)

### TASK PP-M 1 — Return page polling endpoint

### TASK PP-M 2 — Mobile-safe checkout response

### TASK PP-M 3 — Callback/webhook security hardening

```
Add endpoint: GET /payments/orders/:merchantTransactionId/status Auth
required (user must own the order) OR use a signed short-lived token in
query param. Return: status (CREATED|PENDING|SUCCESS|FAILED|EXPIRED),
amount, planKey, updatedAt. Ensure it never leaks sensitive provider
details.
```
```
Update POST /payments/checkout: Return a response shaped for mobile web
redirect: { merchantTransactionId, redirectUrl, // PhonePe hosted page
URL returnUrl // your frontend page to show status } Frontend must do:
window.location.href = redirectUrl (no popup).
```
```
Secure /payments/webhook/phonepe: - Add HTTP Basic auth
(username/password from env) if PhonePe is configured that way - Also
store raw request body and hash it for idempotency - Update PaymentOrder
```

```
Sources
```
### TASK PP-M 4 — Reconciliation job + status API usage

## Frontend behavior youʼll implement later (just so youʼre aligned)

On Next.js:

1. Student clicks “Pay” → calls /payments/checkout
2. Redirect to PhonePe redirectUrl
3. PhonePe returns to /payment/return?txn=...
4. Return page calls /payments/orders/:txn/status every 2–3 seconds for ~30–60
    seconds:
       SUCCESS → show “Activated”
       FAILED → show failure + retry
       PENDING → show “Weʼre verifying, donʼt close” + keep polling
This pattern is the single biggest thing that makes mobile payments “feel reliable”.

## One quick question (so we donʼt implement the wrong PhonePe API

## version)

PhonePe docs have multiple “versions/paths” across time and products (v2/v 4
references). Your PhonePe dashboard credentials typically indicate which one you
should use.

If you already have the merchant dashboard access:

do you seePG V 2 orAccept Payments v 4 mentioned in the setup/docs?
If you donʼt know, no worries — we can still implement it cleanly behind a provider
adapter so swapping the exact endpoint paths later is painless.

```
and create PaymentEvent - Do not grant subscription unless status
confirmed (either by callback data validation or by status API call)
```
```
Add PaymentsReconciler service: - Periodically check PENDING orders
older than 2-3 minutes - Call PhonePe status API and finalize order - On
SUCCESS: grant subscription + entitlements transactionally This ensures
correctness even on mobile drop-offs.
```

```
version is not known yet
```
Thatʼs totally fine — you can still implement PhonePecleanly and safely even if the
exact “version” (v2/v3/v 4 paths) isnʼt known yet, as long as you build the provider as
aversioned adapterwhere theAPI paths are configuration, not hardcoded.

PhonePeʼs Standard Checkout concept remains the same across versions: you initiate
payment, redirect user to a hosted page, then verify outcome via status/check and/or
callback.

Below is exactly how to structure it so you wonʼt redo work later.

## What stays the same (regardless of version)

### A) Mobile-friendly Standard Checkout

```
Backend creates a transaction/order and returns aredirect URL
Frontend does afull-page redirect(works on mobile browsers)
```
### B) Integrity check mechanism

PhonePe requires theX-VERIFY checksumcomputed from base64(payload) +
apiPath + saltKey, then ###saltIndex. The only thing that changes between
versions is theapiPathstring.
So:make apiPath configurable.

## The main change you should do now

### Build a “PhonePeVersionConfig” and keep endpoints out of code

Instead of baking in /pg/v1/pay or /v1/payment/init, define:
PHONEPE_API_BASE_URL
PHONEPE_PAY_PATH
PHONEPE_STATUS_PATH_TEMPLATE (e.g. /.../{merchantId}/{merchantTransactio
nId})
PHONEPE_XVERIFY_MODE (some flows use payload-based checksum; status calls
might use different construction depending on the product line)


Your X-VERIFY helper takes payPath or statusPath as input, so switching version
becomes just changing env values.

PhonePe docs show the checksum depends on the endpoint path string
(e.g. "/v1/payment/init" in some docs), which is exactly why it must be config-
driven.

## Update to your Payments Set (PhonePe) — “version-agnostic” tasks

### TASK PP-V 1 — Add versioned config layer

### TASK PP-V 2 — Implement X-VERIFY utility that takes apiPath as parameter

This matches PhonePeʼs checksum definition where the apiPath string is part of the
hash input.

### TASK PP-V 3 — PhonePeProvider uses config paths

### TASK PP-V 4 — End-to-end flow stays identical

```
Add PhonePeConfigService that reads env: PHONEPE_API_BASE_URL
PHONEPE_PAY_PATH PHONEPE_STATUS_PATH PHONEPE_MERCHANT_ID
PHONEPE_SALT_KEY PHONEPE_SALT_INDEX PHONEPE_CALLBACK_URL
PHONEPE_REDIRECT_URL Expose methods: - getPayUrl() => baseUrl + payPath
```
- getStatusUrl(merchantTransactionId) => baseUrl + statusPath with
placeholders Never hardcode paths in code.

```
Implement computeXVerify(base64Payload, apiPath, saltKey, saltIndex):
checksum = sha256(base64Payload + apiPath + saltKey) return checksum +
"###" + saltIndex Write unit tests with known sample values (use local
fixtures).
```
```
Implement PhonePeProvider.initiatePayment(payload): - base64 =
base64Encode(JSON.stringify(payload)) - xVerify = computeXVerify(base64,
PAY_PATH, SALT_KEY, SALT_INDEX) - POST to PAY_URL Return redirectUrl
from response in a normalized format. Implement
PhonePeProvider.checkStatus(merchantTransactionId): - Build status URL
from config - Compute xVerify according to config mode (default: use
empty payload or concatenation rule that your config specifies) - Call
status endpoint and normalize to SUCCESS/FAILED/PENDING with provider
reference ids.
```

```
Sources
```
## Why this is the best approach for your situation

Because when you finally get PhonePe dashboard docs/credentials, youʼll discover
which exact paths they want — and youʼll just set:
PHONEPE_PAY_PATH
PHONEPE_STATUS_PATH
...and the code wonʼt change.

## Extra “mobile-first” reliability tips (keep these in your

## implementation)

1. Always full redirectto PhonePe hosted page (no popup).
2. After returning to your site, show a “Verifying payment...” page andpoll:
    GET /payments/orders/:merchantTransactionId/status
3. Your webhook/callback processing should be idempotent and always confirm using
    status API (your reconciler already covers missed callbacks).

## What I recommend you implement next (still in dev/local)

If you want, I can now give you theexact Next.js “return page polling”
prompts(student app side) — but since you said “backend focus now”, the next
backend set should be:
Refunds + settlement reconciliation (v2)(if PhonePe PG account supports
refunds in your plan)
Coupon codes / plan upgrades
Hardening: rate limits, replay protection, audit trails
Just say:“next backend payments hardening”or“next backend coupons/upgrades”.

```
Keep your earlier flow unchanged: POST /payments/checkout -> create
PaymentOrder + call provider.initiatePayment -> return redirectUrl POST
/payments/webhook/phonepe -> store event -> call provider.checkStatus ->
update order + grant subscription on SUCCESS GET
/payments/orders/:merchantTransactionId/status -> frontend polls after
redirect return
```

```
continue with the backend first and then we can go
ahead with the frontend
```
Got it — weʼll keep goingbackend-first. Since payments are the “money path”, the next
most important backend work is:

1. Payments hardening(idempotency, retries, reconciliation, security, audit)
2. Coupons / discounts / upgrades(optional but common)
3. Access-control + feature gating(entitlements integrated everywhere)
4. Observability + abuse controls(rate limiting, logs, analytics seeds)
HereʼsBackend Payments Set v 2 (Hardening + Growth)as minute-level Codex tasks.

# BACKEND — Payments Set v 2

## (Hardening → Reconciliation → Security → Coupons → Upgrades →

## Email/SMS hooks)

## 1) Payment flow hardening (must-have)

### TASK PH 1 — Normalize “Order state machine” and enforce transitions

### TASK PH 2 — Idempotency keys for checkout + avoid duplicate pending

### orders

```
Implement a strict PaymentOrder status state machine: CREATED ->
PENDING -> SUCCESS|FAILED|EXPIRED Rules: - SUCCESS is terminal - FAILED
is terminal - EXPIRED is terminal Prevent illegal transitions in
PaymentsService with a guard function. Add unit tests for transitions.
```
```
Implement idempotency for POST /payments/checkout: - Accept
Idempotency-Key header (optional). If present, reuse existing
PaymentOrder for same user+plan+key within 15 mins. - Also add server-
side protection: If user has an existing PENDING order for same plan
created within last 10 minutes, return that instead of creating a new
one. Return same redirectUrl.
```

### TASK PH 3 — Make webhook processing exactly-once (DB lock + processed

### flag)

### TASK PH 4 — Payment “finalization” service method (single source of truth)

## 2) Reconciliation and “pending” recovery (mobile-first reliability)

### TASK PH 5 — Reconciler cron job (local dev scheduler)

### TASK PH 6 — Student return-page polling endpoint (secure)

### TASK PH 7 — “Manual finalize” endpoint for admin support

```
In webhook/callback processing: - Upsert PaymentEvent by
providerEventId (or hash(rawBody)) with unique constraint. - Process
inside a transaction: - SELECT PaymentEvent FOR UPDATE - If processedAt
exists -> exit - Else finalize order using checkStatus and update tables
```
- Set processedAt This prevents double-processing under concurrency.

```
Create PaymentsFinalizerService.finalize(merchantTransactionId): -
Calls provider.checkStatus() - Updates PaymentOrder status accordingly -
Creates PaymentTransaction if provider indicates success and it doesn't
exist - Grants subscription+entitlements only if: order transitions to
SUCCESS and subscription not already created Used by: - webhook handler
```
- reconciliation job - manual admin finalize endpoint

```
Implement a Reconciler that runs every 1 minute (in dev): - Find
PaymentOrders in PENDING older than 2 minutes and < 1 day - Call
PaymentsFinalizerService.finalize(txnId) - If still pending after 30
minutes -> EXPIRED Log a summary. Make schedule configurable via env.
```
```
Implement: GET /payments/orders/:merchantTransactionId/status Security:
```
- Require auth and ensure order.userId == current user Response:
{status, plan, amount, updatedAt, message} This enables frontend to poll
after redirect return.

```
Admin endpoint: POST
/admin/payments/orders/:merchantTransactionId/finalize Calls
PaymentsFinalizerService.finalize() Policy: payments.manage Audit log
action. Useful when callbacks fail.
```

## 3) Security hardening (callbacks, replay, abuse)

### TASK PH 8 — Callback/webhook authentication wrapper (configurable)

### TASK PH 9 — Rate limiting for payment endpoints

### TASK PH 10 — Audit logs for every sensitive payment action

## 4) Subscription rules (renewals, overlaps, expiry behavior)

### TASK PH 11 — Subscription overlap policy (extend vs replace)

### TASK PH 12 — Expiry job

## 5) Coupons & discounts (optional but common and fast ROI)

```
Add optional webhook auth layers: - If PHONEPE_WEBHOOK_BASIC_USER/PASS
present -> enforce Basic Auth - Always store rawBody hash and reject
exact duplicates with same hash+timestamp window (best-effort) - Rate
limit webhook endpoint by IP (light) Log invalid signature/auth
attempts.
```
```
Add rate limits: - POST /payments/checkout: e.g. 5 per 10 minutes per
user - GET /payments/orders/:id/status: e.g. 60 per minute per user
(polling) Implement via NestJS throttler or Redis-based limiter
placeholder.
```
```
Add AuditLog entries for: - checkout_created - webhook_received (store
event id only) - order_finalized_success / failed / expired -
subscription_granted - admin_finalize_called Keep metaJson small but
include merchantTransactionId and planKey.
```
```
Implement rule: If user has ACTIVE subscription and buys another plan:
```
- Default behavior: extend endsAt by plan.durationDays (stacking) OR -
replace behavior: startsAt = now, endsAt = now+duration (config) Make it
a config flag SUBSCRIPTION_STACKING=true/false. Write tests.

```
Add daily job: - Mark subscriptions EXPIRED when endsAt < now -
Optionally clean up entitlements by setting endsAt to subscription
endsAt Keep EntitlementService consistent.
```

### TASK PC 1 — Coupon schema

### TASK PC 2 — Apply coupon during checkout

### TASK PC 3 — Finalize coupon redemption on success

## 6) Upgrades/downgrades (simple version)

### TASK PU 1 — Plan tiers + upgrade rules (minimal)

## 7) Notifications hooks (keep it modular)

Even if you donʼt integrate SMS/email now, prepare events.

### TASK PN 1 — Payment event emitter

```
Add Prisma models: Coupon: - id(uuid) - code(unique uppercase) - type
(PERCENT|FLAT) - value (int) // percent or paise -
maxDiscountPaise(optional) - minOrderPaise(optional) - startAt, endAt -
usageLimitTotal(optional) - usageLimitPerUser(optional) - isActive -
createdAt CouponRedemption: - id(uuid) - couponId - userId -
paymentOrderId(optional) - redeemedAt Unique constraint: - (couponId,
userId, paymentOrderId) or track counts with queries Indexes on
couponId, userId.
```
```
Update POST /payments/checkout to accept optional couponCode. Validate
coupon: - active, within date window - limits not exceeded Compute
discount: - percent or flat Clamp to maxDiscount and minOrder Store
discount details in PaymentOrder.notesJson (or dedicated fields:
discountPaise, finalAmountPaise) Use finalAmountPaise to create provider
payment. Record a pending CouponRedemption linked to PaymentOrder.
```
```
On successful payment finalization: - Mark CouponRedemption redeemedAt
(if not already) - Ensure idempotency (only once per order) If payment
fails/expired: - either delete pending redemption or keep for audit with
paymentOrderId reference
```
```
Add to Plan.metadataJson: - tier (int) - features list (NOTES, TESTS,
PRACTICE) Upgrade rule: - If user buys a higher tier, immediately set
entitlements to ALL of new plan and extend expiry by
remainingDays+newDuration OR replace based on config. Implement in
SubscriptionService.
```

## 8) Testing pack (donʼt skip)

### TASK PT 1 — E 2 E tests for the money path

# After this set, youʼll have:

✅ Mobile-safe payment flow (redirect + polling)
✅ Exactly-once webhook processing
✅ Recovery from missed callbacks (reconciler)
✅ Subscription stacking/expiry rules
✅ Coupons + discounts ready
✅ Clean “provider adapter” so PhonePe version/path can change via env

## What backend set should I send next?

Pick one (Iʼll go in order if you donʼt choose):

1. next backend anti-piracy hardening(notes streaming + view tokens + watermark
    seed rotation + anomaly detection)
2. next backend admin CMS(dynamic landing + app sections + banners + home
    widgets + syllabus ordering)
3. next backend observability(logging, tracing IDs, metrics endpoints, slow query
    logs, audit explorer)
4. next backend print engine(generate question paper PDFs from tests + templates +
    queue worker logic)
Reply with:“next backend anti-piracy”(recommended), or any option number.

```
Implement domain events (internal): - PaymentSucceeded(userId, orderId)
```
- SubscriptionActivated(userId, endsAt) - PaymentFailed(userId, reason)
Wire them into finalizer. No external provider required; just logs for
now.

```
Write e2e tests (supertest): - checkout creates PENDING order and
returns redirectUrl - webhook event idempotency: same event twice does
not duplicate transactions/subscriptions - finalization creates
subscription and entitlements exactly once - status endpoint only
accessible by owner Mock provider.checkStatus
```

```
just consider the best options and go ahead
```
Alright — Iʼll pick the best next backend set and move forward.

Given your platform (paid notes + mobile-heavy usage), the highest ROI after payments
is:

1. Anti-piracy hardening for Notes(make downloading hard, make leaks traceable,
    reduce scraping)
2. Admin CMS “dynamic app” content controls(so frontend can be flexible without
    redeploys)
Iʼll doAnti-piracy first(because it protects revenue from day 1). Then weʼll do CMS.

# BACKEND — Anti-Piracy Set v 1 (Notes)

### Goals

```
No raw PDFs exposed
View sessions + short-lived tokens
Rate limiting + anomaly detection hooks
Watermark “facts” + rotating seed
Access logging usable for audits
Make scraping expensive + detectable
```
## AP1) Harden content delivery (PDF streaming + range support)

### TASK AP1.1 — Robust Range streaming (PDF.js-friendly)

```
These arebackend-onlytasks. Frontend will overlay watermark
using /notes/:id/watermark.
```
```
Update GET /notes/:id/content to fully support Range requests: - Parse
Range header: bytes=start-end - Stream only requested bytes from MinIO
(use getObject with range if available; otherwise stream and slice
carefully) - Return 206 Partial Content with Content-Range, Accept-
Ranges, Content-Length - If no Range header, stream entire file with 200
```

### TASK AP1.2 — Disable caching + force inline display

## AP2) Enforce “view session” everywhere (token binding)

### TASK AP2.1 — Upgrade NoteViewSession model for stronger binding

### TASK AP2.2 — Require view token on every content request

### TASK AP2.3 — Limit concurrent sessions per note per user

### TASK AP2.4 — Optional: bind session to IP/User-Agent “softly”

```
Headers: - Cache-Control: no-store - Pragma: no-cache - X-Content-Type-
Options: nosniff Never return MinIO URLs. Add unit tests for Range
parsing.
```
```
Ensure response headers: - Content-Disposition: inline; filename="
<safe>.pdf" - Cache-Control: no-store, max-age=0 - Surrogate-Control:
no-store - Expires: 0 Confirm no CDN/browser caching for PDFs.
```
```
Extend NoteViewSession: - id(uuid) - userId - noteId - tokenHash -
watermarkSeed - expiresAt - revokedAt - createdAt - lastSeenAt -
ipHash(optional) - userAgentHash(optional) - deviceHint(optional string)
Add index on (userId, noteId, expiresAt).
```
```
Enforce for GET /notes/:id/content: - Require header X-View-Token -
Validate tokenHash matches an active NoteViewSession: expiresAt > now,
revokedAt is null, userId matches auth user - Update lastSeenAt If
invalid -> 401/403 Return generic error (don’t leak which check
failed).
```
```
Implement rule: - Allow max N active NoteViewSessions per user+note
(e.g., 2) - When creating a new view session, revoke oldest sessions
beyond limit This reduces token sharing.
```
```
On creating NoteViewSession store ipHash + userAgentHash. On content
requests: - If ipHash/userAgentHash mismatches, allow but increment
suspicion score. Do not hard-block because mobile networks change IP
frequently.
```

## AP3) Access logging (for traceability + analytics)

### TASK AP3.1 — Add structured NoteAccessLog (expand)

### TASK AP3.2 — Add “NoteSecuritySignal” table (anomaly events)

## AP4) Scraping deterrence (backend-side signals + throttles)

### TASK AP4.1 — Rate limit PDF content endpoint per user+note

### TASK AP4.2 — Detect “range scraping” pattern

### TASK AP4.3 — Token reuse detection across devices

```
Ensure NoteAccessLog includes: - id(uuid), userId, noteId -
viewSessionId - ip, userAgent - bytesServed(optional) -
rangeStart(optional), rangeEnd(optional) - createdAt Write logs for
every /content request (or sample if high volume).
```
```
Add Prisma model NoteSecuritySignal: - id(uuid) - userId - noteId -
viewSessionId(optional) - type
(TOO_MANY_REQUESTS|RANGE_SCRAPE|MULTI_DEVICE|TOKEN_REUSE|IP_FLAPPING|UA_CHA
```
- severity (LOW|MEDIUM|HIGH) - metaJson - createdAt Used for admin
review later.

```
Implement rate limiting for GET /notes/:id/content: - Key:
userId:noteId - Example: 60 requests per 2 minutes (tune later) Return
429 with Retry-After. Log NoteSecuritySignal TOO_MANY_REQUESTS on
repeated violations. Use in-memory limiter for dev; keep interface
compatible with Redis later.
```
```
Add detection: If the client requests sequential ranges rapidly (e.g.
0-1MB, 1-2MB, 2-3MB...) without normal PDF.js access pattern, mark as
RANGE_SCRAPE (MEDIUM/HIGH). Heuristic: - many distinct ranges in short
time - ranges cover large portion of file quickly On detection: -
increase rate limit strictness for that session - optionally revoke view
session for HIGH severity (configurable). Record NoteSecuritySignal.
```
```
If same X-View-Token is used with different userAgentHash/deviceHint
frequently, log TOKEN_REUSE (HIGH) and optionally revoke that view
session. Do not auto-ban user in v1; only revoke view session.
```

## AP5) Watermark data that is hard to deny later (rotating seed)

### TASK AP5.1 — Rotate watermarkSeed periodically

### TASK AP5.2 — Add signed watermark payload (tamper-resistant)

## AP6) “No direct file access” enforcement (MinIO is private)

### TASK AP6.1 — Ensure MinIO bucket is not publicly accessible

### TASK AP6.2 — Ensure fileAsset objectKey is never returned to student

## AP7) Admin monitoring endpoints (minimal v1)

### TASK AP7.1 — Admin note access logs viewer APIs

```
Implement: GET /notes/:id/watermark Returns watermark payload: -
displayName - maskedEmail/phone - userHash (stable short hash) - noteId
```
- issuedAt - viewSessionId - watermarkSeed Rotate watermarkSeed every X
minutes: - if now - lastSeedRotationAt > X -> generate new seed and
update session This ensures recorded piracy screenshots have time-bound
fingerprint.

```
Sign watermark payload with server secret: - watermarkSignature =
HMAC_SHA256(JSON(payloadWithoutSig), WATERMARK_SECRET) Return signature
with watermark data. Frontend can ignore, but you can later verify
screenshots claims (admin tooling).
```
```
Add a startup check (dev warning) verifying bucket policy is private.
Document required MinIO policy: no anonymous GET/LIST. All access must
go through API streaming.
```
```
Audit controllers: - Student note endpoints must not return
fileAssetId/objectKey/presigned urls Only return note metadata +
endpoints to view-session/content/watermark. Add tests to ensure no
objectKey leaks.
```
```
Admin endpoints: GET /admin/security/note-access?
noteId=&userId=&from=&to= GET /admin/security/signals?
```

### TASK AP7.2 — Revoke sessions + ban device (soft)

## AP8) Entitlement enforcement consistency checks

### TASK AP8.1 — Ensure every premium entrypoint requires entitlement

# Result after Anti-Piracy Set v 1

✅ PDF never downloadable via URL
✅ Tokens expire + can be revoked
✅ Scraping patterns become detectable
✅ Watermarks are time-bound + attributable
✅ Admin can inspect abuse signals

This is the best “v1” you can ship without doing heavy server-side watermarking or
DRM.

## Next backend set Iʼll do automatically after this

Admin CMS Set v 1 (dynamic landing + dynamic student home + banners +
announcements + subject/topic ordering + feature flags + content scheduling). This is
what lets you keep frontend “dynamic”.

When youʼre ready, just say:“continue backend”and Iʼll send the CMS task prompts.

```
noteId=&userId=&severity= Policy: analytics.read or security.read Return
paginated results.
```
```
Admin endpoints: POST /admin/security/note-
sessions/:viewSessionId/revoke POST /admin/security/users/:userId/block
(already exists in UsersModule) Policy: users.manage + security.manage
Audit log actions.
```
```
Add tests ensuring: - /notes/:id/view-session checks entitlement for
premium notes - /notes/:id/content checks entitlement AND view-token -
/notes/:id/watermark checks view-token Try premium note without
entitlement -> 403
```

```
continue backend
```
Great — next up isAdmin CMS Set v 1 : make the landing page + student app home +
“whatʼs new” + banners + sectionsfully dynamicfrom admin panel, without redeploys.

This set gives you:

```
A cleancontent/config model
Versioning + publish workflow
Scheduling (start/end)
Targeting (student/admin, free/paid, subject/topic)
A singlePublic Config APIthat frontend consumes
```
# BACKEND — Admin CMS Set v 1 (Dynamic Landing + App

# Content)

## CMS0) Decide the content strategy (fast + scalable)

Weʼll usetwo layers:

1. Config Store(key/value JSON) for app-wide settings and small widgets
2. CMS Entitiesfor lists: banners, announcements, home sections, pages
This keeps it simple and flexible.

## CMS1) Core CMS models

### TASK CMS1.1 — AppConfig upgrade (versioned + publishable)

### TASK CMS1.2 — CMS entities: Banner, Announcement, HomeSection, Page

```
Upgrade AppConfig model to support versioning: AppConfig: - id(uuid) -
key (string) - version (int) - status (DRAFT|PUBLISHED|ARCHIVED) -
valueJson (Json) - createdByUserId - publishedByUserId(optional) -
publishedAt(optional) - createdAt, updatedAt Unique: (key, version) Add
helper: only one PUBLISHED per key at a time. Migrate existing simple
AppConfig rows to version=1 PUBLISHED.
```

## CMS2) Admin APIs (CRUD + publish + scheduling)

### TASK CMS2.1 — Admin Config endpoints (draft/publish flow)

### TASK CMS2.2 — Admin Banners CRUD

### TASK CMS2.3 — Admin Announcements CRUD

```
Add Prisma models: Banner: - id(uuid) - title - subtitle(optional) -
imageAssetId(optional) // from FileAsset (use /assets/:id) -
linkUrl(optional) - target (PUBLIC|STUDENT|ADMIN) - priority(int default
0) - startAt(optional), endAt(optional) - isActive(boolean default true)
```
- metaJson(optional) // e.g. theme, gradient, tracking - createdByUserId
- createdAt, updatedAt Announcement: - id(uuid) - title - bodyJson
(Json) // rich blocks text/image - target (STUDENT|ADMIN|ALL) -
startAt(optional), endAt(optional) - isPinned(boolean) -
isActive(boolean) - createdByUserId - createdAt, updatedAt HomeSection:
- id(uuid) - key(unique) // e.g. "featured_notes", "upcoming_tests",
"top_topics" - title - type (NOTES|TESTS|TOPICS|CUSTOM) - configJson
(Json) // e.g. filters: subjectId/topicIds, limit, sort - target
(STUDENT|PUBLIC) - orderIndex - startAt(optional), endAt(optional) -
isActive(boolean) - createdAt, updatedAt Page: - id(uuid) - slug(unique)
// "about", "privacy", "terms" - title - bodyJson (Json) - status
(DRAFT|PUBLISHED) - publishedAt(optional) - createdByUserId - createdAt,
updatedAt Add indexes for active+time windows and ordering. Migrate.

```
Implement AdminConfigController: GET /admin/config?key= POST
/admin/config/:key/draft -> creates new DRAFT version based on latest
published PUT /admin/config/:key/draft/:version -> updates valueJson
POST /admin/config/:key/publish/:version -> sets that version PUBLISHED,
archives previous GET /admin/config/:key/published -> latest published
Policy: admin:config:write Audit logs for draft/create/publish.
```
```
Implement AdminBannersController: POST /admin/banners PATCH
/admin/banners/:id GET /admin/banners?target=&active=&from=&to= POST
/admin/banners/:id/activate POST /admin/banners/:id/deactivate Validate
imageAssetId exists and confirmed. Policy: content.manage Audit logs.
```
```
Implement AdminAnnouncementsController: POST /admin/announcements PATCH
/admin/announcements/:id GET /admin/announcements?target=&active= POST
/admin/announcements/:id/pin POST /admin/announcements/:id/unpin
Validate bodyJson schema (blocks). Policy: content.manage Audit logs.
```

### TASK CMS2.4 — Admin HomeSection CRUD

### TASK CMS2.5 — Admin Pages (CMS pages for landing/legal)

## CMS3) Public/Student-facing CMS APIs (single source for frontend)

### TASK CMS3.1 — Public config endpoint for landing page

### TASK CMS3.2 — Student app config endpoint

### TASK CMS3.3 — Resolve HomeSections into actual content (server-side)

```
Implement AdminHomeSectionsController: POST /admin/home-sections PATCH
/admin/home-sections/:id GET /admin/home-sections?target=&active=
Reorder endpoint: POST /admin/home-sections/reorder Body: [{id,
orderIndex}] Validate configJson by type: - NOTES: filters like
{subjectId?, topicIds?, premiumOnly?, limit, sort} - TESTS: filters like
{upcomingOnly?, limit} - TOPICS: {subjectId?, limit} Policy:
content.manage Audit logs.
```
```
Implement AdminPagesController: POST /admin/pages (slug, title,
bodyJson) PATCH /admin/pages/:id POST /admin/pages/:id/publish GET
/admin/pages?status= Policy: content.manage Audit logs.
```
```
Implement PublicCmsController: GET /cms/public Return: - banners where
target=PUBLIC and isActive and within time window - homeSections where
target=PUBLIC and active within time window - pages metadata
(slug/title) for published pages if needed - selected published
AppConfig keys: landing.theme, landing.hero, landing.cta, etc. This
endpoint must be cache-friendly (but respect schedules).
```
```
Implement: GET /cms/student Auth required. Return: - banners
target=STUDENT active in time window - announcements target=STUDENT or
ALL (include pinned first) - homeSections target=STUDENT active in time
window - published AppConfig keys: app.home, app.features, app.support,
etc. Also return user subscription summary so UI can show locked
sections.
```
```
Implement HomeSectionResolverService: Given HomeSection.type and
configJson, resolve into payload: - NOTES: query published notes
filtered by subject/topic/premium, return list - TESTS: query published
tests filtered by config, return list - TOPICS: query topics by
subject/orderIndex, return list - CUSTOM: return configJson as-is
```

## CMS4) Rich content schema for announcements/pages (text +

## images)

### TASK CMS4.1 — Reuse the “ContentBlock” schema

## CMS5) Permissions & safety

### TASK CMS5.1 — Add CMS permissions

### TASK CMS5.2 — Prevent leaking internal config keys

## CMS6) Performance (moderate traffic ready)

### TASK CMS6.1 — Response caching with version stamp

```
PublicCmsController and StudentCmsController should return resolved
sections so frontend is dumb. Optimize queries to avoid N+1 (batch by
type).
```
```
Standardize bodyJson schema used in Announcement/Page: bodyJson = {
blocks: [{ type: "text"|"image", text?, imageAssetId?, styleJson? }] }
Validate blocks: - imageAssetId must exist and be confirmed - restrict
max blocks and total size Use same Assets endpoint for images.
```
```
Add permissions: content.manage content.read cms.pages.publish
cms.config.write Update roles: ADMIN_SUPER -> all ADMIN_CONTENT ->
content.manage + cms pages/config Ensure guards enforce admin type +
permissions.
```
```
Implement allowlist of AppConfig keys that can be returned from
/cms/public and /cms/student. Never return secrets, payment keys,
internal flags. Add tests to ensure only allowlisted keys returned.
```
```
Implement simple caching layer for /cms/public and /cms/student: -
Cache by key: cms:public and cms:student:{userTier} - Include a
"cmsVersion" stamp (max updatedAt among relevant tables) to invalidate
cache. Use in-memory cache for dev; wrap with interface for Redis
later.
```

### TASK CMS6.2 — DB indexes for time-window filtering

# What youʼll be able to do after CMS Set v 1

✅ Admin can control landing page content (hero text, CTAs, banners, sections)
✅ Admin can change student app home layout (featured notes/tests/topics)
✅ Announcements can be scheduled + pinned
✅ Pages (Privacy/Terms/About) managed in CMS
✅ Frontend becomes mostly rendering — no hardcoding

## Next backend set (Iʼll choose best unless you tell otherwise)

After CMS, the best next backend work is:

1. Admin panel operational APIs(dashboards, counts, quick actions)
2. Analytics v 1 (topic progress, test trends, revenue summaries)
3. Print engine v 1 (generate question papers PDFs)
Say“continue backend”again and Iʼll proceed withAnalytics v 1 (because you already
asked for progress & metadata, and it powers admin + student insights).

```
Add indexes: Banner(target, isActive, startAt, endAt, priority)
Announcement(target, isActive, startAt, endAt, isPinned)
HomeSection(target, isActive, startAt, endAt, orderIndex) Verify queries
use indexes.
```
```
continue backend
```
Next best backend set:Analytics v 1 (because you already want practice/test progress
and itʼs essential for both student motivation + admin visibility). This set is designed to
becheap to query(aggregates + indexed event tables), not expensive “scan
everything” queries.

Weʼll cover:

```
Student analytics (notes progress, practice progress, test performance)
Admin analytics (usage, engagement, revenue)
Data pipeline basics (events → aggregates), without needing external BI.
```

# BACKEND — Analytics Set v 1 (Student + Admin)

## AN0) Analytics principles (what weʼre implementing)

```
Events are truth(PracticeQuestionEvent, Attempt, NoteAccessLog, PaymentOrder)
Aggregates make dashboards fast(UserTopicProgress, UserSubjectProgress,
Daily counters)
UsePostgres-friendly grouping+ indexes.
```
## AN1) Extend data capture where needed

### TASK AN1.1 — Notes progress tracking (last read page + completion)

### TASK AN1.2 — Update NoteAccessLog writing strategy (sampling)

### TASK AN1.3 — Ensure Attempts store topic/subject breakdown

## AN2) Student analytics APIs (fast endpoints)

### TASK AN2.1 — Student dashboard summary endpoint

```
Add Prisma model NoteProgress: - userId - noteId - lastPageRead(int
default 0) - totalPages(optional int) // from Note.pageCount when
available - percentComplete(float default 0) - lastReadAt -
completedAt(optional) Composite PK (userId, noteId) Indexes on userId,
lastReadAt. Add endpoint: POST /notes/:id/progress Body: lastPageRead,
totalPages(optional) Rules: - auth required - note must be published -
if premium note -> entitlement required Update NoteProgress
percentComplete and completedAt when >= 95% threshold.
```
```
Update NoteAccessLog creation: - For every /notes/:id/content request,
log bytesServed + rangeStart/end - If high volume, implement sampling by
config LOG_NOTE_ACCESS_SAMPLE_RATE (e.g. 0.3) Keep NoteProgress endpoint
as main progress signal.
```
```
When evaluating a test attempt, enrich Attempt.scoreJson: - perSubject:
{subjectId: {correct, wrong, skipped, score}} - perTopic: {topicId:
{correct, wrong, skipped, score}} (topicId may be null) Store totals +
accuracyPct. This makes analytics instant without recomputation.
```

### TASK AN2.2 — Notes analytics endpoints

### TASK AN2.3 — Practice analytics endpoints (topic-wise trends)

### TASK AN2.4 — Test analytics endpoints

## AN3) Admin analytics APIs (usage + content + revenue)

### TASK AN3.1 — Admin KPI overview

### TASK AN3.2 — Admin content coverage analytics (syllabus gaps)

```
Implement: GET /analytics/me/summary Returns: - notes: {completedCount,
inProgressCount, lastReadNotes[]} - practice: {todayAttempted,
todayAccuracy, weakestTopics[], strongestTopics[]} - tests:
{attemptedCount30d, avgScore30d, lastAttempts[]} - subscription:
{isActive, endsAt} Use NoteProgress, UserTopicProgress, Attempt,
Subscription. Optimize with indexed queries.
```
```
Implement: GET /analytics/me/notes Returns: - list of notes with
percentComplete, lastReadAt Filters: subjectId, topicId, status
(COMPLETED|IN_PROGRESS|NOT_STARTED) GET /analytics/me/notes/subjects
Returns subject-wise completion stats: - totalNotes, completedNotes,
avgCompletionPct
```
```
Implement: GET /analytics/me/practice/topics?subjectId= Return
UserTopicProgress rows: - totalCorrect/totalWrong/accuracyPct/updatedAt
Also return a 7-day trend per topic (optional v1): - from
PracticeQuestionEvent grouped by day where eventType=ANSWERED GET
/analytics/me/practice/weak-questions?topicId=&limit= Return questions
with highest wrongCount from UserQuestionState.
```
```
Implement: GET /analytics/me/tests Return: - last N attempts (test
title, score, accuracyPct, submittedAt) - subject/topic breakdown for
last attempt (from Attempt.scoreJson) Filters: date range, testId GET
/analytics/me/tests/performance?subjectId=&topicId= Aggregate from
Attempt.scoreJson across last 30 days.
```
```
Implement: GET /admin/analytics/overview?from=&to= Return KPIs: -
newStudents - activeUsers (notes/practice/tests activity) - notesViews -
practiceAnswers - testAttempts - revenue (SUCCESS orders sum) -
conversionRate (orders/unique active) Policy: analytics.read
```

### TASK AN3.3 — Admin payments/revenue analytics

### TASK AN3.4 — Admin engagement analytics (retention proxy)

## AN4) Daily aggregates (for speed at moderate traffic)

### TASK AN4.1 — DailyStats table (rollups)

### TASK AN4.2 — Rollup job for “yesterday” (consistency)

## AN5) Query optimization + indexes (donʼt skip)

```
Implement: GET /admin/analytics/coverage?subjectId= Return: - topics
with notes count - topics with questions count - topics with tests
coverage (via mixer rules or question distribution) Highlight gaps (0
notes or 0 questions) Policy: analytics.read
```
```
Implement: GET /admin/analytics/revenue?
from=&to=&groupBy=day|week|month From PaymentOrder where status=SUCCESS:
```
- total revenue - count of orders - avg order value Also top plans by
revenue. Policy: analytics.read

```
Implement: GET /admin/analytics/engagement?from=&to= Compute: - DAU/WAU
(based on PracticeQuestionEvent, Attempt submitted, NoteProgress
lastReadAt) - top subjects/topics by engagement - cohort-ish proxy:
users active in last 7 days who joined in last 30 days Policy:
analytics.read
```
```
Add Prisma model DailyStat: - date (YYYY-MM-DD) as string or Date -
metricKey (e.g. NOTES_VIEWS, PRACTICE_ANSWERS, TEST_ATTEMPTS, NEW_USERS,
REVENUE_PAISE) - valueInt Composite PK (date, metricKey) Create
AnalyticsRollupService: - increment(metricKey, amount, date=now) Call
increment in: - note progress updates (NOTES_VIEWS or
NOTES_PROGRESS_UPDATES) - practice answer submission (PRACTICE_ANSWERS)
```
- test submit (TEST_ATTEMPTS) - payment success finalization
(REVENUE_PAISE)

```
Create a daily job: - recompute yesterday’s DailyStat from raw tables -
compare with counters and correct if drift > threshold This ensures
reliability even if some increments failed. Configurable in dev.
```

### TASK AN5.1 — Add indexes that analytics queries need

### TASK AN5.2 — Pagination + limits everywhere

## AN6) Privacy + security

### TASK AN6.1 — Protect student analytics endpoints

# After Analytics v1, you will have:

✅ Student progress dashboards (notes + practice + tests)
✅ Admin KPIs + engagement + revenue + syllabus coverage
✅ Daily rollups for speed
✅ Scalable enough for “moderate traffic from launch”

## Next backend set Iʼll do automatically

The most valuable next backend set isPrint Engine v 1 (generate printable PDFs for
tests/question sets), because itʼs a key admin feature in your doc and needs a worker
pipeline.

Say“continue backend”again and Iʼll sendPrint Engine v 1 prompts (worker, templates,
PDF generation pipeline, storing output to MinIO, admin download endpoints).

```
Add/verify indexes: PracticeQuestionEvent(userId, createdAt)
PracticeQuestionEvent(topicId, createdAt) Attempt(userId, submittedAt)
NoteProgress(userId, lastReadAt) PaymentOrder(status, updatedAt)
DailyStat(date, metricKey) Ensure Postgres uses these for group
queries.
```
```
Add pagination params for admin analytics endpoints returning lists: -
limit, cursor Apply max limits to prevent heavy queries.
```
```
Ensure all /analytics/me/* endpoints: - require auth - only return
current user's data Admin endpoints require analytics.read. No PII
leakage in admin lists beyond allowed.
```

```
continue backend
```
Alright —Print Engine v 1 (backend + worker pipeline) so admins can generateprint-
ready PDFsfor tests, topic-wise practice sets, or custom question papers (as your doc
requires).

This set includes:

```
job queue + worker
PDF generation approach (HTML → PDF via Playwright/Chromium is fastest)
templates
storing generated PDFs in MinIO (FileAsset)
admin endpoints to trigger + download
```
# BACKEND — Print Engine Set v 1 (Queue + PDF Generation

# + MinIO)

## PE0) Approach (fastest & stable)

Use HTML templates + Playwright → PDF
predictable layouts
easy to include images
easy to print
works for question papers + answer keys
(Weʼll generate PDFs in a worker, not in API request.)

## PE1) DB schema for print jobs & outputs

### TASK PE1.1 — PrintJob schema (extend if you already created)

```
Add/ensure Prisma model PrintJob: - id(uuid) - type
(TEST_PAPER|PRACTICE_SET|CUSTOM) - userId (admin who triggered) -
testId(optional) - subjectId(optional) - topicId(optional) - configJson
(Json) // includes filters, count, includeAnswers, includeExplanation,
language, etc. - status (QUEUED|RUNNING|DONE|FAILED) -
```

### TASK PE1.2 — PrintJobItem snapshot (optional but recommended)

## PE2) Queue + worker bootstrapping

### TASK PE2.1 — BullMQ setup (shared QueueModule)

### TASK PE2.2 — Separate worker app (recommended)

## PE3) Admin APIs to create jobs and check status

### TASK PE3.1 — Admin endpoints for printing

```
outputFileAssetId(optional) - error(optional string) -
startedAt(optional) - finishedAt(optional) - createdAt Indexes: -
status, createdAt - testId - userId
```
```
Add model PrintJobItem: - printJobId - questionId - orderIndex
Composite PK (printJobId, questionId) Index (printJobId, orderIndex)
Reason: - You snapshot the exact question set at job start -
Reproducible output even if questions change later
```
```
Integrate BullMQ (with Redis) into NestJS: - QueueModule exposes
queues: print - Add config: REDIS_URL - Implement
PrintQueueService.enqueue(printJobId) - Provide retry/backoff config:
attempts=3, backoff exponential
```
```
Create a separate NestJS bootstrap entry for worker: -
apps/worker/main.ts (or similar) - Worker loads PrintProcessor which
consumes "print" queue - Worker uses Prisma + MinIO services - Worker
logs job start/end with correlationId
```
```
Implement AdminPrintController: POST /admin/print/test/:testId Body: {
includeAnswers:boolean, includeExplanations?:boolean,
includeImages?:boolean, headerConfig?:json } Creates PrintJob type
TEST_PAPER with testId and configJson, status QUEUED, then enqueue. POST
/admin/print/practice Body: { subjectId, topicId?, count, difficulty?,
includeAnswers, includeExplanations } Creates PrintJob type PRACTICE_SET
and enqueues. GET /admin/print/jobs?status=&from=&to= GET
/admin/print/jobs/:id Policy: print.generate + analytics.read (as
needed) Audit logs on create.
```

### TASK PE3.2 — Download endpoint for generated PDF (secure)

## PE4) Selecting questions for a print job (snapshot logic)

### TASK PE4.1 — Snapshot questions for TEST_PAPER jobs

### TASK PE4.2 — Snapshot questions for PRACTICE_SET jobs

## PE5) PDF template system (HTML generation)

### TASK PE5.1 — Create HTML templates

### TASK PE5.2 — Convert ContentBlocks to HTML

```
Implement: GET /admin/print/jobs/:id/download Rules: - job must be DONE
and outputFileAssetId exists - stream PDF from MinIO via your existing
streaming logic Return Content-Disposition: attachment;
filename="paper_<id>.pdf" Admin-only policy.
```
```
When creating TEST_PAPER print job: - Load test by id - If test is
fixed: use TestQuestion order - If mixer-based: either: A) use a
deterministic selection with seeded randomness, OR B) require admin to
“generate paper set” first and store snapshot For v1, use deterministic
selection: - seed = hash(printJobId) - select questions based on mixer
rules in stable random order Insert into PrintJobItem with orderIndex
```
```
For PRACTICE_SET: - Query published questions by
subject/topic/difficulty - Select count - Shuffle deterministically
using seed=hash(printJobId) Insert PrintJobItem rows.
```
```
Create template files: - templates/paper.html (question paper) -
templates/answer-key.html (optional section) Use a simple CSS for print:
```
- A4, margins, consistent font sizes - Page breaks between questions -
Header with academy name + test title + date - Footer with page number
Template inputs: - paperTitle - subject/topic/test metadata - questions
array: {index, statementJson, optionsJson, imagesResolvedUrls?, marks?}
- includeAnswers, includeExplanations flags

```
Implement ContentRenderService: - renderContentBlock({text,
imageAssetId}) -> HTML snippet - For imageAssetId, embed images as:
Option A (recommended): signed internal URL that worker fetches and
```

### TASK PE5.3 — Include option images and stem images

## PE6) Worker: HTML → PDF → MinIO

### TASK PE6.1 — Playwright PDF generation utility

### TASK PE6.2 — PrintProcessor workflow

## PE7) Performance & safety controls

### TASK PE7.1 — Concurrency + limits

### TASK PE7.2 — Image embedding limits

```
base64 embeds Option B: base64 embed directly by reading bytes from
MinIO Use base64 embedding so PDF is self-contained.
```
```
Ensure renderOptions: - MCQ options support text+image - Layout: two
columns optional if fits - Ensure images have max-width constraints and
keep aspect ratio
```
```
Implement PdfGeneratorService using Playwright (Chromium): - launch
browser in headless mode - setContent(html, waitUntil networkidle) -
page.pdf({format:'A4', printBackground:true, margin: ...}) Return
Buffer. Add timeout handling and safe browser close.
```
```
Implement PrintProcessor(job): Input: printJobId Steps: 1) Update
PrintJob status RUNNING, startedAt=now 2) Load PrintJob + PrintJobItems
+ Questions (and assets) 3) Render HTML using templates and
ContentRenderService 4) Generate PDF buffer 5) Create FileAsset (purpose
PRINT_PDF) with objectKey prints/{yyyy}/{mm}/{printJobId}.pdf 6) Upload
buffer to MinIO (putObject) 7) Confirm upload by stat + set confirmedAt
8) Update PrintJob status DONE, outputFileAssetId, finishedAt On error:
```
- set status FAILED and error message, finishedAt Also write AuditLog
"print.job.completed" / "print.job.failed"

```
Configure worker concurrency: - 1–2 jobs concurrently (PDF generation
is heavy) Set max questions per job (e.g., 200) to avoid memory blowups.
Validate in admin endpoints.
```

### TASK PE7.3 — Logging + correlation IDs

## PE8) E 2 E test harness (mock PDF)

### TASK PE8.1 — Worker test mode without Chromium

# After Print Engine v 1

✅ Admin can generate printable PDFs for tests and practice sets
✅ PDFs can include images in stems/options
✅ Output stored in MinIO, downloadable securely
✅ Fully async and scalable on your VPS later

## Next backend set (best next)

Now the backend is feature-complete for a v 1 launch. The best remaining backend work
is:

1. Admin operational dashboard APIs(counts, quick actions, audit viewer)
2. E 2 E test suitefor the critical flows (auth → subscription → notes → practice →
    tests)
3. Security & abuse controlsacross app (rate limits, payload validation hardening)
Say“continue backend”and Iʼll proceed withAdmin Ops + E 2 E critical flowsprompts.

```
Add max total embedded image bytes (e.g., 20MB). If exceed, fail job
with clear error and suggest split. This prevents OOM.
```
```
Ensure every job log includes: - printJobId - adminUserId - type -
durationMs Store duration metrics (optional) in PrintJob.metaJson.
```
```
Add a config PRINT_FAKE_PDF=true: - Worker will generate a small dummy
PDF buffer instead of Playwright. Write e2e tests: - create print job ->
status transitions -> DONE -> downloadable file exists This makes CI
easier.
```
```
skip the test suite and continue backend
```

Got it — skipping test suite. Next best backend set isAdmin Ops + Production
Hardening APIs(things admins need daily + safeguards for launch). This will also make
frontend admin panel straightforward.

# BACKEND — Admin Ops Set v 1 (Dashboards + Quick

# Actions + Audits + Moderation)

## AO1) Admin dashboard “one-call” endpoint

### TASK AO1.1 — Admin dashboard summary

## AO2) Admin quick content actions

### TASK AO2.1 — “Content health” endpoints (gaps & readiness)

### TASK AO2.2 — Bulk publish/unpublish (safe batch)

## AO3) User management & support tools

```
Implement: GET /admin/dashboard/summary?from=&to= Return: - counts:
totalStudents, activeSubscribers, totalNotesPublished,
totalQuestionsPublished, totalTestsPublished - today:
practiceAnswersToday, testAttemptsToday, notesReadsToday - revenue:
revenueToday, revenue7d, revenue30d - system: pendingPrintJobs,
failedPrintJobs, suspiciousSignals7d Policy: admin.dashboard.read Use
existing aggregates (DailyStat) + simple indexed counts.
```
```
Implement: GET /admin/content/health?subjectId= Return: -
topicsMissingNotes[] - topicsMissingQuestions[] - notesDraftCount,
notesPublishedCount - questionsDraftCount, questionsPublishedCount -
testsDraftCount, testsPublishedCount Policy: content.manage or
analytics.read
```
```
Implement: POST /admin/notes/bulk-publish POST /admin/notes/bulk-
unpublish Body: {noteIds: string[]} Validate max batch size (e.g., 50).
Write audit logs for each note or summary log with list. Policy:
notes.publish
```

### TASK AO3.1 — Student search + profile view

### TASK AO3.2 — Grant/revoke entitlement manually (support)

### TASK AO3.3 — Reset password / force logout (admin)

## AO4) Security & piracy monitoring

### TASK AO4.1 — Security signals dashboard

### TASK AO4.2 — User security profile

### TASK AO4.3 — Ban note access for a user (soft ban)

```
Implement: GET /admin/users/students?query=&status=&subscriptionStatus=
GET /admin/users/:id/profile Return: - basic user info - subscription
status - last activity times: lastNoteReadAt, lastPracticeAt, lastTestAt
Policy: users.read
```
```
Implement admin endpoints: POST /admin/users/:id/entitlements/grant
Body: {kind: NOTES|TESTS|ALL, scopeJson?, durationDays?} POST
/admin/users/:id/entitlements/revoke Body: {entitlementId} Policy:
payments.manage or users.manage Audit log with reason.
```
```
Implement: POST /admin/users/:id/force-logout Revokes all
RefreshSessions and NoteViewSessions for user. Optional: POST
/admin/users/:id/reset-password (generates temp password or sends reset
link later) Policy: users.manage Audit logs.
```
```
Implement: GET /admin/security/signals/summary?from=&to= Return counts
by type/severity and top offending users/notes. Policy: security.read
```
```
Implement: GET /admin/security/users/:userId Return: - recent
NoteSecuritySignals - recent NoteAccessLog summary (distinct notes,
request rate) - active NoteViewSessions (with revoke option) Policy:
security.read
```
```
Implement: POST /admin/security/users/:userId/notes/ban Body: {noteId,
durationHours, reason} Create DB model NoteBan: - userId, noteId,
startsAt, endsAt, reason, createdByUserId Enforce in /notes/:id/view-
session and /content. Policy: security.manage Audit logs.
```

## AO5) Payments admin ops (support + reconciliation UI)

### TASK AO5.1 — Admin payments dashboard endpoints

### TASK AO5.2 — Re-run finalize from admin UI

## AO6) Print ops (job management)

### TASK AO6.1 — Print jobs admin ops

# BACKEND — Production Hardening Set v 1 (Launch

# safeguards)

(Still dev/local friendly, but prevents launch pain)

## H1) Global rate limiting + endpoint-specific throttles

### TASK H1.1 — Add Nest throttler with sensible defaults

```
Implement: GET /admin/payments/orders?status=&userId=&from=&to= GET
/admin/payments/orders/:merchantTransactionId Include: - linked plan -
linked subscription/entitlements (if any) - events history
(PaymentEvent) - last status check timestamp Policy: payments.read
```
```
Implement: POST /admin/payments/orders/:merchantTransactionId/finalize
Calls PaymentsFinalizerService.finalize Policy: payments.manage Audit
log.
```
```
Implement: GET /admin/print/jobs?status=&type=&from=&to= POST
/admin/print/jobs/:id/retry (only if FAILED) POST
/admin/print/jobs/:id/cancel (if QUEUED) Policy: print.generate Audit
logs for retry/cancel.
```
```
Integrate @nestjs/throttler: - global default: e.g. 120 req/min per IP
```
- stricter on auth endpoints: 10/min - stricter on payments/checkout:
5/10min per user - notes content: already has per-user+note limiter Add
decorators to override limits.


## H2) Input validation hardening

### TASK H2.1 — Strict DTO validation everywhere

## H3) Consistent error format + correlation

### TASK H3.1 — Standard error response & request id

## H4) Admin audit explorer endpoints

### TASK H4.1 — Audit log viewer

## H5) Data export (basic CSV endpoints for ops)

### TASK H5.1 — Export students list / subscriptions

# After this set

✅ Admin panel can be powerful from day 1
✅ Support actions available (entitlements, finalize payments, force logout)

```
Ensure every controller uses DTOs with class-validator: -
forbidNonWhitelisted=true - transform=true Add max length constraints
for text fields (note title, question statement blocks, etc.) Reject
huge JSON payloads by setting body size limit.
```
```
Ensure global exception filter returns: {code, message, details?,
requestId, timestamp} Attach X-Request-Id header to all responses. Log
requestId in all logs.
```
```
Implement: GET /admin/audit?
actorUserId=&action=&resourceType=&from=&to= Return paginated audit
logs. Policy: admin.audit.read
```
```
Implement: GET /admin/exports/students.csv GET
/admin/exports/subscriptions.csv Stream CSV (do not load whole dataset
into memory). Policy: users.read / payments.read
```

✅ Security review and anti-piracy enforcement tooling exists
✅ Launch-grade throttling and validation in place

## Whatʼs left backend-wise

At this point, backend is in avery complete v 1 shape.

If you still want more backend before frontend, the only meaningful next sets are:

1. Notification system(email/SMS/WhatsApp hooks)
2. Search(full-text for notes/questions) — optional
3. Multi-tenancy— not needed now
Say“continue backend notifications”or“start frontend”and Iʼll proceed.

```
continue backend notifications
```
Perfect —Notifications Set v 1 (backend-first, provider-agnostic). Weʼll implement a
clean notification system that supports:
Email(primary for OTP, password reset, receipts, announcements)
OptionalSMS/WhatsApplater (same interface)
Async delivery via your existingBullMQ/Redis worker
Templates stored in DB (editable via admin) + fallback code templates
Event-driven triggers (payment success, subscription activation, admin broadcast)
No deployment details — purely local-dev ready.

# BACKEND — Notifications Set v 1 (Email-first, extensible)

## N0) Decide notification channels (v1)

```
✅ Email (must)
⏳ SMS/WhatsApp (later — keep interface ready)
```
## N1) Core models (auditability + retries)


### TASK N1.1 — Notification schema

## N2) Provider abstraction (swap SMTP/SES later without rewrites)

### TASK N2.1 — NotificationProvider interface + Email provider placeholder

### TASK N2.2 — Renderer service (template variables -> final message)

## N3) Queue + worker delivery (retries + backoff)

### TASK N3.1 — Queue integration

```
Add Prisma models: NotificationTemplate: - id(uuid) - key(unique) //
e.g. AUTH_OTP, AUTH_RESET, PAYMENT_SUCCESS, SUBSCRIPTION_ACTIVATED,
BROADCAST - channel (EMAIL|SMS|WHATSAPP) - subject(optional) // for
email - bodyJson (Json) // rich template structure OR simple {html,
text} - variablesJson (Json) // {requiredVars:[], optionalVars:[]} -
isActive(boolean) - updatedByUserId - updatedAt NotificationMessage: -
id(uuid) - channel (EMAIL|SMS|WHATSAPP) - to (string) -
templateKey(optional) - subject(optional) - payloadJson (Json) //
variables used - renderedHtml(optional) - renderedText(optional) -
status (QUEUED|SENT|FAILED) - providerMessageId(optional) -
error(optional) - attempts(int default 0) - scheduledAt(optional) -
sentAt(optional) - createdAt Add indexes: status, createdAt, channel.
```
```
Create NotificationsModule with: interface INotificationProvider {
sendEmail({to, subject, html, text}):
Promise<{providerMessageId?:string}> sendSms?(...): Promise<...>
sendWhatsapp?(...): Promise<...> } Implement SmtpEmailProvider using
nodemailer: - env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
SMTP_FROM, SMTP_SECURE Make it work locally with any SMTP dev tool. Do
NOT implement SMS/WhatsApp providers now; keep interfaces.
```
```
Implement TemplateRendererService: Inputs: templateKey + payloadJson
Loads NotificationTemplate if exists, else fallback templates in code.
Renders: - subject - html - text Use a simple templating engine
(handlebars/ejs) or minimal string interpolation. Validate required
variables; if missing -> throw.
```
```
Add notifications queue to QueueModule: - queue name: "notifications"
Add NotificationsQueueService.enqueue(messageId) Retry config:
attempts=5, exponential backoff, removeOnComplete.
```

### TASK N3.2 — Notifications worker processor

## N4) Auth notifications (OTP + password reset)

### TASK N4.1 — OTP email (login/signup verification optional)

### TASK N4.2 — Password reset email (token-based)

## N5) Payment/subscription notifications (event-driven)

### TASK N5.1 — Event hooks from PaymentsFinalizerService

```
Implement NotificationsProcessor: Given messageId: - load
NotificationMessage - if status already SENT -> return (idempotent) -
render (if not rendered) - call provider sendEmail - update status SENT
+ sentAt + providerMessageId On error: - increment attempts, set status
FAILED only when attempts exhausted - store error string Log with
requestId/correlationId if available
```
```
Implement AuthNotificationsService: - sendOtpEmail(userEmail, otpCode,
ttlMinutes) Template key: AUTH_OTP Store OTP in DB: OtpCode: id,
userId(optional), email, codeHash, purpose(LOGIN|RESET), expiresAt,
consumedAt(optional), createdAt Create endpoints: POST /auth/request-otp
(email) POST /auth/verify-otp (email, code) On request: create OTP
record and enqueue notification.
```
```
Implement password reset flow: - ResetToken: id, userId, tokenHash,
expiresAt, usedAt, createdAt Endpoint: POST /auth/request-password-reset
(email) POST /auth/reset-password (token, newPassword) Notification
template: AUTH_RESET Include reset link: FRONTEND_URL + /reset?token=...
Enqueue email via notifications queue.
```
```
If you want phone-based auth later, weʼll reuse the same OTP table and add SMS
provider.
```
```
In PaymentsFinalizerService when order transitions to SUCCESS: Emit
internal events: - PaymentSucceeded(userId, orderId, amount, planKey) -
SubscriptionActivated(userId, endsAt, planKey) Create
NotificationsEventsHandler that listens and sends: - PAYMENT_SUCCESS
email (receipt-ish) - SUBSCRIPTION_ACTIVATED email Use templates and
enqueue messages.
```

### TASK N5.2 — Receipt data shaping

## N6) Admin broadcast notifications (announcements → email blast)

### TASK N6.1 — Broadcast model + audience filters

### TASK N6.2 — Broadcast sender job (batch enqueue)

## N7) User notification preferences (minimal v1)

### TASK N7.1 — Preferences schema + endpoints

## N8) Admin & ops visibility

```
Implement helper to shape receipt payload: - user name/email - plan
name, duration - amount, transaction id - subscription endsAt Do not
include secrets. Store payloadJson in NotificationMessage for audit.
```
```
Add Prisma model Broadcast: - id(uuid) - title - templateKey(optional
default BROADCAST_EMAIL) - bodyJson (Json) // {subject, html, text} or
blocks - audienceJson (Json) // filters: subscribedOnly,
subjectInterest?, createdAfter?, etc. - status
(DRAFT|SCHEDULED|SENT|CANCELLED) - scheduledAt(optional) -
sentAt(optional) - createdByUserId - createdAt, updatedAt Add endpoints:
POST /admin/broadcasts PATCH /admin/broadcasts/:id POST
/admin/broadcasts/:id/schedule POST /admin/broadcasts/:id/cancel GET
/admin/broadcasts Policy: notifications.manage
```
```
Implement BroadcastSenderService: - selects recipients based on
audienceJson: - STUDENT users only - optional: active subscribers only -
paginates users in batches (e.g. 500) - creates NotificationMessage rows
per user and enqueues - marks Broadcast SENT when all queued Make it
safe and resumable if interrupted.
```
```
Add model NotificationPreference: - userId (PK) - emailEnabled(boolean
default true) - marketingEmailEnabled(boolean default false) - updatedAt
Add endpoints: GET /me/notification-preferences PATCH /me/notification-
preferences Ensure broadcast respects marketingEmailEnabled.
Transactional emails (OTP, payment, subscription) ignore marketing
preference.
```

### TASK N8.1 — Notification logs endpoint (admin)

### TASK N8.2 — Manual resend endpoint

## N9) Safety hardening (avoid spam + ensure deliverability)

### TASK N9.1 — Dedup guard for OTP emails

### TASK N9.2 — Template allowlist for public triggers

# After Notifications Set v 1

✅ Email OTP + password reset ready
✅ Payment/subscription emails ready
✅ Admin broadcast emails (optional but powerful)
✅ Full audit trail (what was sent, to whom, status, errors)
✅ Async + retry safe (BullMQ worker)

## What next?

If youʼre done with backend now, say“start frontend”and Iʼll begin with thebest first
frontend app(Iʼll choose Student App first because it validates notes/practice/tests
quickly), then admin panel, then landing page.

```
Implement: GET /admin/notifications/messages?
status=&channel=&to=&from=&toDate= Returns paginated NotificationMessage
list with errors. Policy: admin.audit.read or notifications.read
```
```
Implement: POST /admin/notifications/messages/:id/resend Clones message
with status QUEUED and enqueues. Policy: notifications.manage Audit
log.
```
```
Prevent OTP spamming: - allow 1 OTP per email per purpose per 60
seconds - max 5 OTP requests per hour per email Return 429 on violation.
Log security signal.
```
```
Ensure only specific template keys can be triggered by public
endpoints: AUTH_OTP, AUTH_RESET only. Broadcast and others admin-only.
```

If you still want one more backend set before frontend, best options are:

```
Search v 1 (notes + questions full-text)
Multi-language contentgroundwork
```
```
lastly also prepare similar tasks for Search v 1 (notes +
questions full-text)
```
HereʼsSearch v 1 as minute-level tasks (Codex-ready) fornotes + questions full-
textusingPostgresthe right way (fast, simple, no extra infra). Weʼll do:
TSVECTOR-based full-textfor title/description/text blocks
Trigramfor typo-ish partial matching (optional but great)
A unified /search endpoint + admin search endpoints
Works with your JSON-rich question schema
(statementJson/optionsJson/explanationJson)

# BACKEND — Search Set v 1 (Postgres FTS + Trigram)

## S0) Enable Postgres extensions

### TASK S0.1 — Enable pg_trgm (optional but recommended)

## S1) Searchable text extraction (important because questions are

## JSON)

### TASK S1.1 — Add “searchText” columns to Note and Question

```
Add migration to enable extension: CREATE EXTENSION IF NOT EXISTS
pg_trgm; Also ensure you can run this in dev and production
environments.
```
```
Update Prisma models: Note: - searchText (String) default "" //
denormalized plain text for indexing Question: - searchText (String)
default "" Add indexes later via raw SQL migration. Create migration.
```

### TASK S1.2 — Implement text extraction for Question JSON blocks

### TASK S1.3 — Implement text extraction for Notes

## S2) Add Postgres full-text indexes (tsvector)

### TASK S2.1 — Add generated tsvector columns (recommended) + GIN index

### TASK S2.2 — Add trigram indexes for title and searchText (optional but

### great)

## S3) Search service (ranking + filters)

```
Implement a utility QuestionSearchTextBuilder: Input: statementJson,
optionsJson, explanationJson Output: plain concatenated text: - include
statement text - include option texts - include explanation text Ignore
imageAssetIds. Normalize: - lowercasing (optional) - collapse whitespace
```
- strip HTML if any Use this whenever creating/updating/bulk-importing
questions. Set Question.searchText = built text.

```
Implement NoteSearchTextBuilder: - searchText = title + description +
subject name + topic names (optional but recommended) When note topics
change, recompute Note.searchText.
```
```
Prisma doesnʼt natively manage tsvector well; useraw SQL migrations.
```
```
Create SQL migration: For notes: ALTER TABLE "Note" ADD COLUMN
"searchVector" tsvector GENERATED ALWAYS AS (to_tsvector('simple',
coalesce("searchText", ''))) STORED; CREATE INDEX
"Note_searchVector_gin" ON "Note" USING GIN ("searchVector"); For
questions: ALTER TABLE "Question" ADD COLUMN "searchVector" tsvector
GENERATED ALWAYS AS (to_tsvector('simple', coalesce("searchText", '')))
STORED; CREATE INDEX "Question_searchVector_gin" ON "Question" USING GIN
("searchVector"); Use 'simple' config to avoid language stemming issues
initially.
```
```
Create SQL migration: CREATE INDEX "Note_title_trgm" ON "Note" USING
GIN ("title" gin_trgm_ops); CREATE INDEX "Note_searchText_trgm" ON
"Note" USING GIN ("searchText" gin_trgm_ops); CREATE INDEX
"Question_searchText_trgm" ON "Question" USING GIN ("searchText"
gin_trgm_ops); This improves partial/typo matching for short queries.
```

### TASK S3.1 — SearchService with two strategies (FTS + trigram fallback)

### TASK S3.2 — Use Prisma $queryRaw safely

## S4) API endpoints

### TASK S4.1 — Unified student search endpoint

### TASK S4.2 — Admin search endpoints (include drafts)

## S5) Snippet generation (nice UX)

### TASK S5.1 — Add snippets using ts_headline for FTS results

```
Implement SearchService with methods: searchNotes({q, subjectId?,
topicId?, premium?, publishedOnly?, limit, offset}) searchQuestions({q,
subjectId?, topicId?, difficulty?, publishedOnly?, limit, offset})
Logic: - If q has >= 3 non-space chars: primary: FTS using searchVector
@@ websearch_to_tsquery('simple', q) rank: ts_rank_cd(searchVector,
query) - If results are low (e.g., < 5) OR q is very short: fallback:
trigram similarity on title/searchText and order by similarity desc
Always apply filters: - notes: isPublished=true for student search -
questions: isPublished=true for student search
```
```
Implement queries via prisma.$queryRaw with parameter binding. Do NOT
string-concatenate user inputs into SQL. Return stable fields only (id,
title, snippet, subjectId/topicIds, etc.).
```
```
Implement: GET /search?
q=&type=notes|questions|all&subjectId=&topicId=&limit=&offset= Response:
{ query: string, notes: [{id, title, descriptionSnippet, subjectId,
topicIds, isPremium}], questions: [{id, subjectId, topicId, difficulty,
statementSnippet}], meta: {limit, offset, totalApprox?} } For "all": run
both searches and return both lists. Auth required (so you can rate
limit and log).
```
```
Admin endpoints: GET /admin/search/notes?
q=&subjectId=&topicId=&published= GET /admin/search/questions?
q=&subjectId=&topicId=&published= Policy: content.manage or content.read
Allow searching drafts/unpublished too.
```

## S6) Maintenance & consistency

### TASK S6.1 — Backfill searchText for existing rows

### TASK S6.2 — Ensure updates keep searchText correct

## S7) Performance & abuse controls

### TASK S7.1 — Add rate limiting for /search

### TASK S7.2 — Query guards

# After Search v 1

✅ Fast full-text search for notes and questions
✅ Works with JSON-rich question content

```
When using FTS query, also select: ts_headline('simple', searchText,
query, 'StartSel=<mark>, StopSel=</mark>, MaxWords=20, MinWords=10')
Return this as snippetHtml (admin) or snippetText (student, strip tags
optionally).
```
```
Write a one-time script: - iterate Notes and recompute searchText -
iterate Questions and recompute searchText from JSON Save in batches.
Run after migrations.
```
```
Wire searchText recompute into: - AdminNotesController create/update +
topic assignment updates - AdminQuestionsController create/update + bulk
import Add unit tests for builder outputs.
```
```
Rate limit /search: - per user: 60/min - per IP for unauth (if you ever
expose public): 30/min Return 429 on abuse. Log security signal for
repeated abuse.
```
```
Reject queries that are: - empty after trim - > 200 chars Normalize
whitespace. Limit max limit=50.
```

✅ Great UX via snippets
✅ No extra infra (just Postgres indexes)

If you say“start frontend”, Iʼll begin withStudent Apptasks (notes viewer + practice
engine + tests + payment return polling), then admin panel, then landing page.