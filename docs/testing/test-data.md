# FoodFlow — Test Data

> Fixture identifiers referenced by every test case's **Data** field. These are
> produced by `tests/helpers/factories.js` and by the seed script; the names
> below are the contract between the test cases and the fixtures.

**No real credentials appear anywhere in this document or in the repository.**
Seeded accounts use `@foodflow.com` (restaurant owners are named after their
restaurant). FoodFlow sends no email. All passwords are placeholders resolved from environment variables at run
time. All phone numbers are in the reserved-for-documentation range.

---

## 1. Credential handling

```bash
# .env.test.example — committed with placeholders, never with values
TEST_USER_PASSWORD=<set-me>          # used for every seeded non-admin account
TEST_ADMIN_EMAIL=<set-me>
TEST_ADMIN_PASSWORD=<set-me>
TEST_JWT_SECRET=<set-me>             # ≥32 chars, distinct per environment
```

Test cases refer to the password as `${TEST_USER_PASSWORD}` and never quote a
literal. A case that needs a *specific* password shape — for validation testing —
uses an inline literal that is deliberately not a credential for any account,
e.g. `"short1"` or `"nodigitshere"`.

---

## 2. Users

### Valid users

| ID | Role | Email | Status | Notes |
|----|------|-------|--------|-------|
| `CUST_A` | CUSTOMER | `sara.idris@gmail.com` | ACTIVE | Primary customer; has addresses and order history |
| `CUST_B` | CUSTOMER | `omar.haddad@gmail.com` | ACTIVE | **Second customer — the cross-tenant probe subject** |
| `CUST_NEW` | CUSTOMER | `nora.fresh@gmail.com` | ACTIVE | No addresses, no cart, no orders — empty-state fixture |
| `CUST_SUSPENDED` | CUSTOMER | `sam.suspended@gmail.com` | SUSPENDED | For BR-A5 / FR-1.7 |
| `CUST_DELETED` | CUSTOMER | `customer.deleted@foodflow.com` | ACTIVE, `deleted_at` set | Soft-deleted (BR-A6) |
| `CUST_FILLER` | CUSTOMER | `ahmed.mansour@gmail.com` … `habiba.saad@gmail.com` | ACTIVE (3 SUSPENDED) | 26 more customers (`first.last@gmail.com`) who joined across 2026; they place the seeded order history and its reviews |
| `OWNER_A` | RESTAURANT | `olive.grill@foodflow.com` | ACTIVE | Owns `REST_A` (ACTIVE) |
| `OWNER_B` | RESTAURANT | `pasta.house@foodflow.com` | ACTIVE | Owns `REST_B` (ACTIVE) — **cross-restaurant probe subject** |
| `OWNER_PENDING` | RESTAURANT | `new.spice@foodflow.com` | ACTIVE | Owns `REST_PENDING` |
| `OWNER_SUSPENDED` | RESTAURANT | `paused.kitchen@foodflow.com` | ACTIVE | Owns `REST_SUSPENDED` — note the *user* stays ACTIVE (BR-AD3) |
| `DRIVER_A` | DRIVER | `driver@foodflow.com` | ACTIVE | Profile ACTIVE, availability AVAILABLE |
| `DRIVER_B` | DRIVER | `driver.b@foodflow.com` | ACTIVE | Profile ACTIVE, AVAILABLE — second candidate for dispatch races |
| `DRIVER_BUSY` | DRIVER | `driver.busy@foodflow.com` | ACTIVE | Profile ACTIVE, availability ON_DELIVERY, holds an accepted assignment |
| `DRIVER_PENDING` | DRIVER | `driver.pending@foodflow.com` | ACTIVE | Profile PENDING_APPROVAL — must receive no offers |
| `DRIVER_OFFLINE` | DRIVER | `driver.offline@foodflow.com` | ACTIVE | Profile ACTIVE, availability OFFLINE |
| `ADMIN_A` | ADMIN | `${TEST_ADMIN_EMAIL}` | ACTIVE | Seeded admin |
| `ADMIN_B` | ADMIN | `raya.johonson@foodflow.com` (Raya Johonson) | ACTIVE | Second admin — needed for BR-AD7 (self-suspension) and audit-review cases |
| `ADMIN_FILLER` | ADMIN | `nadia.farouk@foodflow.com`, `omar.said@foodflow.com`, `rami.fikry@foodflow.com` | ACTIVE / SUSPENDED / SUSPENDED | Admin password; fill the Admin tab, two of them suspended |
| `OWNER_FILLER` | RESTAURANT | `corner.diner@foodflow.com` (SUSPENDED, owns suspended Corner Diner), `rejected.bistro@foodflow.com` (ACTIVE, owns REJECTED Rejected Bistro) | — | Fill the restaurant Suspended and Rejected tabs |
| `DRIVER_FILLER` | DRIVER | `karim.road@`, `mina.pedal@` (bicycle, no plate), `hesham.cruise@` (ACTIVE, OFFLINE); `fady.halt@`, `waleed.stop@` (SUSPENDED) — all `@foodflow.com` | — | Carried the past deliveries; offline, so never in a live dispatch |

