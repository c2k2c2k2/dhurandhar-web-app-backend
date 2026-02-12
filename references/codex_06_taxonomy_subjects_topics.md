# Taxonomy: Subjects and Topics

**Models**
1. Subject: id, key, name, orderIndex, isActive.
2. Topic: id, subjectId, parentId, name, orderIndex, isActive.
3. Hierarchy: parent/children self-relation; prevent cycles.

**Admin APIs**
1. Create/update subjects.
2. Create/update topics with optional parentId.
3. Validate topic.subjectId matches subjectId.
4. Reorder topics with orderIndex.

**Student APIs**
1. `GET /subjects` active list ordered.
2. `GET /topics?subjectId=` flat list.
3. `GET /taxonomy/tree` subject -> topic -> children hierarchy.

**Usage**
1. Notes can map to multiple topics via join.
2. Questions map to topicId optionally.
3. Tests mixer rules reference subjectId and optional topicIds.
