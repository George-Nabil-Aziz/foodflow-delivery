# Spec 12 — Discount Codes

**Status:** Approved · **Owner:** Ordering / Platform Ops · **Covers:** FR-12.1 – FR-12.12

## Objective

Let administrators publish promo codes, let customers apply one in the cart and
see exactly what it takes off, and store the discount on the order so that the
money stays reproducible after the code is edited, deactivated or deleted.

Money is the reason this is a spec rather than a field. A discount is a second
way to get a price wrong: it can drop a total below zero, be used more often
than the limit says, or follow a customer into a cart it was never meant for.
Each of those is decided here and enforced on the server, at order time, inside
the checkout transaction. The client sends a code; it never sends or computes an
amount.

## Scope

**In scope**
- `discount_codes`, `order_discounts`, `orders.discount_amount` and `carts.discount_code_id`.
- `computeTotals` extended with an optional discount (the one pricing function).
- Applying and removing a code on the active cart; re-validation at checkout.
- An optional `discountCode` on admin-placed orders (spec-10, BR-AD11).
- Admin list, create, edit, deactivate / reactivate and soft delete, all audited, with usage statistics.
- The discount line on the cart, checkout, customer order detail, restaurant order detail and admin order dialog.

**Out of scope** — automatic or stacked promotions (one code per order), codes
that discount the delivery fee, per-item or per-category discounts, referral or
loyalty credit, refunds of a discount (a card refund returns what was paid, [spec-11](spec-11-card-payments.md)), a
customer-facing list of available codes.

## Actors

| Actor | Can |
|-------|-----|
| **CUSTOMER** | Apply and remove a code on their own cart; see the discount on their orders |
| **RESTAURANT** | See the discount on the orders of their restaurant (read-only; they do not manage codes) |
| **ADMIN** | Create, edit, deactivate, reactivate and delete codes; read usage statistics; supply a code when placing an order for a customer |
| **DRIVER** | None |

## Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-12.1 | An admin can create a code: unique name, `PERCENT` or `FIXED` value, optional maximum discount (percent only), optional minimum subtotal, optional single-restaurant scope, optional start and end, optional total and per-customer usage limits |
| FR-12.2 | An admin can edit every field except the code's name; editing never changes an order already placed |
| FR-12.3 | An admin can deactivate and reactivate a code; deactivating requires a reason |
| FR-12.4 | An admin can soft-delete a code, with a reason; the name becomes available again |
| FR-12.5 | The admin list searches by `q` (1–60 characters, code or description), filters by state (`ACTIVE`, `INACTIVE`, `EXPIRED`, `SCHEDULED`) and shows each code's usage count and total discount given |
| FR-12.6 | A customer can apply a code to their active cart (`POST /api/cart/discount`) and remove it (`DELETE /api/cart/discount`) |
| FR-12.7 | `GET /api/cart` returns the applied `discount`, `totals.discountAmount` and the discounted `totals.total`; a stored code that no longer qualifies is returned as `discountIssue` and blocks `canCheckout` |
| FR-12.8 | Checkout validates the code again, inside its transaction, and rejects the order with the specific `DISCOUNT_CODE_*` error if it fails |
| FR-12.9 | The order stores `discount_amount` and a snapshot row in `order_discounts` (code as written, amount, link to the code) |
| FR-12.10 | The usage limit cannot be exceeded under concurrency: two checkouts racing for the last use produce one order and one `DISCOUNT_CODE_LIMIT_REACHED` |
| FR-12.11 | Admin-placed orders accept an optional `discountCode` and apply the same rules |
| FR-12.12 | The discount is shown on the cart, checkout summary, customer and restaurant order detail and the admin order dialog, in English and Arabic |

## Business Rules

