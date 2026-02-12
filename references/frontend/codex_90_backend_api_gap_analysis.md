# Backend API Gap Analysis for Frontend

## Summary
The backend now covers the key frontend needs after adding alias endpoints, security summary support, and user subscription/activity summaries. The remaining work is mostly frontend wiring to the updated paths and permission keys.

## Admin Panel Gaps and Mismatches
1. Dashboard endpoint mismatch.
- Frontend plan expects `/admin/dashboard/summary`.
- Backend now supports `/admin/dashboard/summary` (alias of `/admin/ops/summary`).

2. Permission keys mismatch.
- Added `admin.audit.read` and `security.read` to the backend seed.
- Frontend should align gating to backend keys (`content.manage`, `notes.*`, `questions.*`, `tests.*`, `users.*`, `payments.read`, `payments.refund`, `admin.config.write`, `analytics.read`, `security.read`, `security.manage`, `notifications.*`, `admin.audit.read`).

3. Security module mismatch.
- Backend now includes:
  - `GET /admin/notes/security-summary`
  - `POST /admin/notes/security/sessions/:sessionId/revoke`
- Existing endpoints remain:
  - `GET /admin/notes/security-signals`
  - `GET /admin/notes/security/users/:userId`
  - `POST /admin/notes/:noteId/revoke-sessions`
  - `POST /admin/notes/:noteId/ban/:userId`
  - `POST /admin/notes/:noteId/unban/:userId`
- No severity field (still not modeled).

4. Audit logs endpoint mismatch.
- Backend now supports `/admin/audit` (alias of `/admin/audit-logs`) with page/pageSize pagination.
- Permission is `admin.audit.read`.

5. Print engine endpoint mismatch.
- Backend now supports:
  - `POST /admin/print/test/:testId`
  - `POST /admin/print/practice`
- `/admin/print-jobs` remains for listing and management.

6. Analytics endpoint mismatch.
- Backend now supports `/admin/analytics/overview` and `/admin/analytics/coverage` as aliases.

7. Users profile activity.
- Backend `GET /users/:id` now includes `activity` with `lastNoteReadAt`, `lastPracticeAt`, `lastTestAt`.

8. Notifications admin.
- Backend provides admin notifications and broadcasts endpoints.
- Frontend plan does not include these screens yet.

## Student App Gaps and Mismatches
1. Subscription and entitlement summary.
- `GET /users/me` now includes `subscription` and active `entitlements`.

2. Test review with correct answers.
- `GET /attempts/:attemptId` strips `correctAnswerJson`.
- If the UI needs answer review after evaluation, add an endpoint or include correct answers once status is EVALUATED.

3. Remaining student endpoints are present.
- Subjects, topics, notes, practice, tests, payments, analytics, search, and notifications preferences are available.

## Landing Page Gaps and Mismatches
1. CMS content is supported.
- `/cms/public`, `/cms/pages/:slug` are available.
- If landing needs extra sections not modeled in CMS configs, add those keys in CMS configs or new CMS models.

2. Pricing and plans.
- `/plans` is public and can drive pricing blocks.

## Recommended Actions
1. Align frontend API paths and permission keys to the backend updates listed above.
2. Decide if test review should expose correct answers post-evaluation.
