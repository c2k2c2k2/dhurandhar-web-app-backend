#### Now we need to work on frontend part of this entire

#### application. Backend is kind of strong as of now as per our

#### requirements.

#### Can you do the same for frontend as well step by step or

#### module by module

#### Thought for 8s

#### Yep — we can do the same “tasks/prompts” style for the frontend , module-by-module,

#### and keep it aligned with your requirements (Admin Dashboard + Student Dashboard +

#### Payments + Print + Analytics).

#### Below is Frontend Set v1 (foundation + structure). After you execute this, you’ll tell me

#### “next student app” / “next admin panel” / “next landing page” and I’ll continue in the

#### same format.

```
Project
```

# FRONTEND — Set v1 (Foundation + Architecture)

## Repo: Next.js (Landing + Student App + Admin Panel)

## FE0) Repo setup + routing strategy

#### TASK FE0.1 — Create Next.js app with route groups

#### TASK FE0.2 — UI & tooling baseline

## FE1) API Client + Auth session (shared)

#### TASK FE1.1 — Typed API client wrapper

```
txt
```
```
Create Next.js (App Router) project with:
```
- /(public) -> landing pages
- /(student) -> student app
- /(admin) -> admin panel
Add layout shells per segment.
Use TypeScript. Add ESLint + Prettier. Copy code

```
txt
```
```
Install:
```
- tailwindcss
- shadcn/ui
- zod
- react-hook-form
- @tanstack/react-query
- axios (or fetch wrapper)
- jwt-decode
- next-themes (optional)
Define design tokens, spacing, typography defaults. Copy code

```
txt
```
```
Create /src/lib/api:
```
- apiClient.ts (axios instance)
- attach access token automatically
- handle 401: attempt refresh once then logout
- error normalization: {code, message, requestId} Copy code


#### TASK FE1.2 — Auth store + /me bootstrap

#### TASK FE1.3 — Route guards

## FE2) Shared “domain UI” components

#### TASK FE2.1 — App Shell components

#### TASK FE2.2 — Upload widget (MinIO presigned)

```
 
```
```
txt
```
```
Create /src/modules/auth:
```
- AuthProvider (loads session on app start)
- login/logout/refresh flows
- persist tokens securely (httpOnly cookie ideal; else localStorage + short TTL)
- fetch /auth/me (or /me) to load:
{userType, roles, permissions}
Expose hooks: useAuth(), usePermissions() Copy code

```
txt
```
```
Student guard:
```
- require userType=STUDENT
Admin guard:
- require userType=ADMIN
Permission guard:
- <Can perm="notes.write">...
If unauthorized -> show 403 page / redirect. Copy code

```
txt
```
```
Create:
```
- <AppShell> (sidebar + header)
- <TopNav> / <UserMenu>
- <EmptyState>, <LoadingState>, <ErrorState>
- <DataTable> (server pagination ready)
- <ConfirmDialog> reusable Copy code

```
txt
```

# What we build next (choose order)

#### Best order for real progress:

#### 1. Student App (core experience) → notes reader + practice + tests + subscription

#### gating

#### 2. Admin Panel → upload notes, manage questions/topics, tests, print jobs

#### 3. Landing Page → CMS-driven public pages

#### Reply with “next student app” and I’ll drop the same minute-level prompt set for:

#### subjects/topics browsing

#### notes library tree (topic-driven)

#### PDF viewer (PDF.js) + watermark overlay (from /notes/:id/watermark)

#### practice sessions + telemetry submission

#### tests attempt flow + results

#### PhonePe redirect return page (poll payment status)

#### Or say “next admin panel” / “next landing page” if you want to start there.

```
Create <FileUpload> component:
Flow:
1) call POST /admin/files/init-upload
2) PUT file to presignedPutUrl (track progress)
3) call POST /admin/files/confirm-upload/:fileAssetId
Return fileAssetId to caller.
Support PDF + images.
```
```
Copy code
```
```
Sources
```
#### is it okay to start with the admin panel so most of the apis

#### will get checked initially and also we can add the initial

#### data via admin panel which then easily rendered in landing

#### and student app


#### Yes — starting with the admin panel first is a smart move for your project.

#### Why it works well here:

#### You’ll validate 80% of backend APIs early (auth/RBAC, taxonomy, notes, questions,

#### tests, CMS, payments ops, print jobs, notifications, search).

#### You can seed real content (subjects/topics/notes/questions/tests/banners/home

#### sections), which then makes student app + landing mostly “render what exists”.

#### Your team won’t get blocked on “no data” while building the student UX.

#### So let’s do Admin Panel Set v1 now.

# FRONTEND — Admin Panel Set v1 (Next.js /admin)

## Goal: end-to-end content ops + backend validation

## ADM0) Admin routing + shell

#### TASK ADM0.1 — Admin app layout

#### TASK ADM0.2 — Navigation map (permission-driven)

```
txt
```
```
Create /(admin)/layout.tsx with:
```
- Sidebar (Nav groups)
- Topbar (search, notifications bell placeholder, user menu)
- Content area
Add route: /(admin)/login
Add route: /(admin)/forbidden Copy code

```
txt
```
```
Define nav config with required permissions per item:
```
- Dashboard (admin.dashboard.read)
- Subjects & Topics (content.manage)
- Notes (notes.write, notes.publish)
- Questions (questions.crud, questions.publish)
- Tests (tests.crud, tests.publish)
- Practice Print (print.generate)
- CMS (content.manage + admin:config:write)
- Payments (payments.read/payments.manage)
- Users (users.read/users.manage)


## ADM1) Auth + RBAC UX

#### TASK ADM1.1 — Admin login + session bootstrap

#### TASK ADM1.2 — Permission gating components

## ADM2) Dashboard (fast backend validation)

#### TASK ADM2.1 — Admin dashboard page

- Security (security.read/security.manage)
- Analytics (analytics.read)
- Audit Logs (admin.audit.read)
Render menu items only if user has permission. Copy code

```
txt
```
```
Implement /admin/login:
```
- form: email/password (or otp if your backend supports)
- call backend auth endpoint
- store tokens/session
- redirect to /admin
On mount, load /auth/me (or /me) to get permissions. Copy code

```
txt
```
```
Create:
<Can perm="notes.write">...</Can>
<RequireAdmin>...</RequireAdmin>
Use on pages + buttons (Create/Edit/Publish). Copy code
```
```
 
```
```
txt
```
```
Create /admin page:
```
- fetch GET /admin/dashboard/summary
- show cards: counts + revenue + activity + pending/failed print jobs + suspiciou
- show quick links to create Subject/Topic/Note/Question/Test
Handle loading/error states. Copy code


## ADM3) Subjects & Topics (taxonomy)

#### TASK ADM3.1 — Subjects CRUD UI

#### TASK ADM3.2 — Topics CRUD UI (tree)

## ADM4) Notes (upload + topics mapping + publish)

#### TASK ADM4.1 — Notes list page

#### TASK ADM4.2 — Note create/edit page

```
txt
```
```
Page: /admin/taxonomy/subjects
```
- list subjects (GET /admin/subjects)
- create/edit modal (POST/PATCH)
- reorder (optional v1: orderIndex edit inline) Copy code

```
txt
```
```
Page: /admin/taxonomy/topics?subjectId=
```
- render hierarchical tree (parent/child)
- create topic under parent
- edit topic
- toggle active
Backend:
GET /admin/topics?subjectId=
POST /admin/subjects/:subjectId/topics
PATCH /admin/topics/:id Copy code

```
txt
```
```
Page: /admin/notes
Filters: subject, topic, published, premium, search q
Table: title, subject, premium, published, updatedAt
Actions: edit, publish/unpublish
API: GET /admin/notes Copy code
```
```
txt
```
```
Page: /admin/notes/new and /admin/notes/:id
Fields:
```

## ADM5) Questions (rich JSON + images + bulk import)

#### TASK ADM5.1 — Questions list page

#### TASK ADM5.2 — Question editor (text + image support)

#### TASK ADM5.3 — Bulk import (optional v1.1)

- subjectId
- title, description
- isPremium
- topic multi-select (from /admin/topics?subjectId)
- upload PDF (FileUpload component -> returns fileAssetId)
Save:
POST /admin/notes
PATCH /admin/notes/:id
Publish action:
POST /admin/notes/:id/publish
    Copy code

```
txt
```
```
Page: /admin/questions
Filters: subject, topic, difficulty, published, search q
Table: snippet, subject/topic, difficulty, published
Actions: edit, publish
API: GET /admin/questions Copy code
```
```
txt
```
```
Page: /admin/questions/new and /admin/questions/:id
Editor supports:
```
- statement: text + optional image upload (FileUpload purpose QUESTION_IMAGE)
- options A-D: text and/or image upload (OPTION_IMAGE)
- correct answer selection
- explanation: text + optional image (EXPLANATION_IMAGE)
- subjectId + topicId + difficulty
Validate on UI using zod.
Save: POST/PATCH /admin/questions
Publish: POST /admin/questions/:id/publish
Images rendered by /assets/:id preview. Copy code

```
txt
```

## ADM6) Tests (mixer rules by topic + publish)

#### TASK ADM6.1 — Tests list page

#### TASK ADM6.2 — Test builder UI (mixer rules)

## ADM7) Print engine UI

#### TASK ADM7.1 — Print jobs page

```
Add /admin/questions/import:
```
- accept JSON/CSV upload
- map fields
- show per-row errors from backend
Call POST /admin/questions/bulk-import Copy code

```
txt
```
```
Page: /admin/tests
Table: name, type, published, duration, updatedAt
Actions: edit, publish
API: GET /admin/tests Copy code
```
```
txt
```
```
Page: /admin/tests/new and /admin/tests/:id
Fields:
```
- title, type (SUBJECT/COMBINED/CUSTOM)
- duration, negative marking
- mixer rules builder:
add rule: subjectId + topic multi-select + difficulty + count
Validate: sum counts > 0
Save: POST/PATCH /admin/tests
Publish: POST /admin/tests/:id/publish Copy code

```
txt
```
```
Page: /admin/print
```
- create print job for test paper
- create practice set print job (subject/topic/count)


## ADM8) CMS UI (dynamic landing + student home)

#### TASK ADM8.1 — Banners management

#### TASK ADM8.2 — Announcements management

#### TASK ADM8.3 — Home sections builder

#### TASK ADM8.4 — Pages (privacy/terms/about)

- list jobs with status QUEUED/RUNNING/DONE/FAILED
- download when DONE
API:
POST /admin/print/test/:testId
POST /admin/print/practice
GET /admin/print/jobs
GET /admin/print/jobs/:id/download
Actions: retry/cancel if you implemented
    Copy code

```
txt
```
```
Page: /admin/cms/banners
```
- list/create/edit banners
- upload image asset
- schedule start/end
API: /admin/banners Copy code

```
txt
```
```
Page: /admin/cms/announcements
```
- rich blocks editor (text/image)
- pin/unpin
API: /admin/announcements Copy code

```
txt
```
```
Page: /admin/cms/home-sections
```
- reorder sections
- configure type NOTES/TESTS/TOPICS/CUSTOM and filters
API: /admin/home-sections + reorder endpoint Copy code

```
txt
```

## ADM9) Payments + Users + Security + Audit

#### TASK ADM9.1 — Payments ops page

#### TASK ADM9.2 — Users ops page

#### TASK ADM9.3 — Security monitoring

#### TASK ADM9.4 — Audit log viewer

```
Page: /admin/cms/pages
```
- create/edit/publish
API: /admin/pages

```
Copy code
```
```
txt
```
```
Page: /admin/payments
```
- list orders
- view order details (events/transactions/subscription)
- admin finalize button
API: /admin/payments/orders + finalize endpoint Copy code

```
txt
```
```
Page: /admin/users
```
- search students
- view profile (subscription, activity)
- grant/revoke entitlements
- force logout
API: /admin/users/... + entitlements endpoints + force logout Copy code

```
txt
```
```
Page: /admin/security
```
- signals summary
- user security profile
- revoke sessions / ban note for user
API: /admin/security/... Copy code

```
txt
```

## ADM10) Admin Global Search (Search v1 UI)

#### TASK ADM10.1 — Search bar + results drawer

# Suggested implementation order (best “backend

# validation first”)

#### 1. Admin login + permissions + dashboard

#### 2. Subjects & Topics

#### 3. Notes (upload + publish)

#### 4. Questions (editor + publish)

#### 5. Tests (mixer)

#### 6. CMS (banners/home sections)

#### 7. Print (generate/download)

#### 8. Users/Payments/Security/Audit

#### 9. Admin search bar

#### If you reply “start admin panel” , I’ll continue with the next level down : folder structure +

#### exact pages/components list + Zod schemas + React Query hooks + a “definition of done”

#### checklist per module (still in the same task/prompt style).

```
Page: /admin/audit
```
- filters + pagination
API: GET /admin/audit

```
Copy code
```
```
txt
```
```
Add a topbar search input:
```
- query backend /admin/search/notes and /admin/search/questions
- show results grouped by type
- click navigates to note/question edit page
Debounce 300ms + minimum length 2/3 chars Copy code


#### start admin panel

#### Cool — Admin Panel it is. Below is the deep, “minute-level” Admin Panel plan you can