**History.** Join dates, restaurant approvals and driver approvals are spread over 2026. The seed also adds 89 past orders (75 delivered, 14 cancelled, February to two days ago) and 60 reviews of them — happy, so-so and unhappy, some without a comment, five hidden by a moderator. Generated from a fixed random seed (`seeds/data/history.js`): the same rows on every run, with order dates running up to the day it is run. The named fixtures above keep only their documented orders.

### Invalid / boundary registration inputs

| ID | Field | Value | Expected |
|----|-------|-------|----------|
| `REG_BAD_EMAIL_1` | email | `not-an-email` | 422 |
| `REG_BAD_EMAIL_2` | email | `""` | 422 |
| `REG_BAD_EMAIL_3` | email | `"   "` | 422 (whitespace-only) |
| `REG_BAD_EMAIL_4` | email | 256-char local part | 422 (>255) |
| `REG_DUP_EMAIL` | email | `CUSTOMER.A@EXAMPLE.COM` | 409 — case-insensitive (BR-A1) |
| `REG_PW_SHORT` | password | `Ab1` | 422 (<8) |
| `REG_PW_LONG` | password | 73 characters | 422 — explicit, not truncated (BR-A2) |
| `REG_PW_NO_DIGIT` | password | `nodigitshere` | 422 |
| `REG_PW_NO_LETTER` | password | `12345678` | 422 |
| `REG_PW_BOUNDARY_MIN` | password | 8 chars with a letter and a digit | 201 — lower boundary passes |
| `REG_PW_BOUNDARY_MAX` | password | 72 chars with a letter and a digit | 201 — upper boundary passes |
| `REG_ROLE_ADMIN` | role | `ADMIN` | 403 `FORBIDDEN_ROLE` (BR-A3) |
| `REG_ROLE_DRIVER` | role | `DRIVER` | 403 `FORBIDDEN_ROLE` |
| `REG_ROLE_UNKNOWN` | role | `SUPERUSER` | 422 |
| `REG_MASS_ASSIGN` | extra keys | `{ status: "ACTIVE", id: "<uuid>", role: "CUSTOMER" }` | 201 with the extra keys stripped |
| `REG_BAD_PHONE` | phone | `abc123` | 422 |
| `REG_MISSING_NAME` | fullName | absent | 422 |

---

## 3. Restaurants

