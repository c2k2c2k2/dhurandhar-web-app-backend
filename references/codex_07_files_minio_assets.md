# Files and Assets (MinIO)

**MinIO integration**
1. MinioService with ensureBucketExists, presigned PUT/GET, statObject.
2. Env config for endpoint, keys, bucket, SSL.
3. Bucket must be private (no public access).

**FileAsset model**
1. id, objectKey, fileName, contentType, sizeBytes, checksum, createdByUserId, confirmedAt.
2. purpose enum: NOTES_PDF, PRINT_PDF, QUESTION_IMAGE, OPTION_IMAGE, EXPLANATION_IMAGE, OTHER.
3. Optional width/height for images.

**Admin upload flow**
1. `POST /admin/files/init-upload` with purpose and contentType validation.
2. Generate objectKey by purpose path.
3. Create FileAsset then return presigned PUT URL.
4. `POST /admin/files/confirm-upload/:fileAssetId` verifies size and marks confirmed.

**Secure delivery**
1. Assets must never return MinIO URLs.
2. Add `GET /assets/:id` streaming endpoint with authorization.
3. Authorize asset by reference to published content and entitlement when required.
4. Use AssetReference mapping table for fast checks.
