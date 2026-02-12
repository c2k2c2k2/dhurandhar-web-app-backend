# Admin Ops and Hardening

**Admin dashboard**
1. Summary endpoint with counts, revenue, activity, pending jobs, signals.

**Content ops**
1. Content health endpoint for missing notes/questions/tests by topic.
2. Bulk publish/unpublish notes with batch size limits.

**Security ops**
1. Security signals dashboard and user security profile.
2. Revoke note sessions and ban per-user note access.

**Payments ops**
1. Admin list orders with events.
2. Manual finalize endpoint.

**Print ops**
1. List, retry, cancel print jobs.

**Hardening**
1. Global throttler with endpoint overrides.
2. Strict DTO validation and payload size limits.
3. Consistent error responses with requestId.
4. Admin audit log explorer.
5. CSV export endpoints for users and subscriptions.
