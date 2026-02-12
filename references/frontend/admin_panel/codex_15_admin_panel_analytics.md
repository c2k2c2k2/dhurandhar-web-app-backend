# Admin Panel Analytics

## Route
- `/admin/analytics`

## Backend Endpoints
- `GET /admin/analytics/overview` (alias of `/admin/analytics/kpis`)
- `GET /admin/analytics/coverage` (alias of `/admin/analytics/content-coverage`)
- `GET /admin/analytics/revenue`
- `GET /admin/analytics/engagement`

## UI
- Tabs: Overview, Coverage, Revenue, Engagement.
- Date range picker with presets.
- Coverage highlights missing notes/questions per subject/topic.

## DoD
- Overview shows KPIs and top subjects/topics.
- Coverage loads and highlights gaps.
- Revenue table supports day/week/month grouping.
- Engagement shows DAU/WAU and top lists.
- Permission gating uses `analytics.read`.
