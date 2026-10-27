# Spec 13 — Notifications (Email & SMS Delivery)

**Status:** Approved · **Owner:** Platform · **Covers:** FR-12.1 – FR-12.10 · **Replaces:** the stub transport (master-sdd §3 "Real email / SMS provider", §24 item 3)

## Objective

Make notifications reach people. Email goes out over SMTP (nodemailer) and SMS
over Twilio, behind the existing `notify()` interface. With no credentials
configured, behaviour is unchanged: a row in `notifications` and a log line, so
development and tests need no accounts. Delivery must never break or slow the
operation that triggered it.

## Scope

**In scope**
- Transport adapters `smtp`, `twilio` and `log`, chosen by configuration.
- Recipient resolution from a user id or a role-target ("the restaurant owner of order X").
- One template per notification type, in English and Arabic; plain-text and HTML email, short SMS.
- Delivery status, attempts and last error on every `notifications` row.
- A retry job with exponential backoff, and protection against repeat sends.
- The template × channel matrix below.

**Out of scope** — push / WebSocket delivery (live updates are a separate
feature), delivery receipts and webhooks from the providers, marketing email,
user-editable notification preferences, unsubscribe links, an in-app inbox UI.

## Actors

- **SYSTEM** — sends notifications and runs the retry job.
- **CUSTOMER, RESTAURANT, DRIVER** — recipients.
- **ADMIN** — triggers account-created notices; sees nothing of the delivery pipeline except through the table.

## Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-12.1 | `notify({ userId?, channel?, template, payload })` keeps its signature. Callers name a user, or omit it and the template's role-target is resolved from `payload.orderId` |
| FR-12.2 | Email is sent via SMTP (nodemailer); SMS via Twilio; each transport is enabled by its own settings. Without them the `log` transport is used |
| FR-12.3 | A new order notifies the **restaurant owner** (SMS + email), not an unaddressed row |
| FR-12.4 | Each template defines its channels and recipient (matrix below) |
| FR-12.5 | Messages are rendered in the recipient's language (English or Arabic), plain text plus HTML for email, one short text for SMS |
| FR-12.6 | Sending happens after the triggering transaction commits, in the background; a failure is recorded on the row and never reaches the caller |
| FR-12.7 | Every row carries a delivery status `QUEUED` / `SENT` / `FAILED` / `SKIPPED`, `attempts`, `last_error` and the resolved `recipient` |
| FR-12.8 | `FAILED` rows are retried by a background job with exponential backoff up to `NOTIFY_MAX_ATTEMPTS` |
| FR-12.9 | The same message to the same recipient on the same channel is stored and sent once; external sends are capped per recipient per hour |
| FR-12.10 | Account-created and driver-created notices are welcome messages that never contain the initial password |

## Business Rules

| ID | Rule | Enforcement |
|----|------|-------------|
| BR-N1 | Delivery never fails or delays the triggering operation | `notify` is called after commit, swallows every error, and sends in a background task; only the row insert is awaited |
| BR-N2 | Without credentials nothing leaves the process | `getTransport` falls back to `log`; the row is `SKIPPED` |
| BR-N3 | A password is never sent by any channel (extends BR-AD8) | Account templates contain no password field; the payload never includes one; tested |
| BR-N4 | One message is sent at most once per (template, order, channel, recipient) | `uq_notifications_dedupe` on `dedupe_key`; insert is `ON CONFLICT DO NOTHING` |
| BR-N5 | A row is sent by exactly one worker | Atomic claim: `UPDATE ... SET attempts = attempts + 1 WHERE status = ... RETURNING` |
| BR-N6 | Retries are bounded and spaced | `attempts < NOTIFY_MAX_ATTEMPTS`, `next_attempt_at = now + base × 2^(attempts-1)` |
| BR-N7 | At most `NOTIFY_RECIPIENT_HOURLY_LIMIT` external messages per recipient per channel per hour | Count of `SENT` rows in the last hour; excess rows are `SKIPPED` |
| BR-N8 | Only active, non-deleted users are contacted | `loadUser` filters `status = 'ACTIVE' AND deleted_at IS NULL` |
| BR-N9 | Personal data stays out of logs | No body at any level; phones masked with `maskPhone`, emails with `maskEmail` |
| BR-N10 | User-provided text is escaped in HTML; subjects are single-line | `escapeHtml`; CR/LF stripped from subjects (header-injection guard) |

