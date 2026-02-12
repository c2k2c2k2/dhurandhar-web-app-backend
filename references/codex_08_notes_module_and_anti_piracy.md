# Notes Module and Anti-Piracy

**Models**
1. Note: subjectId, title, description, isPremium, isPublished, fileAssetId, pageCount, publishedAt.
2. NoteTopic join table for many-to-many topics.
3. NoteAccessLog with range and bytes info.
4. NoteViewSession with tokenHash, watermarkSeed, expiresAt, revokedAt, lastSeenAt.
5. NoteSecuritySignal for anomaly detection.
6. NoteProgress for last read page and completion percent.

**Admin APIs**
1. Create/update notes with topicIds validation.
2. Publish/unpublish workflows with audit logs.
3. List notes with filters for subject/topic/published/premium.

**Student APIs**
1. `GET /notes` with subjectId/topicId filters.
2. `GET /notes/:id` returns metadata only.
3. `GET /notes/tree` subject -> topic -> notes hierarchy.
4. `POST /notes/:id/view-session` to create short-lived token.
5. `GET /notes/:id/watermark` for overlay data.
6. `GET /notes/:id/content` streaming with range support.
7. `POST /notes/:id/progress` to update note completion.

**Streaming hardening**
1. Range support (206 Partial Content) for PDF.js.
2. No caching headers, inline disposition.
3. Require valid view token and entitlement for premium notes.
4. Log access and range patterns.

**Anti-piracy signals**
1. Rate limit per user+note on content endpoint.
2. Detect sequential range scraping patterns.
3. Detect view token reuse across devices.
4. Store signals in NoteSecuritySignal and expose admin endpoints.
5. Allow admin to revoke sessions or ban note access per user.

**Watermark strategy**
1. Client-side overlay only; no server-side PDF watermarking.
2. Include displayName, masked email/phone, user hash, viewSessionId, and rotating watermarkSeed.
3. Sign watermark payload with HMAC for later verification.
