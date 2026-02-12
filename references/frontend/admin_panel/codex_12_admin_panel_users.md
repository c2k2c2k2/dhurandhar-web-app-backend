# Admin Panel Users Ops

## Routes
- `/admin/users`
- `/admin/users/:id`

## Users List
- Filters: search, type, status, hasActiveSubscription.
- Columns: email, name, type, status, lastLoginAt.

### Backend Endpoint
- `GET /users`

## User Profile
- Show roles, subscriptions, entitlements, and activity summary.
- Actions: block, unblock, force logout, grant/revoke entitlement.

### Backend Endpoints
- `GET /users/:userId`
- `PATCH /users/:userId/block`
- `PATCH /users/:userId/unblock`
- `POST /users/:userId/force-logout`
- `POST /users/:userId/entitlements/grant`
- `POST /users/:userId/entitlements/revoke`

## DoD
- Users list loads and filters work.
- User profile shows roles, subscriptions, entitlements, and `activity` fields (`lastNoteReadAt`, `lastPracticeAt`, `lastTestAt`).
- Block/unblock, force logout, grant/revoke entitlement work.
- Permission gating uses `users.read` and `users.manage`.