#### follow step-by-step (Codex-friendly). It’s organized as phases → modules → exact

#### files/pages/hooks/components → DoD checklist.

#### I’m assuming:

#### Next.js App Router

#### Tailwind + shadcn/ui

#### TanStack React Query

#### Zod + React Hook Form

#### Backend already exposes the endpoints we planned

# ADMIN PANEL — Phase 0: Project Skeleton

## A0) Folder structure (do this first)

#### TASK A0.1 — Create these folders

```
txt
```
```
/src
/app
/(admin)
/login/page.tsx
/forbidden/page.tsx
/layout.tsx
/page.tsx // dashboard
/taxonomy
/subjects/page.tsx
/topics/page.tsx
/notes
/page.tsx
/new/page.tsx
/[id]/page.tsx
/questions
/page.tsx
```

## A0.2) Shared conventions

```
/new/page.tsx
/[id]/page.tsx
/tests
/page.tsx
/new/page.tsx
/[id]/page.tsx
/print
/page.tsx
/cms
/banners/page.tsx
/announcements/page.tsx
/home-sections/page.tsx
/pages/page.tsx
/payments/page.tsx
/users
/page.tsx
/[id]/page.tsx
/security/page.tsx
/analytics/page.tsx
/audit/page.tsx
```
```
/lib
/api
/auth
/config
/utils
```
```
/modules
/admin-shell
/taxonomy
/notes
/questions
/tests
/print
/cms
/payments
/users
/security
/analytics
/audit
/shared Copy code
```

#### TASK A0.2 — Decide these rules and stick to them

#### DoD Phase 0

#### Admin routes exist (even placeholder)

#### /admin/login renders

#### /admin renders a placeholder dashboard page inside AdminLayout

# ADMIN PANEL — Phase 1: API Client + Auth + Permissions

## A1) API client

#### TASK A1.1 — Create api client

## A1) Auth store

#### TASK A1.2 — Create auth module

```
txt
```
- API calls only in /lib/api or per-module api.ts
- All DTO validation via zod schemas in each module
- All queries/mutations via React Query hooks in each module
- Pages should be thin: compose module components + hooks
- Permissions are checked both:
(1) backend (real security)
(2) frontend (hide UI to reduce confusion) Copy code

```
txt
```
```
Create /src/lib/api/client.ts:
```
- axios instance with baseURL = NEXT_PUBLIC_API_BASE_URL
- request interceptor attaches access token
- response interceptor:
- if 401 and refresh available -> refresh once then retry
- else logout + redirect /admin/login
Normalize errors into:
{ message, code?, requestId?, status? } Copy code

```
txt
```
```
Create /src/lib/auth:
```
- types.ts: UserMe { id, name, email, userType, roles[], permissions[] }
- tokenStore.ts: get/set/clear tokens (localStorage for now)


## A1) Admin guards

#### TASK A1.3 — Guards

#### DoD Phase 1

#### Can login as admin

#### /admin redirects to /admin/login if not logged

#### Logged admin sees dashboard route

#### permissions[] drives UI hiding (sidebar + buttons)

# ADMIN PANEL — Phase 2: Admin Shell (Layout + Sidebar

# + Topbar + Search)

## A2) Shell components

#### TASK A2.1 — Build the shell

- authApi.ts: login(), refresh(), me(), logout()

```
Create /src/lib/auth/AuthProvider.tsx:
```
- on mount: if token exists -> call me()
- store user in context
Expose hooks:
useAuth(), usePermissions() Copy code

```
txt
```
```
Create:
```
- <RequireAdmin> redirects to /admin/login if not logged
- <RequirePerm perm="..."> shows 403 page or hides content
- <Can perm="..."> conditional render Copy code

```
txt
```
```
Create /modules/admin-shell:
```
- AdminLayout.tsx (sidebar + topbar + content)
- SidebarNav.tsx (permission-driven nav)
- Topbar.tsx (search input placeholder + user menu)
- UserMenu.tsx (logout)
- Breadcrumbs.tsx (optional) Copy code


## A2) Permission-driven nav map

#### TASK A2.2 — Create a single nav config

## A2) Admin global search (v1)

#### TASK A2.3 — Add topbar search drawer

#### DoD Phase 2

#### Sidebar renders correctly with permission gating

#### Topbar search returns results and navigates

#### Logout works

# ADMIN PANEL — Phase 3: Shared UI + Utilities

## A3) Shared components

#### TASK A3.1 — Shared UI kit

```
txt
```
```
Create nav.ts:
Each item has:
{ label, href, icon, requiredPerms?: string[] }
```
```
Render only if user has ANY requiredPerms (or all, your choice). Copy code
```
```
txt
```
- Input + debounce 300ms
- Call:
/admin/search/notes?q=...
/admin/search/questions?q=...
- Show grouped results (Notes / Questions)
- Click navigates to edit pages
- Minimum query length: 2 or 3 Copy code

```
txt
```
```
Create /modules/shared/components:
```
- PageHeader (title + actions)
- DataTable (server pagination ready)
- FiltersBar (selects + search)


## A3) File upload widget (presigned + confirm)

#### TASK A3.2 — FileUpload component

#### DoD Phase 3

#### You can upload a PDF/image and get fileAssetId

#### Component displays progress + success state

# ADMIN PANEL — Phase 4: Dashboard (fast backend

# validation)

## A4) Dashboard page

#### TASK A4.1 — /admin dashboard

- ConfirmDialog
- Drawer/Modal wrappers
- Toast helpers
- FormField components (Input, Select, Switch, Textarea) Copy code

```
 
```
```
txt
```
```
Create /modules/shared/FileUpload:
Props:
```
- purpose (NOTES_PDF | QUESTION_IMAGE | OPTION_IMAGE | EXPLANATION_IMAGE | BANNER_
- accept mime list
Flow:
1) init-upload -> get presignedPutUrl + fileAssetId
2) PUT file -> progress
3) confirm-upload -> mark confirmed
Return: {fileAssetId, fileName, sizeBytes, contentType}
    Copy code

```
txt
```
```
Create /modules/dashboard:
```
- api.ts: getSummary()
- hooks.ts: useAdminSummary()
- DashboardCards.tsx
Page /admin/page.tsx consumes these.

```
Render:
```

#### DoD Phase 4

#### Dashboard renders from real API

#### Error + loading states handled

# ADMIN PANEL — Phase 5: Taxonomy (Subjects + Topics)

## A5) Subjects module

#### TASK A5.1 — Subjects CRUD

## A5) Topics module (tree)

#### TASK A5.2 — Topics tree UI

#### DoD Phase 5

#### Can create/edit subjects

#### Can create nested topics under subject

#### Topic tree renders correctly

- counts, today metrics, revenue, print jobs, suspicious signals
Add “Quick Actions” buttons linking to create pages.
    Copy code

```
txt
```
```
/modules/taxonomy/subjects:
```
- api.ts: listSubjects, createSubject, updateSubject
- schemas.ts: zod SubjectCreate/Update
- hooks.ts: useSubjects, useCreateSubject, useUpdateSubject
- SubjectsTable.tsx + SubjectFormDialog.tsx Copy code

```
txt
```
```
/modules/taxonomy/topics:
```
- api.ts: listTopics(subjectId), createTopic, updateTopic
- schemas.ts: TopicCreate/Update zod
- hooks.ts
- TopicsTree.tsx (renders hierarchy)
- TopicFormDialog.tsx
Page: /admin/taxonomy/topics?subjectId= Copy code


# ADMIN PANEL — Phase 6: Notes (upload + topic mapping

# + publish)

## A6) Notes module

#### TASK A6.1 — Notes list

#### TASK A6.2 — Note editor

#### DoD Phase 6

#### Can create note with PDF + topics

#### Can publish/unpublish

#### List filters by subject/topic/published/premium

# ADMIN PANEL — Phase 7: Questions (rich editor + images

# + publish)

```
 
```
```
txt
```
```
/modules/notes:
```
- api.ts: listNotes(filters), getNote(id), createNote, updateNote, publishNote, u
- schemas.ts: NoteCreate/Update zod (topicIds array required)
- hooks.ts
- NotesFilters.tsx
- NotesTable.tsx
Page: /admin/notes Copy code

```
txt
```
```
Create NoteEditorForm.tsx:
```
- subject select
- topic multiselect (depends on subject)
- title/description
- premium toggle
- PDF FileUpload (NOTES_PDF)
- Save draft (create/update)
- Publish/unpublish buttons gated by perms
Pages:
- /admin/notes/new
- /admin/notes/[id] Copy code


## A7) Questions module

#### TASK A7.1 — Questions list

#### TASK A7.2 — Question editor

#### DoD Phase 7

#### Create/edit/publish question

#### Supports images in stem and options

#### UI validates schemas before calling backend

# ADMIN PANEL — Phase 8: Tests (mixer rules builder +

# publish)

## A8) Tests module

#### TASK A8.1 — Tests list

```
 
```
```
txt
```
```
/modules/questions:
```
- api.ts: listQuestions(filters), getQuestion, createQuestion, updateQuestion, pu
- schemas.ts:
- ContentBlock schema { text?: string, imageAssetId?: string } refine: at least
- Option schema { key: "A"|"B"|"C"|"D", text?: string, imageAssetId?: string }
- QuestionCreate/Update: statementJson, optionsJson, correctAnswerJson, explanat
- hooks.ts
- QuestionsTable + Filters
    Copy code

```
txt
```
```
Build QuestionEditorForm.tsx supporting:
```
- subject + topic + difficulty
- statement block: text + image upload (QUESTION_IMAGE)
- options A-D: text + image upload (OPTION_IMAGE)
- correct answer select (A/B/C/D)
- explanation: text + image upload (EXPLANATION_IMAGE) (optional)
- preview card rendering (uses /assets/:id for images)

```
Pages:
```
- /admin/questions/new
- /admin/questions/[id] Copy code


#### TASK A8.2 — Mixer rule builder component

#### DoD Phase 8

#### Can build tests using mixer rules

#### Publish/unpublish works

#### Topic constraints enforced in UI

# ADMIN PANEL — Phase 9: Print (jobs + download)

## A9) Print module

#### TASK A9.1 — Print jobs page

```
 
```
```
txt
```
```
/modules/tests:
```
- api.ts: listTests, getTest, createTest, updateTest, publishTest, unpublishTest
- schemas.ts: TestCreate/Update including mixerRules array
- hooks.ts
- TestsTable + Filters
Page: /admin/tests Copy code

```
txt
```
```
Create MixerRulesBuilder.tsx:
```
- add/remove rule rows
- each row:
subjectId (select)
topicIds (multi-select filtered by subject)
difficulty (optional)
count
- validates count > 0
- shows total questions count summary Copy code

```
txt
```
```
/modules/print:
```
- api.ts: createTestPrintJob, createPracticePrintJob, listPrintJobs, getPrintJob,
- hooks.ts
UI:
- Create job forms (test paper / practice set)


#### DoD Phase 9

#### Create job triggers backend

#### Job status list refreshes

#### PDF downloads when ready

# ADMIN PANEL — Phase 10: CMS (banners, home sections,

# pages, announcements)

## A10) CMS modules

#### TASK A10.1 — Banners

#### TASK A10.2 — Announcements

#### TASK A10.3 — Home sections builder

```
 
```
- Jobs table with status
- Download button when DONE
Page: /admin/print Copy code

