# Frontend API Map (Backend Alignment)

Use this map to wire frontend screens to the backend endpoints and permissions. It is intentionally concise; for detailed payloads, use the per-module frontend docs.

## Admin Panel Endpoints

| Area | Endpoints | Permission |
| --- | --- | --- |
| Dashboard | `GET /admin/dashboard/summary` (alias of `/admin/ops/summary`) | `analytics.read` |
| Content Health | `GET /admin/ops/content-health` | `content.manage` |
| Exports | `GET /admin/exports/users`; `GET /admin/exports/subscriptions` | `users.read`; `payments.read` |
| Subjects | `POST /admin/subjects`; `PATCH /admin/subjects/:subjectId` | `content.manage` |
| Topics | `POST /admin/topics`; `PATCH /admin/topics/:topicId`; `POST /admin/topics/reorder` | `content.manage` |
| Notes | `GET /admin/notes`; `POST /admin/notes`; `PATCH /admin/notes/:noteId`; `POST /admin/notes/:noteId/publish`; `POST /admin/notes/:noteId/unpublish`; `POST /admin/notes/bulk-publish`; `POST /admin/notes/bulk-unpublish` | `notes.read`; `notes.write`; `notes.publish` |
| Notes Security | `GET /admin/notes/security-summary`; `GET /admin/notes/security-signals`; `GET /admin/notes/security/users/:userId`; `POST /admin/notes/security/sessions/:sessionId/revoke`; `POST /admin/notes/:noteId/revoke-sessions`; `POST /admin/notes/:noteId/ban/:userId`; `POST /admin/notes/:noteId/unban/:userId` | `security.read`; `notes.write` |
| Questions | `GET /admin/questions`; `GET /admin/questions/:questionId`; `POST /admin/questions`; `PATCH /admin/questions/:questionId`; `POST /admin/questions/:questionId/publish`; `POST /admin/questions/:questionId/unpublish`; `POST /admin/questions/bulk-import` | `questions.read`; `questions.crud`; `questions.publish` |
| Tests | `GET /admin/tests`; `POST /admin/tests`; `PATCH /admin/tests/:testId`; `POST /admin/tests/:testId/publish`; `POST /admin/tests/:testId/unpublish` | `tests.crud`; `tests.publish` |
| Print Engine | `POST /admin/print/test/:testId`; `POST /admin/print/practice`; `GET /admin/print-jobs`; `GET /admin/print-jobs/:jobId`; `GET /admin/print-jobs/:jobId/download`; `POST /admin/print-jobs/:jobId/retry`; `POST /admin/print-jobs/:jobId/cancel` | `content.manage` |
| CMS Configs | `GET /admin/cms/configs`; `POST /admin/cms/configs`; `POST /admin/cms/configs/:configId/publish` | `admin.config.write` |
| CMS Pages | `GET /admin/cms/pages`; `POST /admin/cms/pages`; `PATCH /admin/cms/pages/:pageId`; `POST /admin/cms/pages/:pageId/publish`; `POST /admin/cms/pages/:pageId/unpublish` | `admin.config.write` |
| CMS Banners | `GET /admin/cms/banners`; `POST /admin/cms/banners`; `PATCH /admin/cms/banners/:bannerId` | `admin.config.write` |
| CMS Home Sections | `GET /admin/cms/home-sections`; `POST /admin/cms/home-sections`; `PATCH /admin/cms/home-sections/:sectionId`; `POST /admin/cms/home-sections/reorder` | `admin.config.write` |
| CMS Announcements | `GET /admin/cms/announcements`; `POST /admin/cms/announcements`; `PATCH /admin/cms/announcements/:announcementId` | `admin.config.write` |
| Payments Ops | `GET /admin/plans`; `POST /admin/plans`; `PATCH /admin/plans/:planId`; `GET /admin/coupons`; `POST /admin/coupons`; `PATCH /admin/coupons/:couponId`; `GET /admin/payments/orders`; `POST /admin/payments/orders/:orderId/finalize` | `payments.read`; `admin.config.write` |
| Users Ops | `GET /users`; `GET /users/:userId`; `PATCH /users/:userId/block`; `PATCH /users/:userId/unblock`; `POST /users/:userId/force-logout`; `POST /users/:userId/entitlements/grant`; `POST /users/:userId/entitlements/revoke` | `users.read`; `users.manage` |
| Audit Logs | `GET /admin/audit` (alias of `/admin/audit-logs`) | `admin.audit.read` |
| Analytics | `GET /admin/analytics/overview`; `GET /admin/analytics/coverage`; `GET /admin/analytics/revenue`; `GET /admin/analytics/engagement` | `analytics.read` |
| Admin Search | `GET /admin/search/notes`; `GET /admin/search/questions` | `notes.read`; `questions.read` |
| Admin Notifications | `GET /admin/notifications/templates`; `POST /admin/notifications/templates`; `PATCH /admin/notifications/templates/:templateId`; `GET /admin/notifications/messages`; `POST /admin/notifications/messages/:messageId/resend`; `GET /admin/notifications/broadcasts`; `POST /admin/notifications/broadcasts`; `POST /admin/notifications/broadcasts/:broadcastId/schedule`; `POST /admin/notifications/broadcasts/:broadcastId/cancel` | `notifications.read`; `notifications.manage` |
| Admin File Uploads | `POST /admin/files/init-upload`; `POST /admin/files/confirm-upload/:fileAssetId` | `content.manage` |

