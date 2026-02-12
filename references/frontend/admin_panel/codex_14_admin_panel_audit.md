# Admin Panel Audit Logs

## Route
- `/admin/audit`

## Backend Endpoint
- `GET /admin/audit` (alias of `/admin/audit-logs`)

## Filters (AdminAuditQueryDto)
- actorUserId
- action
- resourceType
- resourceId
- from
- to
- page
- pageSize

## UI
- Audit table with pagination.
- Detail drawer with metaJson.
- Copy JSON and support summary.

## DoD
- Audit list loads with filters.
- Pagination works with page/pageSize.
- Detail drawer renders metaJson.
- Permission gating uses `admin.audit.read`.
