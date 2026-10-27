# Spec 11 — Card Payments & Refunds

**Status:** Approved · **Owner:** Platform · **Covers:** FR-11.1 – FR-11.10 · **Supersedes:** the payment row of master-sdd §3 (Non-Goals) and §24 item 1

## Objective

Let a customer pay for an order by card at checkout, and give the money back
automatically when an order that was paid by card is cancelled — without
weakening any guarantee the order lifecycle already makes. Cash on delivery
keeps working exactly as before.

The payment gateway is **behind a provider interface**: the first adapter is
Moyasar, but nothing outside `modules/payments/providers/` and one frontend
component knows that. The **currency is configuration** (`PAYMENT_CURRENCY`,
default `EGP`), and each adapter converts to its gateway's minor unit itself.
Adding another gateway (for example Paymob) is a new adapter, not a rewrite.

## Scope

**In scope**
- A `CARD` payment method at checkout, alongside `CASH_ON_DELIVERY`.
- A `payments` table: one payment per card order, with its gateway reference, amount, status and refund outcome.
- Server-side **verification**: a payment is `PAID` only because the gateway says so, for the amount the server recorded.
- A gateway webhook as a second, independent route to `PAID`.
- Restaurant invisibility of unpaid card orders; a system timeout for payments that never complete.
- Automatic full refund when a paid card order reaches `CANCELLED` by any path.
- Admin visibility of failed refunds and an audited retry.
- A provider interface with a Moyasar adapter and a deterministic fake adapter.

**Out of scope** — partial refunds, saved cards, payouts to restaurants, split payments, tipping, invoices/receipts, wallet or cash-collection reconciliation, charging a cancellation fee. Card details never reach FoodFlow: the gateway's form collects them (PCI scope stays with the gateway).

## Actors

**CUSTOMER** pays and sees payment state. **RESTAURANT** sees only paid card orders. **ADMIN** sees payment state and failed refunds and retries them. **SYSTEM** cancels orders whose payment never completed and sweeps unfinished refunds. **GATEWAY** calls the webhook.

## Design: the payment flow

```
1  Customer: POST /api/orders { paymentMethod: "CARD", addressId }
2  Server (one transaction): order PENDING + CARD, payments row INITIATED
       amount = orders.total_amount, currency = PAYMENT_CURRENCY   (never from the client)
   Response carries order.payment { id, amount, currency, publishableKey, status: INITIATED }
   -> NOT announced to the restaurant (no NEW_ORDER notification)
3  Browser: gateway form (publishable key, amount, currency, metadata.payment_ref = payment.id)
       card data goes browser -> gateway only; 3-D Secure happens on the gateway
4  Browser: POST /api/orders/:id/payment/confirm { providerPaymentId }
       (also on return from 3-D Secure, from the gateway's ?id=… redirect)
5  Server: asks the gateway for that payment with the SECRET key and checks
       reference == payments.id, amount == payments.amount, currency == payments.currency,
       status == paid, and that this gateway payment has not settled another order
   -> payments.status = PAID (compare-and-set), after commit: NEW_ORDER to the restaurant
6  Independently, the gateway calls POST /api/payments/webhooks/moyasar;
   the server authenticates the call, then does step 5 for the payment it names
   (covers a customer who paid and closed the tab)
```

Cancelling, at any time after step 5: the transition commits, then **after
commit** the server refunds the payment in full and records the outcome. If the
refund fails, the order stays cancelled, the payment becomes `REFUND_FAILED`,
and an admin sees and retries it.

### Decisions and their justification