```
 
```
```
txt
```
```
/modules/cms/banners:
```
- list/create/update/toggle
- image upload (BANNER_IMAGE -> can map to QUESTION_IMAGE purpose or add dedicate
- schedule start/end
Page: /admin/cms/banners Copy code

```
txt
```
```
/modules/cms/announcements:
```
- blocks editor (text/image) reusing ContentBlock UI
- pin/unpin
Page: /admin/cms/announcements Copy code

```
txt
```
```
/modules/cms/home-sections:
```
- list + reorder (drag/drop optional; else numeric)

```
Copy code
```

#### TASK A10.4 — Pages

#### DoD Phase 10

#### Admin can configure public/student home sections & banners

#### Scheduling works

#### Pages publish works

# ADMIN PANEL — Phase 11: Payments + Users + Security +

# Audit (ops)

## A11) Payments

#### TASK A11.1 — Payments ops

## A11) Users

#### TASK A11.2 — Users list + profile

- editor: type NOTES/TESTS/TOPICS/CUSTOM + configJson editor
Page: /admin/cms/home-sections

```
txt
```
```
/modules/cms/pages:
```
- create/edit/publish
- slug uniqueness UI check
Page: /admin/cms/pages Copy code

```
txt
```
```
/modules/payments:
```
- list orders, view details
- finalize button (payments.manage)
Page: /admin/payments Copy code

```
txt
```
```
/modules/users:
```
- list/search students
- profile page showing subscription + activity
- grant/revoke entitlements


## A11) Security + Audit

#### TASK A11.3 — Security

#### TASK A11.4 — Audit viewer

#### DoD Phase 11

#### Support workflows exist (finalize, entitlement grant, force logout)

#### Security signals visible

#### Audit logs searchable

# Implementation order (best for quick wins)

#### 1. Phase 1–3 (auth + shell + upload)

#### 2. Dashboard

#### 3. Subjects/Topics

#### 4. Notes

#### 5. Questions

#### 6. Tests

#### 7. CMS

#### 8. Print

#### 9. Ops (Payments/Users/Security/Audit)

- force logout
Pages: /admin/users, /admin/users/[id]

```
Copy code
```
```
txt
```
```
/modules/security:
```
- signals summary
- user security profile view
- revoke sessions / ban note
Page: /admin/security Copy code

```
txt
```
```
/modules/audit:
```
- list audit logs + filters + pagination
Page: /admin/audit Copy code


## Tell me what to generate next

#### Reply with one :

#### “next admin auth contract” (exact /me shape + token storage approach + guards)

#### “start taxonomy module”

#### “start notes module”

#### “start questions module” (biggest + most valuable early)

#### “start tests module”

#### If you don’t care, say “go ahead” and I’ll start with Taxonomy → Notes (best data seeding

#### path).

#### go ahead

#### Alright — we’ll go Taxonomy → Notes (best way to seed data fast and validate backend

#### early).

#### Below are copy-paste Codex tasks to implement these modules end-to-end in the admin

#### panel.

# ADMIN PANEL — Module 1: Taxonomy (Subjects → Topics

# Tree)

## T1) API + types + query keys

#### TASK T1.1 — Create taxonomy API clients

```
txt
```
```
Create:
src/modules/taxonomy/subjects/api.ts
```
- listSubjects(): GET /admin/subjects
- createSubject(dto): POST /admin/subjects
- updateSubject(id,dto): PATCH /admin/subjects/:id

```
src/modules/taxonomy/topics/api.ts
```

#### TASK T1.2 — Zod schemas

#### TASK T1.3 — React Query hooks

- listTopics(subjectId): GET /admin/topics?subjectId=...
- createTopic(subjectId,dto): POST /admin/subjects/:subjectId/topics
- updateTopic(id,dto): PATCH /admin/topics/:id

```
Define shared types in:
src/modules/taxonomy/types.ts Copy code
```
```
txt
```
```
Create:
src/modules/taxonomy/subjects/schemas.ts
```
- SubjectCreateSchema: { key?, name, orderIndex?, isActive? }
- SubjectUpdateSchema: partial

```
src/modules/taxonomy/topics/schemas.ts
```
- TopicCreateSchema: { name, parentId?, orderIndex?, isActive? }
- TopicUpdateSchema: partial

```
Add refinements:
```
- name length 2..120
- key uppercase/slug optional (if used) Copy code

```
txt
```
```
Create hooks:
src/modules/taxonomy/subjects/hooks.ts
```
- useSubjects()
- useCreateSubject()
- useUpdateSubject()

```
src/modules/taxonomy/topics/hooks.ts
```
- useTopics(subjectId)
- useCreateTopic(subjectId)
- useUpdateTopic()

```
Use query keys:
["admin","subjects"]
["admin","topics",subjectId]
Invalidate appropriately on mutations. Copy code
```

## T2) Subjects UI

#### TASK T2.1 — Subjects page

#### TASK T2.2 — Subject create/edit dialog

#### DoD (Subjects)

#### Create/edit subjects works

#### Table updates without refresh

#### Permissions: page renders only if user has content.manage (or your chosen perm)

## T3) Topics UI (hierarchical tree)

#### TASK T3.1 — Build topic tree builder

```
txt
```
```
Implement page: /app/(admin)/taxonomy/subjects/page.tsx
Use:
```
- <PageHeader title="Subjects" action={<CreateSubjectButton/>} />
- Table columns: name, key, orderIndex, active, updatedAt, actions(Edit)
- Filter: text search (client-side v1 ok), active toggle optional Copy code

```
txt
```
```
Create components:
src/modules/taxonomy/subjects/SubjectFormDialog.tsx
```
- react-hook-form + zod resolver
- fields: name, key(optional), orderIndex, isActive
- submit -> create/update mutation
- show toast on success/failure
Add <ConfirmDialog> for close-with-unsaved (optional). Copy code

```
txt
```
```
Create:
src/modules/taxonomy/topics/topicTree.ts
Functions:
```
- buildTree(topics): returns root nodes with children[]
- flattenTree(nodes): returns list for dropdowns with indent levels
Ensure stable sort: orderIndex asc, name asc. Copy code


#### TASK T3.2 — Topics page with subject selector

#### TASK T3.3 — TopicsTree component

#### TASK T3.4 — Topic create/edit dialog

#### DoD (Topics)

#### Create root topics and child topics under a subject

```
txt
```
```
Implement page: /app/(admin)/taxonomy/topics/page.tsx
UI layout:
```
- SubjectSelect (loads subjects)
- Left: TopicsTree
- Right: Selected topic details (optional) OR just actions inline

```
Flow:
```
- require subjectId selection (from query param)
- if none: show empty state "Select a subject"
- load topics for selected subject Copy code

```
txt
```
```
Create:
src/modules/taxonomy/topics/TopicsTree.tsx
```
- Recursive tree rendering
- Each node row:
- name
- active badge
- buttons: Add Child, Edit
- Expand/collapse (local state) OR always expanded v1
- Reorder later; for now show orderIndex field in edit form Copy code

```
txt
```
```
Create:
src/modules/taxonomy/topics/TopicFormDialog.tsx
Fields:
```
- name
- parentId (hidden when creating child; optional when creating root)
- orderIndex
- isActive
Submit to createTopic/updateTopic Copy code


#### Tree renders correctly and updates live

# ADMIN PANEL — Module 2: Notes (Upload PDF + Topic

# mapping + Publish)

## N1) Notes API + schemas + hooks

#### TASK N1.1 — Notes API client

#### TASK N1.2 — Notes schemas

#### TASK N1.3 — Notes hooks

```
 
```
```
txt
```
```
Create:
src/modules/notes/api.ts
```
- listNotes(filters): GET /admin/notes?subjectId=&topicId=&q=&published=&premium=
- getNote(id): GET /admin/notes/:id
- createNote(dto): POST /admin/notes
- updateNote(id,dto): PATCH /admin/notes/:id
- publishNote(id): POST /admin/notes/:id/publish
- unpublishNote(id): POST /admin/notes/:id/unpublish Copy code

```
 
```
```
txt
```
```
Create:
src/modules/notes/schemas.ts
NoteCreateSchema:
{
subjectId: uuid,
title: string (2..160),
description?: string (0..500),
isPremium: boolean,
topicIds: uuid[] (min 0),
fileAssetId: uuid
}
NoteUpdateSchema: partial but require subjectId/title/topicIds/fileAssetId in edit
Copy code
```
```
txt
```

## N2) Notes list page

#### TASK N2.1 — Notes list UI

#### DoD

#### Filters work and call backend with query params

#### Publish/unpublish toggles update table

## N3) Note editor page

#### TASK N3.1 — Create editor shared component

```
Create:
src/modules/notes/hooks.ts
```
- useNotes(filters)
- useNote(id)
- useCreateNote()
- useUpdateNote(id)
- usePublishNote(id)
- useUnpublishNote(id)

```
Query keys:
["admin","notes",filters]
["admin","note",id]
Invalidate list + single appropriately.
```
```
Copy code
```
```
txt
```
```
Implement: /app/(admin)/notes/page.tsx
Components:
```
- NotesFilters.tsx:
- SubjectSelect (from subjects)
- TopicSelect (from topics filtered by subject)
- PublishedSelect (all/published/unpublished)
- PremiumSelect (all/premium/free)
- Search input q (debounced)
- NotesTable.tsx:
columns: title, subject, topics count, premium, published, updatedAt
row actions: Edit, Publish/Unpublish (perm gated)
Add "Create Note" button -> /admin/notes/new Copy code


#### TASK N3.2 — New note page

#### TASK N3.3 — Edit note page

#### DoD

#### Create note with PDF + topics

#### Edit note updates metadata + topics

#### Publish/unpublish works

```
 
```
```
txt
```
```
Create:
src/modules/notes/NoteEditorForm.tsx
Props:
```
- mode: "create"|"edit"
- initialData?
Form fields:
- subjectId (select)
- title, description
- isPremium (switch)
- topicIds (multi-select)
- fileAssetId (PDF upload)
Behavior:
- when subject changes: reload topics list + clear topicIds not in subject
- PDF upload uses shared <FileUpload purpose="NOTES_PDF" accept="application/pdf"
Submit:
- create -> navigate to /admin/notes/:id after success
- edit -> toast success Copy code

```
txt
```
```
Implement /app/(admin)/notes/new/page.tsx
```
- Require perm notes.write
- Render <NoteEditorForm mode="create" /> Copy code

```
txt
```
```
Implement /app/(admin)/notes/[id]/page.tsx
```
- Load note via useNote(id)
- Render <NoteEditorForm mode="edit" initialData=... />
- Add Publish/Unpublish buttons (perm notes.publish)
- Show read-only note metadata (createdAt, publishedAt) Copy code


#### No hard refresh required anywhere

## N4) Multi-select for topics (reusable)

#### TASK N4.1 — TopicMultiSelect component

# Suggested commit order (so you don’t get stuck)

#### 1. Taxonomy Subjects page ✅

#### 2. Topics tree page ✅

#### 3. Notes list ✅

#### 4. Notes editor ✅

#### 5. Publish/unpublish buttons ✅

#### 6. Polishing: loading/error/empty states ✅

## Next step after you finish Notes

#### Reply with:

#### “next questions module” (recommended)

#### and I’ll give the same deep tasks for the rich question editor (text + images in

#### options) , then tests builder.

```
txt
```
```
Create:
src/modules/taxonomy/topics/TopicMultiSelect.tsx
Inputs:
```
- subjectId
- value: topicIds[]
- onChange
Implementation:
- load topics via useTopics(subjectId)
- show flattened tree with indentation
- allow selecting multiple
- show selected chips Copy code


#### next questions module

#### Awesome — Questions module is the biggest win because it validates: assets/images,

#### taxonomy (subject/topic), rich JSON schema, publish workflow, search, and later

#### practice/test reuse.

#### Below is Admin Questions Module v1 with minute-level Codex tasks.

# ADMIN PANEL — Module 3: Questions (Rich Editor +

# Images + Publish)

## Q0) What we’re building

#### Questions list with filters + search

#### Question editor:

#### statement: text + optional image

#### options A–D: text and/or image

#### correct option select

#### explanation: optional text + optional image

#### difficulty + subject + topic

#### Publish/unpublish

#### Uses your FileUpload + /assets/:id preview

# Q1) Types + schemas (Zod) — do this first

## TASK Q1.1 — Create module files

```
txt
```
```
Create folder:
src/modules/questions
api.ts
hooks.ts
schemas.ts
types.ts
```

### TASK Q1.2 — Define shared JSON block schema

### TASK Q1.3 — Options schema

```
components/
QuestionsFilters.tsx
QuestionsTable.tsx
QuestionEditorForm.tsx
blocks/
ContentBlocksEditor.tsx
ContentBlockRow.tsx
ImageAssetPicker.tsx
options/
OptionsEditor.tsx
OptionRow.tsx
preview/
QuestionPreviewCard.tsx Copy code
```
```
txt
```
```
In schemas.ts define:
```
```
ContentBlockSchema:
{
type: "text" | "image",
text?: string,
imageAssetId?: string
}
Refine:
```
- if type="text" => text required (min 1)
- if type="image" => imageAssetId required

```
ContentDocSchema:
{ blocks: ContentBlockSchema[] }
Refine:
```
- blocks length 1..50
- max total text length (e.g. 10k) Copy code

```
txt
```
```
OptionKey = "A" | "B" | "C" | "D"
```
```
OptionSchema:
```

### TASK Q1.4 — Question create/update schema

### TASK Q1.5 — Build “extract plain text” helper (for preview + sanity)

##### {

```
key: OptionKey,
blocks: ContentBlockSchema[] // allow mix text+image
}
Refine:
```
- at least 1 block
- max blocks per option (e.g. 6)

```
OptionsSchema:
{
options: [OptionSchema, OptionSchema, OptionSchema, OptionSchema]
}
Refine:
```
- keys must be A,B,C,D unique and present Copy code

```
txt
```
```
QuestionCreateSchema:
{
subjectId: uuid
topicId?: uuid | null
difficulty: "EASY"|"MEDIUM"|"HARD"
statementJson: ContentDocSchema
optionsJson: OptionsSchema
correctAnswerJson: { key: OptionKey }
explanationJson?: ContentDocSchema | null
isPublished?: boolean
}
```
```
QuestionUpdateSchema:
Partial, but in editor always submit full object (safer). Copy code
```
```
txt
```
```
Implement helper:
contentDocToPlainText(doc) -> string
```
- join text blocks
- ignore image blocks
Used in list snippet and preview fallback. Copy code


#### DoD Q1

#### Zod schemas compile

#### You can validate sample payload in a small test page or console

# Q2) API client + hooks

## TASK Q2.1 — Questions API

## TASK Q2.2 — React Query hooks

#### DoD Q2

```
 
```
```
txt
```
```
In api.ts implement:
listQuestions(filters):
GET /admin/questions?subjectId=&topicId=&difficulty=&published=&q=&page=&limit=
getQuestion(id): GET /admin/questions/:id
createQuestion(dto): POST /admin/questions
updateQuestion(id,dto): PATCH /admin/questions/:id
publishQuestion(id): POST /admin/questions/:id/publish
unpublishQuestion(id): POST /admin/questions/:id/unpublish
```
```
Also implement:
getAssetUrl(assetId): `${API_BASE}/assets/${assetId}` (stream endpoint)
(only used for preview <img src>) Copy code
```
```
txt
```
```
In hooks.ts implement:
useQuestions(filters)
useQuestion(id)
useCreateQuestion()
useUpdateQuestion(id)
usePublishQuestion(id)
useUnpublishQuestion(id)
```
```
Query keys:
["admin","questions",filters]
["admin","question",id]
Invalidate both list + single on mutations. Copy code
```

#### listQuestions call works and returns data

#### create/update mutations reachable

# Q3) Questions list page (filters + table + publish)

## TASK Q3.1 — Page + filters component

## TASK Q3.2 — Questions table

## TASK Q3.3 — Connect to backend pagination

```
txt
```
```
Implement /app/(admin)/questions/page.tsx
```
```
Add <QuestionsFilters /> with:
```
- SubjectSelect (required to narrow topics; allow "All" too)
- TopicSelect (depends on subject, optional)
- DifficultySelect
- PublishedSelect (all/published/unpublished)
- Search input q (debounced 300ms; min length 2)
- Reset filters button

```
Persist filters in URL query params. Copy code
```
```
txt
```
```
Implement <QuestionsTable />:
Columns:
```
- snippet (from statementJson -> plain text, truncate)
- subject/topic
- difficulty
- published badge
- updatedAt
Actions:
- Edit (always if questions.crud)
- Publish/Unpublish (only if questions.publish)
Row click can navigate to edit page. Copy code

```
txt
```

#### DoD Q3

#### Filters update table

#### Publish/unpublish works from list

#### Navigation to edit works

# Q4) Question editor (new/edit) — the main part

## Q4A) Block editor (statement + explanation)

## TASK Q4.1 — ContentBlocksEditor

## TASK Q4.2 — ImageAssetPicker (upload + preview)

```
If backend supports pagination:
```
- accept page + limit
- DataTable shows next/prev
Else:
- use limit=50 and show “Load more” button (v1)

```
Copy code
```
```
txt
```
```
Implement ContentBlocksEditor.tsx:
```
- Renders blocks list
- Add Text block
- Add Image block
- Reorder blocks (optional v1; else up/down buttons)
- Delete block
For text block:
- textarea with max length
For image block:
- ImageAssetPicker opens upload and sets imageAssetId
Return updated ContentDoc value to RHF via Controller. Copy code

```
txt
```
```
Implement ImageAssetPicker.tsx:
```
- Uses <FileUpload purpose="QUESTION_IMAGE" accept="image/*" />
- After upload returns fileAssetId
- Shows preview thumbnail via /assets/:id

```
Copy code
```

## Q4B) Options editor

### TASK Q4.3 — OptionsEditor

## Q4C) Editor form orchestration

### TASK Q4.4 — QuestionEditorForm

- Allows replace/remove
Also support OPTION_IMAGE and EXPLANATION_IMAGE via prop "purpose".

```
txt
```
```
Implement OptionsEditor.tsx:
```
- Always shows 4 options A-D
- Each OptionRow has:
- blocks editor (same ContentBlocksEditor but with tighter limits)
- key label (A/B/C/D)
- Correct answer radio select alongside options
Integrate with RHF so optionsJson and correctAnswerJson stay consistent.Copy code

```
txt
```
```
Implement QuestionEditorForm.tsx:
Fields:
```
- subjectId (select)
- topicId (select filtered by subject, optional)
- difficulty (select)
- statementJson (ContentBlocksEditor)
- optionsJson (OptionsEditor)
- explanationJson (ContentBlocksEditor optional toggle)

```
Buttons:
```
- Save
- Save & Publish (if questions.publish)
- Publish/Unpublish (edit mode)

```
Behavior:
```
- When subject changes: clear topicId if not in subject
- Validate using Zod before submit
- On save success:
create -> navigate to /admin/questions/:id
edit -> toast "Saved" Copy code


## TASK Q4.5 — Preview panel

#### DoD Q4

#### Create question with text-only

#### Create question with image in statement

#### Create question with images in options

#### Correct answer selection stable

#### Edit loads existing content correctly

#### Publish/unpublish works

# Q5) Pages wiring

## TASK Q5.1 — New question page

## TASK Q5.2 — Edit question page

```
txt
```
```
Create QuestionPreviewCard.tsx:
```
- Render statement blocks
- Render options blocks
- Show correct answer if admin toggle "Show answer" on
- Render explanation blocks if present
Images: <img src={`/assets/${id}`} />
Keep styles print-friendly. Copy code

```
txt
```
```
/app/(admin)/questions/new/page.tsx
```
- Require perm questions.crud
- Render <QuestionEditorForm mode="create" /> Copy code

```
txt
```
```
/app/(admin)/questions/[id]/page.tsx
```
- Load question via useQuestion(id)
- Render <QuestionEditorForm mode="edit" initialData=... />
- Add publish/unpublish actions Copy code


# Q6) Quality-of-life (admin productivity)

## TASK Q6.1 — “Duplicate question” button

## TASK Q6.2 — Keyboard shortcuts (optional)

# Q7) Guardrails (prevent bad content)

## TASK Q7.1 — Strong client-side validation messages

# Suggested commit order

#### 1. Q1 schemas + helpers

#### 2. Q2 api + hooks

#### 3. Q3 list + filters + publish

```
 
```
```
txt
```
```
Add in edit page:
```
- Button “Duplicate”
- Creates a new question with same statement/options/explanation but isPublished=
- Navigate to new question id
Requires questions.crud Copy code

```
txt
```
```
Add shortcuts:
```
- Ctrl+S -> Save
- Ctrl+Shift+P -> Save & Publish (if allowed) Copy code

```
txt
```
```
Show inline errors for:
```
- empty statement
- any option empty
- no correct answer (should default A)
- too many blocks
- missing subject
Also limit image size hint (backend enforces too). Copy code


#### 4. Q4 editor: statement blocks

#### 5. Q4 options editor + correct answer

#### 6. Q4 preview + explanation

#### 7. Q5 pages wiring

#### 8. Q6 productivity extras

## Next after Questions

#### Say “next tests module” and I’ll give the same minute-level tasks for:

#### Mixer rules builder

#### Test CRUD + publish

#### (Optional) Preview generated paper set for print/test runs

#### next tests module

#### Alright — Tests module next. This will validate: mixer rules, topic filters, publishing, and

#### later it plugs into print + student test attempts.

#### Below is Admin Tests Module v1 in the same minute-level Codex task style.

# ADMIN PANEL — Module 4: Tests (Mixer Rules Builder +

# Publish)

## TE0) What we’re building

#### Tests list with filters + publish toggle

#### Test editor (create/edit):

#### title, type, duration, negative marking

#### mixer rules builder :

#### subjectId

#### topicIds (multi-select, optional)

#### difficulty (optional)


#### count

#### validations (sum count > 0, topic/subject consistency)

#### Publish/unpublish

#### (Optional) “Preview selection” button if backend supports a preview endpoint

# TE1) Types + schemas + module files

## TASK TE1.1 — Create module structure

## TASK TE1.2 — Define enums & types

```
txt
```
```
Create folder:
src/modules/tests
api.ts
hooks.ts
schemas.ts
types.ts
components/
TestsFilters.tsx
TestsTable.tsx
TestEditorForm.tsx
builder/
MixerRulesBuilder.tsx
MixerRuleRow.tsx
TotalCountSummary.tsx
preview/
TestPreviewPanel.tsx // optional Copy code
```
```
txt
```
```
In types.ts define:
```
```
TestType = "SUBJECT" | "COMBINED" | "CUSTOM" // match backend
Difficulty = "EASY"|"MEDIUM"|"HARD"
```
```
MixerRule:
{
subjectId: string,
topicIds?: string[],
```

### TASK TE1.3 — Zod schemas

```
difficulty?: Difficulty | null,
count: number
}
```
```
TestConfigJson:
{
durationSec: number,
negativeMarking?: { enabled: boolean, perWrong?: number } | null,
mixerRules: MixerRule[]
}
```
```
TestEntity:
{
id, title, type, isPublished, publishedAt?, configJson, createdAt, updatedAt
}
Copy code
```
```
txt
```
```
In schemas.ts define:
```
```
MixerRuleSchema:
{
subjectId: uuid,
topicIds?: uuid[] (optional),
difficulty?: enum (optional),
count: number int min 1 max 500
}
```
```
TestConfigSchema:
{
durationSec: number int min 60 max 6*60*60
negativeMarking?: { enabled: boolean, perWrong?: number min 0 } optional
mixerRules: MixerRuleSchema[] min 1
}
Refine:
```
- sum(rule.count) <= 500 (or your chosen max)
- if negativeMarking.enabled then perWrong required

```
TestCreateSchema:
{
title: string 2..160
```

#### DoD TE1

#### Schemas compile and validate sample configJson

# TE2) API client + React Query hooks

## TASK TE2.1 — Tests API

## TASK TE2.2 — Hooks

```
type: TestType
configJson: TestConfigSchema
}
```
```
TestUpdateSchema: same shape (submit full object from editor). Copy code
```
```
txt
```
```
In api.ts implement:
listTests(filters):
GET /admin/tests?type=&published=&q=&page=&limit=
getTest(id): GET /admin/tests/:id
createTest(dto): POST /admin/tests
updateTest(id,dto): PATCH /admin/tests/:id
publishTest(id): POST /admin/tests/:id/publish
unpublishTest(id): POST /admin/tests/:id/unpublish
```
```
Optional (only if backend exists):
previewSelection(id or dto): POST /admin/tests/preview-selection Copy code
```
```
txt
```
```
In hooks.ts implement:
useTests(filters)
useTest(id)
useCreateTest()
useUpdateTest(id)
usePublishTest(id)
useUnpublishTest(id)
```
```
Query keys:
["admin","tests",filters]
```

# TE3) Tests list page (filters + table)

## TASK TE3.1 — Tests page & URL filters

## TASK TE3.2 — Tests table + actions

#### DoD TE3

#### Filters work

#### Publish/unpublish works from list

```
["admin","test",id]
Invalidate list+single on mutations.
```
```
Copy code
```
```
txt
```
```
Implement /app/(admin)/tests/page.tsx
```
```
Filters:
```
- type (all/SUBJECT/COMBINED/CUSTOM)
- published (all/published/unpublished)
- q search input (debounced)
- page + limit (optional)

```
Persist in URL query params. Copy code
```
```
txt
```
```
Implement TestsTable.tsx:
Columns:
```
- title
- type badge
- duration (from configJson.durationSec)
- totalQuestions (sum mixerRules counts)
- published badge
- updatedAt
Actions:
- Edit
- Publish/Unpublish (perm tests.publish)
Row click navigates to edit. Copy code


# TE4) Test editor (create/edit)

## TE4A) Mixer rules builder (core)

## TASK TE4.1 — MixerRulesBuilder component

## TASK TE4.2 — TopicMultiSelect reuse

## TE4B) Core form fields

## TASK TE4.3 — TestEditorForm component

```
txt
```
```
Implement MixerRulesBuilder.tsx:
```
- renders an array of rule rows
- add rule button
- remove rule button
- show TotalCountSummary (sum of counts)
- each row fields:
subjectId (select from subjects)
topicIds (multi-select filtered by subjectId)
difficulty (optional)
count (number)
Validation behavior:
- count must be >=1
- if subjectId changes -> clear topicIds
Integrate with RHF field array (useFieldArray). Copy code

```
txt
```
```
Reuse TopicMultiSelect from taxonomy module:
```
- pass subjectId
- allow multi selection
- optionally “Include all topics” toggle = empty topicIds array Copy code

```
txt
```
```
Implement TestEditorForm.tsx:
Fields:
```
- title
- type
- durationSec (input minutes + convert to seconds for payload)
- negative marking:


## TASK TE4.4 — Data helpers

#### DoD TE4

#### Can create a test with 1+ mixer rules

#### Can edit rule counts and topics

#### Can publish/unpublish

# TE5) Pages wiring

## TASK TE5.1 — New test page

## TASK TE5.2 — Edit test page

```
switch enabled
perWrong input (if enabled)
```
- mixerRules builder
Buttons:
- Save
- Save & Publish (if tests.publish)
In edit mode:
- Publish/Unpublish buttons
- show metadata: createdAt, publishedAt

```
Submit full object using TestCreate/Update schema.
On create success -> navigate to /admin/tests/:id Copy code
```
```
txt
```
```
Create helpers:
```
- secondsToMinutes
- minutesToSeconds
- calcTotalQuestions(configJson)
Keep consistent in list + editor. Copy code

```
txt
```
```
/app/(admin)/tests/new/page.tsx
Require perm tests.crud
Render <TestEditorForm mode="create" /> Copy code
```
```
txt
```

# TE6) Optional “Preview selection” (nice if backend

# supports it)

## TASK TE6.1 — Preview panel (optional)

# TE7) Guardrails & UX productivity

## TASK TE7.1 — Templates / presets

## TASK TE7.2 — Duplicate test

```
/app/(admin)/tests/[id]/page.tsx
Load test via useTest
Render <TestEditorForm mode="edit" initialData /> Copy code
```
```
txt
```
```
If backend provides preview endpoint:
Add a “Preview question set” button:
```
- calls previewSelection with current configJson (not saved)
- shows list of selected questions (id + snippet + subject/topic + difficulty)
- show counts per subject/topic
This helps admins verify mixer distribution. Copy code

```
txt
```
```
Add “Add preset rule” dropdown:
```
- e.g. "20 EASY", "30 MIXED", "50 HARD"
It just inserts rules with common values. Copy code

```
txt
```
```
Add “Duplicate” button on edit page:
```
- creates new test with same configJson, isPublished=false
- navigates to new test Copy code


# Suggested commit order

#### 1. TE1 schemas/types

#### 2. TE2 api/hooks

#### 3. TE3 list page

#### 4. TE4 mixer builder

#### 5. TE4 editor form + create/edit pages

#### 6. publish/unpublish + polish

#### 7. optional preview

## Next after Tests

#### Say “next cms module” and I’ll give tasks for:

#### Banners

#### Announcements (block editor reused)

#### Home sections builder + reorder

#### Pages (privacy/terms/about)

#### Then we’ll do Print + Payments ops + Users/Security/Audit.

#### next cms module

#### Alright — CMS module next. This is what makes your landing page + student home

#### dynamic, and it validates those backend CMS APIs early.

#### We’ll build:

#### Banners (image + link + schedule + target)

#### Announcements (rich blocks + pin + schedule + target)

#### Home Sections (type + configJson + reorder)

#### Pages (privacy/terms/about etc with publish)

#### All in admin panel under /admin/cms/*.


# ADMIN PANEL — Module 5: CMS (Banners +

# Announcements + Home Sections + Pages)

## C0) Shared CMS foundations

## TASK C0.1 — Create CMS module structure

## TASK C0.2 — Date/time helpers (scheduling)

```
txt
```
```
Create folder:
src/modules/cms
types.ts
api.ts
hooks.ts
utils.ts
blocks/
CmsBlocksEditor.tsx // reuse ContentBlocksEditor or wrap it
banners/
BannerFormDialog.tsx
BannersTable.tsx
BannerFilters.tsx
announcements/
AnnouncementFormDialog.tsx
AnnouncementsTable.tsx
AnnouncementFilters.tsx
home-sections/
HomeSectionsTable.tsx
HomeSectionEditorDialog.tsx
ReorderControls.tsx
pages/
PagesTable.tsx
PageEditor.tsx
PagePublishDialog.tsx Copy code
```
```
txt
```
```
Implement utils:
```
- toIso(datetime-local string) -> ISO string
- fromIsoToLocalInput(iso) -> datetime-local string
- isActiveNow(startAt?, endAt?) -> boolean

```
C d
```

### TASK C0.3 — Targets enum + shared schema

## C1) CMS API client + hooks

### TASK C1.1 — Implement CMS api.ts

```
Use datetime-local inputs for startAt/endAt in forms.
```
```
Copy code
```
```
 
```
```
txt
```
```
In types.ts define:
Target = "PUBLIC" | "STUDENT" | "ADMIN" | "ALL"
```
```
Zod helpers:
```
- OptionalIsoDateString
- ScheduleSchema: { startAt?: string|null, endAt?: string|null } with refine startCopy code

```
txt
```
```
In src/modules/cms/api.ts implement:
```
```
// Banners
listBanners(filters): GET /admin/banners?target=&active=&from=&to=
createBanner(dto): POST /admin/banners
updateBanner(id,dto): PATCH /admin/banners/:id
activateBanner(id): POST /admin/banners/:id/activate
deactivateBanner(id): POST /admin/banners/:id/deactivate
```
```
// Announcements
listAnnouncements(filters): GET /admin/announcements?target=&active=
createAnnouncement(dto): POST /admin/announcements
updateAnnouncement(id,dto): PATCH /admin/announcements/:id
pinAnnouncement(id): POST /admin/announcements/:id/pin
unpinAnnouncement(id): POST /admin/announcements/:id/unpin
```
```
// Home Sections
listHomeSections(filters): GET /admin/home-sections?target=&active=
createHomeSection(dto): POST /admin/home-sections
updateHomeSection(id,dto): PATCH /admin/home-sections/:id
reorderHomeSections(items): POST /admin/home-sections/reorder
```

## TASK C1.2 — Hooks

# C2) Banners (image + link + schedule + target)

## TASK C2.1 — Banner schemas

```
// Pages
listPages(filters): GET /admin/pages?status=
createPage(dto): POST /admin/pages
updatePage(id,dto): PATCH /admin/pages/:id
publishPage(id): POST /admin/pages/:id/publish Copy code
```
```
 
```
```
txt
```
```
In hooks.ts implement:
useBanners(filters), useCreateBanner, useUpdateBanner, useToggleBanner
useAnnouncements(filters), useCreateAnnouncement, useUpdateAnnouncement, usePinAn
useHomeSections(filters), useCreateHomeSection, useUpdateHomeSection, useReorderH
usePages(filters), useCreatePage, useUpdatePage, usePublishPage
```
```
Query keys:
["admin","cms","banners",filters]
["admin","cms","announcements",filters]
["admin","cms","homeSections",filters]
["admin","cms","pages",filters]
Invalidate correctly. Copy code
```
```
txt
```
```
Define BannerCreate/Update zod schema:
{
title: string 2..120
subtitle?: string 0..200
imageAssetId?: uuid | null
linkUrl?: string url | null
target: "PUBLIC"|"STUDENT"|"ADMIN"
priority?: number int 0..999
startAt?: iso|null
endAt?: iso|null
isActive?: boolean
```

## TASK C2.2 — Banners page

## TASK C2.3 — BannerFormDialog

#### DoD (Banners)

#### Create/edit banner with image

#### Activate/deactivate works

#### Schedule fields saved correctly

# C3) Announcements (rich blocks + pin + schedule +

# target)

## TASK C3.1 — Announcement schemas

```
metaJson?: any (optional)
}
Refine: startAt < endAt if both exist. Copy code
```
```
txt
```
```
Implement /app/(admin)/cms/banners/page.tsx
```
- Filters: target, active, date range optional
- Table columns: title, target, priority, active, schedule window, updatedAt
- Actions: edit, activate/deactivate
- Create button opens BannerFormDialog Copy code

```
 
```
```
txt
```
```
Build BannerFormDialog.tsx using RHF + Zod:
Fields:
```
- title, subtitle
- target select
- priority
- schedule startAt/endAt (datetime-local)
- linkUrl
- image upload using <FileUpload purpose="QUESTION_IMAGE" accept="image/*" /> OR
Preview thumbnail using /assets/:id
Submit create/update mutation.
    Copy code

```
txt
```

### TASK C3.2 — Announcements page

### TASK C3.3 — AnnouncementFormDialog

#### DoD (Announcements)

#### Create announcement with text + image

#### Pin/unpin works

#### Scheduling works

```
AnnouncementCreate/Update schema:
{
title: string 2..160
bodyJson: ContentDocSchema (reuse your question ContentDoc schema)
target: "STUDENT"|"ADMIN"|"ALL"
startAt?: iso|null
endAt?: iso|null
isPinned?: boolean
isActive?: boolean
} Copy code
```
```
txt
```
```
Implement /app/(admin)/cms/announcements/page.tsx
```
- Filters: target, active
- Table: title, target, pinned, active, schedule, updatedAt
- Actions: edit, pin/unpin
- Create opens AnnouncementFormDialog Copy code

```
txt
```
```
Build with:
```
- title input
- target select
- schedule start/end
- pinned toggle
- blocks editor (CmsBlocksEditor wrapping ContentBlocksEditor):
- text blocks
- image blocks (upload purpose QUESTION_IMAGE or ANNOUNCEMENT_IMAGE)
Preview pane optional.
Save create/update. Copy code


# C4) Home Sections (builder + reorder)

## TASK C4.1 — HomeSection schemas

## TASK C4.2 — Home sections page + reorder

## TASK C4.3 — HomeSectionEditorDialog

```
txt
```
```
HomeSection types:
type = "NOTES"|"TESTS"|"TOPICS"|"CUSTOM"
```
```
HomeSectionCreate/Update schema:
{
key: string 2..60 (slug-like)
title: string 2..120
type: enum
target: "STUDENT"|"PUBLIC"
orderIndex: number int 0..999
isActive: boolean
startAt?: iso|null
endAt?: iso|null
configJson: any (validated by type)
}
```
```
Type-specific validation (light v1):
```
- NOTES config: { subjectId?, topicIds?, premiumOnly?, limit?, sort? }
- TESTS config: { upcomingOnly?, limit? }
- TOPICS config: { subjectId?, limit? }
- CUSTOM config: any Copy code

```
txt
```
```
Implement /app/(admin)/cms/home-sections/page.tsx
```
- Filter by target (PUBLIC/STUDENT)
- Table shows: orderIndex, title, type, target, active
- Add buttons:
- Move up/down (v1 reorder)
- Edit
- Toggle active
- Save reorder calls POST /admin/home-sections/reorder with [{id, orderIndex}]Copy code

```
txt
```

#### DoD (Home Sections)

#### Create sections for PUBLIC and STUDENT

#### Reorder works and persists

#### ConfigJson saved without invalid JSON

# C5) Pages (privacy/terms/about + publish)

## TASK C5.1 — Page schemas

## TASK C5.2 — Pages list

```
Dialog fields:
```
- key (disabled in edit mode if you want)
- title
- type
- target
- active toggle
- schedule start/end
- orderIndex (optional; reorder tools will manage)
- configJson editor:
v1: JSON textarea + "Validate JSON" button
v1.1: switch to structured form based on type
Use Zod parse + JSON.parse with friendly error messages.
    Copy code

```
txt
```
```
PageCreate/Update schema:
{
slug: string 2..80 (lowercase slug)
title: string 2..160
bodyJson: ContentDocSchema
}
Publish action exists separately. Copy code
```
```
txt
```
```
Implement /app/(admin)/cms/pages/page.tsx
```
- list pages with status (DRAFT/PUBLISHED)
- actions: edit, publish
- create button navigates to /admin/cms/pages/new (optional) OR dialog


## TASK C5.3 — Page editor UI

#### DoD (Pages)

#### Create/edit draft pages

#### Publish works

#### Blocks editor supports text + image

# C6) Permission gating (CMS)

## TASK C6.1 — Gate CMS pages/actions

# Recommended commit order

#### 1. C1 api + hooks

#### 2. Banners page + dialog

#### 3. Announcements page + dialog

#### 4. Home sections page + reorder + dialog

#### 5. Pages page + editor + publish

```
If you keep it simple:
```
- Use a drawer editor in same page. Copy code

```
txt
```
```
Create PageEditor component:
```
- slug input (disabled when editing published? your choice)
- title input
- blocks editor for bodyJson
- Save draft
- Publish button -> calls POST /admin/pages/:id/publish
Show publishedAt in UI. Copy code

```
txt
```
```
Require perms (map as you prefer):
```
- CMS read: content.manage
- Config write: admin:config:write
- Pages publish: cms.pages.publish
Wrap buttons with <Can perm="...">. Copy code


#### 6. Polishing + permission gating

## Next after CMS

#### Say “next print module” and I’ll give tasks for:

#### creating print jobs (test paper/practice set)

#### job listing with polling

#### download + retry/cancel

#### Then we’ll do Payments ops → Users ops → Security → Audit.

#### next print module

#### Alright — Print module next. This one is nice because it validates your worker pipeline

#### end-to-end and gives admins an immediate “deliverable” feature.

#### We’ll build:

#### Create print job (Test paper / Practice set)

#### List jobs + status polling

#### Download PDF when DONE

#### Retry/cancel (if backend supports)

# ADMIN PANEL — Module 6: Print (Jobs + Download +

# Ops)

## P0) Module structure

## TASK P0.1 — Create files

```
txt
```
```
Create folder:
src/modules/print
```

## P1) Types + schemas

### TASK P1.1 — Types

```
types.ts
api.ts
hooks.ts
schemas.ts
components/
PrintJobCreatePanel.tsx
PrintJobsTable.tsx
PrintJobDetailsDrawer.tsx
PrintFilters.tsx
DownloadButton.tsx
JobStatusBadge.tsx Copy code
```
```
txt
```
```
In types.ts define:
```
```
PrintJobType = "TEST_PAPER" | "PRACTICE_SET" | "CUSTOM"
PrintJobStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED"
```
```
PrintJobEntity:
{
id: string
type: PrintJobType
status: PrintJobStatus
testId?: string|null
subjectId?: string|null
topicId?: string|null
configJson: any
outputFileAssetId?: string|null
error?: string|null
createdAt: string
startedAt?: string|null
finishedAt?: string|null
}
```
```
CreateJob payloads:
```

### TASK P1.2 — Zod schemas

## P2) API client

### TASK P2.1 — Print API methods

```
 
```
- TestPaperCreateDto: { includeAnswers:boolean, includeExplanations?:boolean, inc
- PracticeSetCreateDto: { subjectId, topicId?:string|null, count:number, difficult

```
Copy code
```
```
txt
```
```
In schemas.ts define:
```
```
TestPaperCreateSchema:
{
testId: uuid
includeAnswers: boolean
includeExplanations?: boolean
includeImages?: boolean
headerConfig?: any
}
```
```
PracticeSetCreateSchema:
{
subjectId: uuid
topicId?: uuid|null
count: number int min 10 max 500
difficulty?: "EASY"|"MEDIUM"|"HARD"|null
includeAnswers: boolean
includeExplanations?: boolean
}
```
```
FiltersSchema:
{ status?: enum, type?: enum, q?: string } Copy code
```
```
txt
```
```
In api.ts implement:
```
```
createTestPaperJob(testId, dto):
POST /admin/print/test/:testId body=dto
```

### TASK P2.2 — Download helper

## P3) React Query hooks

### TASK P3.1 — Hooks

```
createPracticeSetJob(dto):
POST /admin/print/practice body=dto
```
```
listPrintJobs(params):
GET /admin/print/jobs?status=&type=&from=&to=&limit=&cursor=
```
```
getPrintJob(id):
GET /admin/print/jobs/:id (if backend exists, else reuse list item)
```
```
downloadPrintJob(id):
GET /admin/print/jobs/:id/download as blob (axios {responseType:"blob"})
```
```
Optional (only if backend exists):
retryJob(id): POST /admin/print/jobs/:id/retry
cancelJob(id): POST /admin/print/jobs/:id/cancel Copy code
```
```
txt
```
```
Implement downloadBlob(blob, filename):
```
- createObjectURL
- <a download> click
- revokeObjectURL
Filename:
paper_<jobId>.pdf or include test name if you have it. Copy code

```
txt
```
```
In hooks.ts implement:
```
```
usePrintJobs(filters)
useCreateTestPaperJob()
useCreatePracticeSetJob()
usePrintJob(id) (optional)
useDownloadPrintJob()
useRetryPrintJob() (optional)
```

### TASK P3.2 — Polling strategy (important)

## P4) Print page UI

### TASK P4.1 — Page route

## P5) Create job panel

### TASK P5.1 — Create panel component with two tabs

```
useCancelPrintJob() (optional)
```
```
Query keys:
["admin","print","jobs",filters]
Invalidate jobs list on create/retry/cancel. Copy code
```
```
txt
```
```
Implement polling on list:
```
- if there exists any job with status QUEUED or RUNNING:
refetchInterval = 2000–3000ms
- otherwise no polling
Keep it lightweight. Copy code

```
txt
```
```
Implement /app/(admin)/print/page.tsx
```
```
Layout:
```
- Left (or top): PrintJobCreatePanel
- Right (or below): PrintJobsTable
Use shadcn Card sections. Copy code

```
txt
```
```
Implement PrintJobCreatePanel.tsx:
Tabs:
1) Test Paper
```
- Test select dropdown (loads from /admin/tests list)
- includeAnswers (switch)


## P6) Jobs list table

### TASK P6.1 — Status badge component

### TASK P6.2 — Jobs table component

- includeExplanations (switch)
- includeImages (switch)
- Create button -> createTestPaperJob
2) Practice Set
- Subject select
- Topic select (optional, filtered by subject)
- difficulty select (optional)
- count input
- includeAnswers/includeExplanations
- Create button -> createPracticeSetJob

```
On success:
```
- toast "Job queued"
- reset form
- jobs list invalidated Copy code

#### If you don’t want to load all tests, add a “search test” dropdown later. For v1, load first

#### page of tests with limit 50.

```
txt
```
```
Create JobStatusBadge.tsx:
```
- QUEUED (muted)
- RUNNING (spinner)
- DONE (success)
- FAILED (destructive)
No hardcoded colors if you’re strict; otherwise use shadcn variants. Copy code

```
txt
```
```
Implement PrintJobsTable.tsx:
Columns:
```
- createdAt
- type
- status badge
- summary (testId/subject/topic + count from configJson if available)


### TASK P6.3 — Details drawer

## P7) Download behavior (blob)

### TASK P7.1 — Download button

## P8) Permissions & guardrails

### TASK P8.1 — Permission gating

- duration (finishedAt-startedAt if present)
- actions:
- View details (opens drawer)
- Download (only if DONE)
- Retry (only if FAILED, if supported)
- Cancel (only if QUEUED, if supported)

```
Row click can open details drawer. Copy code
```
```
txt
```
```
Implement PrintJobDetailsDrawer.tsx:
Shows:
```
- Job id
- Status + error if FAILED
- configJson pretty-printed
- createdAt/startedAt/finishedAt
- outputFileAssetId (read-only)
Actions inside:
- Download if DONE
- Retry/Cancel if allowed Copy code

```
txt
```
```
Implement DownloadButton.tsx:
On click:
```
- call downloadPrintJob(jobId)
- create filename paper_<jobId>.pdf
- trigger browser download
Handle errors with toast. Copy code


### TASK P8.2 — Form validation constraints

## DoD (Print module)

#### Admin can create test paper print job

#### Job appears in list and status updates via polling

#### DONE jobs can be downloaded as PDF

#### FAILED jobs show error message

#### (Optional) Retry/cancel works if backend supports

## Next modules after Print

#### Reply with:

#### “next payments ops module” (recommended)

#### Then we’ll do Users ops → Security → Audit → Analytics pages.

#### If you say “go ahead” again, I’ll proceed with Payments ops next.

```
txt
```
```
Wrap whole /admin/print page with RequirePerm "print.generate".
Hide retry/cancel if user lacks permission (same perm). Copy code
```
```
txt
```
```
Use zod + RHF:
```
- count max (e.g., 500)
- require subjectId for practice
Disable Create button while mutation loading. Copy code

#### next payments ops module


#### Alright — Payments Ops module next (admin-side). This validates PhonePe flow +

#### reconciliation + support actions.

#### We’ll build:

#### Orders list with filters

#### Order details drawer/page (events + linked subscription)

#### Admin “Finalize” action

#### Basic revenue quick stats (optional, if endpoint exists)

# ADMIN PANEL — Module 7: Payments Ops (Orders +

# Finalize + Support)

## PAY0) Module structure

## TASK PAY0.1 — Create files

## PAY1) Types + schemas

## TASK PAY1.1 — Types

```
txt
```
```
Create folder:
src/modules/payments
types.ts
api.ts
hooks.ts
schemas.ts
components/
PaymentsFilters.tsx
PaymentsTable.tsx
PaymentOrderDetailsDrawer.tsx
OrderStatusBadge.tsx
FinalizeButton.tsx
Money.tsx Copy code
```
```
txt
```

### TASK PAY1.2 — Schemas (filters)

```
 
```
```
In types.ts define:
```
```
PaymentStatus = "CREATED"|"PENDING"|"SUCCESS"|"FAILED"|"EXPIRED"
```
```
PaymentOrder:
{
id: string
merchantTransactionId: string
userId: string
userEmail?: string
planKey?: string
amountPaise: number
finalAmountPaise?: number
discountPaise?: number
status: PaymentStatus
provider?: string
createdAt: string
updatedAt: string
metaJson?: any
}
```
```
PaymentEvent:
{
id: string
providerEventId?: string
type?: string
receivedAt: string
rawSummary?: string
metaJson?: any
}
```
```
PaymentOrderDetails:
{
order: PaymentOrder
events: PaymentEvent[]
subscription?: { id:string, status:string, startsAt:string, endsAt:string, plan
entitlements?: any[] | null
}
```
```
Copy code
```
```
txt
```

## PAY2) API client

### TASK PAY2.1 — Implement admin payments APIs

## PAY3) React Query hooks

```
In schemas.ts define PaymentsFiltersSchema:
{
status?: PaymentStatus | "ALL"
userId?: string
merchantTransactionId?: string
from?: string (iso) | null
to?: string (iso) | null
limit?: number (default 25, max 100)
cursor?: string|null
}
```
```
Also add helper to parse URL params -> filters. Copy code
```
```
 
```
```
txt
```
```
In api.ts implement:
```
```
listOrders(filters):
GET /admin/payments/orders?status=&userId=&from=&to=&limit=&cursor=&merchantTra
Return: {items: PaymentOrder[], nextCursor?: string}
```
```
getOrder(merchantTransactionId):
GET /admin/payments/orders/:merchantTransactionId
Return PaymentOrderDetails
```
```
finalizeOrder(merchantTransactionId):
POST /admin/payments/orders/:merchantTransactionId/finalize
Return updated PaymentOrderDetails or {status} Copy code
```
#### If your backend uses orderId instead of merchantTransactionId, adapt accordingly,

#### but keep UI key as merchantTransactionId for support friendliness.


### TASK PAY3.1 — Hooks

## PAY4) Payments page UI

### TASK PAY4.1 — Payments page route

## PAY5) Filters

### TASK PAY5.1 — PaymentsFilters component

```
txt
```
```
In hooks.ts implement:
```
```
usePaymentOrders(filters)
usePaymentOrderDetails(merchantTransactionId, enabled)
useFinalizePaymentOrder()
```
```
Query keys:
["admin","payments","orders",filters]
["admin","payments","order",merchantTransactionId]
```
```
On finalize success:
```
- invalidate details + list Copy code

```
txt
```
```
Implement /app/(admin)/payments/page.tsx
```
```
Layout:
```
- <PageHeader title="Payments" />
- <PaymentsFilters />
- <PaymentsTable />
- <PaymentOrderDetailsDrawer /> (opens on row click)
Require perm: payments.read Copy code

```
txt
```
```
Implement PaymentsFilters.tsx:
Fields:
```

## PAY6) Orders table

### TASK PAY6.1 — Status badge + money formatting

### TASK PAY6.2 — PaymentsTable component

- Status select (ALL, CREATED, PENDING, SUCCESS, FAILED, EXPIRED)
- merchantTransactionId text input (exact search)
- userId text input (optional)
- date range: from/to (datetime-local or date)
Buttons:
- Apply (updates URL query params)
- Reset

```
Debounce merchantTransactionId input optional.
Copy code
```
```
txt
```
```
Create OrderStatusBadge.tsx (variants for each status)
Create Money.tsx helper:
```
- input paise -> "₹ 1,234.00"
- handle null/undefined gracefully Copy code

```
txt
```
```
Implement PaymentsTable.tsx:
Columns:
```
- createdAt
- merchantTransactionId (copy button)
- user (email or userId short)
- planKey
- amount (Money)
- status (badge)
- updatedAt
Actions:
- View (opens drawer)
- Finalize (visible only if status=PENDING and user has payments.manage)

```
Row click opens drawer.
Pagination:
```
- if cursor exists, show "Load more" Copy code


## PAY7) Order details drawer (support view)

### TASK PAY7.1 — PaymentOrderDetailsDrawer

### TASK PAY7.2 — Finalize button component

## PAY8) QoL (optional but useful)

### TASK PAY8.1 — Quick status refresh

### TASK PAY8.2 — Highlight risky states

```
txt
```
```
Implement drawer that loads details on open:
```
- order summary (status, amounts, plan, provider, timestamps)
- subscription block (if exists)
- entitlements block (if exists)
- events list (most recent first)

```
Show:
```
- finalize button if allowed
- a "Copy details" button that copies a support-friendly text block:
merchantTxnId, status, amount, plan, createdAt, updatedAt Copy code

```
 
```
```
txt
```
```
Implement FinalizeButton.tsx:
```
- confirm dialog: "Finalize will call provider status check and update the order.
- call finalize mutation
- show loading state
- toast on success/failure
Visible only if payments.manage. Copy code

```
txt
```
```
Add "Refresh" button in drawer that refetches details query.
Useful when webhook arrives while admin is watching. Copy code
```
```
txt
```

## PAY9) Permissions

### TASK PAY9.1 — Gate everything properly

## DoD (Payments Ops)

#### Orders list loads with filters

#### Clicking opens details drawer with events and subscription info

#### Admin can finalize stale PENDING orders (if allowed)

#### Copy merchantTransactionId works

#### Error/loading states are clean

## Next after Payments Ops

#### Reply with:

#### “next users ops module” (recommended)

#### Then we’ll do Security → Audit → Analytics.

#### If you say “go ahead”, I’ll proceed with Users Ops next.

```
If order is PENDING and older than 15 minutes:
```
- show warning badge "Stale pending"
Encourage finalize / check status. Copy code

```
txt
```
- Page requires payments.read
- Finalize requires payments.manage
- Hide finalize button if missing perm Copy code

#### next users ops module


#### Cool — Users Ops module next. This is your admin “support desk”: search students, view

#### profile, grant/revoke entitlements, force logout, etc.

#### We’ll build:

#### Students list with search + filters

#### Student profile page (subscription + activity + entitlements)

#### Actions:

#### Grant entitlement

#### Revoke entitlement

#### Force logout

#### (Optional) block/unblock user

# ADMIN PANEL — Module 8: Users Ops (Students +

# Entitlements + Support)

## U0) Module structure

## TASK U0.1 — Create files

## U1) Types + schemas

```
txt
```
```
Create folder:
src/modules/users
types.ts
api.ts
hooks.ts
schemas.ts
components/
StudentsFilters.tsx
StudentsTable.tsx
StudentProfileHeader.tsx
StudentEntitlementsCard.tsx
EntitlementGrantDialog.tsx
EntitlementRevokeDialog.tsx
ForceLogoutButton.tsx
ActivitySummaryCard.tsx Copy code
```

### TASK U1.1 — Types

```
txt
```
```
In types.ts define:
```
```
UserStatus = "ACTIVE"|"BLOCKED"|"DELETED" (adapt to backend)
SubscriptionStatus = "ACTIVE"|"EXPIRED"|"NONE"
```
```
StudentListItem:
{
id: string
name?: string
email?: string
phone?: string
status?: UserStatus
subscriptionStatus?: SubscriptionStatus
lastActivityAt?: string|null
createdAt: string
}
```
```
StudentProfile:
{
user: {
id, name, email, phone, status, createdAt
}
subscription?: {
id, status, planKey, startsAt, endsAt
} | null
entitlements?: Entitlement[] | null
activity?: {
lastNoteReadAt?: string|null
lastPracticeAt?: string|null
lastTestAt?: string|null
} | null
}
```
```
EntitlementKind = "NOTES"|"TESTS"|"ALL"
Entitlement:
{
id: string
kind: EntitlementKind
scopeJson?: any | null
startsAt: string
```

### TASK U1.2 — Schemas (filters + grant form)

## U2) API client

### TASK U2.1 — Admin users APIs

```
endsAt: string
createdAt: string
} Copy code
```
```
txt
```
```
In schemas.ts define:
```
```
StudentsFiltersSchema:
{
query?: string
status?: "ALL"|UserStatus
subscriptionStatus?: "ALL"|SubscriptionStatus
limit?: number (default 25, max 100)
cursor?: string|null
}
```
```
EntitlementGrantSchema:
{
kind: EntitlementKind
durationDays?: number int min 1 max 365
scopeJson?: any|null
}
```
```
EntitlementRevokeSchema:
{ entitlementId: uuid } Copy code
```
```
txt
```
```
In api.ts implement:
```
```
listStudents(filters):
GET /admin/users/students?query=&status=&subscriptionStatus=&limit=&cursor=
Return {items: StudentListItem[], nextCursor?: string}
```
```
getStudentProfile(userId):
```

## U3) React Query hooks

### TASK U3.1 — Hooks

## U4) Students list page

```
GET /admin/users/:id/profile
Return StudentProfile
```
```
grantEntitlement(userId, dto):
POST /admin/users/:id/entitlements/grant
```
```
revokeEntitlement(userId, dto):
POST /admin/users/:id/entitlements/revoke
```
```
forceLogout(userId):
POST /admin/users/:id/force-logout
```
```
Optional:
blockUser(userId): POST /admin/users/:id/block
unblockUser(userId): POST /admin/users/:id/unblock Copy code
```
```
txt
```
```
In hooks.ts implement:
```
```
useStudents(filters)
useStudentProfile(userId)
useGrantEntitlement(userId)
useRevokeEntitlement(userId)
useForceLogout(userId)
```
```
Query keys:
["admin","users","students",filters]
["admin","users","profile",userId]
```
```
On mutations:
```
- invalidate profile
- optionally invalidate students list Copy code


### TASK U4.1 — Route + layout

### TASK U4.2 — StudentsFilters component

### TASK U4.3 — StudentsTable component

#### DoD

#### Can search students and filter

```
txt
```
```
Implement /app/(admin)/users/page.tsx
```
```
Require perm: users.read
```
```
Render:
```
- <PageHeader title="Students" />
- <StudentsFilters />
- <StudentsTable /> Copy code

```
txt
```
```
StudentsFilters.tsx:
```
- query text input (name/email/phone)
- status select (ALL/ACTIVE/BLOCKED)
- subscriptionStatus select (ALL/ACTIVE/EXPIRED/NONE)
- Apply/Reset (URL query params)
Debounce query input 300ms optional. Copy code

```
txt
```
```
Columns:
```
- name/email/phone (show best available)
- subscriptionStatus badge
- status badge
- lastActivityAt
- createdAt
Actions:
- View profile (navigate /admin/users/:id)
Pagination:
- Load more (cursor)
Row click navigates to profile.
Add “copy userId” icon. Copy code


#### Can open profile page from list

## U5) Student profile page (support hub)

### TASK U5.1 — Profile route

## U6) Entitlements UI (grant/revoke)

### TASK U6.1 — Entitlements card

### TASK U6.2 — Grant dialog

```
txt
```
```
Implement /app/(admin)/users/[id]/page.tsx
```
```
Require perm: users.read
Load profile with useStudentProfile(id)
```
```
Layout:
```
- StudentProfileHeader (basic info + status badges)
- ActivitySummaryCard
- StudentEntitlementsCard (list + actions)
- Subscription card (plan + endsAt)
Support actions area:
- Force logout button (users.manage)
- Grant entitlement (payments.manage or users.manage)
- Revoke entitlement (payments.manage or users.manage)
Optional block/unblock buttons. Copy code

```
txt
```
```
StudentEntitlementsCard.tsx:
```
- Table: kind, startsAt, endsAt, scope summary, actions(revoke)
- “Grant entitlement” button opens EntitlementGrantDialog
Show empty state if none. Copy code

```
txt
```
```
EntitlementGrantDialog.tsx:
Fields:
```

### TASK U6.3 — Revoke dialog

## U7) Force logout action

### TASK U7.1 — ForceLogout button

## U8) Activity summary card

### TASK U8.1 — Activity summary UI

- kind select (ALL/NOTES/TESTS)
- durationDays (default based on plan, e.g. 30)
- scopeJson editor (v1: textarea JSON)
Helper presets:
- Notes for subjectIds/topicIds
- Specific noteIds
Validation:
- JSON parse with friendly errors
Submit -> grantEntitlement mutation Copy code

```
txt
```
```
EntitlementRevokeDialog.tsx:
```
- confirm prompt
- submit revokeEntitlement({entitlementId}) Copy code

```
txt
```
```
ForceLogoutButton.tsx:
```
- confirm dialog
- calls forceLogout mutation
- toast “User sessions revoked”
Permission: users.manage Copy code

```
txt
```
```
ActivitySummaryCard.tsx:
Show:
```
- lastNoteReadAt
- lastPracticeAt


## U9) Permissions gating (important)

### TASK U9.1 — Gate actions

## DoD (Users Ops)

#### Students list loads + filters + navigation works

#### Profile page shows subscription + activity + entitlements

#### Grant entitlement works (creates new entitlement)

#### Revoke entitlement works

#### Force logout works

#### UI gated by permissions

## Next after Users Ops

#### Reply with:

#### “next security module” (recommended)

#### Then we’ll do Audit → Analytics pages.

#### If you say “go ahead”, I’ll proceed with Security module next.

- lastTestAt
If null: “No activity yet”
This validates /admin/users/:id/profile activity fields. Copy code

```
txt
```
- Page access: users.read
- Force logout: users.manage
- Grant/revoke entitlement: payments.manage OR users.manage (choose policy)
- Block/unblock: users.manage
Hide buttons if no permission. Copy code

#### next security module


#### Alright — Security module next. This is where admins can monitor piracy/suspicious

#### behavior, revoke sessions, and ban note access for users.

#### We’ll build:

#### Security dashboard (signals summary + top offenders)

#### User security profile view (signals + active note sessions)

#### Actions:

#### Revoke note view session

#### Ban a user from a specific note (duration)

#### (Optional) Force logout shortcut

# ADMIN PANEL — Module 9: Security (Signals + Sessions +

# Note Bans)

## S0) Module structure

## TASK S0.1 — Create files

```
txt
```
```
Create folder:
src/modules/security
types.ts
api.ts
hooks.ts
schemas.ts
components/
SecuritySummaryCards.tsx
SignalsTable.tsx
SecurityFilters.tsx
UserSecurityLookup.tsx
UserSecurityProfileDrawer.tsx
UserSignalsList.tsx
ActiveNoteSessionsTable.tsx
RevokeSessionDialog.tsx
NoteBanDialog.tsx Copy code
```

## S1) Types + schemas

### TASK S1.1 — Types

```
txt
```
```
In types.ts define:
```
```
Severity = "LOW"|"MEDIUM"|"HIGH"
```
```
SignalType =
| "TOO_MANY_REQUESTS"
| "RANGE_SCRAPE"
| "MULTI_DEVICE"
| "TOKEN_REUSE"
| "IP_FLAPPING"
| "UA_CHANGED"
```
```
NoteSecuritySignal:
{
id: string
userId: string
noteId?: string|null
viewSessionId?: string|null
type: SignalType
severity: Severity
metaJson?: any
createdAt: string
}
```
```
NoteViewSessionAdmin:
{
id: string
userId: string
noteId: string
createdAt: string
expiresAt: string
lastSeenAt?: string|null
revokedAt?: string|null
deviceHint?: string|null
}
```
```
SecuritySummary:
{
```

### TASK S1.2 — Schemas

```
from: string
to: string
countsByType: Record<string, number>
countsBySeverity: Record<string, number>
topUsers?: { userId: string, count: number }[]
topNotes?: { noteId: string, count: number }[]
}
```
```
UserSecurityProfile:
{
userId: string
recentSignals: NoteSecuritySignal[]
activeSessions: NoteViewSessionAdmin[]
recentAccessSummary?: any // if backend returns it
} Copy code
```
```
txt
```
```
In schemas.ts define:
```
```
SecuritySummaryFiltersSchema:
{
from?: string|null (iso date)
to?: string|null (iso date)
}
```
```
SignalsFiltersSchema:
{
userId?: string
noteId?: string
severity?: "ALL"|Severity
type?: "ALL"|SignalType
from?: string|null
to?: string|null
limit?: number (default 25 max 100)
cursor?: string|null
}
```
```
RevokeSessionSchema:
{ viewSessionId: uuid }
```

## S2) API client

### TASK S2.1 — Security APIs

## S3) React Query hooks

### TASK S3.1 — Hooks

```
NoteBanSchema:
{
userId: uuid
noteId: uuid
durationHours: number int min 1 max 720
reason: string 2..200
} Copy code
```
```
 
```
```
txt
```
```
In api.ts implement:
```
```
getSignalsSummary(filters):
GET /admin/security/signals/summary?from=&to=
```
```
listSignals(filters):
GET /admin/security/signals?noteId=&userId=&severity=&type=&from=&to=&limit=&cu
```
```
getUserSecurityProfile(userId):
GET /admin/security/users/:userId
```
```
revokeViewSession(viewSessionId):
POST /admin/security/note-sessions/:viewSessionId/revoke
```
```
banUserFromNote(dto):
POST /admin/security/users/:userId/notes/ban
body: { noteId, durationHours, reason } Copy code
```
#### If your backend uses slightly different paths, keep these functions but adjust the URL

#### strings in one place.

```
txt
```

## S4) Security page UI (/admin/security)

### TASK S4.1 — Route + layout

## S5) Summary cards

### TASK S5.1 — SecuritySummaryCards

```
In hooks.ts implement:
```
```
useSecuritySummary(filters)
useSignals(filters)
useUserSecurityProfile(userId, enabled)
useRevokeViewSession()
useBanUserFromNote()
```
```
Query keys:
["admin","security","summary",filters]
["admin","security","signals",filters]
["admin","security","user",userId]
```
```
On revoke/ban success:
```
- invalidate user profile
- invalidate signals list
- optionally invalidate summary
    Copy code

```
 
```
```
txt
```
```
Implement /app/(admin)/security/page.tsx
```
```
Require perm: security.read
```
```
Layout:
```
- PageHeader "Security"
- SecuritySummaryCards (from summary endpoint)
- Filters + SignalsTable
- UserSecurityLookup (input userId/email -> for now userId direct; later connect t
    Copy code

```
txt
```

## S6) Signals list table

### TASK S6.1 — Filters bar

### TASK S6.2 — SignalsTable

```
Render:
```
- Total signals
- High severity count
- Top signal types (small list)
- Top users (click opens user profile drawer)
- Top notes (optional)
Use data from /admin/security/signals/summary
    Copy code

```
txt
```
```
SecurityFilters.tsx:
```
- severity select (ALL/LOW/MEDIUM/HIGH)
- type select (ALL + types)
- userId input
- noteId input
- date range from/to (optional)
- Apply/Reset (URL params) Copy code

```
txt
```
```
SignalsTable.tsx columns:
```
- createdAt
- severity badge
- type badge
- userId (copy)
- noteId (copy)
- viewSessionId (copy)
- metaJson (collapsed, expand to view)
Row action:
- "Open user profile" -> opens UserSecurityProfileDrawer(userId)
Pagination via cursor (Load more) Copy code


## S7) User security profile drawer

### TASK S7.1 — Drawer component

### TASK S7.2 — ActiveNoteSessionsTable

### TASK S7.3 — Revoke session dialog

```
txt
```
```
UserSecurityProfileDrawer.tsx:
```
- loads useUserSecurityProfile(userId) when opened
Tabs:
1) Recent Signals
2) Active Note Sessions
3) (Optional) Access Summary

