# Admin Panel Tests

## Routes
- `/admin/tests`
- `/admin/tests/new`
- `/admin/tests/:id`

## List Page
- Columns: name, type, published, updatedAt.
- Actions: edit, publish, unpublish.

### Backend Endpoints
- `GET /admin/tests`
- `POST /admin/tests/:testId/publish`
- `POST /admin/tests/:testId/unpublish`

## Create/Edit Page
Fields:
- title
- description
- type (SUBJECT, COMBINED, CUSTOM)
- subjectId (optional)
- startsAt, endsAt (optional)
- configJson builder

### configJson shape (backend)
- `questionIds?: string[]`
- `items?: { questionId: string; marks?: number }[]`
- `mixer?: { subjectId?: string; topicIds?: string[]; difficulty?: "EASY"|"MEDIUM"|"HARD"; count: number }`
- `marksPerQuestion?: number`

### Backend Endpoints
- `POST /admin/tests`
- `PATCH /admin/tests/:testId`

## DoD
- Tests list loads and filters work.
- Create/edit generates a valid `configJson`.
- Publish and unpublish work with permission gating.