| ID | Owner | Status | Accepting | Hours today | Fee | Minimum | Notes |
|----|-------|--------|-----------|-------------|-----|---------|-------|
| `REST_A` | `OWNER_A` | ACTIVE | true | 00:00–23:59 | 12.00 | 30.00 | Primary; always orderable |
| `REST_B` | `OWNER_B` | ACTIVE | true | 00:00–23:59 | 8.00 | 20.00 | Cross-restaurant cart conflicts |
| `REST_CLOSED` | — | ACTIVE | true | closed today | 10.00 | 25.00 | `isOrderable` false, reason `CLOSED_NOW` |
| `REST_PAUSED` | — | ACTIVE | **false** | 00:00–23:59 | 10.00 | 25.00 | `isOrderable` false, reason `NOT_ACCEPTING` |
| `REST_PENDING` | `OWNER_PENDING` | PENDING_APPROVAL | true | 00:00–23:59 | 10.00 | 0.00 | Invisible to customers |
| `REST_PENDING_EMPTY` | — | PENDING_APPROVAL | true | — | 10.00 | 0.00 | **No available items** — for BR-AD10 |
| `REST_SUSPENDED` | `OWNER_SUSPENDED` | SUSPENDED | true | 00:00–23:59 | 10.00 | 25.00 | Invisible; in-flight orders still complete |
| `REST_REJECTED` | — | REJECTED | false | — | 10.00 | 0.00 | Carries `rejection_reason` |
| `REST_UNRATED` | — | ACTIVE | true | 00:00–23:59 | 15.00 | 40.00 | `rating_count` 0 — must sort last (BR-D5.6) |
| `REST_HIGH_MIN` | — | ACTIVE | true | 00:00–23:59 | 12.00 | **500.00** | For `BELOW_MINIMUM_ORDER` |

`REST_A` and `REST_B` open 00:00–23:59 deliberately, so ordinary cases never
fail because the suite ran at midnight. Time-of-day behaviour is tested
explicitly by `REST_CLOSED` and by the hours boundary cases, which control the
clock.

### Boundary hours fixtures

| ID | Definition | Used for |
|----|-----------|----------|
| `HOURS_FULL_WEEK` | All 7 days, 11:00–23:00 | Valid `PUT /hours` |
| `HOURS_MISSING_DAY` | 6 days, Wednesday absent | 422 |
| `HOURS_DUPLICATE_DAY` | 8 entries, Monday twice | 422 |
| `HOURS_OVERNIGHT` | opens 22:00, closes 02:00 | 422 (BR-R11, A-09) |
| `HOURS_EQUAL` | opens 11:00, closes 11:00 | 422 |
| `HOURS_CLOSED_DAY` | `isClosed: true`, no times | Valid |
| `HOURS_BOUNDARY` | opens 12:00, closes 14:00 | Clock set to 11:59 (closed), 12:00 (open), 13:59 (open), 14:00 (closed) |

---

## 4. Menu

| ID | Restaurant | Category | Name | Price | Available | Notes |
|----|-----------|----------|------|-------|-----------|-------|
| `CAT_A_MAINS` | `REST_A` | — | Mains | — | active | |
| `CAT_A_SOUPS` | `REST_A` | — | Soups | — | active | |
| `CAT_A_INACTIVE` | `REST_A` | — | Seasonal | — | **inactive** | Hidden from public projection (BR-R7) |
| `CAT_A_EMPTY` | `REST_A` | — | Drinks | — | active | No items — deletable |
| `CAT_B_PASTA` | `REST_B` | — | Pasta | — | active | **Cross-restaurant probe target** |
| `ITEM_GRILL` | `REST_A` | `CAT_A_MAINS` | Mixed Grill | 58.00 | true | Primary item |
| `ITEM_SOUP` | `REST_A` | `CAT_A_SOUPS` | Lentil Soup | 18.00 | true | Second line item |
| `ITEM_UNAVAILABLE` | `REST_A` | `CAT_A_MAINS` | Lamb Chops | 92.00 | **false** | `ITEM_UNAVAILABLE` cases |
| `ITEM_IN_INACTIVE_CAT` | `REST_A` | `CAT_A_INACTIVE` | Pumpkin Stew | 34.00 | true | Available but hidden (BR-R7) |
| `ITEM_DELETED` | `REST_A` | `CAT_A_MAINS` | Old Special | 40.00 | true, `deleted_at` set | `ITEM_REMOVED` cases |
| `ITEM_B_PASTA` | `REST_B` | `CAT_B_PASTA` | Truffle Pasta | 74.00 | true | Cart restaurant-mismatch trigger |
| `ITEM_CHEAP` | `REST_A` | `CAT_A_SOUPS` | Side Salad | 9.00 | true | For below-minimum carts |