```
Includes:
```
- Force logout shortcut (calls existing users force logout if you want)
- Ban note action (opens NoteBanDialog) Copy code

```
txt
```
```
Table columns:
```
- sessionId (copy)
- noteId (copy)
- createdAt
- expiresAt
- lastSeenAt
- deviceHint
- revokedAt
Actions:
- Revoke (opens RevokeSessionDialog)
Disable revoke if already revoked/expired. Copy code

```
txt
```
```
RevokeSessionDialog.tsx:
```
- confirm message
- calls revokeViewSession(viewSessionId)
- toast success
Permission: security.manage Copy code


## S8) Note ban dialog (per user per note)

### TASK S8.1 — NoteBanDialog

## S9) Permission gating (important)

### TASK S9.1 — Gates

## DoD (Security module)

#### Security page shows summary + signals list

#### Filters work

#### User profile drawer opens and shows recent signals + sessions

#### Admin can revoke view session

#### Admin can ban user for a note with duration + reason

#### UI action buttons respect permissions

## Next after Security

#### Reply with:

#### “next audit module” (recommended)

#### Then we’ll do Analytics page , and after that we can start Student App / Landing.

```
txt
```
```
NoteBanDialog.tsx:
Inputs:
```
- noteId (text input OR optional note search later)
- durationHours
- reason
Submit -> banUserFromNote(userId, {noteId, durationHours, reason})
Permission: security.manage Copy code

