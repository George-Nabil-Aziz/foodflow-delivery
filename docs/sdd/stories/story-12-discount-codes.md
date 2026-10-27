# Story 12 — Discount Codes

**Phase:** 7 (after v1) · **Depends on:** story-05, story-06, story-10 · **Blocks:** nothing

## Goal

Let administrators publish promo codes and let customers apply one in the cart
and see exactly what it takes off — with the discount decided by the server,
re-checked inside the checkout transaction and stored on the order so the money
stays reproducible after the code is edited, deactivated or deleted.

## User Story

> As a **customer**
> I want to apply a promo code in my cart and see what it saves me before I order
> So that I know the real price I will pay, and I am told clearly when a code does not work.
>
> As a **platform administrator**
> I want to create, limit, pause and retire discount codes and see how much each one has given away
> So that promotions run on our terms without ever making an order's price wrong.

## Scope

**In:** `discount_codes`, `order_discounts`, `orders.discount_amount` and
`carts.discount_code_id`; the one pricing function extended with an optional
discount; applying and removing a code on the active cart; re-validation at
checkout; an optional `discountCode` on admin-placed orders; admin list, create,
edit, deactivate, reactivate and soft delete, all audited, with usage
statistics; the discount line on the cart, checkout, customer and restaurant
order detail and the admin order dialog; Arabic strings; a development-only
list of the seeded codes under the code field.

**Out:** automatic or stacked promotions (one code per order); codes that
discount the delivery fee; per-item or per-category discounts; referral or
loyalty credit; a customer-facing list of available codes in production.

## Actors

**CUSTOMER** (applies and removes a code on their own cart, sees the discount on
their orders), **ADMIN** (manages codes, supplies a code when placing an order
for a customer), **RESTAURANT** (read-only: sees the discount on its own
orders). DRIVER has no part in it.

## Preconditions

- Story-05 for the cart that carries the code.
- Story-06 for checkout and the order detail views the discount appears on.
- Story-10 for the admin conventions, the audit log and admin-placed orders.

## Functional Requirements

Implements spec-12: FR-12.1 – FR-12.12.

1. Create a code: unique name, `PERCENT` or `FIXED` value, optional maximum discount (percent only), optional minimum subtotal, optional single-restaurant scope, optional start and end, optional total and per-customer usage limits.
2. Edit every field except the name; editing never changes an order already placed.
3. Deactivate (reason required) and reactivate a code.
4. Soft-delete a code with a reason; its name becomes available again.
5. List with search (`q`) and a state filter (`ACTIVE`, `INACTIVE`, `EXPIRED`, `SCHEDULED`); each row shows its usage count and total discount given.
6. Apply a code to the active cart (`POST /api/cart/discount`) and remove it (`DELETE /api/cart/discount`).
7. `GET /api/cart` returns the applied `discount`, `totals.discountAmount` and the discounted total; a stored code that no longer qualifies comes back as `discountIssue` and blocks `canCheckout`.
8. Checkout validates the code again inside its transaction and rejects the order with the specific `DISCOUNT_CODE_*` error.
9. The order stores `discount_amount` and a snapshot row in `order_discounts` (code as written, amount, link to the code).
10. The usage limit cannot be exceeded under concurrency: two checkouts racing for the last use produce one order and one `DISCOUNT_CODE_LIMIT_REACHED`.
11. Admin-placed orders accept an optional `discountCode` and apply the same rules.
12. The discount is shown on the cart, checkout summary, customer and restaurant order detail and the admin order dialog, in English and Arabic.
13. In development only, the codes created by `npm run seed` are listed under the code field and one click applies one.

## Business Rules

