# Question Bank and Media

**Question schema**
1. Question fields: subjectId, topicId, type, difficulty, statementJson, optionsJson, explanationJson, correctAnswerJson, isPublished.
2. `statementJson`, `optionsJson`, `explanationJson` support imageAssetId references.
3. Optional hasMedia boolean.

**Media support**
1. Extend file upload to allow image purposes and content types.
2. Validate asset references are confirmed and match allowed purposes.
3. Use AssetReference mapping for fast authorization.

**Admin APIs**
1. CRUD and publish endpoints with validation.
2. Bulk import for JSON including images.
3. Admin fetch endpoint resolves asset metadata for editor previews.

**Student APIs**
1. `GET /questions` with filters.
2. `GET /questions/:id` returns published only.
3. Question payloads include statementJson/optionsJson without answers.

**Search text extraction**
1. Build searchText from JSON text blocks.
2. Update searchText on create/update/bulk import.
