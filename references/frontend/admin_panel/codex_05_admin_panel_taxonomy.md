# Admin Panel Taxonomy (Subjects and Topics)

## Routes
- `/admin/taxonomy/subjects`
- `/admin/taxonomy/topics?subjectId=`

## Subjects
- List subjects.
- Create and edit subject.
- Optional: edit `orderIndex` inline.

### Backend Endpoints
- `GET /admin/subjects`
- `POST /admin/subjects`
- `PATCH /admin/subjects/:subjectId`

## Topics
- Render hierarchical tree for a subject.
- Create topic under parent.
- Edit topic.
- Toggle active.

### Backend Endpoints
- `GET /admin/topics?subjectId=`
- `POST /admin/subjects/:subjectId/topics`
- `PATCH /admin/topics/:topicId`

## DoD
- Subjects list loads and create/edit works.
- Topic tree renders and supports nested topics.
- Permission gating uses `content.manage`.