| ID | Rule | Enforcement |
|----|------|-------------|
| BR-DC1 | A code is unique, compared case-insensitively, among codes that are not deleted | `code citext` + `uq_discount_codes_code … WHERE deleted_at IS NULL`; the API stores it upper-case |
| BR-DC2 | A code is usable only while it is **active** (`is_active`, not deleted) | `DISCOUNT_CODE_INVALID` otherwise — an unknown, inactive or deleted code is indistinguishable to the customer |
| BR-DC3 | A code is usable only inside its window: not before `starts_at`, not at or after `ends_at` | `DISCOUNT_CODE_EXPIRED` (the error carries `startsAt` or `endsAt`) |
| BR-DC4 | The amount is computed by `orderPricing.discountAmountFor`: `PERCENT` = `round_half_up(subtotal × value / 100)`, then capped at `max_discount_amount` when set; `FIXED` = `value`; in both cases never more than the subtotal | Pure function, unit tested; the same function prices the cart preview and the order |
| BR-DC5 | The discount applies to the **items subtotal only** — never the delivery fee, never the tax. The restaurant minimum order and the code's own `min_subtotal` are both judged on the **pre-discount** subtotal | `computeTotals`; `meetsMinimum(subtotal, …)` is called before the discount is applied |
| BR-DC6 | **Tax is charged on the discounted subtotal**: `tax = round((subtotal − discount) × rate, 2)`; `total = subtotal − discount + delivery_fee + tax` | `computeTotals`; `chk_orders_totals` restates the sum. A fully discounted order pays no tax on food but still pays delivery |
| BR-DC7 | A code may be restricted to one restaurant, to a total number of uses and to a number of uses per customer. A use is an order carrying the code that is **not cancelled**, so cancelling an order gives its use back | `evaluate()` counts `order_discounts` joined to `orders` where `status <> 'CANCELLED'`. Wrong restaurant or below `min_subtotal` → `DISCOUNT_CODE_NOT_APPLICABLE`; either limit → `DISCOUNT_CODE_LIMIT_REACHED` |
| BR-DC8 | Applying to the cart is a **preview**; the order is authoritative. Checkout, and admin placement, re-run every rule with the cart as it is at that moment | `validateForOrder` in `insertOrder`; the cart store of a code is never trusted |
| BR-DC9 | Limits are race-free: the code row is read `FOR UPDATE` in the order transaction, so redemptions of one code are serialized and the second sees the first's row | `discounts.validateForOrder` → `findByCode(…, { forUpdate: true })` |
| BR-DC10 | An order's discount is a snapshot: later edits, deactivation or deletion of the code change nothing on past orders and their totals | `orders.discount_amount`, `order_discounts.code_snapshot` and `amount`; the FK to the code is `ON DELETE SET NULL` |
| BR-DC11 | At most one code per order or cart. Applying a second replaces the first | `carts.discount_code_id` is a single column; `uq_order_discounts_order` |
| BR-DC12 | Every admin mutation is audited in the same transaction (BR-AD1) | `DISCOUNT_CODE_CREATED / UPDATED / DEACTIVATED / REACTIVATED / DELETED` written by `admin.service` inside `withTransaction` |
| BR-DC13 | A code is not carried between restaurants or past an emptied cart: replacing the restaurant, removing the last line or clearing the cart removes the applied code | `cart.service` |

### The formula

```
line_total = unit_price × quantity
subtotal   = Σ line_total
discount   = min( subtotal,
                  PERCENT: min( round_half_up(subtotal × value / 100), max_discount_amount? )
                  FIXED:   value )
tax        = round_half_up( (subtotal − discount) × tax_rate, 2 )
total      = subtotal − discount + delivery_fee + tax
```

Worked example (rate 15%, delivery 12.00, subtotal 134.00):

| Code | discount | taxable | tax | total |
|------|---------:|--------:|----:|------:|
| none | 0.00 | 134.00 | 20.10 | 166.10 |
| 10% | 13.40 | 120.60 | 18.09 | 150.69 |
| 50%, cap 20.00 | 20.00 | 114.00 | 17.10 | 143.10 |
| fixed 500.00 | 134.00 (clamped) | 0.00 | 0.00 | 12.00 |

Charging tax on the discounted subtotal is the assumption (new **A-DC1**):
the customer is taxed on what they pay for the food, which is how VAT treats a
price reduction. Taxing the pre-discount subtotal would make a fully discounted
order owe tax on money nobody paid. It is a one-line change in `computeTotals`
and the constraint would not need to move, because it checks only the sum.

## Data Requirements

