# Story 11 — Card Payments & Refunds

**Phase:** 7 (after v1) · **Depends on:** story-06, story-07, story-10 · **Blocks:** nothing

## Goal

Let a customer pay for an order by card at checkout, and give the money back
automatically when a paid order is cancelled — without weakening any guarantee
the order lifecycle already makes, and without touching cash on delivery.

## User Story

> As a **customer**
> I want to pay for my order by card and be refunded automatically if it is cancelled
> So that I can order without cash in hand and never lose money on an order that did not arrive.

## Scope

**In:** the `CARD` payment method at checkout; the `payments` table; server-side
verification of every payment against the gateway; the gateway webhook as a
second route to `PAID`; restaurant invisibility of unpaid card orders; the
payment timeout; the automatic full refund and its sweep job; admin visibility
and audited retry of failed refunds; the provider interface with a Moyasar
adapter and a deterministic fake adapter; the payment panel in the customer,
restaurant and admin order screens.

**Out:** partial refunds, saved cards, payouts to restaurants, split payments,
tipping, invoices and receipts, cash-collection reconciliation, cancellation
fees, and syncing refunds or chargebacks made in the gateway's own dashboard.
Card details never reach FoodFlow: the gateway's form collects them.

## Actors

**CUSTOMER** pays and sees payment state. **RESTAURANT** sees only paid card
orders. **ADMIN** sees payment state and retries failed refunds. **SYSTEM**
cancels orders whose payment never completed and sweeps unfinished refunds.
**GATEWAY** calls the webhook.

## Preconditions

- Story-06 for checkout, the order record and the customer order page.
- Story-07 for the state machine, restaurant order processing and the order-timeout job.
- Story-10 for `admin_audit_logs`, force-cancel and the needs-attention (stuck) view.
- A payment provider: `PAYMENT_PROVIDER=fake` in development and tests (test mode, no real money), a real provider with keys in production.

## Functional Requirements

Implements spec-11: FR-11.1 – FR-11.10.

1. Checkout accepts `paymentMethod: CARD`; the order is created with an `INITIATED` payment for its server-computed total, and the response carries the payment details the gateway form needs.
2. The customer pays on the gateway's hosted form and the browser reports the gateway payment id to `POST /api/orders/:id/payment/confirm`.
3. The server fetches the payment from the gateway and checks reference, amount, currency, status and single use before marking it `PAID`; a mismatch is rejected and changes nothing.
4. The gateway webhook, authenticated by a shared secret, settles a payment the browser never reported.
5. A card order is invisible to its restaurant, and cannot be acted on, until its payment is `PAID`; `NEW_ORDER` is sent at the moment it is paid, not at checkout.
6. A card order unpaid after `PAYMENT_TIMEOUT_MINUTES` is cancelled by SYSTEM with reason `PAYMENT_TIMEOUT`.
7. When a `PAID` card order becomes `CANCELLED` by any actor, the full amount is refunded after the cancellation commits and the outcome is recorded.
8. A failed refund is recorded as `REFUND_FAILED` with the gateway's message, shown in the admin order detail and listed in stuck orders with reason `REFUND_FAILED`.
9. An admin retries a failed refund with `POST /api/admin/payments/:id/refund`; the attempt is audited whatever its outcome.
10. The customer order page and the admin order dialog show the payment state: awaiting payment, paid, failed, refund in progress, refunded, refund failed.

## Business Rules