BR-DC1 – BR-DC13 from [spec-12](../specs/spec-12-discount-codes.md#business-rules).

The ones that shape behaviour most: the amount comes from one pure function
used by both the cart preview and the order (BR-DC4); the discount applies to
the items subtotal only, and the restaurant minimum and the code's own minimum
are judged on the pre-discount subtotal (BR-DC5); tax is charged on the
discounted subtotal, so `tax = round((subtotal − discount) × rate)` and
`total = subtotal − discount + delivery_fee + tax` (BR-DC6); a use is an order
carrying the code that is not cancelled, so cancelling gives the use back
(BR-DC7); applying to the cart is a preview and the order is authoritative
(BR-DC8); the code row is read `FOR UPDATE` in the order transaction so limits
are race-free (BR-DC9); and an order's discount is a snapshot (BR-DC10).

## Acceptance Criteria

```gherkin
Given I am a customer with items worth 134.00 in my cart
When I apply the code "save10" (10%, case-insensitive)
Then the cart shows the code as SAVE10, a discount of 13.40, the discounted total
  and canCheckout true, and the same figures on the next GET /api/cart

Given I have applied a code
When I remove it
Then the cart returns with no discount and the undiscounted total

Given I have applied a code
When I check out
Then the order is priced by the server with the discount, stores discount_amount
  and an order_discounts snapshot, and shows the code and amount on my order detail

Given an order used a code
When the code is later edited, deactivated or deleted
Then the order keeps its discount code, discount amount and total

Given an order used a code
When the restaurant owner or an admin opens the order
Then the code and the discount amount are shown

Given a percentage code with a maximum discount of 20.00
When it is applied at checkout
Then the discount is capped at 20.00

Given a fixed code larger than the subtotal
When it is applied at checkout
Then the discount is clamped to the subtotal, tax is 0.00 and the delivery fee
  is still charged

Given a discount brings the subtotal below the restaurant's minimum order
When I check out
Then the order is accepted, because the minimum is judged before the discount

Given a code that is unknown, inactive or deleted
When I apply it
Then I receive 422 DISCOUNT_CODE_INVALID and nothing is applied

Given a code that has ended or has not started yet
When I apply it
Then I receive 422 DISCOUNT_CODE_EXPIRED

Given a code for another restaurant, or a cart below the code's minimum subtotal
When I apply it
Then I receive 422 DISCOUNT_CODE_NOT_APPLICABLE

Given my cart is empty
When I apply a code
Then I receive 422 CART_EMPTY

Given I applied a code that then expired or was deactivated
When I view the cart
Then it shows no discount, a discountIssue naming the reason and canCheckout false,
  and checkout returns the matching 422 with no order created and the cart still ACTIVE

Given a code with a per-customer limit of 1 that I have used
When I apply it again
Then I receive 422 DISCOUNT_CODE_LIMIT_REACHED, until I cancel that order and the
  use is given back

Given a code with a total limit of 1 and two customers who both applied it
When both check out at the same moment
Then exactly one order is created and the other receives 422
  DISCOUNT_CODE_LIMIT_REACHED, with its cart intact

Given I am an admin
When I place an order for a customer with a valid discountCode
Then it is priced by the same rules; with an invalid code I receive the same 422
  and no order is written

Given I am an admin
When I create a code, edit it, deactivate it, reactivate it and delete it
Then each step succeeds, each writes one DISCOUNT_CODE_* audit row, and a deleted
  code disappears from the list and returns 404 on read

Given a code named "WELCOME20" exists
When I create "Welcome20"
Then I receive 409 CONFLICT and no audit row is written

Given I submit a percentage above 100, a cap on a FIXED code, a name with a space,
  an end before the start, a limit of 0 or an unknown restaurant
Then I receive 422 and nothing is stored

Given codes in each state
When I filter by state or search by q
Then only matching codes are listed, and each shows its usage count and total
  discount given, excluding cancelled orders

Given I am a customer, restaurant owner or unauthenticated
When I call /api/admin/discount-codes
Then I receive 403 FORBIDDEN_ROLE (401 without a token) and nothing is audited

Given I am an admin
When I call /api/cart/discount
Then I receive 403

Given the frontend is running in development
When a customer opens the cart code field
Then the seeded codes WELCOME10, SAVE50, GRILL15 and OLDDEAL are listed under it
  and clicking one fills it in and applies it, with the server deciding the outcome

Given the frontend is built for production
When a customer opens the cart code field
Then no development code list is rendered and its component is absent from the build
```

## API Impact

Customer: `POST /api/cart/discount` (`{ code }`, returns the full cart),
`DELETE /api/cart/discount`. `GET /api/cart` gains `discount`,
`totals.discountAmount` and `discountIssue`. Orders gain `discountAmount` and
`discountCode`.

Admin: `GET /api/admin/discount-codes` (`?status=&q=&page=&limit=`, each row with
`state` and `stats { usageCount, totalDiscount }`), `POST` (201),
`GET /:id`, `PUT /:id`, `POST /:id/deactivate`, `POST /:id/reactivate`,
`DELETE /:id`. `POST /api/admin/orders` gains an optional `discountCode`;
`POST /api/orders` is unchanged and uses the code on the cart.

## Database Impact

Migration `011_discounts`: `discount_codes` (`code citext`, partial unique index
`uq_discount_codes_code … WHERE deleted_at IS NULL`, `CHECK` constraints for type,
value, cap, minimum, window and limits); `order_discounts` (one row per order,
`code_snapshot`, `amount > 0`, link `ON DELETE SET NULL`); `orders.discount_amount`
with `chk_orders_discount` and `chk_orders_totals` rewritten to
`total = subtotal − discount_amount + delivery_fee + tax_amount`;
`carts.discount_code_id`. A code's state is derived from the columns, never
stored. The development seed creates WELCOME10, SAVE50, GRILL15 and OLDDEAL.

## Frontend Impact

The `cart` store gains `discount`, `discountIssue`, `applyDiscount` and
`removeDiscount` and computes nothing. `DiscountCodeField` (cart and checkout):
an input and Apply; once applied, the code, "you save X" and Remove; a stored code
that no longer qualifies shows the reason and Remove code. `DevDiscountCodes` is
rendered under the field only when `import.meta.env.DEV` is true and is loaded by a
dynamic import in the dead branch — like `DevAccounts` — so it never ships in a
production build. A Discount line (green, with the code) appears in the cart,
checkout, customer and restaurant order detail and the admin `OrderDetailsDialog`,
only above zero. `utils/discount.discountErrorText` maps each `DISCOUNT_CODE_*` to
its own sentence. Admin: `DiscountCodesView` and `DiscountCodeFormView`
(`/admin/discount-codes`, `/new`, `/:id/edit`; the code is read-only when editing),
with a reason dialog for deactivate and delete; an optional Discount code field on
the admin order form. Arabic strings in `i18n/ar/discounts.js`.

## Backend Impact

`modules/discounts/` (`discounts.service.js`, `discounts.repository.js`,
`index.js`) owns `discount_codes` and `order_discounts`; cart, orders and admin
reach it only through `index.js`. `evaluate()` is the single place the rules live;
`validateForOrder` reads the code `FOR UPDATE`, `validateForCart` does not.
`orderPricing.computeTotals` takes an optional `discount`. `insertOrder` (shared
by checkout and admin placement) checks the minimum, validates the code against
the pre-discount subtotal, recomputes, inserts and records the redemption; a
discount that rounds to zero records none. The cart builds its view strictly when
applying (a failure rolls the stored id back) and leniently otherwise (a failure
becomes `discountIssue`); replacing the restaurant, removing the last line or
clearing the cart removes the code. `admin.service` writes each mutation and its
audit row in one transaction.

## Validation

Create: `code` 3–30 of letters, digits, `-`, `_`, stored upper-case; `type`
`PERCENT` or `FIXED`; `value` > 0, ≤ 100 for `PERCENT`; `maxDiscountAmount` > 0,
`PERCENT` only; `minSubtotal` ≥ 0 (default 0); `restaurantId` an existing
restaurant; `startsAt` before `endsAt`; `usageLimit` and `perCustomerLimit`
integers ≥ 1. `reason` 5–300 characters on deactivate and delete (optional on
reactivate); `q` 1–60; cart `code` 1–40 after trimming; admin order `discountCode`
1–40. The database repeats the structural rules as `CHECK` constraints.

## Error Cases

| Case | Expected |
|------|----------|
| Unknown, inactive or deleted code | `422 DISCOUNT_CODE_INVALID` |
| Ended or not yet started | `422 DISCOUNT_CODE_EXPIRED` (`startsAt` or `endsAt` in details) |
| Another restaurant's code, or below the code's minimum | `422 DISCOUNT_CODE_NOT_APPLICABLE` (`required`, `actual`, `shortfall` for the minimum) |
| Total or per-customer limit reached | `422 DISCOUNT_CODE_LIMIT_REACHED` |
| Applying to an empty cart | `422 CART_EMPTY` |
| Checkout with a code that stopped qualifying | The matching `422`; no order; cart still `ACTIVE` |
| Zero-total order paid by card | `422`; choose cash on delivery |
| Duplicate code name, any case | `409 CONFLICT` |
| Editing or deleting a deleted or unknown code | `404 RESOURCE_NOT_FOUND` |
| Admin placing an order with a bad code | The same `422`; no order |
| Non-admin on an admin route / admin on the cart route | `403` / `403` (`401` without a token) |

## Security Considerations

- **The client sends a code, never an amount:** the discount, the tax and the total are computed on the server and re-checked at checkout; the cart store of a code is never trusted (BR-DC8).
- **No leak of code existence:** an unknown, inactive and deleted code return the same `DISCOUNT_CODE_INVALID`.
- **Race-free limits:** the code row is locked in the order transaction, so a limit cannot be beaten by concurrent checkouts (BR-DC9).
- **Audit:** every admin mutation and its audit row commit in one transaction (BR-DC12).
- **Role separation:** `/api/admin/discount-codes` is `ADMIN`-only and `/api/cart/discount` is `CUSTOMER`-only, acting on the cart resolved from the token.
- **Development list:** `DevDiscountCodes` exists only under `import.meta.env.DEV` and is absent from a production build; it lists names and notes, and the server still decides whether a code applies.

## Related Specs

- [spec-12 — Discount Codes](../specs/spec-12-discount-codes.md) (primary)
- [spec-06 — Cart Management](../specs/spec-06-cart-management.md) (the cart carries the code)
- [spec-07 — Order Placement & Lifecycle](../specs/spec-07-order-placement-lifecycle.md) (`insertOrder` and pricing)
- [spec-10 — Platform Administration & Reporting](../specs/spec-10-platform-administration-reporting.md) (audit and admin-placed orders)

## Dependencies

**Depends on:** story-05 for the cart; story-06 for checkout and order views; story-10 for the admin surface and audit log.
**Must happen before:** nothing.
**Can happen in parallel with:** nothing — it extends code those stories own.

## Testing Requirements

- Unit: `backend/tests/unit/discountPricing.test.js` — percent, percent with cap, fixed, fixed above the subtotal, rounding of the discount then the tax, the totals identity, no discount unchanged. `frontend/tests/unit/discount.test.js` — the cart store mirrors the discount and total verbatim and exposes `discountIssue`; `discountErrorText` names each reason; the discount line renders only above zero.
- Integration: `backend/tests/integration/discounts.test.js` (real PostgreSQL). Required: **two concurrent checkouts racing for the last use produce one order**; a code stored with a snapshot that survives the code being edited and deleted; every `DISCOUNT_CODE_*` error; a code that expires or is deactivated after being applied blocking checkout with the cart left `ACTIVE`; the restaurant minimum judged before the discount; the per-customer limit freed by cancelling; admin-placed orders with a good and a bad code; admin CRUD with each mutation audited, duplicates regardless of case, input validation, filters, search and statistics excluding cancelled orders; non-admin `403`, unauthenticated `401` and an admin refused on the cart endpoint.
- Frontend: the development list is checked by inspecting a production build — `npm run build` must produce no `DevDiscountCodes` chunk (no automated test exists for this yet).