```sql
discount_codes (
  id uuid PK,
  code citext NOT NULL,
  description text,
  discount_type text NOT NULL CHECK (discount_type IN ('PERCENT','FIXED')),
  value numeric(10,2) NOT NULL,                 -- percent (<= 100) or amount
  max_discount_amount numeric(10,2),            -- percent only
  min_subtotal numeric(10,2) NOT NULL DEFAULT 0,
  restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE,   -- NULL = every restaurant
  starts_at timestamptz, ends_at timestamptz,   -- starts_at < ends_at
  usage_limit integer, per_customer_limit integer,                  -- NULL = unlimited, else >= 1
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at, updated_at
);
CREATE UNIQUE INDEX uq_discount_codes_code ON discount_codes (code) WHERE deleted_at IS NULL;

order_discounts (
  id uuid PK,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,   -- unique: one per order
  discount_code_id uuid REFERENCES discount_codes(id) ON DELETE SET NULL,
  code_snapshot text NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  created_at
);

orders ADD discount_amount numeric(10,2) NOT NULL DEFAULT 0,
  CHECK (discount_amount >= 0 AND discount_amount <= subtotal),
  CHECK (total_amount = subtotal - discount_amount + delivery_fee + tax_amount);
carts ADD discount_code_id uuid REFERENCES discount_codes(id) ON DELETE SET NULL;
```

Migration `011_discounts.js`. Existing orders get `discount_amount = 0` and keep
satisfying the rewritten `chk_orders_totals`. A code's *state* is derived, never
stored, so it cannot disagree with the dates:
`INACTIVE` (not `is_active`) › `EXPIRED` (`ends_at` passed) › `SCHEDULED`
(`starts_at` ahead) › `ACTIVE`.

The code is copied onto `order_discounts` as well as linked: the link exists so
the admin can count usage, the copy so the order can still say which code it
used after the code is gone (the same reasoning as `order_items`, BR-O1).

## API Requirements

Customer, all `CUSTOMER`:

| Method | Route | Purpose | Errors |
|--------|-------|---------|--------|
| POST | `/api/cart/discount` | `{ code }` — apply to the active cart; returns the full cart | 422 `CART_EMPTY`, `DISCOUNT_CODE_*`, `VALIDATION_ERROR` |
| DELETE | `/api/cart/discount` | Remove; returns the full cart | — |