```
txt
```
- /admin/security page requires security.read
- Revoke session + Note ban require security.manage
Hide action buttons if missing perm. Copy code


#### If you say “go ahead”, I’ll proceed with Audit module next.

#### next audit module

#### Cool — Audit module next. This gives admins visibility into “who did what” (content edits,

#### publish actions, payments finalize, bans, etc.). Super useful for production ops.

#### We’ll build:

#### Audit log list with filters

#### Detail drawer (full payload)

#### Copy/share-friendly audit entry

# ADMIN PANEL — Module 10: Audit Logs (Filters +

# Pagination + Details)

## A0) Module structure

## TASK A0.1 — Create files

```
txt
```
```
Create folder:
src/modules/audit
types.ts
api.ts
hooks.ts
schemas.ts
components/
AuditFilters.tsx
AuditTable.tsx
AuditDetailsDrawer.tsx
ActionBadge.tsx
ResourceBadge.tsx Copy code
```

## A1) Types + schemas

### TASK A1.1 — Types

### TASK A1.2 — Filters schema

```
txt
```
```
In types.ts define:
```
```
AuditEntry:
{
id: string
actorUserId?: string|null
actorEmail?: string|null
action: string // e.g. "notes.publish", "payments.finalize"
resourceType?: string|null // e.g. "NOTE", "QUESTION", "ORDER"
resourceId?: string|null
ip?: string|null
userAgent?: string|null
metaJson?: any|null
createdAt: string
}
```
```
AuditListResponse:
{
items: AuditEntry[]
nextCursor?: string|null
} Copy code
```
```
txt
```
```
In schemas.ts define AuditFiltersSchema:
{
actorUserId?: string
action?: string
resourceType?: string
resourceId?: string
from?: string|null
to?: string|null
limit?: number (default 25 max 100)
cursor?: string|null
}
Also helpers:
```

