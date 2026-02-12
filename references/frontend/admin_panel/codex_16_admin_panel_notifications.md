# Admin Panel Notifications

## Routes
- `/admin/notifications/templates`
- `/admin/notifications/messages`
- `/admin/notifications/broadcasts`

## Backend Endpoints
- `GET /admin/notifications/templates`
- `POST /admin/notifications/templates`
- `PATCH /admin/notifications/templates/:templateId`
- `GET /admin/notifications/messages`
- `POST /admin/notifications/messages/:messageId/resend`
- `GET /admin/notifications/broadcasts`
- `POST /admin/notifications/broadcasts`
- `POST /admin/notifications/broadcasts/:broadcastId/schedule`
- `POST /admin/notifications/broadcasts/:broadcastId/cancel`

## UI
- Templates list and editor.
- Messages log with resend action.
- Broadcast create, schedule, cancel.

## DoD
- Templates CRUD works.
- Messages list loads and resend works.
- Broadcasts can be scheduled and cancelled.
- Permission gating uses `notifications.read` and `notifications.manage`.