Admin, all `ADMIN`, every mutation audited:

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/admin/discount-codes` | `?status=&q=&page=&limit=`; each row carries `state` and `stats { usageCount, totalDiscount }` |
| POST | `/api/admin/discount-codes` | Create; `201` |
| GET | `/api/admin/discount-codes/:id` | One code with its statistics |
| PUT | `/api/admin/discount-codes/:id` | Edit everything except `code` |
| POST | `/api/admin/discount-codes/:id/deactivate` | `{ reason }` |
| POST | `/api/admin/discount-codes/:id/reactivate` | `{ reason? }` |
| DELETE | `/api/admin/discount-codes/:id` | `{ reason }`; soft delete |

`POST /api/admin/orders` gains an optional `discountCode`. `POST /api/orders` is
unchanged: it uses the code on the cart. Payloads in
[api-design §6, §7 and §10](../architecture/api-design.md).

### Error codes (all `422`)

| Code | Raised when |
|------|-------------|
| `DISCOUNT_CODE_INVALID` | Unknown, inactive or deleted |
| `DISCOUNT_CODE_EXPIRED` | Before `starts_at` (`details[].startsAt`) or at/after `ends_at` (`details[].endsAt`) |
| `DISCOUNT_CODE_NOT_APPLICABLE` | Another restaurant's code, or the pre-discount subtotal is under `min_subtotal` (`required`, `actual`, `shortfall`) |
| `DISCOUNT_CODE_LIMIT_REACHED` | Total or per-customer limit reached; the `issue` text says which |

An admin creating a name that already exists gets `409 CONFLICT`.

## Frontend Requirements

- `cart` store gains `discount`, `discountIssue`, `applyDiscount`, `removeDiscount`. **It computes nothing**: the amount, the new total and `canCheckout` come from the response.
- `DiscountCodeField` (cart and checkout): an input and **Apply**; once applied it shows the code, "you save X" and **Remove**. A stored code that no longer qualifies shows the reason and **Remove code**; checkout stays disabled with that reason as text.
- A **Discount** line (green, with a minus sign and the code) in the summary of the cart, checkout, customer order detail, restaurant order detail and the admin `OrderDetailsDialog`; shown only when the discount is above zero.
- `utils/discount.discountErrorText` maps each `DISCOUNT_CODE_*` to its own sentence ("Add EGP 20.00 more to use this code (minimum EGP 50.00)", "This discount code has expired.").
- Admin: **Discount codes** in the sidebar; `DiscountCodesView` (PageTitle with count, search, state `FilterSelect` with counts, "Add a discount code" in the `FilterBar`, details dialog, ConfirmDialog with reason for deactivate and delete); `DiscountCodeFormView` for create and edit on a page of its own (the code is read-only when editing). Routes `/admin/discount-codes`, `/new`, `/:id/edit`.
- Make an order (admin) has an optional **Discount code** field.
- **Development only:** `DevDiscountCodes` under the code field lists the codes `npm run seed` creates (WELCOME10, SAVE50, GRILL15, and the expired OLDDEAL to show the error), each with a one-line note; a click fills the code in and applies it, so the server still decides. Like `DevAccounts` on the login page it is rendered behind `import.meta.env.DEV` and loaded by a dynamic import, so it is not in a production build.
- Arabic strings in `i18n/ar/discounts.js`.

## Backend Requirements

Module `modules/discounts/` (`discounts.service.js`, `discounts.repository.js`,
`index.js`). It owns `discount_codes` and `order_discounts`; the cart, orders and
admin modules reach it only through `discounts/index.js`.

- **`evaluate(row, { customerUserId, restaurantId, subtotal })`** is the one place the rules live, and returns the pricing spec `{ id, code, type, value, maxDiscount }` that `computeTotals` takes as `discount`. It does not compute the amount: that is `orderPricing`'s job (BR-DC4).
- **`validateForOrder`** reads the code `FOR UPDATE` and evaluates. **`validateForCart`** evaluates without the lock. The two differ only in the lock.
- **`insertOrder`** (shared by checkout and `adminPlaceOrder`), after the minimum-order check: compute totals without a discount → validate the code against that subtotal → recompute with the spec → insert the order with `discount_amount` → `recordRedemption`. Nothing else in `orders.service.js` changed except that the detail views read the code for display.
- **Cart:** `applyDiscount` row-locks the cart, resolves the code, stores the id and builds the view *strictly* — a failing rule throws and the stored id rolls back with the transaction. Every other read builds the view *leniently*: it re-judges the stored code and reports a failure as `discountIssue` instead of throwing. `getActiveCartForCheckout` hands `discountCode` to checkout; a soft-deleted code throws `DISCOUNT_CODE_INVALID` rather than matching a new code that reuses its name.
- **Admin:** `admin.service` wraps each `discounts.admin*` call and its `audit()` in one transaction. The list query joins a per-code aggregate of non-cancelled redemptions for `usageCount` and `totalDiscount`.

## Validation

| Field | Rule |
|-------|------|
| `code` (create) | 3–30 of letters, digits, `-`, `_`; stored upper-case; unique |
| `type` | `PERCENT` \| `FIXED` |
| `value` | > 0; ≤ 100 for `PERCENT`; at most 2 decimals |
| `maxDiscountAmount` | > 0, `PERCENT` only |
| `minSubtotal` | ≥ 0, default 0 |
| `restaurantId` | UUID of an existing restaurant, or absent for all |
| `startsAt`, `endsAt` | dates; `startsAt < endsAt` |
| `usageLimit`, `perCustomerLimit` | integers ≥ 1, or absent |
| `reason` | 5–300 characters on deactivate and delete |
| `q` | 1–60 characters |
| cart `code` | 1–40 characters after trimming |

The database repeats the structural rules as `CHECK` constraints.

## Authorization

`/api/admin/discount-codes` is `ADMIN`-only (`403 FORBIDDEN_ROLE` for every other
role, `401` without a token). `/api/cart/discount` is `CUSTOMER`-only and acts on
the cart resolved from the token. A restaurant owner sees only the amount and
the code on their own orders and manages no codes.

## Error Handling

| Condition | Response |
|-----------|----------|
| Unknown, inactive, deleted code | `422 DISCOUNT_CODE_INVALID` |
| Expired / not yet started | `422 DISCOUNT_CODE_EXPIRED` |
| Wrong restaurant, or below the code's minimum | `422 DISCOUNT_CODE_NOT_APPLICABLE` |
| Limit reached | `422 DISCOUNT_CODE_LIMIT_REACHED` |
| Applying to an empty cart | `422 CART_EMPTY` |
| Checkout with a code that stopped qualifying | The matching `422`; no order, cart untouched and still `ACTIVE` |
| Duplicate code name | `409 CONFLICT` with `details[].field = code` |
| Editing or deleting a deleted or unknown code | `404 RESOURCE_NOT_FOUND` |
| Admin placing an order with a bad code | The same `422`; no order, no audit row |

## Testing Requirements

Unit — `computeTotals` with discounts: percent, percent with cap and under the
cap, fixed, fixed larger than the subtotal (clamped, no tax, delivery kept),
rounding of the discount then the tax, the identity
`total = subtotal − discount + fee + tax`, no discount unchanged,
`money.percentOf` half-up, the minimum judged on the pre-discount subtotal.

Integration (`discounts.test.js`, real PostgreSQL) — a valid code reduces the
cart and the order, is stored with a snapshot and survives the code being edited
and deleted; the discount shows on the customer, restaurant and admin order;
unknown / inactive / deleted → INVALID; expired and not-yet-started → EXPIRED;
other restaurant and below minimum → NOT_APPLICABLE; applying to an empty cart;
a code that expires or is deactivated after being applied blocks checkout with
the specific error and leaves the cart `ACTIVE`; the restaurant minimum is
judged before the discount; per-customer limit, freed by cancelling; total
limit; **two concurrent checkouts racing for the last use produce one order**;
admin-placed orders with a good and a bad code; admin CRUD with every mutation
audited, duplicate code regardless of case, input validation, list filters,
search, usage and discount-given statistics (cancelled orders excluded);
non-admin `403` and unauthenticated `401`; an admin cannot use the cart endpoint.

Frontend — the store mirrors the discount and total verbatim and exposes
`discountIssue`; `discountErrorText` names each reason; the discount line renders
only above zero.

## Edge Cases

| Case | Expected |
|------|----------|
| Customer applies a code, then removes items until the subtotal is under the code's minimum | The view shows the code with `DISCOUNT_CODE_NOT_APPLICABLE` and the shortfall; the total is undiscounted; checkout is blocked until the code is removed or the cart grows |
| Code expires between apply and checkout | `422 DISCOUNT_CODE_EXPIRED`; nothing is created |
| Two customers take the last use at once | One `201`, one `422 DISCOUNT_CODE_LIMIT_REACHED`; the loser's cart is intact |
| Customer cancels an order that used a per-customer-limited code | The use is released; they may apply the code again |
| Admin deletes a code a customer has in their cart | The cart reports the code as invalid; checkout is blocked until removed |
| Admin deletes a code, then creates one with the same name | Allowed; carts pointing at the old row do not match the new one |
| Percentage of a tiny subtotal rounds to 0.00 | The order is placed at full price and no redemption is recorded |
| Fixed discount larger than the subtotal | Clamped to the subtotal; tax 0.00; the delivery fee is still charged |
| Customer switches restaurant with `?replace=true` or empties the cart | The applied code is removed (BR-DC13) |
| Admin edits a code's value after orders used it | Past orders keep their amount and total; usage statistics keep their sum |
| Code scoped to a restaurant that is later hard-deleted | The code is removed with it (`ON DELETE CASCADE`); order snapshots survive with a null link |
| An order is delivered or cancelled | `GMV` already sums `total_amount`, which is net of the discount (BR-AD9); no change |

## Related Stories

[Story 12 — Discount Codes](../stories/story-12-discount-codes.md) implements this
spec, under its own requirement range (FR-12.x). It extends
[story-05 — Cart Management](../stories/story-05-cart-management.md),
[story-06 — Order Placement & Customer Order Tracking](../stories/story-06-order-placement-customer-tracking.md)
and the admin story in [spec-10](spec-10-platform-administration-reporting.md).

## Dependencies

**Depends on:** [spec-06](spec-06-cart-management.md) (the cart carries the code), [spec-07](spec-07-order-placement-lifecycle.md) (`insertOrder`, BR-O3 pricing, BR-O5), [spec-10](spec-10-platform-administration-reporting.md) (admin conventions, BR-AD1 audit, admin-placed orders), [spec-03](spec-03-restaurant-profile-operations.md) (restaurant scope).
**Depended on by:** none.
