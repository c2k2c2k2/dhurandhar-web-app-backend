# Search v1 (Postgres Full-Text)

**Extensions**
1. Enable `pg_trgm`.

**Schema**
1. Add `searchText` columns to Note and Question.
2. Generated `searchVector` columns with GIN indexes.
3. Trigram indexes for title and searchText.

**Text extraction**
1. Build searchText from note title/description/subject/topic names.
2. Build searchText from question statement/options/explanation JSON.
3. Recompute on create/update/bulk import.

**SearchService**
1. Use FTS with `websearch_to_tsquery` and rank.
2. Fallback to trigram similarity for short queries or low results.
3. Use Prisma `$queryRaw` with parameter binding.

**Endpoints**
1. `GET /search` for notes/questions/all.
2. Admin search for drafts and unpublished.
3. Add snippet generation via `ts_headline`.

**Hardening**
1. Rate limit `/search`.
2. Reject empty or overly long queries.
3. Pagination and max limits.
