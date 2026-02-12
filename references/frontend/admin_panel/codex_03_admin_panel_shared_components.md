# Admin Panel Shared Components and File Upload

## Shared UI Components
Create `src/modules/shared/components`:
- `PageHeader`
- `DataTable` (server pagination ready)
- `FiltersBar`
- `EmptyState`, `LoadingState`, `ErrorState`
- `ConfirmDialog`
- `FormField` wrappers (Input, Select, Switch, Textarea)
- `Toast` helper

## FileUpload Component
Create `src/modules/shared/FileUpload`:
- Props: `purpose`, `accept`, `maxBytes?`, `onComplete`.
- Flow:
  1. `POST /admin/files/init-upload`
  2. PUT file to `presignedPutUrl` with progress
  3. `POST /admin/files/confirm-upload/:fileAssetId`
- Return `{ fileAssetId, fileName, sizeBytes, contentType }`.

## Backend Endpoints
- `POST /admin/files/init-upload`
- `POST /admin/files/confirm-upload/:fileAssetId`

## DoD
- Shared components render and are reused across pages.
- FileUpload returns a confirmed `fileAssetId`.
- Upload errors are handled with a clear toast.
