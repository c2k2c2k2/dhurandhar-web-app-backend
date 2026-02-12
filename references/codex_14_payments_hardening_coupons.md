# Payments Hardening, Coupons, Upgrades

**Hardening**
1. PaymentOrder state machine with allowed transitions.
2. Idempotency for checkout by header and by pending order reuse.
3. Exactly-once webhook processing with processedAt and DB lock.
4. Finalizer service as the only subscription grant path.
5. Reconciler job for PENDING orders.
6. Rate limit checkout and status polling endpoints.
7. Audit logs for all payment events and admin actions.

**Coupons**
1. Coupon model with type, value, limits, active window.
2. CouponRedemption model linked to PaymentOrder.
3. Apply coupon at checkout to compute final amount.
4. Mark redemption on success, clean up on failure.

**Upgrades**
1. Plan metadata includes tier and feature list.
2. Upgrade rule: extend or replace based on config.

**Admin operations**
1. Admin list orders with status and events.
2. Admin finalize order endpoint.
3. Optional refund flow depending on PhonePe capability.
