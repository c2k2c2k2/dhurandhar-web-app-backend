# Admin Panel Foundation and Auth

## Scope
This phase creates the admin route skeleton, API client, auth session handling, and permission gates.

## Routes
- `/admin/login`
- `/admin/forbidden`
- `/admin` (dashboard placeholder)

## Folder Structure (App Router)
- `src/app/(admin)/login/page.tsx`
- `src/app/(admin)/forbidden/page.tsx`
- `src/app/(admin)/layout.tsx`
- `src/app/(admin)/page.tsx`
- `src/lib/api/*`
- `src/lib/auth/*`

## API Client
Create `src/lib/api/client.ts`:
1. Base URL from `NEXT_PUBLIC_API_BASE_URL`.
2. Attach access token in request interceptor.
3. On 401, attempt refresh once then retry.
4. If refresh fails, clear tokens and redirect to `/admin/login`.
5. Normalize errors to `{ message, code?, requestId?, status? }`.

## Auth Module
Create `src/lib/auth`:
- `types.ts`: `UserMe { id, email, fullName?, type, roles[], permissions[] }`.
- `tokenStore.ts`: `getAccessToken`, `getRefreshToken`, `setTokens`, `clearTokens`.
- `authApi.ts`: `login`, `refresh`, `logout`, `me`.
- `AuthProvider.tsx`: bootstraps `/auth/me` and exposes `useAuth()`.

## Guards and Permissions
Create:
- `RequireAdmin`: redirects to `/admin/login` if no session.
- `RequirePerm perm="..."`: shows 403 or hides content.
- `Can perm="..."`: conditional render.

## Backend Endpoints
- `POST /auth/login`
- `POST /auth/refresh`
- `GET /auth/me`
- `POST /auth/logout`

## DoD
- Admin login works and redirects to `/admin`.
- Session persists across refresh.
- `/admin` redirects to `/admin/login` when logged out.
- Permissions drive UI gating.