| Decision | Why |
|----------|-----|
| **No new order status and no new transition.** An unpaid card order is an ordinary `PENDING` order that the restaurant cannot see. | The §7.3 state machine stays exactly as specified (and its 245-combination test stays valid). The "dispatch gate" is visibility, not state: restaurant queries and the transition path treat a card order as non-existent until `payments.status` is settled. A new `AWAITING_PAYMENT` status would have had to be threaded through every list, filter, label, timeline and timeout. |
| The gateway, not the browser, is the source of truth. | A browser can claim anything. The server fetches the payment with the secret key and compares it to what *it* stored at checkout. |
| Payment lives in its own module and does not import orders. | Orders calls `payments` (initiate, refund). `payments` announces `onPaid(listener)`; orders subscribes. Dependencies stay one-way (NFR-1) and the late-payment case (below) falls out of the listener. |
| The refund is not part of the cancellation transaction. | External I/O never runs inside a transaction (as with `notifyNewOrder`): a slow or failing gateway must not hold row locks or undo a cancellation that has already happened. |
| `REFUNDING` is a payment status, claimed before the gateway call. | A compare-and-set claim means the post-commit refund, the sweep job and an admin retry cannot refund twice. The gateway is also asked first whether the payment is already refunded. |
| Webhook secret comparison is constant-time and the payload is only a pointer. | An attacker who guesses a payment id gains nothing: the payment is re-fetched and verified like a browser confirmation. |

## Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-11.1 | Checkout accepts `paymentMethod: CARD`; the order is created with an `INITIATED` payment for the order's server-computed total |
| FR-11.2 | Card payment is completed with the gateway's hosted form; the customer's browser reports the gateway payment id to `POST /api/orders/:id/payment/confirm` |
| FR-11.3 | The server verifies the payment with the gateway (reference, amount, currency, status, single use) before marking it `PAID`; a mismatch is rejected and changes nothing |
| FR-11.4 | A gateway webhook, authenticated by a shared secret, can settle a payment the browser never reported |
| FR-11.5 | A card order is invisible to its restaurant, and cannot be accepted, until its payment is `PAID`; the restaurant is notified (`NEW_ORDER`) at the moment it is paid, not at checkout |
| FR-11.6 | A card order whose payment is not completed within `PAYMENT_TIMEOUT_MINUTES` is cancelled by SYSTEM with reason `PAYMENT_TIMEOUT` |
| FR-11.7 | When a `PAID` card order becomes `CANCELLED` by any actor, the full amount is refunded after the cancellation commits and the outcome is recorded on the payment |
| FR-11.8 | A failed refund is recorded (`REFUND_FAILED`, with the gateway's message), shown in the admin order detail and listed in "stuck" orders with reason `REFUND_FAILED` |
| FR-11.9 | An admin can retry a failed refund with `POST /api/admin/payments/:id/refund`; the attempt is audited whatever its outcome |
| FR-11.10 | The customer order page and the admin order dialog show a clear payment state: awaiting payment, paid, failed, refund in progress, refunded, refund failed |

## Business Rules

| ID | Rule | Enforcement |
|----|------|-------------|
| BR-P1 | Only `CARD` orders have a payment; admin-placed orders are always `CASH_ON_DELIVERY` | `adminPlaceOrder` fixes the method; checkout creates a payment only for `CARD` |
| BR-P2 | The payable amount and currency are the server's: `payments.amount` is copied from `orders.total_amount` inside the checkout transaction; no request field can set or change it (BR-O5) | `checkoutSchema` strips unknown keys; `payments.initiate` takes the amount from the created order |
| BR-P3 | A payment becomes `PAID` only when the gateway reports it paid **and** its reference, amount and currency equal what was recorded **and** that gateway payment id has not already settled another payment | `payments.settle`; unique index `uq_payments_provider_payment`; failure is `422 PAYMENT_NOT_VERIFIED` and leaves the row untouched |
| BR-P4 | An unpaid card order is invisible to the restaurant (lists, detail, counts, stats, stuck-orders) and a restaurant transition on it is a `404` | `restaurantVisible()` predicate in the orders repository and restaurant stats; guard in `transitionInTransaction` |
| BR-P5 | Cancellation of a `PAID` card order triggers one full refund, after commit, from the single place every cancellation passes through; a failure never undoes the cancellation | `settleCancelled(order)`, called by `transition` and by admin force-cancel after its transaction commits; `refundSweepJob` as the safety net |
| BR-P6 | A failed refund is retried only by an admin (never silently in a loop), and every retry is audited in the transaction that records its result | `payments.retryRefund(id, { onRecorded })` + `audit` (BR-AD1) |
| BR-P7 | A payment that completes after its order was cancelled (a late 3-D Secure, a timeout race) is refunded immediately and never announces the order | `payments.onPaid` listener in orders |
| BR-P8 | The unpaid-card timeout is separate from the restaurant-response timeout: `orderTimeoutJob` ignores unpaid card orders and, for card orders, measures the restaurant's response time from `paid_at` | `orderTimeoutJob`, `paymentTimeoutJob` |
| BR-P9 | The fake provider can never take payment in production | `config.payments.cardEnabled` is false when `NODE_ENV=production` and the provider is `fake`; checkout answers `422 CARD_PAYMENTS_UNAVAILABLE`, the simulate endpoint answers `404` |
| BR-P10 | Provider specifics (minor units, field names, webhook shape, auth) live only in the provider adapter; the rest of the app handles decimal-string amounts in the configured currency | `providers/*.provider.js` interface |
| BR-P11 | A card order must have something to pay: a checkout whose total is zero after a discount code is refused, and nothing is written | Card branch of `checkout` in orders; the customer pays cash on delivery instead |
| BR-P12 | `PAYMENT_PROVIDER=moyasar` without its secret and publishable keys stops the server at startup | Config validation |

## Data Requirements

Migration `010_payments.js`. Full detail in [database-design §4](../architecture/database-design.md#payments).

- `payment_method` gains `CARD`; `cancellation_reason` gains `PAYMENT_TIMEOUT`.
- New enum `payment_status`: `INITIATED`, `PAID`, `FAILED`, `REFUNDING`, `REFUNDED`, `REFUND_FAILED`.
- New table `payments` — one row per card order (`uq_payments_order`): `order_id`, `customer_user_id`, `provider`, `provider_payment_id`, `amount numeric(10,2)`, `currency`, `status`, `refunded_amount`, `failure_message`, `refund_error`, `refund_attempts`, `refund_started_at`, `paid_at`, `refunded_at`, `metadata jsonb`, timestamps.
- `orders` gains **no** column. Payment state is read from `payments`.

Payment status machine:

```
INITIATED ──paid──────────▶ PAID ──refund claimed──▶ REFUNDING ──ok──▶ REFUNDED
    │  ▲                                                   └──error──▶ REFUND_FAILED ──admin retry──▶ REFUNDING
    └──declined──▶ FAILED ──paid──▶ PAID
```

A `FAILED` payment can still succeed on a later attempt, as long as the order is open.

## API Requirements

Full tables in [api-design](../architecture/api-design.md) §7 and §10 and the new §10a.

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| POST | `/api/orders` | C | `paymentMethod: CARD` creates the order and its `INITIATED` payment; the response has `payment` |
| POST | `/api/orders/:id/payment/confirm` | C +own | `{ providerPaymentId }`; verifies with the gateway; returns the order with its payment |
| POST | `/api/orders/:id/payment/simulate` | C +own | Fake provider only, never in production: stands in for the gateway page |
| GET | `/api/payments/config` | C | `{ cardEnabled, provider, currency }` |
| POST | `/api/payments/webhooks/moyasar` | public (secret token) | Gateway webhook |
| POST | `/api/admin/payments/:id/refund` | A | Retry a failed refund; audited |

Order DTOs gain `payment` (customer: status, amount, currency, refunded amount, failure message, and `publishableKey` while it is payable; admin: also the gateway id, refund error and attempts). Order summaries gain `paymentMethod` and `paymentStatus`.

## Frontend Requirements

- **CheckoutView** — a Card option next to Cash on delivery, shown when `GET /api/payments/config` says `cardEnabled`. Choosing it only changes `paymentMethod`; no price is sent. On success the customer is taken to the order page.
- **PaymentForm component** (`components/customer/PaymentForm.vue`) — the only provider-specific frontend code: renders Moyasar's form from the server's amount, currency and publishable key and reports the gateway payment id. A second gateway adds a branch here. With the fake provider it shows a test-mode button instead.
- **Customer OrderDetailView** — a payment panel with a status badge (awaiting payment / paid / payment failed / refund in progress / refunded), the form while the order is `PENDING` and `INITIATED`/`FAILED`, a refund notice when cancelled, and handling of the gateway's return redirect (`?id=`).
- **Admin OrderDetailsDialog** — payment status, gateway reference, refunded amount, failure and refund error, and a **Retry refund** button when `REFUND_FAILED`.
- **Restaurant OrderDetailView** — shows "Paid by card" (a restaurant only ever sees paid card orders).
- All copy through `t(...)`, with Arabic in `i18n/ar/{customer,admin,restaurant}.js`. Status is shown as colour **and** text (NFR-14).

## Backend Requirements

Module `modules/payments/` — `payments.service.js`, `payments.repository.js`, `payments.mapper.js`, `payments.routes.js`, `providers/`. Public interface via `index.js` only.

**Provider interface** (`providers/index.js`): `name`, `publishableKey`, `fetchPayment(id)`, `refund(id, amount)`, `verifyWebhook(body)`, `webhookPaymentId(body)`. Amounts are decimal strings; adapters convert to their gateway's minor unit. `fetchPayment` returns `{ id, status: paid|failed|pending|refunded, amount, currency, reference, message }` or `null`. Adapters: `moyasar` (Basic auth with `MOYASAR_SECRET_KEY`, 10 s timeout, `ProviderError` on any transport or non-2xx failure) and `fake` (in-memory, deterministic; `fakeControls` seeds payments and scripts refund failures; used in tests and whenever keys are missing). In `NODE_ENV=test` the fake adapter is always selected, whatever keys are in the environment, so the suite never touches the network.

**Orders module** — `checkout` creates the payment in its transaction and skips `notifyNewOrder` for `CARD`; `transition` and the admin force-cancel share one transaction body (`transitionInTransaction`), so the force-cancel is no longer a second status-changing path, and both call `settleCancelled(order)` after commit.

**Jobs** — `paymentTimeoutJob` (FR-11.6) and `refundSweepJob` (PAID payments of CANCELLED orders and abandoned `REFUNDING` attempts), registered next to `orderTimeoutJob`; `orderTimeoutJob` is adjusted per BR-P8.

**Configuration** — `PAYMENT_PROVIDER` (`moyasar`|`fake`, default by keys), `MOYASAR_SECRET_KEY`, `MOYASAR_PUBLISHABLE_KEY`, `MOYASAR_WEBHOOK_SECRET`, `MOYASAR_API_URL`, `PAYMENT_CURRENCY` (default `EGP`), `PAYMENT_TIMEOUT_MINUTES` (default 15).

## Validation

| Field | Rule |
|-------|------|
| `paymentMethod` (checkout) | `CASH_ON_DELIVERY` or `CARD`; default cash |
| `providerPaymentId` | Required string, 1–100 chars; only a pointer |
| Webhook body | `secret_token` must equal `MOYASAR_WEBHOOK_SECRET` (constant-time); unrecognised or unverifiable payments are acknowledged with `200` and ignored |
| `:id` | UUID |
| Amount | Never accepted from a client |

## Authorization

- Confirm and simulate: `CUSTOMER` only, and only on their own order (another customer's order is a `404`, indistinguishable from a missing one).
- Webhook: no session; the shared secret is the credential, and the route is disabled (`404`) while no secret is configured.
- Refund retry: `ADMIN` only, audited (BR-AD1, BR-P6).
- The restaurant has no payment endpoint and cannot see unpaid card orders (BR-P4). Customer DTOs never include the gateway id or refund error; the secret key never leaves the server.

## Error Handling

| Condition | Response |
|-----------|----------|
| Card checkout while cards are unavailable (production without keys) | `422 CARD_PAYMENTS_UNAVAILABLE` |
| Card checkout whose total is zero after a discount code | `422 UNPROCESSABLE` on `paymentMethod` ("There is nothing to pay by card. Choose cash on delivery."); no order, no payment, the cart stays active |
| Confirm with an unknown gateway id, wrong amount/currency/reference, or an id already used | `422 PAYMENT_NOT_VERIFIED`; the payment is unchanged |
| Gateway unreachable during confirm | `503 PAYMENT_PROVIDER_UNAVAILABLE`; the customer retries; the webhook is the backstop |
| Gateway reports the payment declined | `200`; the order carries `payment.status = FAILED` and the gateway's message; the customer may try again |
| Gateway reports the payment still in progress (3-D Secure) | `200`; `payment.status` stays `INITIATED` |
| Confirm on another customer's order | `404` |
| Refund call fails | Cancellation stands; payment `REFUND_FAILED` with the message; admin retry available |
| Admin retry of a payment that is not `REFUND_FAILED` | `409 PAYMENT_NOT_REFUNDABLE`, no audit row |
| Admin retry fails again | `200` with `outcome: REFUND_FAILED`, audited, still retryable |
| Webhook with a wrong secret | `401`; with no secret configured, `404` |

## Testing Requirements

Integration, `cardPayments.test.js`, against real PostgreSQL and the fake adapter (no network):
- Card checkout creates the order and an `INITIATED` payment for the server's total; a client-sent amount is ignored; the restaurant is not notified and cannot see, fetch or accept the order.
- A verified payment becomes `PAID`, announces the order once (idempotent), and makes it visible and acceptable.
- Wrong amount, wrong currency, unknown gateway id, wrong reference, a gateway payment reused for a second order, another customer's order: all rejected, payment unchanged.
- A declined payment becomes `FAILED` and a later successful attempt `PAID`; a payment in 3-D Secure stays `INITIATED`.
- Cancelling a paid order refunds it, for each path: customer, restaurant reject, admin force-cancel, SYSTEM accept-timeout. An unpaid or cash order triggers no refund. Repeated follow-ups refund once.
- A failing refund is recorded and does not undo the cancellation; it appears in the admin order detail and the stuck list; the sweep does not retry it; the admin retry succeeds or fails again, each audited exactly once; retry of a non-failed payment is `409`; non-admins get `403`.
- Unpaid card orders are cancelled by SYSTEM after the timeout (`PAYMENT_TIMEOUT`) and are untouched by the restaurant-response timeout; a payment arriving after that is refunded and does not notify; the sweep finishes a refund the cancellation never reached.
- Webhook: wrong secret `401`; a valid call settles a payment the browser never reported; a forged payment id is ignored.
- Cash on delivery: no payment row, announced at once, visible to the restaurant; admin-placed orders stay cash even if `CARD` is sent.
- The router audits (`authorization.test.js`) include the new routes; the webhook is the only new public route.

Frontend — lint, component/unit tests and a production build; the Arabic catalogue check covers the new strings. Not covered by automated tests: the real Moyasar form (needs a browser and test keys), which must be checked by hand against Moyasar's test cards.

## Edge Cases

- **Customer pays, then closes the tab.** The webhook settles the payment; if the webhook is not configured the order stays unpaid and times out, and a payment that lands after the timeout is refunded (BR-P7). Configure the webhook in production.
- **Paid, then the process dies before the refund.** The order is `CANCELLED` and the payment still `PAID`; `refundSweepJob` finishes it.
- **Refund succeeded at the gateway but was not recorded.** The next claim sees the gateway already reports it refunded and records `REFUNDED` without refunding again.
- **Two cancellations race.** The order row lock serialises them (BR-O9); only one reaches `CANCELLED`, so one refund.
- **Restaurant suspended or deleted with paid card orders in flight.** Unchanged from the order lifecycle: the orders finish or are cancelled, and a cancellation refunds.
- **Customer cancels an unpaid card order.** Allowed; nothing to refund; the payment stays `INITIATED` and a payment completing later is refunded.
- **Currency or gateway change.** Existing payments keep their stored `currency` and `provider`; refunds go to the provider that took the payment's `provider_payment_id`.
- **Gateway outage at refund time.** Recorded as `REFUND_FAILED`; surfaced to admins.
- **Gateway-initiated refunds or chargebacks made in the gateway's dashboard** are not synchronised back (non-goal).

## Related Stories

- [Story 11 — Card Payments & Refunds](../stories/story-11-card-payments.md) — implements this spec
- [Story 06 — Order Placement & Customer Tracking](../stories/story-06-order-placement-customer-tracking.md)
- [Story 07 — Restaurant Order Processing](../stories/story-07-restaurant-order-processing.md)
- [Story 10 — Platform Administration & Reporting](../stories/story-10-platform-administration-reporting.md)

## Dependencies

[Spec 07](spec-07-order-placement-lifecycle.md) (checkout transaction, state machine, `transition`), [Spec 10](spec-10-platform-administration-reporting.md) (audit, stuck orders), [Spec 01](spec-01-platform-foundation-api-contract.md) (envelope, error registry, config).