### Invalid / boundary menu inputs

| ID | Field | Value | Expected |
|----|-------|-------|----------|
| `ITEM_PRICE_ZERO` | price | `"0.00"` | 422 (BR-R5) |
| `ITEM_PRICE_NEG` | price | `"-5.00"` | 422 |
| `ITEM_PRICE_3DP` | price | `"12.345"` | 422 |
| `ITEM_PRICE_MAX_OK` | price | `"9999.99"` | 201 — upper boundary passes |
| `ITEM_PRICE_OVER` | price | `"10000.00"` | 422 |
| `ITEM_NAME_SHORT` | name | `"A"` | 422 (<2) |
| `ITEM_NAME_LONG` | name | 121 chars | 422 (>120) |
| `ITEM_NAME_WS` | name | `"   "` | 422 after trim |
| `ITEM_IMG_JS` | imageUrl | `javascript:alert(1)` | 422 — XSS vector |
| `ITEM_IMG_DATA` | imageUrl | `data:text/html,<script>…` | 422 |
| `ITEM_IMG_LONG` | imageUrl | 501 chars | 422 |
| `ITEM_CAT_FOREIGN` | categoryId | `CAT_B_PASTA` while acting as `OWNER_A` | 422 on `categoryId` (BR-R6) |
| `CAT_NAME_DUP` | name | `"starters"` when `"Starters"` exists | 409 — case-insensitive per restaurant |

---

## 5. Carts

| ID | Customer | Restaurant | Contents | Notes |
|----|----------|-----------|----------|-------|
| `CART_EMPTY` | `CUST_NEW` | null | — | Unbound; 200 with `items: []` |
| `CART_A_VALID` | `CUST_A` | `REST_A` | 2 × `ITEM_GRILL`, 1 × `ITEM_SOUP` | Subtotal 134.00, `canCheckout` true |
| `CART_A_BELOW_MIN` | `CUST_A` | `REST_A` | 1 × `ITEM_CHEAP` (9.00) | Below the 30.00 minimum |
| `CART_A_UNAVAILABLE` | `CUST_A` | `REST_A` | 1 × `ITEM_GRILL`, 1 × `ITEM_UNAVAILABLE` | Issue `ITEM_UNAVAILABLE` |
| `CART_A_PRICE_CHANGED` | `CUST_A` | `REST_A` | 1 × `ITEM_GRILL` with `price_seen_at_add` 58.00, live price 62.00 | Issue `PRICE_CHANGED` |
| `CART_A_MAXQTY` | `CUST_A` | `REST_A` | 20 × `ITEM_GRILL` | At the quantity ceiling |
| `CART_A_NEAR_MAX` | `CUST_A` | `REST_A` | 19 × `ITEM_GRILL` | Adding 5 must cap at 20, not fail |
| `CART_CLOSED_REST` | `CUST_A` | `REST_CLOSED` | 1 × item | `RESTAURANT_UNAVAILABLE` at checkout |
| `CART_B_OTHER` | `CUST_B` | `REST_B` | 1 × `ITEM_B_PASTA` | Owned by another customer — 404 probe |

### Quantity boundaries

| Value | Expected |
|-------|----------|
| `-1` | 422 |
| `0` | 422 — removal is `DELETE`, not quantity 0 (BR-C5) |
| `1` | OK — lower boundary |
| `20` | OK — upper boundary |
| `21` | 422 |
| `1.5` | 422 — not an integer |
| `"2"` | OK — coerced |
| `999999999999` | 422 |

---

## 6. Orders

Factories produce an order in any lifecycle state via
`makeOrder({ status, restaurant, customer, driver })`.

