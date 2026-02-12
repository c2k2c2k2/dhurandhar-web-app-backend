# Practice Engine and Progress

**Models**
1. PracticeSession with subjectId/topicId, mode, configJson, status, startedAt, endedAt.
2. PracticeQuestionEvent for telemetry (SERVED, ANSWERED, SKIPPED, REVEALED, BOOKMARKED).
3. UserQuestionState aggregate per user+question.
4. UserTopicProgress aggregate per user+topic.

**Student APIs**
1. `POST /practice/start` and `POST /practice/:id/end`.
2. `GET /practice/:id/next` returns batch questions.
3. `POST /practice/:id/answer` records event and updates aggregates.
4. `POST /practice/:id/answer/batch` for mobile efficiency.
5. Optional `POST /practice/:id/reveal` for explanations.

**Selection logic**
1. Prefer unseen then wrong then least-recently answered.
2. Filter by subjectId/topicId and difficulty.
3. Create SERVED events for each delivered question.

**Progress endpoints**
1. Subject and topic progress summaries.
2. Weak questions list by wrongCount.
3. 7-day trend by PracticeQuestionEvent group.

**Policy and entitlements**
1. Gate practice via policy `practice.use` when paid.