## Template × Channel Matrix

| Template | Trigger | Recipient | Channels |
|----------|---------|-----------|----------|
| `ORDER_PLACED` | Checkout, or admin places an order | Customer of the order | Email |
| `NEW_ORDER` | Same moment | Restaurant owner of the order | SMS + Email |
| `NEW_OFFER` | Dispatch creates a delivery offer | The offered driver | In-app only (row, status `SENT`) |
| `ORDER_OUT_FOR_DELIVERY` | Driver picks up (T7) | Customer of the order | SMS |
| `ORDER_CANCELLED` | Any cancellation: customer, restaurant, system timeout, admin force-cancel | Customer of the order | Email |
| `DRIVER_CREATED` | Admin creates a driver | The new driver | Email (welcome, no password) |
| `ACCOUNT_CREATED` | Admin creates a customer, restaurant owner or admin | The new user | Email (welcome, no password) |

SMS is reserved for the two time-critical messages (a restaurant must accept an
order; a customer should know the driver is coming). Everything else is email.
Driver offers expire in 90 seconds, so they stay in-app rather than cost an SMS.

## Data Requirements

`notifications` gains (migration `012_notification_delivery.js`):

| Column | Type | Meaning |
|--------|------|---------|
| `status` | text, check `QUEUED/SENT/FAILED/SKIPPED`, default `QUEUED` | Delivery state. `SKIPPED` = not sent by design (log transport, no address, rate limit) |
| `attempts` | integer, default 0 | Send attempts so far |
| `last_error` | text null | Last failure or skip reason (never contains credentials) |
| `recipient` | text null | Resolved address: email, or E.164 phone. Null for in-app |
| `next_attempt_at` | timestamptz null | When a `FAILED` row is next due |
| `dedupe_key` | text null | `template:orderId:channel:userId`; unique where not null |

`sent_at` now means "actually sent": it is null until delivery succeeds (it
previously defaulted to creation time). Rows written by the old stub are
back-filled to `SKIPPED`. New indexes: `idx_notifications_retry` (due `FAILED`
rows) and `idx_notifications_recipient_sent` (the hourly cap).

## Backend Requirements

Code lives in `shared/notifications.js` (service) and `shared/messaging/`
(`templates.js`, `recipients.js`, `transports.js`), so orders, delivery and
admin keep calling the one `notify` they already import.

### Flow

```
caller (after commit) ── notify() ── resolve recipient ── for each channel:
        insert row (QUEUED | SKIPPED | SENT for in-app, dedupe) ── background deliver(id)
deliver(id): claim ── rate-limit check ── render ── transport.send ── SENT | SKIPPED(log) | FAILED + backoff
```

`notify` awaits only the recipient lookup and row insert; the transport call
runs in a background task and is never awaited by the caller. `settled()`
awaits those tasks, for tests and graceful shutdown.

### Recipient resolution

One place (`recipients.js`): a `userId`, or a role-target — `ORDER_CUSTOMER`,
`ORDER_RESTAURANT_OWNER` — applied to an order id. Phones are normalised to
E.164 from the format the app validates (`01012345678` → `+201012345678`);
a number that cannot be normalised makes that channel `SKIPPED`. Language is
English until a user preference exists; it is a single line in `toRecipient`.

### Transports