| ID | Status | Customer | Restaurant | Driver | Notes |
|----|--------|----------|-----------|--------|-------|
| `ORDER_PENDING` | PENDING | `CUST_A` | `REST_A` | — | Cancellable by customer |
| `ORDER_CONFIRMED` | CONFIRMED | `CUST_A` | `REST_A` | — | Last customer cancellation point |
| `ORDER_PREPARING` | PREPARING | `CUST_A` | `REST_A` | — | Customer cancellation now refused |
| `ORDER_READY` | READY_FOR_PICKUP | `CUST_A` | `REST_A` | — | `dispatch_state` UNASSIGNED |
| `ORDER_READY_ASSIGNED` | READY_FOR_PICKUP | `CUST_A` | `REST_A` | `DRIVER_A` | Accepted assignment exists |
| `ORDER_OUT` | OUT_FOR_DELIVERY | `CUST_A` | `REST_A` | `DRIVER_BUSY` | |
| `ORDER_DELIVERED` | DELIVERED | `CUST_A` | `REST_A` | `DRIVER_A` | Reviewable |
| `ORDER_DELIVERED_NO_DRIVER` | DELIVERED | `CUST_A` | `REST_A` | **none** | Driver rating must be refused (BR-V4) |
| `ORDER_CANCELLED` | CANCELLED | `CUST_A` | `REST_A` | — | `cancelled_by` CUSTOMER |
| `ORDER_B_FOREIGN` | PENDING | `CUST_B` | `REST_B` | — | Cross-tenant probe subject |
| `ORDER_PENDING_STALE` | PENDING | `CUST_A` | `REST_A` | — | `placed_at` back-dated 11 minutes — timeout job |
| `ORDER_UNASSIGNED_STALE` | READY_FOR_PICKUP | `CUST_A` | `REST_A` | — | `confirmed_at` back-dated 16 minutes — admin backlog |
| `ORDER_STUCK_OUT` | OUT_FOR_DELIVERY | `CUST_A` | `REST_A` | `DRIVER_BUSY` | `picked_up_at` back-dated 91 minutes |
| `ORDER_REVIEWED` | DELIVERED | `CUST_A` | `REST_A` | `DRIVER_A` | Already has a review |

### Canonical pricing fixture

Used by every totals assertion so the arithmetic is checkable by hand:

```text
2 × Mixed Grill @ 58.00  = 116.00
1 × Lentil Soup @ 18.00  =  18.00
subtotal                    134.00
delivery fee (REST_A)        12.00
tax = round(134.00 × 0.15)   20.10
total                       166.10
```

Rounding boundary fixture: subtotal `0.10` → tax `round(0.015)` = `0.02`
(half-up), proving the rounding direction rather than assuming it.

---

## 7. Delivery assignments

| ID | Order | Driver | Status | Notes |
|----|-------|--------|--------|-------|
| `ASSIGN_OFFERED` | `ORDER_READY` | `DRIVER_A` | OFFERED | `expires_at` = now + 90 s |
| `ASSIGN_EXPIRED` | `ORDER_READY` | `DRIVER_A` | OFFERED, `expires_at` back-dated | Accept must fail |
| `ASSIGN_ACCEPTED` | `ORDER_READY_ASSIGNED` | `DRIVER_A` | ACCEPTED | |
| `ASSIGN_DECLINED` | `ORDER_READY` | `DRIVER_B` | DECLINED | Must not be re-offered (BR-D12) |
| `ASSIGN_BUSY` | `ORDER_OUT` | `DRIVER_BUSY` | ACCEPTED | Blocks a second acceptance |

---

## 8. Reviews

| ID | Order | Restaurant rating | Driver rating | Status | Notes |
|----|-------|------------------|---------------|--------|-------|
| `REVIEW_A` | `ORDER_REVIEWED` | 5 | 4 | PUBLISHED | Fresh — inside the edit window |
| `REVIEW_OLD` | — | 4 | — | PUBLISHED | `created_at` back-dated 25 h — edit refused |
| `REVIEW_HIDDEN` | — | 3 | — | HIDDEN | Excluded from list and aggregate |
| `REVIEW_SET_543` | `REST_A` | 5, 4, 3 | — | PUBLISHED | Average 4.00, count 3; hiding the 3 gives 4.50 / 2 |

### Rating and comment boundaries

