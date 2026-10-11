# Test Cases — Frontend Behaviour (TC-369 – TC-392)

> Covers [frontend-architecture.md](../../sdd/architecture/frontend-architecture.md) ·
> the Frontend Impact sections of every story · NFR-13, NFR-14

**Principle under test.** These cases assert **behaviour**, not markup. "The add
button is disabled and says why when the item is unavailable" survives a
refactor; "the div has class `opacity-50`" does not. No case here asserts that a
component merely renders.

**Priority rationale.** Critical for the two places where a client bug causes
real harm: **single-flight token refresh** (getting it wrong logs users out
mid-session) and **the cart-switch dialog** (getting it wrong destroys a
customer's cart). Everything else is High or Medium.

---

## HTTP layer and session

### TC-369 — Concurrent 401s trigger exactly one refresh
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-11 · **Rules** frontend-architecture §3
**Type** Unit · **Priority** Critical
**Steps** 1. Mock five parallel requests all returning 401 `TOKEN_EXPIRED`. 2. Let the interceptor run.
**Expected** Exactly **one** `POST /api/auth/refresh` is issued; the other four queue on the same promise and are retried once it resolves; all five ultimately succeed.
**Notes** Refresh tokens are single-use with reuse detection, so five parallel refreshes would trip `REFRESH_TOKEN_REUSED` and log the user out. This case is the reason single-flight is mandatory rather than an optimization.

### TC-370 — A failed refresh logs out and redirects
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** frontend-architecture §3
**Type** Unit · **Priority** High
**Steps** 1. Make the refresh call return 401.
**Expected** The auth store clears; `localStorage` is cleared; the user is routed to `/login`; no infinite retry loop occurs.

### TC-371 — `TOKEN_EXPIRED` refreshes while `TOKEN_INVALID` logs out
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-09 · **Rules** frontend-architecture §3
**Type** Unit · **Priority** High
**Steps** 1. Return 401 `TOKEN_EXPIRED`. 2. Return 401 `TOKEN_INVALID`.
**Expected** Step 1 attempts a refresh and retries. Step 2 logs out immediately without attempting a refresh.

### TC-372 — The envelope is unwrapped and errors become typed
**Spec** spec-01 · **Story** story-01 · **AC** AC-01-10 · **Rules** FR-10.1
**Type** Unit · **Priority** High
**Steps** 1. Resolve a success envelope. 2. Reject with an error envelope. 3. Reject with a network failure.
**Expected** Success resolves to `data.data`; the error becomes an `ApiError` carrying `code`, `message`, `details` and `status`; the network failure becomes a distinct `NetworkError` rather than an `ApiError` with an undefined code.

### TC-373 — The auth store restores and clears a session
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** frontend-architecture §2
**Type** Unit · **Priority** High
**Steps** 1. Log in and reload the app. 2. Log out and reload.
**Expected** Step 1 restores `user`, `role` and `isAuthenticated` from `localStorage`. Step 2 leaves nothing behind — no token, no user, no role.

---

## Routing and role-based UI

### TC-374 — Protected routes redirect with a return path
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-16 · **Rules** frontend-architecture §4
**Type** Component · **Priority** High
**Steps** 1. Visit `/account/profile` unauthenticated. 2. Log in.
**Expected** Redirect to `/login?redirect=/account/profile`; after login the user lands on `/account/profile`, not on a generic home page.

### TC-375 — A wrong-role visit renders a 403 view, not a silent redirect
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** frontend-architecture §4
**Type** Component · **Priority** High
**Steps** 1. As a customer, visit `/admin/users`, `/restaurant/orders` and `/driver/offers`.
**Expected** The `ForbiddenView` renders and names the required role each time.
**Notes** Silent redirects make "why did that link do nothing?" unanswerable; a 403 page is debuggable by the person hitting it.

### TC-376 — Guests are bounced from auth-only-for-guests routes
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** frontend-architecture §4
**Type** Component · **Priority** Medium
**Steps** 1. While logged in, visit `/login` and `/register`.
**Expected** Redirected to the role's home view.

### TC-377 — Each role sees only its own navigation
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** frontend-architecture §4
**Type** Component · **Priority** Medium
**Steps** 1. Render the layout for each of the four roles.
**Expected** Customer sees cart and orders; restaurant sees menu and orders; driver sees offers and deliveries; admin sees the admin sections. No role sees another's links.
**Notes** This is a courtesy, not a control — the server rejects the calls regardless (TC-030).

### TC-378 — A pending restaurant sees disabled navigation with a reason
**Spec** spec-03 · **Story** story-03 · **AC** AC-03-02, AC-03-03 · **Rules** FR-2.7
**Type** Component · **Priority** High
**Steps** 1. Render the restaurant dashboard with `status: PENDING_APPROVAL`.
**Expected** A status banner explains that customers cannot see the restaurant yet; menu and order items are **visibly disabled with an explanation**; profile and hours remain usable.
**Notes** A hidden nav item looks like a bug; a disabled one with a reason does not.

---

## Forms and validation

### TC-379 — Registration form validates before submitting
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** validation §15
**Type** Component · **Priority** High
**Steps** 1. Enter an invalid email, blur. 2. Enter a 6-character password, blur. 3. Submit with empty required fields.
**Expected** Inline errors appear on blur; submit is blocked; **no** HTTP request is issued for the client-detectable failures.

### TC-380 — Server validation errors map back onto form fields
**Spec** spec-01 · **Story** story-02 · **AC** — · **Rules** frontend-architecture §6
**Type** Component · **Priority** High
**Steps** 1. Submit a form that passes client rules but fails server rules, returning 422 with `details[].field`.
**Expected** Each error is displayed against its field and the first invalid control receives focus.
**Notes** A rule the client does not know about still lands on the right input rather than in a generic toast.

### TC-381 — Duplicate-email conflict is surfaced on the email field
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-02 · **Rules** BR-A1
**Type** Component · **Priority** Medium
**Steps** 1. Register with an existing email and receive 409 `EMAIL_ALREADY_REGISTERED`.
**Expected** A field-level message on the email input, not an anonymous error banner.

---

## Cart behaviour

### TC-382 — The cart store mirrors the server and computes nothing
**Spec** spec-06 · **Story** story-05 · **AC** — · **Rules** frontend-architecture §2
**Type** Unit · **Priority** Critical
**Steps** 1. Load a cart response. 2. Inspect the store's `totals`, `canCheckout` and `issues`.
**Expected** All three are taken verbatim from the response. 3. Statically confirm the store contains no total arithmetic.
**Notes** Duplicating the arithmetic client-side guarantees the two eventually disagree — and the disagreement would be about money.

### TC-383 — The switch-restaurant dialog appears on conflict and defaults to keeping the cart
**Spec** spec-06 · **Story** story-05 · **AC** AC-05-03 · **Rules** BR-C3
**Type** Component · **Priority** Critical
**Steps** 1. Trigger a 409 `CART_RESTAURANT_MISMATCH`.
**Expected** A dialog names both restaurants and the current item count; **"Keep my cart" is the default action** and "Start new cart" is styled as destructive.

### TC-384 — Dismissing the dialog changes nothing
**Spec** spec-06 · **Story** story-05 · **AC** AC-05-03 · **Rules** BR-C3
**Type** Component · **Priority** Critical
**Steps** 1. Open the dialog and choose "Keep my cart", then dismiss with Escape and with a backdrop click.
**Expected** **No HTTP request is issued** in any of the three; the cart state is unchanged.

### TC-385 — Confirming the switch retries with `replace=true`
**Spec** spec-06 · **Story** story-05 · **AC** AC-05-04 · **Rules** BR-C4
**Type** Component · **Priority** Critical
**Steps** 1. Confirm "Start new cart".
**Expected** Exactly one request to `POST /api/cart/items?replace=true` with the original item; the store then reflects the new single-item cart.

### TC-386 — Quantity stepper is bounded with an accessible explanation
**Spec** spec-06 · **Story** story-05 · **AC** AC-05-07 · **Rules** BR-C5, NFR-14
**Type** Component · **Priority** High
**Steps** 1. Render a line at quantity 1, then at 20.
**Expected** Decrement is disabled at 1 and increment at 20; each disabled control carries an accessible explanation; no request fires when a disabled control is activated.

### TC-387 — The checkout button states why it is disabled
**Spec** spec-06 · **Story** story-05 · **AC** AC-05-14 · **Rules** BR-C9 – BR-C11
**Type** Component · **Priority** High
**Steps** 1. Render with `canCheckout: false` for each cause: empty, issues present, below minimum, restaurant unavailable.
**Expected** The button is disabled and the reason is rendered **as text** — including the shortfall amount for the below-minimum case — never conveyed by styling alone.

### TC-388 — An unavailable item cannot be added from the menu
**Spec** spec-04 · **Story** story-04 · **AC** AC-04-14 · **Rules** FR-4.5, NFR-14
**Type** Component · **Priority** High
**Steps** 1. Render `FoodItemCard` with `isAvailable: false`.
**Expected** The add control is disabled with `aria-disabled` and a visible "Unavailable" label; status is never communicated by colour alone.

---

## Orders, tracking and lists

### TC-389 — The cancel control appears only in the cancellable window
**Spec** spec-07 · **Story** story-06 · **AC** AC-06-14 · **Rules** FR-6.6
**Type** Component · **Priority** High
**Steps** 1. Render the order detail for each of the seven statuses.
**Expected** The cancel button is present **only** for `PENDING` and `CONFIRMED`.
**Notes** A courtesy; the server independently refuses the rest (TC-195).

### TC-390 — The action bar offers only transitions legal for the current status
**Spec** spec-07 · **Story** story-07 · **AC** AC-07-16 · **Rules** §7.3
**Type** Component · **Priority** High
**Steps** 1. Render `OrderActionBar` for each status as a restaurant, then as a driver.
**Expected** `PENDING` → accept, reject. `CONFIRMED` → start-preparing, cancel. `PREPARING` → ready, cancel. `READY_FOR_PICKUP` → none for a restaurant. Terminal → none for anyone.

### TC-391 — Polling starts, pauses, stops and backs off
**Spec** spec-07 · **Story** story-06 · **AC** AC-06-19 · **Rules** frontend-architecture §5, R-10
**Type** Unit · **Priority** High
**Steps** 1. Mount a tracking view with a fake clock. 2. Set `document.visibilityState` to hidden, then visible. 3. Return a terminal status. 4. Fail three consecutive polls. 5. Unmount mid-flight.
**Expected** Polls at the configured interval; **pauses** while hidden and fetches immediately on return; **stops permanently** at `DELIVERED`/`CANCELLED`; backs off to 30 s after three failures; clears its interval on unmount **including on the error path**.

### TC-392 — Loading, empty and error states are distinct
**Spec** spec-05 · **Story** story-04 · **AC** AC-04-16 · **Rules** frontend-architecture, NFR-14
**Type** Component · **Priority** Medium
**Steps** 1. Render the restaurant list, order list and menu in each of: loading, loaded-empty, loaded-with-data, and API-error.
**Expected** Loading shows a spinner or skeleton; **empty** shows an actionable message (restaurant list offers to clear filters; empty order list links to browsing) and is clearly **not** an error; **error** shows a retry action. The three states are never conflated.
