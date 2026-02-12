# Admin Panel CMS

## Routes
- `/admin/cms/banners`
- `/admin/cms/announcements`
- `/admin/cms/home-sections`
- `/admin/cms/pages`

## Banners
- List, create, update banners.
- Upload image asset.
- Schedule start and end.

### Backend Endpoints
- `GET /admin/cms/banners`
- `POST /admin/cms/banners`
- `PATCH /admin/cms/banners/:bannerId`

## Announcements
- List, create, update announcements.
- Rich blocks editor (text and image).
- Pin and schedule.

### Backend Endpoints
- `GET /admin/cms/announcements`
- `POST /admin/cms/announcements`
- `PATCH /admin/cms/announcements/:announcementId`

## Home Sections
- List, create, update sections.
- Reorder sections.

### Backend Endpoints
- `GET /admin/cms/home-sections`
- `POST /admin/cms/home-sections`
- `PATCH /admin/cms/home-sections/:sectionId`
- `POST /admin/cms/home-sections/reorder`

## Pages
- List, create, update, publish, unpublish.

### Backend Endpoints
- `GET /admin/cms/pages`
- `POST /admin/cms/pages`
- `PATCH /admin/cms/pages/:pageId`
- `POST /admin/cms/pages/:pageId/publish`
- `POST /admin/cms/pages/:pageId/unpublish`

## DoD
- All CMS pages load and save changes.
- Reorder persists for home sections.
- Permissions gated by `admin.config.write`.
