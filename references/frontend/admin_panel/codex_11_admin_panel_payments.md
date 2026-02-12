# Admin Panel Payments Ops

## Route
- `/admin/payments`

## Features
- List payment orders with filters.
- View order details with transactions and events.
- Manually finalize order if required.

## Backend Endpoints
- `GET /admin/payments/orders`
- `POST /admin/payments/orders/:orderId/finalize`

## Optional Extensions
- Plans management: `GET/POST/PATCH /admin/plans`
- Coupons management: `GET/POST/PATCH /admin/coupons`

## DoD
- Orders list loads with filters.
- Order detail shows transactions and events.
- Manual finalize triggers refresh.
- Permission gating uses `payments.read`.