## A2) API client

### TASK A2.1 — Audit API

## A3) React Query hooks

### TASK A3.1 — Hooks

## A4) Audit page UI (/admin/audit)

### TASK A4.1 — Page route

- parseQueryToFilters(searchParams)
- filtersToQueryString(filters) Copy code

```
 
```
```
txt
```
```
In api.ts implement:
```
```
listAudit(filters):
GET /admin/audit?actorUserId=&action=&resourceType=&resourceId=&from=&to=&limit
Return AuditListResponse
```
```
Optional:
getAudit(id): GET /admin/audit/:id
(Only if backend has it; otherwise details come from list entry metaJson)Copy code
```
```
txt
```
```
In hooks.ts implement:
```
```
useAudit(filters)
useAuditEntry(id, enabled) (optional)
```
```
Query keys:
["admin","audit",filters]
["admin","audit",id] Copy code
```

## A5) Filters component

### TASK A5.1 — AuditFilters UI

## A6) Table component

### TASK A6.1 — Badges

```
txt
```
```
Implement /app/(admin)/audit/page.tsx
```
```
Require perm: admin.audit.read
```
```
Render:
```
- <PageHeader title="Audit Logs" />
- <AuditFilters />
- <AuditTable />
- <AuditDetailsDrawer />
    Copy code

