# Spec 15 — Item Options (sizes, extras, notes)

**Status:** Approved · **Owner:** Menu / Ordering · **Covers:** FR-15.1 – FR-15.14

## Objective

Let a restaurant offer a dish the way real food apps do — a required **Size**,
optional **Extras**, a free-text **note** — and let a customer choose them while
the price follows the choice. The order records exactly what was chosen and what
it cost, so the kitchen cooks the right dish and the money stays reproducible
after the menu changes.

Options are a second way to get a price wrong and a second way to cook the wrong
dish: a required choice skipped, an extra that ran out, a size that was repriced
while the item sat in a cart. Each is decided here and enforced on the server in
one place, for every way an order can be made. The client sends option **ids**
and a note; it never sends or computes a price.

## Scope

**In scope**
- `item_option_groups`, `item_options`, `cart_item_options`, `order_item_options`, and `cart_items.line_key`.
- Owner management of groups and options: create, edit, reorder, delete, availability.
- Option groups on the owner item list and the public menu.
- Add-to-cart with chosen options and a per-line note; line identity (same choices merge, different choices are separate lines).
- Server pricing: unit price = base price + the sum of the chosen deltas, from live data.
- Cart re-validation of options as per-line issues that block checkout.
- Checkout and admin "Make an order" enforcing the same rules in `insertOrder`; the order snapshot of options and note.
- Options and note on the customer, restaurant, admin (and driver delivery) order views.

**Out of scope** — option groups shared between items, per-option stock counts,
percentage or negative price deltas, options that change the item's availability
or preparation time, editing a cart line's options in place (remove and re-add),
choosing options in the admin "Make an order" page (the API supports it; see A-IO2).

**Assumptions** (recorded where they arise below)
- **A-IO1** A line note is chosen in the add-to-cart dialog, which opens only for an item that has groups. An item without groups is added with one click and no note, "exactly as today"; the API still accepts `notes` for any item.
- **A-IO2** The admin "Make an order" page shows an item with a required group as "requires option choices" and does not let the admin add it; items with only optional groups can still be added without a choice. The `POST /api/admin/orders` API accepts `optionIds` per line and enforces every rule (the bonus is at API level only).
- **A-IO3** Groups and options are **soft-deleted**, so a cart line can still name an option that was removed (BR-IO8).
- **A-IO4** A group may not ask for more than it offers: `minSelect` ≤ number of options when saved, and the last options needed to meet `minSelect` cannot be deleted (409). Switching an option off is allowed even if that leaves a required group with too few available options: the item then cannot be ordered until one is back (a temporary sell-out is a normal event; refusing it would force a lie).
- **A-IO5** `price_seen_at_add` (the change detector from ADR-008) now holds the whole unit price at add, so a repriced option is reported as `PRICE_CHANGED` exactly like a repriced item. Merging into an existing line keeps the original value (write-once, as before).

## Actors

| Actor | Can |
|-------|-----|
| **RESTAURANT** (owner) | Manage option groups and options of their own items; see options and notes on their orders |
| **CUSTOMER** | Choose options and a note when adding; see them in the cart and on their orders |
| **ADMIN** | See options and notes on any order; supply `optionIds` when placing an order through the API |
| **DRIVER** | See chosen options and the note on an accepted delivery (read-only) |

## Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-15.1 | An owner can create an option group on one of their items: name, `minSelect`, `maxSelect`, display order and at least one option (name, price delta ≥ 0, availability) |
| FR-15.2 | An owner can edit a group (name, min, max, order) and an option (name, price delta, availability, order) |
| FR-15.3 | An owner can reorder groups of an item and options of a group atomically |
| FR-15.4 | An owner can delete a group (with its options) or an option; the owner can switch a single option on or off with its own endpoint |
| FR-15.5 | The owner item list and the public menu carry each item's `optionGroups` with their options, unavailable options flagged |
| FR-15.6 | `POST /api/cart/items` accepts `optionIds` and `notes` (≤ 200 characters); a missing required choice, too many choices, an unavailable option or an option that is not this item's is refused with `422 ITEM_OPTIONS_INVALID` |
| FR-15.7 | A cart line is identified by item + the set of chosen options + the note: identical adds merge their quantity (capped at 20), any difference makes a separate line |
| FR-15.8 | Each cart line's `unitPrice` is the item's live price plus the live deltas of its options; the cart view lists the options, `basePrice` and `notes` |
| FR-15.9 | Cart re-validation reports `OPTION_UNAVAILABLE`, `OPTION_REMOVED` and `OPTIONS_CHANGED` as per-line issues in the existing `issues` list; each blocks `canCheckout` and checkout |
| FR-15.10 | Checkout snapshots each line's options (group name, option name, price delta) and its note into `order_item_options` / `order_items.notes`; `unit_price` and `line_total` include the deltas |
| FR-15.11 | `insertOrder` enforces the option rules for checkout **and** admin placement; admin placement refuses an item with a required group when no choice is given |
| FR-15.12 | Customer, restaurant and admin order views (and the driver's delivery view) return each line's `options` and `notes` |
| FR-15.13 | The cart, checkout summary, customer / restaurant order detail and admin order dialog display options and note; the menu opens a choose-options dialog with a running price, in English and Arabic |
| FR-15.14 | Demo groups are seeded (required size, optional extras, a sold-out option) |

## Business Rules

| ID | Rule | Enforcement |
|----|------|-------------|
| BR-IO1 | Options belong to one item. Only the owner of that item's restaurant manages them; another restaurant's group or option is `404` | `options.repository` joins `food_items.restaurant_id` on every owner lookup |
| BR-IO2 | A group has `0 ≤ minSelect`, `1 ≤ maxSelect ≤ 20`, `maxSelect ≥ minSelect`; `minSelect ≥ 1` makes it **required**. An option's price delta is `0.00 … 9999.99` (free choices are normal). Names are unique per item (groups) and per group (options), case-insensitively, among live rows | `CHECK` constraints and partial unique indexes; `createGroupSchema`; `assertSatisfiable` |
| BR-IO3 | A choice is valid only if every chosen option is a **live, available** option of this item and each group's count is within `[minSelect, maxSelect]` (a required group needs at least `minSelect`) | `optionSelection.selectOptions`, the single pure judge used by add, cart revalidation, checkout and admin placement |
| BR-IO4 | The client sends **ids only**. The group of an option is derived from the option; a repeated id counts once; no price, group or name from the client is used | `optionIds` schema (`z.guid` array); `resolveSelections` |
| BR-IO5 | Unit price = base price + Σ chosen deltas, computed by the server from live data in `money` arithmetic; `line_total = unit_price × quantity`; pricing stays `subtotal − discount + delivery + tax`. The cart stores no price (BR-C8) | `unitPriceWith`, `computeTotals`; discounts and tax apply to a subtotal that includes the deltas |
| BR-IO6 | Line identity is `(cart, item, line_key)` where `line_key` = sorted option ids + `|` + note, or `''` for a plain line. Same item with different options or a different note is a **separate line**; identical choices and note merge (qty ≤ 20). A blank note is no note | `uq_cart_items_line`, `lineKeyOf`, `normalizeNote` |
| BR-IO7 | Notes are at most 200 characters, trimmed | `optionalTrimmed(200)` |
| BR-IO8 | Revalidation maps problems to cart issues: a chosen option switched off → `OPTION_UNAVAILABLE`; deleted (or its group deleted) → `OPTION_REMOVED`; a group's min/max no longer satisfied, including a required group added after the line was made → `OPTIONS_CHANGED`. A removed option is shown, flagged, and not charged. Any issue blocks checkout | `cartValidator.validateLines`; `CART_ISSUE_FOR` |
| BR-IO9 | **Every** order path enforces BR-IO3 at order time, inside the order transaction: `insertOrder` resolves each line's `optionIds` against the live menu before pricing. Admin placement with an item that has a required group and no choice is `422 ITEM_OPTIONS_INVALID` and creates nothing, audits nothing | `orders.service.insertOrder` → `menu.resolveSelections` |
| BR-IO10 | An order's options are a snapshot (BR-O1): later rename, repricing, deletion of an option or group, or deletion of the item, change nothing on the order | `order_item_options` copies names and delta; no FK to `item_options` |
| BR-IO11 | A group cannot be left unable to satisfy its own minimum by a **delete** or an edit: `minSelect` > option count is `422`; deleting an option that would leave fewer than `minSelect` is `409 OPTION_GROUP_UNSATISFIABLE` | `options.service` |

### Pricing example

Item 58.00, Size *Large* +12.50, Extras *Cheese* +5.00 and *Bacon* +7.25, quantity 2:

```
unit_price = 58.00 + 12.50 + 5.00 + 7.25 = 82.75
line_total = 82.75 × 2 = 165.50
```

That line adds 165.50 to the subtotal; discount, delivery and tax follow
[spec-12](spec-12-discount-codes.md) / BR-O3 unchanged.

## Data Requirements

```sql
item_option_groups (
  id uuid PK, food_item_id uuid NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,
  name text NOT NULL,
  min_select int NOT NULL DEFAULT 0, max_select int NOT NULL DEFAULT 1,
  display_order int NOT NULL DEFAULT 0 CHECK (0..999),
  created_at, updated_at, deleted_at,
  CHECK (min_select >= 0 AND max_select >= 1 AND max_select >= min_select AND max_select <= 20)
);
CREATE UNIQUE INDEX uq_option_groups_item_name ON item_option_groups (food_item_id, lower(name)) WHERE deleted_at IS NULL;

item_options (
  id uuid PK, group_id uuid NOT NULL REFERENCES item_option_groups(id) ON DELETE CASCADE,
  name text NOT NULL, price_delta numeric(10,2) NOT NULL DEFAULT 0 CHECK (0..9999.99),
  is_available boolean NOT NULL DEFAULT true, display_order int NOT NULL DEFAULT 0,
  created_at, updated_at, deleted_at
);
CREATE UNIQUE INDEX uq_item_options_group_name ON item_options (group_id, lower(name)) WHERE deleted_at IS NULL;

cart_items ADD line_key text NOT NULL DEFAULT '';
  -- uq_cart_items_line becomes UNIQUE (cart_id, food_item_id, line_key)
cart_item_options (
  cart_item_id uuid NOT NULL REFERENCES cart_items(id) ON DELETE CASCADE,
  option_id    uuid NOT NULL REFERENCES item_options(id) ON DELETE CASCADE,
  PRIMARY KEY (cart_item_id, option_id)
);

order_item_options (
  id uuid PK, order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  group_name_snapshot text NOT NULL, option_name_snapshot text NOT NULL,
  price_delta numeric(10,2) NOT NULL DEFAULT 0 CHECK (price_delta >= 0), created_at
);
```

Migration `014_item_options.js`. Existing cart lines get `line_key = ''` (or
`'|' || notes`), so they keep merging as before; existing orders have no option
rows. `order_items.unit_price` includes the deltas, so
`chk_order_items_line_total` is unchanged. Groups and options are soft-deleted
(A-IO3); the order snapshot carries no FK to them.

## API Requirements

Owner, all `RESTAURANT`, scoped to the token's restaurant (BR-IO1). Each returns the
affected group `{ id, name, minSelect, maxSelect, isRequired, displayOrder, options[] }`.

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/restaurant/items/:itemId/option-groups` | The item's groups with options |
| POST | `/api/restaurant/items/:itemId/option-groups` | Create a group with its options; `201` |
| PUT | `/api/restaurant/items/:itemId/option-groups/order` | `{ groups: [{ id, displayOrder }] }` atomically |
| PATCH | `/api/restaurant/option-groups/:groupId` | Edit name, min, max, order |
| DELETE | `/api/restaurant/option-groups/:groupId` | Soft delete; `204` |
| POST | `/api/restaurant/option-groups/:groupId/options` | Add an option; `201` |
| PUT | `/api/restaurant/option-groups/:groupId/options/order` | `{ options: [{ id, displayOrder }] }` atomically |
| PATCH | `/api/restaurant/options/:optionId` | Edit name, price delta, availability, order |
| PATCH | `/api/restaurant/options/:optionId/availability` | `{ isAvailable }` |
| DELETE | `/api/restaurant/options/:optionId` | Soft delete; returns the group |

Changed: `GET /api/restaurant/items` and `GET /api/restaurants/:id/menu` add
`optionGroups` to each item; `POST /api/cart/items` accepts `optionIds` and
`notes`; cart lines add `basePrice`, `options[]`; order items (all views) add
`options[]`; `POST /api/admin/orders` lines accept `optionIds`. Payloads in
[api-design §6, §7 and §10](../architecture/api-design.md).

### Errors

| Code | Status | Raised when |
|------|-------:|-------------|
| `ITEM_OPTIONS_INVALID` | 422 | A choice breaks BR-IO3 on add, checkout or admin placement; `details[]` names each problem (`code`: `OPTION_REMOVED`, `OPTION_UNAVAILABLE`, `GROUP_MIN`, `GROUP_MAX`) |
| `OPTION_GROUP_UNSATISFIABLE` | 409 | Deleting an option would leave fewer than the group's `minSelect` |
| `CART_HAS_ISSUES` | 422 | Checkout with a line carrying `OPTION_*` / `OPTIONS_CHANGED` (existing code) |
| `VALIDATION_ERROR` | 422 | Bad group or option fields (min > max, negative delta, empty options, `minSelect` above the option count) |
| `CONFLICT` | 409 | A group or option name already exists on the item / group |

## Frontend Requirements

- `ItemOptionsDialog` opens from the menu card for an item with groups: radio buttons for a single-choice group, checkboxes otherwise (a group at its maximum disables the rest), required groups labelled, unavailable options shown and disabled, a note field (200), quantity, and a running price. The button is disabled until the required groups are satisfied. The price is a **preview** from integer cents; the server's figure is the truth.
- `useAddToCart` routes every add: an item with groups opens the dialog and the choice rides through the restaurant-switch dialog; an item without groups adds at once.
- `LineOptions` shows options (with `+price`) and the note on the cart, checkout summary, customer and restaurant order detail and the admin dialog. Removed options are struck through.
- Cart issue labels for the three new issues (the line must be removed and re-added).
- Owner `MenuItemsView`: an **Options (n)** control per item opens `ItemOptionsEditor` (create, edit, reorder with arrows, delete, availability checkbox per option); a refresh keeps the editor open.
- Admin Make an order: an item with a required group is marked "requires option choices" (A-IO2).
- Arabic strings in `i18n/ar/itemOptions.js`.

## Backend Requirements

Inside `modules/menu/` (it owns the tables; other modules use `menu/index.js`):

- `optionSelection.js` — pure: `selectOptions`, `unitPriceWith`, `lineKeyOf`, `normalizeNote`, `CART_ISSUE_FOR`.
- `options.repository.js` / `options.service.js` / `options.schemas.js` — owner CRUD; `groupsForItems` loads live groups with options for many items in two queries (no N+1 on menu, cart or checkout); `getOptionContext` (cart); `resolveSelections` (add, checkout, admin placement; throws `ITEM_OPTIONS_INVALID`).
- **Cart:** `addItem` resolves the choice, stores `price_seen_at_add` = unit price and `line_key`, upserts the line and writes `cart_item_options` only for a new line; `buildCartView` and checkout revalidation pass the live option data to `validateLines`.
- **Orders:** `insertOrder` takes lines of `{ foodItemId, basePrice, optionIds, … }`, resolves them with `menu.resolveSelections` inside the order transaction, prices, inserts `order_items` then `order_item_options`. `repo.listItems` attaches each line's options, so every view and the driver delivery view see them.
- **Admin:** the place-order schema accepts `optionIds` per line; the "lists an item twice" check now compares item + options + note.
- Discount codes, card payments, live events and notifications are untouched: they consume the order's totals and ids only.

## Validation

| Field | Rule |
|-------|------|
| group `name` / option `name` | 1–60 characters, trimmed |
| `minSelect` / `maxSelect` | integers 0–20; `maxSelect` ≥ 1 and ≥ `minSelect`; `minSelect` ≤ number of options |
| `options` (create group) | 1–30 entries |
| `priceDelta` | ≥ 0, ≤ 9999.99, at most 2 decimals, default `0.00` |
| `displayOrder` | integer 0–999 |
| `optionIds` | up to 30 UUIDs, duplicates counted once |
| line `notes` | ≤ 200 characters |

## Authorization

The owner routes sit behind `authenticate`, `authorize('RESTAURANT')` and
`attachRestaurant`: no route takes a restaurant id, every lookup joins the owner's
restaurant, and a foreign id is `404`. Cart routes remain `CUSTOMER`-only on the
cart resolved from the token. `POST /api/admin/orders` remains `ADMIN`-only.

## Error Handling

| Condition | Response |
|-----------|----------|
| Required group with no choice (cart add, checkout, admin placement) | `422 ITEM_OPTIONS_INVALID`; nothing created |
| More choices than `maxSelect`; an unavailable option; an option of another item; an unknown id | `422 ITEM_OPTIONS_INVALID` |
| Option switched off / deleted / group changed after the item was carted | Cart `issues` + `canCheckout: false`; checkout `422 CART_HAS_ISSUES` with `codes` |
| Deleting an option needed for `minSelect` | `409 OPTION_GROUP_UNSATISFIABLE` |
| Another restaurant's group or option | `404 RESOURCE_NOT_FOUND` |
| Duplicate group or option name | `409 CONFLICT` |

## Testing Requirements

Unit (`optionSelection.test.js`) — `selectOptions` (valid choice and ordering, required group empty, min and max edges, optional group, unavailable, unknown, repeated id, no groups), `unitPriceWith` in exact arithmetic, line identity (order-insensitive, differs by options or note, `''` for a plain line, blank note), and cart revalidation with options for every issue and price change.

Integration (`itemOptions.test.js`, real PostgreSQL) — owner create / list / edit / reorder / availability / delete, validation, ownership and role isolation, delete-guard and soft delete; public menu and owner list carry groups; add with options priced by the server; refusals (missing required, over max, unavailable, other item's, unknown); ignored client price; merge and split of lines by options and note; items without groups unchanged; revalidation of unavailable / deleted / changed rules / repriced options; checkout totals, snapshot, survival of menu edits, customer / restaurant / admin views; discount priced on a subtotal that includes deltas; stale cart at checkout; admin placement (refused without a required choice, accepted with choices, unavailable / unknown / surplus refused, identical duplicate line refused, items without groups unchanged).

Frontend — preview helpers in cents, the dialog (blocked until required groups are chosen, running price, maximum and unavailable handling, note limit), `LineOptions`, and `useAddToCart` (dialog first, choice sent, plain item unchanged, choice kept through a restaurant switch).

## Edge Cases

| Case | Expected |
|------|----------|
| The same item is added with Large, then with Regular | Two cart lines |
| The same choices are added in a different order | One line, quantity summed (≤ 20) |
| The same options with a different note | Two lines |
| An option is switched off while the item is in a cart | `OPTION_UNAVAILABLE`; checkout blocked until the line is removed or the option is back |
| An option is deleted | `OPTION_REMOVED` (and `PRICE_CHANGED`, since its delta no longer applies); the option is named in the line, struck through, not charged |
| A required group is added to an item already in a cart | `OPTIONS_CHANGED` |
| An option is repriced after being carted | Live total shown, `PRICE_CHANGED` |
| Every option of a required group is switched off | The item cannot be added or ordered until one returns |
| An owner deletes the option a required group needs | `409 OPTION_GROUP_UNSATISFIABLE` |
| A client sends a price, a group or a name with the options | Ignored |
| The admin places an item with a required group and no choice | `422 ITEM_OPTIONS_INVALID`; no order, no audit row |
| Options are renamed, repriced or deleted after checkout | The order is unchanged |
| A restaurant switch (`?replace=true`) with a chosen item | The choice is validated against the new restaurant's live menu and kept |
| A discount applies to an order with options | It applies to the subtotal that includes the deltas |

## Related Stories

[Story 15 — Item Options](../stories/story-15-item-options.md) implements this
spec, under its own requirement range (FR-15.x). It extends
[story-03 — Restaurant Onboarding & Menu Management](../stories/story-03-restaurant-onboarding-menu-management.md),
[story-05 — Cart Management](../stories/story-05-cart-management.md) and
[story-06 — Order Placement & Customer Order Tracking](../stories/story-06-order-placement-customer-tracking.md).

## Dependencies

**Depends on:** [spec-04](spec-04-menu-management.md) (food items, ownership), [spec-06](spec-06-cart-management.md) (the cart, BR-C8), [spec-07](spec-07-order-placement-lifecycle.md) (`insertOrder`, BR-O1, BR-O3), [spec-10](spec-10-platform-administration-reporting.md) (admin placement).
**Depended on by:** none.