BR-P1 – BR-P10 from [spec-11](../specs/spec-11-card-payments.md#business-rules).

The ones that shape behaviour most: the amount and currency are the server's and
no request field can set them (BR-P2); a payment is `PAID` only because the
gateway says so for the amount that was recorded, and one gateway payment can
settle one order (BR-P3); an unpaid card order does not exist as far as the
restaurant is concerned, so no new order status was needed (BR-P4); a failed
refund never undoes a cancellation and is retried only by an admin (BR-P5,
BR-P6); a payment that lands after its order was cancelled is refunded at once
(BR-P7); and the fake provider can never take payment in production (BR-P9).

## Acceptance Criteria

```gherkin
Given a customer with an item in their cart and a saved address
When they check out with paymentMethod CARD
Then they receive 201 with a PENDING order and an INITIATED payment for the
  server-computed total, whatever amount the request tried to send, and the
  restaurant is not notified

Given a card order whose payment is INITIATED
When its restaurant lists, opens or tries to accept it
Then it is absent from the list and the detail and the transition each return 404

Given the gateway reports the payment paid for the recorded amount and currency
When the customer confirms it
Then the payment becomes PAID, the restaurant is notified exactly once, and the
  order becomes visible and acceptable

Given a payment is already PAID
When the customer confirms it again
Then nothing changes and the restaurant is not notified a second time

Given the gateway reports a different amount, a different currency, an unknown
  payment id or a payment made for another order
When the customer confirms it
Then they receive 422 PAYMENT_NOT_VERIFIED and the payment is unchanged

Given a gateway payment has already settled one order
When a customer presents it for a second order
Then they receive 422 PAYMENT_NOT_VERIFIED

Given a card order belonging to another customer
When I try to confirm its payment
Then I receive 404

Given the gateway reports the payment declined
When the customer confirms it
Then the order carries payment status FAILED with the gateway's message, and a
  later successful attempt makes it PAID

Given the payment is still in 3-D Secure
When the customer confirms it
Then the response is 200 and the payment stays INITIATED

Given a customer paid and closed the tab
When the gateway calls the webhook with the correct secret token
Then the server re-fetches the payment and settles it as if the browser had
  reported it

Given a webhook call with the wrong secret token
Then it receives 401

Given a webhook payload naming a payment the gateway does not confirm
Then the call is acknowledged with 200 and nothing changes

Given a PAID card order
When the customer cancels it, the restaurant rejects it, an admin force-cancels
  it or the SYSTEM accept-timeout cancels it
Then the cancellation commits first, the full amount is then refunded and the
  payment becomes REFUNDED

Given cancellation follow-up runs more than once for the same order
Then the payment is refunded exactly once

Given a cash order, or a card order that was never paid, is cancelled
Then no refund is attempted

Given the gateway fails the refund
Then the order stays CANCELLED, the payment becomes REFUND_FAILED with the
  gateway's message, the admin order detail shows it, the order is listed in
  stuck orders with reason REFUND_FAILED, and the sweep job does not retry it

Given a payment is REFUND_FAILED
When an admin retries the refund and it succeeds
Then the payment becomes REFUNDED and exactly one audit row records the retry

Given an admin retries a refund and the gateway fails again
Then they receive 200 with outcome REFUND_FAILED, one audit row is written and
  the payment can be retried again

Given a payment that is not REFUND_FAILED
When an admin tries to retry its refund
Then they receive 409 PAYMENT_NOT_REFUNDABLE and no audit row is written

Given I am not an admin
When I call the refund-retry route
Then I receive 403 FORBIDDEN_ROLE

Given a card order unpaid past PAYMENT_TIMEOUT_MINUTES
When the payment-timeout job runs
Then it is cancelled by SYSTEM with reason PAYMENT_TIMEOUT, the restaurant never
  saw it, and the restaurant-response timeout leaves unpaid card orders alone

Given an order was cancelled for non-payment
When the payment later completes at the gateway
Then it is refunded and the restaurant is not notified

Given an order is CANCELLED but its payment is still PAID
When the refund sweep runs
Then the refund is completed

Given a discount code brings the order total to zero
When the customer checks out with CARD
Then they receive 422, no order and no payment are written, and the cart is left
  as it was

Given a customer checks out by cash on delivery, or an admin places an order
  on a customer's behalf with CARD in the request
Then the order is cash on delivery, has no payment row and, for the customer's
  own order, is announced to the restaurant at once

Given a payment is paid and the restaurant is connected to live updates
Then order.created is pushed to that restaurant at the moment of payment

Given the checkout page loads
When GET /api/payments/config says cardEnabled is false
Then no Card option is shown and cash on delivery works as before
```

## API Impact

New: `POST /api/orders/:id/payment/confirm`; `POST /api/orders/:id/payment/simulate`
(fake provider only; `404` for any real provider and in production);
`GET /api/payments/config`; `POST /api/payments/webhooks/moyasar` (public,
authenticated by secret token, disabled with `404` until
`MOYASAR_WEBHOOK_SECRET` is set — the only new public route);
`POST /api/admin/payments/:id/refund`.

Changed: `POST /api/orders` accepts `paymentMethod: CARD` and returns the order
with `payment`; order DTOs gain `payment` (customer: status, amount, currency,
refunded amount, failure message, and `publishableKey` while payable; admin:
also gateway id, refund error and attempts); order summaries gain
`paymentMethod` and `paymentStatus`; the stuck-orders view gains reason
`REFUND_FAILED`.

## Database Impact

Migration `010_payments`: `payment_method` gains `CARD`; `cancellation_reason`
gains `PAYMENT_TIMEOUT`; new enum `payment_status` (`INITIATED`, `PAID`,
`FAILED`, `REFUNDING`, `REFUNDED`, `REFUND_FAILED`); new table `payments`, one
row per card order (`uq_payments_order`), with `uq_payments_provider_payment`
so one gateway payment settles at most one order, and a check that
`refunded_amount` never exceeds `amount`. `orders` gains no column. The
provider column is limited to `moyasar` and `fake`.

## Frontend Impact

`CheckoutView` shows a Card option next to Cash on delivery when the config call
says `cardEnabled`; a failing config call simply hides it, and no price is ever
sent. `components/customer/PaymentForm.vue` is the only provider-specific
frontend code: it renders Moyasar's form from the server's amount, currency and
publishable key and reports the gateway payment id (with the fake provider it
shows a test-mode button instead). Customer `OrderDetailView` gets a payment
panel and `PaymentBadge`, shows the form while the order is `PENDING` and the
payment `INITIATED` or `FAILED`, and handles the gateway's `?id=` return
redirect. Admin `OrderDetailsDialog` shows payment state, gateway reference,
refund error and a **Retry refund** button. The restaurant order page shows
"Paid by card". All copy through `t(...)` with Arabic strings.

## Backend Impact

New module `modules/payments/` (`payments.service.js`, `.repository.js`,
`.mapper.js`, `.routes.js`, `providers/`), public through `index.js` only. It
does not import orders: orders calls `initiate` and `refundForOrder`, and
subscribes to `payments.onPaid`. Provider interface: `name`, `publishableKey`,
`fetchPayment`, `refund`, `verifyWebhook`, `webhookPaymentId`, with amounts as
decimal strings and minor-unit conversion inside each adapter. Orders:
`checkout` creates the payment in its transaction and skips `notifyNewOrder`
for `CARD`; `transition` and admin force-cancel share one transaction body and
both call `settleCancelled` after commit. Jobs: `paymentTimeout.job.js` and
`refundSweep.job.js` next to `orderTimeout.job.js`, which ignores unpaid card
orders. Admin: `retryRefund`, audited as `PAYMENT_REFUND_RETRIED` in the same
transaction that records the result. Configuration: `PAYMENT_PROVIDER`,
`MOYASAR_*`, `PAYMENT_CURRENCY` (default `EGP`), `PAYMENT_TIMEOUT_MINUTES`
(default 15). In `NODE_ENV=test` the fake adapter is always used.

## Validation

`paymentMethod` is `CASH_ON_DELIVERY` or `CARD` (default cash); `providerPaymentId`
is a required string of 1–100 characters and only a pointer; the webhook
`secret_token` must equal `MOYASAR_WEBHOOK_SECRET` (constant-time); `:id` is a
UUID; an amount is never accepted from a client. A card checkout whose total is
zero after a discount is refused.

## Error Cases

| Case | Expected |
|------|----------|
| Card checkout while cards are unavailable (production, no real provider) | `422 CARD_PAYMENTS_UNAVAILABLE` |
| Card checkout with a total of zero after a discount | `422 UNPROCESSABLE`, nothing written |
| Confirm with unknown id, wrong amount, currency or reference, or a reused id | `422 PAYMENT_NOT_VERIFIED`, payment unchanged |
| Gateway unreachable during confirm | `503 PAYMENT_PROVIDER_UNAVAILABLE`; retry, the webhook is the backstop |
| Gateway reports the payment declined | `200`, `payment.status = FAILED` with the message |
| Gateway reports the payment still in progress | `200`, `payment.status` stays `INITIATED` |
| Confirm on another customer's order | `404` |
| Restaurant acts on an unpaid card order | `404` |
| Refund call fails | cancellation stands; `REFUND_FAILED`; admin retry available |
| Admin retry of a payment that is not `REFUND_FAILED` | `409 PAYMENT_NOT_REFUNDABLE`, no audit row |
| Admin retry fails again | `200` with `outcome: REFUND_FAILED`, audited |
| Webhook with a wrong secret / no secret configured | `401` / `404` |
| Non-admin on the refund route | `403 FORBIDDEN_ROLE` |

## Security Considerations

- **The gateway is the source of truth:** the browser sends only a pointer; the server fetches the payment with the secret key and compares it to what it stored at checkout. The secret key never leaves the server.
- **PCI scope stays with the gateway:** card data goes from the browser to the gateway and never through FoodFlow.
- **Webhook:** authenticated by a constant-time secret comparison, disabled until a secret is configured, and its payload is only a pointer, so a guessed payment id gains an attacker nothing.
- **No double refund:** `REFUNDING` is claimed by compare-and-set before the gateway call, and the gateway is asked first whether the payment is already refunded.
- **The fake provider cannot take payment in production:** `cardEnabled` is false and the simulate route answers `404`.
- **Customer DTOs** never include the gateway id or the refund error; another customer's order is a `404`.
- **Refund retries are audited** in the transaction that records their result (BR-AD1).

## Related Specs

- [spec-11 — Card Payments & Refunds](../specs/spec-11-card-payments.md) (primary)
- [spec-07 — Order Placement & Lifecycle](../specs/spec-07-order-placement-lifecycle.md) (checkout transaction, state machine, cancellation)
- [spec-10 — Platform Administration & Reporting](../specs/spec-10-platform-administration-reporting.md) (audit log, stuck orders, force-cancel)
- [spec-01 — Platform Foundation & API Contract](../specs/spec-01-platform-foundation-api-contract.md) (envelope, error registry, config)

## Dependencies

**Depends on:** story-06 for checkout; story-07 for the state machine and restaurant processing; story-10 for audit and stuck orders.
**Must happen before:** nothing.
**Can happen in parallel with:** nothing that touches checkout or cancellation.

## Testing Requirements

- Integration: `backend/tests/integration/cardPayments.test.js`, against real PostgreSQL and the fake adapter (no network). Required: card checkout creating an `INITIATED` payment for the server's total with a client-sent amount ignored; the restaurant unable to see, fetch or accept an unpaid card order; verification rejecting wrong amount, currency, id, reference and reused gateway payments; confirm idempotence; declined and 3-D Secure outcomes; the webhook (wrong secret, a payment the browser never reported, a forged id); a refund on each cancellation path and none for cash or unpaid orders; a failed refund recorded, visible to admins and not retried by the sweep; the audited admin retry (success, failure, `409`, `403`); the payment timeout, a late payment refunded without notifying, and the refund sweep; cash on delivery unchanged; the zero-total refusal after a discount.
- Authorization: `authorization.test.js` covers the new routes, and the webhook is the only new public one.
- Frontend: lint, component tests and a production build; the Arabic catalogue check covers the new strings. The real Moyasar form needs a browser and test keys and is checked by hand against Moyasar's test cards.
