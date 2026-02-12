# Payments PhonePe v1 (Standard Checkout)

**Provider integration**
1. PhonePe provider adapter with version-agnostic config paths.
2. Env: PHONEPE_API_BASE_URL, PHONEPE_PAY_PATH, PHONEPE_STATUS_PATH, PHONEPE_MERCHANT_ID, PHONEPE_SALT_KEY, PHONEPE_SALT_INDEX, PHONEPE_CALLBACK_URL, PHONEPE_REDIRECT_URL.
3. `computeXVerify(base64Payload, apiPath, saltKey, saltIndex)` utility.
4. `initiatePayment` returns redirectUrl.
5. `checkStatus` for final confirmation.

**Models**
1. PaymentOrder with merchantTransactionId, merchantUserId, amountPaise, status.
2. PaymentTransaction with providerTransactionId and status.
3. PaymentEvent for idempotency and audit.

**Checkout flow**
1. `POST /payments/checkout` validates plan and creates PaymentOrder.
2. Return redirectUrl for full-page redirect on mobile.
3. Optionally `POST /payments/checkout/confirm` for client-side confirmation, but not used to grant access.

**Webhook/callback**
1. `POST /payments/webhook/phonepe` captures raw body.
2. Store PaymentEvent idempotently.
3. Immediately call `checkStatus` and update order.
4. Grant subscription/entitlements only on confirmed SUCCESS.

**Return page polling**
1. `GET /payments/orders/:merchantTransactionId/status` for frontend polling.
2. Only owner can fetch order status.

**Reconciliation**
1. Job to finalize pending orders via status API.
2. Expire stuck orders.
