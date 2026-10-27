# Story 15 — Item Options (sizes, extras, notes)

**Phase:** 8 · **Depends on:** story-03, story-05, story-06 · **Blocks:** nothing

## Goal

Let a restaurant offer a dish with a required size, optional extras and a line
note, and let a customer choose them while the price follows — with every rule
decided by the server, enforced the same way for checkout and for an admin
placing an order, and snapshotted on the order so the kitchen's ticket and the
money stay reproducible after the menu changes.

## User Story

> As a **restaurant owner**
> I want to attach groups such as "Size" (choose one) and "Extras" (choose up to three) to a dish, with a price for each choice
> So that customers order the dish the way we make it, and I can switch off an extra the moment we run out.
>
> As a **customer**
> I want to pick a size and extras and add a note like "no onions", and see the price update as I choose
> So that I get exactly what I want and know what it costs before I add it.

## Scope

**In:** option groups and options with their tables and migration 014; owner
management (create, edit, reorder, delete, availability); groups on the owner
list and the public menu; add-to-cart with `optionIds` and a note; line identity
and merging; server pricing (base + deltas); cart re-validation with three new
issues; the same rules enforced in `insertOrder` for checkout and admin
placement; the order snapshot of options and note; options and note on every
order view; the choose-options dialog and the owner's editor; Arabic strings;
demo data in the seed.

**Out:** groups shared between items; per-option stock counts; percentage or
negative deltas; editing a cart line's options in place; choosing options on the
admin "Make an order" page (the API supports it).

## Actors

**RESTAURANT** (manages options, sees them on orders), **CUSTOMER** (chooses and
orders), **ADMIN** (sees them; places orders through the API), **DRIVER** (sees
them on an accepted delivery).

## Preconditions

- Story-03 for the menu, the owner's menu screens and ownership scoping.
- Story-05 for the cart, line identity and live-price re-validation (BR-C8).
- Story-06 for checkout, the order snapshot (BR-O1) and the order views.

## Functional Requirements

Implements spec-15: FR-15.1 – FR-15.14.

1. Create an option group on an item (name, min, max, order, options with price delta and availability).
2. Edit a group and an option; reorder groups and options atomically.
3. Delete a group or an option (soft); switch one option on or off with its own endpoint.
4. The owner item list and the public menu carry each item's option groups; unavailable options are flagged.
5. Add to cart with `optionIds` and a note (≤ 200 characters); invalid choices are `422 ITEM_OPTIONS_INVALID`.
6. The same item with different options or note is a separate line; identical choices merge.
7. Unit price = base + chosen deltas, from live data; the cart stores no price.
8. Cart re-validation reports `OPTION_UNAVAILABLE`, `OPTION_REMOVED` and `OPTIONS_CHANGED` as per-line issues that block checkout.
9. Checkout snapshots options and note; `line_total` includes the deltas.
10. `insertOrder` enforces the rules for checkout and admin placement; admin placement refuses a required group with no choice.
11. Customer, restaurant, admin and driver order views show the options and the note.
12. The menu opens a choose-options dialog with a running price; the cart, checkout and order views show options and note; English and Arabic.
13. Demo groups in the seed.

## Business Rules

BR-IO1 – BR-IO11 from [spec-15](../specs/spec-15-item-options.md#business-rules).

The ones that shape behaviour most: only ids travel from the client and the
server derives groups and prices (BR-IO4, BR-IO5); one pure function judges a
choice for add, revalidation, checkout and admin placement (BR-IO3); a line is
identified by item, options and note (BR-IO6); a removed option is still shown
on a carted line, flagged and not charged (BR-IO8); every order path enforces the
rules at order time in the order transaction (BR-IO9); and an order's options are
a snapshot (BR-IO10).

## Acceptance Criteria

```gherkin
Given a dish with a required "Size" (Regular +0.00, Large +12.50) and optional "Extras" (up to 2)
When I add it without choosing a size
Then I receive 422 ITEM_OPTIONS_INVALID and nothing is added

Given the same dish
When I add it with Large, Cheese (+5.00) and Bacon (+7.25), quantity 2
Then the cart line shows a unit price of 82.75, a line total of 165.50 and its options,
  and the subtotal includes 165.50

Given I choose three extras where the maximum is two
When I add it
Then I receive 422 ITEM_OPTIONS_INVALID

Given I add the dish with Regular, then again with Regular, then with Large
Then my cart has two lines, the first with quantity 2

Given I add the dish with Regular and the note "no onions", then with Regular and no note
Then my cart has two lines

Given a dish without option groups
When I add it
Then it is added exactly as before, with no dialog

Given an option in my cart is switched off by the restaurant
When I view the cart
Then the line carries OPTION_UNAVAILABLE, canCheckout is false and checkout returns CART_HAS_ISSUES

Given an option in my cart was deleted
When I view the cart
Then the line carries OPTION_REMOVED, names the option, does not charge it, and blocks checkout

Given the restaurant adds a required group to a dish already in my cart
When I view the cart
Then the line carries OPTIONS_CHANGED and checkout is blocked

Given a cart with options and a note
When I check out
Then each order line stores the group name, option name and price delta of every option and the note,
  unit_price and line_total include the deltas, and the total reconciles

Given an order was placed with options
When the restaurant renames, reprices or deletes them
Then the order is unchanged for me, the restaurant and an admin

Given I and the restaurant and an admin open the order
Then each sees the options and the note on every line

Given an admin places an order for a customer with an item that has a required group and no choice
When it is submitted
Then the response is 422 ITEM_OPTIONS_INVALID, no order is created and nothing is audited

Given an owner who needs one size for a required group
When they delete the only remaining option of it
Then they receive 409 OPTION_GROUP_UNSATISFIABLE

Given an owner of another restaurant
When they read, edit or delete this dish's groups or options
Then each is 404

Given I have a discount code
When I check out a cart with options
Then the discount applies to the subtotal that includes the option prices
```

## Definition of Done

- Migration `014_item_options.js` applies and reverses cleanly.
- Unit tests for the selection rules, line identity and revalidation; integration tests for every business rule above on real PostgreSQL; frontend tests for the preview helpers, the dialog and `useAddToCart`.
- The full backend and frontend suites, lint, build and the i18n check pass; the discount, card payment, live update and notification tests are unchanged and green.
- `spec-15`, `story-15`, `database-design.md` and `api-design.md` are current.