```
 
```
```
txt
```
```
AuditFilters.tsx fields:
```
- action (text input; supports partial match client-side; backend exact if needed
- actorUserId input
- resourceType input (or select if you have fixed values)
- resourceId input
- from/to date range
Buttons:
- Apply (update URL params)
- Reset

```
Extra:
```
- Provide “common actions” quick chips:
notes.publish, questions.publish, tests.publish, payments.finalize, security.se
Click chip -> sets action filter
    Copy code

```
txt
```

### TASK A6.2 — AuditTable

## A7) Details drawer

### TASK A7.1 — AuditDetailsDrawer

```
ActionBadge.tsx:
```
- show action string as small badge
- optionally color variants for categories:
content.*, payments.*, security.*, cms.*

```
ResourceBadge.tsx:
```
- show resourceType + resourceId short
- copy button

```
Copy code
```
```
txt
```
```
AuditTable.tsx columns:
```
- createdAt
- action badge
- actor (email or actorUserId short + copy)
- resource badge (type + id)
- ip (optional)
Actions:
- “View” opens details drawer with full entry JSON
Pagination:
- Load more (cursor)
Row click opens drawer. Copy code

```
txt
```
```
Drawer shows:
```
- action, actor, timestamp
- resourceType/resourceId
- ip/userAgent (collapsed)
- metaJson pretty printed
Buttons:
- Copy JSON
- Copy support summary (one-line):
"[time] actor action resourceType/resourceId" Copy code

### ChatGPT 5.2


## A8) Permissions

### TASK A8.1 — Gate module

## DoD (Audit module)

#### Audit list loads

#### Filters work via URL

#### Pagination works (cursor / load more)

#### Details drawer shows metaJson neatly

#### Copy buttons work

#### Permission enforced

## Next after Audit

#### Reply with:

#### “next analytics module” (recommended)

#### Then your admin panel is basically complete for ops.

#### After that, we’ll start Student App (notes viewer + practice + tests + payment return).

```
txt
```
- Page requires admin.audit.read
- If no perm: show /admin/forbidden Copy code

#### next analytics module

#### Alright — Analytics module next. This gives admins the KPIs + coverage + revenue +

#### engagement dashboards you planned, and it validates your analytics endpoints.

#### We’ll build:


#### Analytics overview (KPI cards + charts-ready tables)

#### Coverage (syllabus gaps by subject/topic)

#### Revenue (group by day/week/month)

#### Engagement (DAU/WAU + top subjects/topics)

#### All as simple, fast v1 tables (charts can be added later).

# ADMIN PANEL — Module 11: Analytics (Overview +

# Coverage + Revenue + Engagement)

## AN0) Module structure

## TASK AN0.1 — Create files

## AN1) Types + schemas

## TASK AN1.1 — Types

```
txt
```
```
Create folder:
src/modules/analytics
types.ts
api.ts
hooks.ts
schemas.ts
components/
AnalyticsTabs.tsx
DateRangeBar.tsx
KpiCards.tsx
CoverageTable.tsx
RevenueTable.tsx
EngagementTable.tsx
TopLists.tsx Copy code
```
```
txt
```
```
In types.ts define:
```
```
DateRange:
{ from?: string|null, to?: string|null }
```

AnalyticsOverview:
{
kpis: {
newStudents: number
activeUsers: number
notesViews: number
practiceAnswers: number
testAttempts: number
revenuePaise: number
conversionRate?: number|null
}
topSubjects?: { subjectId: string, name?: string, count: number }[]
topTopics?: { topicId: string, name?: string, count: number }[]
}

CoverageRow:
{
subjectId: string
subjectName?: string
topicId: string
topicName?: string
notesCount: number
questionsCount: number
testsCoverage?: number|null
gaps: { missingNotes: boolean, missingQuestions: boolean }
}

RevenuePoint:
{
bucket: string // date or week label
revenuePaise: number
ordersCount: number
avgOrderValuePaise: number
}

EngagementSummary:
{
dau?: number
wau?: number
topSubjects?: { subjectId: string, count: number }[]
topTopics?: { topicId: string, count: number }[]


### TASK AN1.2 — Schemas

## AN2) API client

### TASK AN2.1 — Analytics API

```
cohorts?: any|null
}
```
```
Copy code
```
```
txt
```
```
In schemas.ts define:
```
```
DateRangeSchema:
{
from?: string|null
to?: string|null
}
```
```
RevenueQuerySchema:
{
from?: string|null
to?: string|null
groupBy: "day"|"week"|"month"
} Copy code
```
```
txt
```
```
In api.ts implement:
```
```
getOverview(range):
GET /admin/analytics/overview?from=&to=
```
```
getCoverage(subjectId?):
GET /admin/analytics/coverage?subjectId=
```
```
getRevenue(query):
GET /admin/analytics/revenue?from=&to=&groupBy=
```
```
getEngagement(range):
GET /admin/analytics/engagement?from=&to= Copy code
```

## AN3) React Query hooks

### TASK AN3.1 — Hooks

## AN4) Analytics page UI (/admin/analytics)

### TASK AN4.1 — Page route + tabs

#### If your backend names differ, keep these methods and adjust URLs in one place.

```
txt
```
```
In hooks.ts implement:
useAnalyticsOverview(range)
useAnalyticsCoverage(subjectId)
useAnalyticsRevenue(query)
useAnalyticsEngagement(range)
```
```
Query keys:
["admin","analytics","overview",range]
["admin","analytics","coverage",subjectId]
["admin","analytics","revenue",query]
["admin","analytics","engagement",range] Copy code
```
```
txt
```
```
Implement /app/(admin)/analytics/page.tsx
```
```
Require perm: analytics.read
```
```
Layout:
```
- PageHeader "Analytics"
- AnalyticsTabs with 4 tabs:
1) Overview
2) Coverage
3) Revenue
4) Engagement
Each tab loads only when active (enabled flag in hooks). Copy code


