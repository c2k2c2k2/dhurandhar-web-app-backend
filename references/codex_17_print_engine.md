# Print Engine v1

**Strategy**
1. HTML templates + Playwright PDF generation.
2. Asynchronous worker via BullMQ.
3. Output stored as FileAsset (PRINT_PDF).

**Models**
1. PrintJob with type, configJson, status, outputFileAssetId.
2. PrintJobItem to snapshot question sets.

**Admin APIs**
1. Create print jobs for tests or practice sets.
2. List and download completed jobs.
3. Retry or cancel jobs.

**Worker flow**
1. Update status to RUNNING.
2. Load PrintJobItems and question data.
3. Render HTML and generate PDF buffer.
4. Upload to MinIO and confirm.
5. Update status DONE or FAILED with error.

**Templates**
1. `paper.html` for question paper.
2. `answer-key.html` if enabled.
3. Render ContentBlock with text/images.

**Limits**
1. Concurrency 1-2 jobs.
2. Max questions per job.
3. Max embedded image bytes.
