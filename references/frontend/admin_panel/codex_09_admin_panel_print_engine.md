# Admin Panel Print Engine

## Route
- `/admin/print`

## Capabilities
- Create print jobs for tests or practice sets.
- List print jobs with status.
- Download output when ready.
- Retry or cancel jobs.

## Backend Endpoints
- `POST /admin/print/test/:testId`
- `POST /admin/print/practice`
- `POST /admin/print-jobs` (generic create)
- `GET /admin/print-jobs`
- `GET /admin/print-jobs/:jobId`
- `GET /admin/print-jobs/:jobId/download`
- `POST /admin/print-jobs/:jobId/retry`
- `POST /admin/print-jobs/:jobId/cancel`

## Create Job Payloads
### Test (PrintTestJobDto)
- Optional: `title`, `subtitle`, `includeAnswerKey`

### Practice (PrintPracticeJobDto)
- `count`
- Optional: `subjectId`, `topicIds`, `difficulty`, `title`, `subtitle`, `includeAnswerKey`

### Generic (PrintJobCreateDto)
- `type`: TEST | PRACTICE | CUSTOM
- `testId` when `type=TEST`
- `questionIds` when `type=PRACTICE` or `type=CUSTOM`
- Optional: `title`, `subtitle`, `includeAnswerKey`

## DoD
- Print job creation works for test and practice flows.
- Job list shows status and download link when DONE.
- Retry and cancel work and update status.