| Transport | Used when | Notes |
|-----------|-----------|-------|
| `smtp` | `SMTP_HOST` set | nodemailer, loaded on first use, 10 s connect timeout |
| `twilio` | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` all set | Twilio REST over HTTPS (`fetch`), 10 s timeout, no SDK |
| `log` | otherwise | Logs channel, masked recipient and subject; marks the row `SKIPPED` |

### Retry job

`notificationRetry` (every 30 s, scaled by `JOB_INTERVAL_SCALE`, under the
existing advisory-lock runner so replicas do not duplicate it) calls
`retryFailed`: it takes `FAILED` rows with `attempts < NOTIFY_MAX_ATTEMPTS` and
`next_attempt_at <= now()`, plus `QUEUED` rows never attempted that are over five
minutes old (the process died between insert and send). Each is claimed
atomically. Backoff after attempt *n* is `NOTIFY_RETRY_BASE_SECONDS × 2^(n-1)`
(60 s, 120 s, 240 s by default). A row stuck mid-send after a crash is
deliberately not resent: at-most-once is preferred to texting someone twice.

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `SMTP_HOST` | unset | Enables the email transport |
| `SMTP_PORT` | 587 | |
| `SMTP_USER`, `SMTP_PASS` | unset | SMTP auth (omit for an open relay) |
| `SMTP_FROM` | `SMTP_USER`, else `FoodFlow <no-reply@foodflow.local>` | Sender |
| `SMTP_SECURE` | false | TLS from connect (port 465) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | unset | All three enable SMS; `TWILIO_FROM` is E.164 |
| `NOTIFY_MAX_ATTEMPTS` | 4 | Attempts including the first |
| `NOTIFY_RETRY_BASE_SECONDS` | 60 | Backoff base |
| `NOTIFY_RECIPIENT_HOURLY_LIMIT` | 20 | External messages per recipient per channel per hour |

Blank values count as unset. Secrets are read only through the config module.

## Error Handling

| Failure | Behaviour |
|---------|-----------|
| Transport throws or times out | Row `FAILED`, `last_error` set, `next_attempt_at` backed off; the order or account operation is unaffected |
| Recipient not found / inactive | Row recorded `SKIPPED` ("no recipient") |
| No email or unusable phone | That channel `SKIPPED` ("no address") |
| Duplicate trigger | Second insert ignored, nothing sent |
| Hourly cap reached | Row `SKIPPED` ("rate limit") |
| Database error while recording | Logged at `warn`; `notify` returns without throwing |
| Attempts exhausted | Row stays `FAILED`; no further sends |

## Security & Privacy

- BR-AD8: no password in any message, payload, row or log (tested by scanning rows and message bodies).
- Phone numbers are masked in logs; email bodies are never logged.
- Provider error text is stored in `last_error`; it contains Twilio's code and message, never the credentials.

## Testing Requirements

- **Unit** (`notificationTemplates.test.js`): every template renders in both languages and all channels; SMS under 160 characters; HTML escapes user strings; subject is one line; no password leaks; phone normalisation; Twilio request shape and error mapping (mocked `fetch`).
- **Integration** (`notifications.test.js`, injected transports, no network): recipient resolution (owner, customer, inactive users); a placed order records `NEW_ORDER` SMS + email for the restaurant owner and `ORDER_PLACED` email for the customer; duplicate trigger stored once; log transport yields `SKIPPED`; a failing transport yields `FAILED` while the order is created; channel skipped without an address; retry job resends a due row, ignores one not yet due, backs off exponentially and stops at the cap; hourly cap; orphaned `QUEUED` row recovery; out-for-delivery SMS; force-cancel email; driver welcome email without password; in-app row.

## Edge Cases

- Order placed by an admin notifies the same recipients as a customer checkout.
- Restaurant owner without a valid phone still gets the email.
- A transport that succeeds on retry clears `last_error` and sets `sent_at`.
- Two replicas: the advisory lock plus the atomic claim prevent double sends.
- Process restart between insert and send: recovered by the retry job after five minutes.
- Seed and demo users have placeholder numbers; with no credentials nothing is ever sent to them.
- Arabic copy is selected only when a language preference exists; today everything is English.

## Related Stories / Dependencies

Depends on spec-07 (order lifecycle hooks), spec-08 (offers), spec-10 (account creation, BR-AD8). Master SDD §3 and §24 item 3 should be updated to point here.
