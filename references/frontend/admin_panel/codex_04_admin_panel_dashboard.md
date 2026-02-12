# Admin Panel Dashboard

## Scope
Create the admin dashboard landing page with summary cards and quick actions.

## Route
- `/admin`

## Backend Endpoints
- `GET /admin/dashboard/summary` (alias of `/admin/ops/summary`)
- Optional: `GET /admin/ops/content-health`

## UI
- KPI cards: users, students, admins, notes, questions, tests, active subscriptions.
- Revenue summary: orders count and amount.
- Activity: practice answers, test submissions, note progress updates.
- Pending: print jobs, payment orders, subscriptions.
- Signals: note security signals.
- Quick actions: Create Subject, Topic, Note, Question, Test.

## DoD
- Dashboard loads from `/admin/dashboard/summary`.
- Loading and error states are handled.
- Quick actions navigate to creation pages.
