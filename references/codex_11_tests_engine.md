# Tests Engine

**Models**
1. Test: title, description, type (SUBJECT|COMBINED|CUSTOM), configJson, isPublished, startsAt, endsAt.
2. TestQuestion join for fixed tests.
3. Attempt: testId, userId, status, startedAt, submittedAt, answersJson, scoreJson, totalScore.
4. AttemptEventLog for start/save/submit events.

**Admin APIs**
1. Create/update/publish/unpublish tests.
2. Validate mixer rules with subject/topic relationships.
3. Audit logs for publish actions.

**Student APIs**
1. `GET /tests` lists published and active window.
2. `GET /tests/:id` without answers.
3. `POST /tests/:id/start` creates attempt.
4. `PATCH /attempts/:id/save` partial answers.
5. `POST /attempts/:id/submit` evaluates and stores score.
6. `GET /attempts/me` and `GET /attempts/:id` for users.

**Mixer rules**
1. Random selection by subjectId, topicIds, difficulty, count.
2. Snapshot selected questionIds into attempt on start.
3. Evaluate using snapshot only.

**Scoring and analytics**
1. Store per-subject and per-topic breakdown in scoreJson.
2. Ensure correct answers never leak in test APIs.
