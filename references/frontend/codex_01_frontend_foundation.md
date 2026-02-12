# Frontend Foundation (Shared)

This file captures the shared frontend foundation for the single Next.js repo that hosts landing pages, student app, and admin panel.

## Scope
- One Next.js App Router project with route groups.
- Shared API client, auth session handling, and permission gates.
- Shared UI primitives and file upload helper.

## FE0. Repo Setup and Routing

### Tasks
1. Create Next.js app with App Router and TypeScript.
2. Add route groups:
   - /(public) for landing pages.
   - /(student) for student app.
   - /(admin) for admin panel.
3. Add layout shells per segment.
4. Configure ESLint + Prettier + Tailwind.

### DoD
- App boots with all three route groups.
- Layouts render without runtime errors.

## FE1. API Client and Auth Session

### Tasks
1. Create `src/lib/api/client.ts`:
   - Base URL from `NEXT_PUBLIC_API_BASE_URL`.
   - Attach access token in request interceptor.
   - On 401, attempt refresh once, then logout and redirect to login route.
   - Normalize errors to `{ message, code?, requestId?, status? }`.
2. Create `src/lib/auth`:
   - `types.ts` with `UserMe`.
   - `tokenStore.ts` for get/set/clear tokens.
   - `authApi.ts` for `/auth/login`, `/auth/refresh`, `/auth/me`, `/auth/logout`.
3. AuthProvider:
   - On mount, if token exists, call `/auth/me` and load permissions.
   - Expose `useAuth()` and `usePermissions()`.

### Backend endpoints
- `POST /auth/login`
- `POST /auth/refresh`
- `GET /auth/me`
- `POST /auth/logout`

### DoD
- User can log in and tokens persist across refresh.
- Session bootstrap loads `/auth/me` and permissions.

## FE2. Shared UI and File Upload

### Tasks
1. Shared components:
   - AppShell layout (student + admin variants).
   - TopNav/UserMenu.
   - PageHeader, LoadingState, EmptyState, ErrorState.
   - DataTable with server pagination support.
   - ConfirmDialog and Toast helpers.
2. FileUpload component:
   - Calls `POST /admin/files/init-upload`.
   - PUT to `presignedPutUrl` with progress.
   - Calls `POST /admin/files/confirm-upload/:fileAssetId`.
   - Returns `fileAssetId`, filename, size, contentType.

### DoD
- Shared UI components are available.
- FileUpload returns a confirmed `fileAssetId`.

## Permissions Map (Backend)
Use these keys for gating UI in both student and admin apps:
- `content.manage`
- `notes.read`, `notes.write`, `notes.publish`
- `questions.read`, `questions.crud`, `questions.publish`
- `tests.crud`, `tests.publish`
- `users.read`, `users.manage`
- `payments.read`, `payments.refund`
- `admin.config.write`
- `analytics.read`
- `security.manage`
- `notifications.read`, `notifications.manage`
