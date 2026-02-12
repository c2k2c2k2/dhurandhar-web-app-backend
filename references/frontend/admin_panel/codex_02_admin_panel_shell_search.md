# Admin Panel Shell, Nav, and Global Search

## Scope
Create the admin layout shell, navigation, and topbar global search.

## Components
- `src/modules/admin-shell/AdminLayout.tsx`
- `src/modules/admin-shell/SidebarNav.tsx`
- `src/modules/admin-shell/Topbar.tsx`
- `src/modules/admin-shell/UserMenu.tsx`
- `src/modules/admin-shell/Breadcrumbs.tsx` (optional)

## Nav Config
Create `src/modules/admin-shell/nav.ts` with items:
- Dashboard
- Subjects and Topics
- Notes
- Questions
- Tests
- Print Jobs
- CMS
- Payments
- Users
- Security
- Audit Logs
- Analytics
- Notifications (optional)

Use backend permission keys for gating:
- `content.manage`
- `notes.read`, `notes.write`, `notes.publish`
- `questions.read`, `questions.crud`, `questions.publish`
- `tests.crud`, `tests.publish`
- `payments.read`
- `users.read`, `users.manage`
- `security.manage`
- `analytics.read`
- `admin.config.write`
- `notifications.read`, `notifications.manage`

## Global Search
Add topbar search drawer:
- Call `GET /admin/search/notes?q=...`
- Call `GET /admin/search/questions?q=...`
- Debounce 300ms.
- Minimum query length 2 or 3.
- Group results by type.
- Click navigates to `/admin/notes/:id` or `/admin/questions/:id`.

## DoD
- Sidebar renders only permitted items.
- Topbar search returns results and navigates.
- User menu logout works.
