# Admin Panel Questions

## Routes
- `/admin/questions`
- `/admin/questions/new`
- `/admin/questions/:id`
- `/admin/questions/import`

## List Page
- Filters: subject, topic, difficulty, published.
- Table columns: snippet, subject, topic, difficulty, published.
- Actions: edit, publish, unpublish.

### Backend Endpoints
- `GET /admin/questions`
- `POST /admin/questions/:questionId/publish`
- `POST /admin/questions/:questionId/unpublish`

## Create/Edit Page
Fields:
- subjectId, topicId, difficulty, type
- statement (text + optional image)
- options A-D (text and/or image)
- correct answer selection
- explanation (text + optional image)

Images use FileUpload with asset purposes:
- `QUESTION_IMAGE`
- `OPTION_IMAGE`
- `EXPLANATION_IMAGE`

### Backend Endpoints
- `POST /admin/questions`
- `PATCH /admin/questions/:questionId`

## Bulk Import
- Accept JSON/CSV upload.
- Show row-level errors.

### Backend Endpoint
- `POST /admin/questions/bulk-import`

## DoD
- Questions list filters work.
- Create/edit with images works.
- Publish and unpublish works.
- Bulk import works with validation feedback.
