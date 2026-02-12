# Entitlements and Subscriptions

**Models**
1. Plan: key, name, pricePaise, durationDays, isActive, metadataJson.
2. Subscription: userId, planId, status, startsAt, endsAt, paymentOrderId.
3. Entitlement: userId, kind (NOTES|TESTS|PRACTICE|ALL), scopeJson, startsAt, endsAt.

**EntitlementService**
1. `hasActiveSubscription(userId)`.
2. `canAccessNote(userId, note)` with subject/topic/note scope support.
3. `canAccessTests(userId)` and `canAccessPractice(userId)`.
4. `denyReason(...)` helper for debugging.

**Policy integration**
1. `notes.read.premium` -> EntitlementService.canAccessNote.
2. `tests.attempt` -> EntitlementService.canAccessTests.
3. `practice.use` -> EntitlementService.canAccessPractice.

**Subscription rules**
1. Configurable stacking vs replace on new purchase.
2. Daily expiry job to mark expired subscriptions and align entitlements.
