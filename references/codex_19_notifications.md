# Notifications v1

**Models**
1. NotificationTemplate with channel, subject, bodyJson, variables.
2. NotificationMessage with payload, renderedHtml/text, status, attempts.
3. NotificationPreference for user marketing preferences.
4. Broadcast model for admin email blasts.

**Providers**
1. Provider interface for Email/SMS/WhatsApp.
2. SMTP email provider for local/dev.

**Queue and worker**
1. Notifications queue in BullMQ.
2. Worker processor with retries and idempotency.

**Auth notifications**
1. OTP email flow with rate limits and anti-spam.
2. Password reset emails with token-based flow.

**Payments notifications**
1. Payment success and subscription activated emails via event hooks.

**Admin broadcast**
1. Create/schedule/cancel broadcasts.
2. Batch enqueue to users with audience filters.

**Admin visibility**
1. Notification logs listing.
2. Resend endpoint.
