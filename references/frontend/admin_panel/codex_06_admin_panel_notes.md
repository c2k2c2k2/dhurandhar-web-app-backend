# Admin Panel Notes

## Routes
- `/admin/notes`
- `/admin/notes/new`
- `/admin/notes/:id`

## List Page
- Filters: subject, topic, published, premium.
- Table columns: title, subject, premium, published, updatedAt.
- Actions: edit, publish, unpublish.

### Backend Endpoints
- `GET /admin/notes`
- `POST /admin/notes/:noteId/publish`
- `POST /admin/notes/:noteId/unpublish`
- Optional bulk:
  - `POST /admin/notes/bulk-publish`
  - `POST /admin/notes/bulk-unpublish`

## Create/Edit Page
Fields:
- subjectId
- title
- description
- isPremium
- topic multi-select
- file upload (PDF) using FileUpload
- pageCount

### Backend Endpoints
- `POST /admin/notes`
- `PATCH /admin/notes/:noteId`
- File upload:
  - `POST /admin/files/init-upload`
  - `POST /admin/files/confirm-upload/:fileAssetId`

## DoD
- Notes list with filters works.
- Create/edit saves with PDF upload.
- Publish and unpublish work with permission gating.