| Value | Expected |
|-------|----------|
| rating `0` | 422 |
| rating `1` | OK — lower boundary |
| rating `5` | OK — upper boundary |
| rating `6` | 422 |
| rating `3.5` | 422 — not an integer |
| comment 1000 chars | OK |
| comment 1001 chars | 422 |
| comment `<script>alert(1)</script>` | 201, stored verbatim, rendered as text |
| comment `""` | OK — comment is optional |

---

## 9. Malicious input fixtures

Used by the security and validation cases. Each is inert by design; the tests
assert that it is **treated as data**.

| ID | Value | Asserted behaviour |
|----|-------|--------------------|
| `MAL_SQL_1` | `' OR 1=1 --` | Treated as a literal search term; no extra rows |
| `MAL_SQL_2` | `'; DROP TABLE users; --` | Literal; `users` still exists after the request |
| `MAL_SQL_3` | `1 UNION SELECT password_hash FROM users` | Literal; no hash in the response |
| `MAL_WILDCARD` | `%` | Escaped; does not return the whole table |
| `MAL_WILDCARD_2` | `_` | Escaped |
| `MAL_XSS_1` | `<script>alert(1)</script>` | Stored verbatim, rendered as text |
| `MAL_XSS_2` | `<img src=x onerror=alert(1)>` | Rendered as text |
| `MAL_XSS_3` | `javascript:alert(1)` | Rejected as a URL field (422) |
| `MAL_SORT` | `sort=password_hash` | 422 — allow-list |
| `MAL_SORT_2` | `sort=name; DROP TABLE` | 422 |
| `MAL_UUID` | `not-a-uuid` | 400/422, never a database error |
| `MAL_BIG_BODY` | 200 KB JSON | 413 normalized to the envelope |
| `MAL_JSON` | `{oops` | 400 `MALFORMED_REQUEST` |
| `MAL_LIMIT` | `limit=100000` | 422 — capped at 100 |
| `MAL_NEG_PAGE` | `page=-1` | 422 |

### Token fixtures

| ID | Description | Expected |
|----|-------------|----------|
| `TOK_VALID_CUST` | Valid access token for `CUST_A` | Accepted |
| `TOK_MISSING` | No `Authorization` header | 401 `TOKEN_MISSING` |
| `TOK_GARBAGE` | `Bearer not.a.token` | 401 `TOKEN_INVALID` |
| `TOK_EXPIRED` | Valid signature, `exp` in the past | 401 `TOKEN_EXPIRED` |
| `TOK_TAMPERED_ROLE` | Payload edited to `role: ADMIN`, original signature | 401 `TOKEN_INVALID` |
| `TOK_ALG_NONE` | `alg: none`, no signature | 401 `TOKEN_INVALID` |
| `TOK_WRONG_SECRET` | Signed with a different secret | 401 `TOKEN_INVALID` |
| `TOK_WRONG_ISSUER` | `iss: "evil"` | 401 `TOKEN_INVALID` |
| `TOK_SUSPENDED` | Valid token minted **before** `CUST_SUSPENDED` was suspended | 403 `ACCOUNT_SUSPENDED` |
| `TOK_DELETED_USER` | Valid token for `CUST_DELETED` | 401 `TOKEN_INVALID` |
| `REFRESH_USED` | A refresh token already rotated once | 401 `REFRESH_TOKEN_REUSED` + family revoked |

---

## 10. Fixture lifecycle

- **Creation:** `tests/helpers/factories.js` builds each fixture on demand; nothing relies on global state left by another test.
- **Isolation:** `TRUNCATE … RESTART IDENTITY CASCADE` between tests. No test depends on another's residue, so cases can run in any order or in parallel.
- **Determinism:** UUIDs are generated, never hard-coded; tests capture the ID they created. Timestamps that matter are set explicitly rather than inherited from `now()`.
- **Clock:** time-dependent fixtures (`ORDER_PENDING_STALE`, `ASSIGN_EXPIRED`, `REVIEW_OLD`) are created with back-dated columns so no test waits on real time.
- **E2E:** Playwright runs against the seed script, which creates a superset of the fixtures above; E2E scenarios create their own users with randomized emails to stay independent of seed drift.
