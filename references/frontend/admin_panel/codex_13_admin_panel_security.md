# Admin Panel Security

## Route
- `/admin/security`

## Backend Endpoints (current)
- `GET /admin/notes/security-signals`
- `GET /admin/notes/security-summary`
- `GET /admin/notes/security/users/:userId`
- `POST /admin/notes/security/sessions/:sessionId/revoke`
- `POST /admin/notes/:noteId/revoke-sessions`
- `POST /admin/notes/:noteId/ban/:userId`
- `POST /admin/notes/:noteId/unban/:userId`

## UI Scope
- Summary cards (counts by signal type, top users/notes).
- Signals list with filters and pagination.
- User security profile view.
- Revoke all sessions for a note.
- Revoke a specific session by ID.
- Ban or unban user for a note.

## DoD
- Summary loads from `/admin/notes/security-summary`.
- Signals list loads from `/admin/notes/security-signals`.
- User security profile loads from `/admin/notes/security/users/:userId`.
- Session revoke by ID posts to `/admin/notes/security/sessions/:sessionId/revoke`.
- Revoke sessions and ban/unban actions work.
- Permission gating uses `security.read` for list/summary/profile and `notes.write` for actions.
