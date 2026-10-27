# Story 13 — Notifications (Email & SMS Delivery)

**Phase:** 7 (after v1) · **Depends on:** story-06, story-07, story-08, story-10 · **Blocks:** nothing

## Goal

Make notifications reach people — a restaurant owner learns of a new order, a
customer learns the driver is coming — over real email and SMS, without ever
letting a delivery problem break or slow the operation that triggered it.

## User Story

> As a **restaurant owner or customer**
> I want to be told by email or SMS when something happens to my order
> So that I act on it in time without keeping the app open.

## Scope

**In:** the transports `smtp` (nodemailer), `twilio` (REST over HTTPS) and `log`,
chosen by configuration; recipient resolution from a user id or a role-target;
one template per notification type, in English and Arabic, with plain-text and
HTML email and a short SMS; delivery status, attempts and last error on every
`notifications` row; a retry job with exponential backoff; dedupe and an hourly
per-recipient cap; the template × channel matrix in
[spec-13](../specs/spec-13-notifications.md#template--channel-matrix).

**Out:** push and WebSocket delivery, provider receipts and webhooks, marketing
email, notification preferences, unsubscribe links, an in-app inbox UI. Also out:
choosing a recipient's language — every message is English today, because no
language preference is stored yet.

## Actors

**SYSTEM** sends and retries. **CUSTOMER**, **RESTAURANT** owner and **DRIVER**
are recipients. **ADMIN** triggers the welcome notices by creating accounts and
sees the pipeline only through the `notifications` table.

## Preconditions

- Story-06 and story-07 for the order lifecycle hooks (placement, out-for-delivery, cancellation).
- Story-08 for delivery offers and driver creation.
- Story-10 for account creation and force-cancel, and for BR-AD8 (no password is ever sent).

## Functional Requirements

Implements spec-13: FR-13.1 – FR-13.10.

1. `notify({ userId?, channel?, template, payload })` is the one entry point. A caller names a user, or omits it and the template's role-target is resolved from `payload.orderId`.
2. Email goes through SMTP when `SMTP_HOST` is set; SMS through Twilio when `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM` are all set; otherwise the `log` transport is used.
3. A new order notifies the restaurant owner (SMS and email) and the customer (email). A card order is announced only once the payment succeeds, not at checkout.
4. Each template defines its channels and recipient: `ORDER_PLACED` (customer, email), `NEW_ORDER` (owner, SMS and email), `ORDER_OUT_FOR_DELIVERY` (customer, SMS), `ORDER_CANCELLED` (customer, email), `NEW_OFFER` (driver, in-app), `DRIVER_CREATED` and `ACCOUNT_CREATED` (the new user, email).
5. Every template renders in English and Arabic; email carries text and HTML, SMS one short text.
6. Sending happens after the triggering transaction commits and in the background; a failure is recorded on the row and never reaches the caller.
7. Every row records `status` (`QUEUED`, `SENT`, `FAILED`, `SKIPPED`), `attempts`, `last_error` and the resolved `recipient`; `sent_at` is set only when delivery actually succeeds.
8. A retry job resends due `FAILED` rows with exponential backoff, up to `NOTIFY_MAX_ATTEMPTS`, and recovers rows that were recorded but never sent.
9. The same message to the same recipient on the same channel is stored and sent once; external sends are capped per recipient, per channel, per hour.
10. Account-created and driver-created notices are welcome messages that never contain the initial password.

## Business Rules

BR-N1 – BR-N10 from [spec-13](../specs/spec-13-notifications.md#business-rules).

The ones that shape behaviour most: delivery never fails or delays the operation
that triggered it (BR-N1 — only the row insert is awaited); without credentials
nothing leaves the process (BR-N2 — rows become `SKIPPED`, so development and
tests need no accounts); a password is never sent by any channel (BR-N3,
extending BR-AD8); one message is sent at most once per template, order, channel
and recipient (BR-N4); and a row is claimed atomically so two workers cannot send
it (BR-N5). A row stuck mid-send after a crash is deliberately not resent —
at-most-once beats texting someone twice.

## Acceptance Criteria

```gherkin
Given a customer places a cash-on-delivery order and both transports are configured
When the order is created
Then the restaurant owner has a NEW_ORDER SMS to their E.164 number and a NEW_ORDER
  email, the customer has an ORDER_PLACED email, every row is SENT with sent_at
  set and attempts 1, and the order response was 201

Given the same new-order notification is triggered twice for one order
Then the owner still has exactly one NEW_ORDER row per channel

Given no SMTP or Twilio credentials are configured
When an order is placed
Then the notification rows are SKIPPED with no sent_at and nothing leaves the process

Given the SMS transport is failing
When an order is placed
Then the order is still created with 201, the SMS row is FAILED with attempts 1,
  the error text and a next_attempt_at, and the email row is SENT

Given a FAILED row whose next_attempt_at is in the future
When the retry job runs
Then it is left alone

Given a FAILED row is due and the transport now works
When the retry job runs
Then it is SENT with attempts 2, last_error cleared and sent_at set, and a later
  run does not send it again

Given a transport that keeps failing
When the retry job runs repeatedly
Then the delay after each attempt is the base times two to the power of attempts
  minus one, and the row stays FAILED once NOTIFY_MAX_ATTEMPTS is reached

Given a notification row stayed QUEUED and never attempted for over five minutes
When the retry job runs
Then it is delivered

Given a recipient already has NOTIFY_RECIPIENT_HOURLY_LIMIT sent messages on a
  channel in the last hour
When another is due to them
Then the row is SKIPPED with "recipient rate limit reached" and nothing is sent

Given the restaurant owner's phone cannot be normalised
When a new order is placed
Then the SMS row is SKIPPED with "no address" and the email is still sent

Given the recipient is suspended or deleted, or the order does not exist
When a role-target is resolved
Then nobody is contacted

Given an order goes out for delivery
Then the customer receives an SMS to their E.164 number naming the order number

Given an admin force-cancels an order
Then the customer receives an ORDER_CANCELLED email

Given an admin creates a driver
Then the driver receives a welcome email, and neither the message nor any
  notifications row contains the initial password

Given a driver is offered a delivery
Then a NEW_OFFER row exists on the IN_APP channel with status SENT and no
  transport call is made
```

## API Impact

None. No endpoint is added or changed; notifications are a side effect of the
existing order, delivery and admin endpoints. The only surface is configuration.

## Database Impact

Migration 12, `012_notification_delivery`: adds `status` (check constraint,
default `QUEUED`), `attempts`, `last_error`, `recipient`, `next_attempt_at` and
`dedupe_key` to `notifications`. `sent_at` becomes nullable with no default, so
it means "actually sent"; rows written by the old stub are back-filled to
`SKIPPED`. Adds `uq_notifications_dedupe` (unique on `dedupe_key` where not null),
`idx_notifications_retry` (due `FAILED` rows) and
`idx_notifications_recipient_sent` (the hourly cap).

## Frontend Impact

None. There is no in-app inbox and no notification preferences screen.

## Backend Impact

The code lives in `shared/` so orders, delivery and admin keep importing the one
`notify` they already use: `shared/notifications.js` (`notify`, `deliver`,
`retryFailed`, `settled`) and `shared/messaging/` (`templates.js`,
`recipients.js`, `transports.js`). The retry job is
`jobs/notificationRetry.job.js`, registered as `notificationRetry` every 30
seconds under the advisory-lock runner so replicas do not duplicate it.

Callers: `orders.service` (`notifyNewOrder` after checkout, or after the payment
succeeds for a card order; `notifyStatusChange` after every `transition` to
`OUT_FOR_DELIVERY` or `CANCELLED`, which covers customer, restaurant, system
timeout and admin cancellations), `delivery.service` (`NEW_OFFER`) and
`admin.service` (`DRIVER_CREATED`, `ACCOUNT_CREATED`, force-cancel, and an order
placed on a customer's behalf).

Configuration: `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USER`, `SMTP_PASS`,
`SMTP_FROM`, `SMTP_SECURE`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_FROM`, `NOTIFY_MAX_ATTEMPTS` (4), `NOTIFY_RETRY_BASE_SECONDS` (60),
`NOTIFY_RECIPIENT_HOURLY_LIMIT` (20), all read through the config module. A
blank value counts as unset.

## Validation

`NOTIFY_MAX_ATTEMPTS` is an integer 1–10; the base and the hourly limit are
positive integers. Phones are normalised to E.164 (`01012345678` becomes
`+201012345678`) and a number that cannot be normalised makes that channel
`SKIPPED`. An unknown template is rejected at render time. A subject is a single
line and user-provided text is HTML-escaped in the email body.

## Error Cases

| Case | Expected |
|------|----------|
| Transport throws or times out | Row `FAILED`, `last_error` set, `next_attempt_at` backed off; the triggering operation is unaffected |
| Recipient not found, suspended or deleted | External channels recorded `SKIPPED` ("no recipient") |
| No email, or a phone that cannot be normalised | That channel `SKIPPED` ("recipient has no address for this channel") |
| Duplicate trigger | Second insert ignored, nothing sent |
| Hourly cap reached | Row `SKIPPED` ("recipient rate limit reached") |
| Log transport in use | Row `SKIPPED`, nothing sent |
| Attempts exhausted | Row stays `FAILED`; no further sends |
| Database error while recording | Logged at `warn`; `notify` returns an empty list and does not throw |

## Security Considerations

- **No password in any channel:** account templates have no password field, the payload never carries one, and a test scans the rendered message and every row for the initial password (BR-N3, BR-AD8).
- **No personal data in logs:** the log transport records channel, masked recipient and subject only — never the body; phones are masked with `maskPhone`, emails with `maskEmail` (BR-N9).
- **Header injection:** CR/LF are stripped from every subject, and user-provided strings are escaped in the HTML body (BR-N10).
- **Credentials stay out of the database:** `last_error` holds the provider's status, code and message, never the account SID or token.
- **Abuse limit:** the hourly cap bounds what any one recipient can be sent externally, whatever the trigger.
- **Only active, non-deleted users are contacted** (BR-N8).

## Related Specs

- [spec-13 — Notifications](../specs/spec-13-notifications.md) (primary)
- [spec-07 — Order Placement & Lifecycle](../specs/spec-07-order-placement-lifecycle.md) (placement and status hooks)
- [spec-08 — Driver Onboarding & Delivery Execution](../specs/spec-08-delivery-assignment-driver-operations.md) (offers, driver creation)
- [spec-10 — Platform Administration & Reporting](../specs/spec-10-platform-administration-reporting.md) (account creation, force-cancel, BR-AD8)

## Dependencies

**Depends on:** story-06 and story-07 for the order hooks; story-08 for offers and driver creation; story-10 for account creation and force-cancel.
**Must happen before:** nothing.
**Can happen in parallel with:** other Phase 7 stories; it touches only the `notifications` table and the callers' one-line `notify` calls.

## Testing Requirements

- Unit (`notificationTemplates.test.js`): every template renders in English and Arabic on every channel, with SMS at most 160 characters and `dir` set for the language; unknown language falls back to English; HTML escapes user strings while the text body does not; subjects are one line; account messages carry no password; phone normalisation and address-per-channel; email masking; the Twilio request shape and error mapping with a mocked `fetch`.
- Integration (`notifications.test.js`, transports injected, no network): recipient resolution including suspended and deleted users; a placed order recording the owner's SMS and email and the customer's email; a duplicate trigger stored once; the log transport yielding `SKIPPED`; a failing transport yielding `FAILED` while the order is created; a channel skipped without an address; the retry job resending a due row, ignoring one not yet due, backing off exponentially and stopping at the cap; the hourly cap; recovery of an orphaned `QUEUED` row; the out-for-delivery SMS; the force-cancel email; the driver welcome email without the password; and the in-app row with no transport call.
- Not covered by a test today: the card-order path (announced after payment), the real `smtp` transport, and Arabic delivery end to end (every recipient is English).
