# Analytics v1

**Data capture**
1. NoteProgress for reading progress.
2. PracticeQuestionEvent for telemetry.
3. Attempt.scoreJson includes per-topic breakdown.
4. DailyStat rollups for quick KPIs.

**Student analytics**
1. `GET /analytics/me/summary` for dashboard summary.
2. Notes completion endpoints with filters.
3. Practice progress by topics and weak questions.
4. Test performance summary and breakdown.

**Admin analytics**
1. KPI overview with activity and revenue.
2. Content coverage for syllabus gaps.
3. Revenue metrics by day/week/month.
4. Engagement metrics (DAU/WAU proxies).

**Rollups**
1. DailyStat model keyed by date and metricKey.
2. Increment counters on key events.
3. Nightly recompute for accuracy.

**Indexes**
1. Add indexes for analytics queries on events and attempts.
2. Limit and paginate admin analytics results.
