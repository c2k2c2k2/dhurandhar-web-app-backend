# CMS and Dynamic Content

**Config strategy**
1. AppConfig with versioned draft/publish workflow.
2. Only one published version per key.
3. Allowlist of public keys for `/cms/public` and `/cms/student`.

**CMS entities**
1. Banner with schedule, target, priority.
2. Announcement with bodyJson blocks and pinning.
3. HomeSection with type and configJson to resolve content server-side.
4. Page with slug, title, bodyJson, publish status.

**Admin APIs**
1. Draft/publish AppConfig versions.
2. CRUD for Banners, Announcements, HomeSections, Pages.
3. Reorder HomeSections.
4. Validate image assets and bodyJson schemas.

**Public/student APIs**
1. `GET /cms/public` for landing page content.
2. `GET /cms/student` for app home content and announcements.
3. Resolve HomeSections into actual notes/tests/topics lists.

**Performance**
1. Cache responses with cmsVersion stamp.
2. Add indexes for time window queries.