## AN5) Common DateRangeBar component

### TASK AN5.1 — Date range picker (simple v1)

## AN6) Overview tab

### TASK AN6.1 — KPI cards

### TASK AN6.2 — Top lists

```
txt
```
```
Create DateRangeBar.tsx:
```
- from date input (type="date")
- to date input
- quick presets:
- Today
- Last 7 days
- Last 30 days
- This month
Calls onChange(range) and updates URL query params. Copy code

```
txt
```
```
KpiCards.tsx renders:
```
- New students
- Active users
- Notes views
- Practice answers
- Test attempts
- Revenue (format ₹)
- Conversion rate (if provided)

```
Use getOverview(range). Copy code
```
```
txt
```
```
TopLists.tsx:
```
- Top subjects by engagement
- Top topics by engagement
Just show lists with counts. Copy code


#### DoD Overview

#### KPI cards render for selected date range

#### No crashes with missing optional fields

## AN7) Coverage tab (syllabus gaps)

### TASK AN7.1 — Coverage UI

#### DoD Coverage

#### Can pick a subject and see topic rows

#### Gaps clearly highlighted

## AN8) Revenue tab

### TASK AN8.1 — Revenue controls + table

```
txt
```
```
CoverageTable.tsx:
```
- Subject filter dropdown (load subjects)
- Table columns:
subject/topic, notesCount, questionsCount, gaps badges
- Highlight gaps:
- missing notes => red badge
- missing questions => red badge
Add quick action links:
- "Create note" -> /admin/notes/new?subjectId=...&topicId=...
- "Create question" -> /admin/questions/new?subjectId=...&topicId=... Copy code

```
txt
```
```
RevenueTable.tsx:
Controls:
```
- DateRangeBar
- groupBy select: day/week/month
Table columns:
- bucket
- revenue (₹)
- ordersCount
- avg order value (₹)


#### DoD Revenue

#### Switching groupBy refetches

#### Values display properly

## AN9) Engagement tab

### TASK AN9.1 — Engagement UI

#### DoD Engagement

#### Data loads and renders

#### Handles missing fields

## AN10) Permission gating

### TASK AN10.1 — Enforce analytics.read

## DoD (Analytics module)

#### Analytics page loads and tabs work

#### Each tab loads only when opened

```
Optional:
```
- total row sum Copy code

```
txt
```
```
EngagementTable.tsx:
Show:
```
- DAU/WAU (if provided)
- Top subjects list
- Top topics list
- Optional cohort summary (if backend returns)
Keep it simple v1. Copy code

```
txt
```
- Whole page requires analytics.read
- Hide link from sidebar if missing

```
Copy code
```

#### Date ranges/presets update queries

#### Coverage gap actions link to creation pages

#### Permissions respected

## Admin panel status ✅

#### At this point your admin panel is functionally complete for v1.

### Next (recommended)

#### Say “start student app” and I’ll begin the same step-by-step plan for:

#### subject/topic navigation

#### notes tree + PDF viewer + watermark overlay

#### practice mode (topic-wise)

#### tests attempt flow

#### PhonePe return page + subscription gating