## Student App Endpoints

| Area | Endpoints | Notes |
| --- | --- | --- |
| Auth | `POST /auth/register`; `POST /auth/login`; `POST /auth/refresh`; `POST /auth/logout`; `GET /auth/me`; `GET /auth/sessions`; `POST /auth/otp/request`; `POST /auth/otp/verify`; `POST /auth/password/request`; `POST /auth/password/reset` | `GET /auth/me` is separate from `GET /users/me` |
| User Profile | `GET /users/me`; `PATCH /users/me` | `GET /users/me` includes subscription + entitlements |
| Subjects/Topics | `GET /subjects`; `GET /topics`; `GET /taxonomy/tree` | Public |
| Notes | `GET /notes`; `GET /notes/tree`; `GET /notes/:noteId`; `POST /notes/:noteId/view-session`; `GET /notes/:noteId/watermark`; `GET /notes/:noteId/content`; `POST /notes/:noteId/progress` | Content streaming requires JWT |
| Practice | `POST /practice/start`; `POST /practice/:sessionId/end`; `GET /practice/:sessionId/next`; `POST /practice/:sessionId/answer`; `POST /practice/:sessionId/answer/batch`; `POST /practice/:sessionId/reveal`; `GET /practice/progress`; `GET /practice/weak-questions`; `GET /practice/trend` | Requires `practice.use` |
| Tests and Attempts | `GET /tests`; `GET /tests/:testId`; `POST /tests/:testId/start`; `PATCH /attempts/:attemptId/save`; `POST /attempts/:attemptId/submit`; `GET /attempts/me`; `GET /attempts/:attemptId` | Attempt review does not include correct answers yet |
| Questions | `GET /questions`; `GET /questions/:questionId` | Public |
| Search | `GET /search` | Throttled |
| Analytics | `GET /analytics/me/summary`; `GET /analytics/me/notes`; `GET /analytics/me/practice/topics`; `GET /analytics/me/practice/weak`; `GET /analytics/me/tests/summary`; `GET /analytics/me/tests/breakdown` | JWT required |
| Payments | `GET /plans`; `POST /payments/checkout`; `GET /payments/orders/:merchantTransactionId/status`; `POST /payments/webhook/phonepe` | Webhook is backend-only |
| Notifications | `GET /notifications/preferences`; `PATCH /notifications/preferences` | JWT required |
| CMS | `GET /cms/public`; `GET /cms/student`; `GET /cms/pages/:slug` | Public |
| Assets | `GET /assets/:assetId` | Optional JWT for gated assets |
| Health | `GET /health` | Optional for ops |
