# Test Cases — Discovery & Search (TC-115 – TC-134, TC-414 – TC-415)

> Covers [spec-05](../../sdd/specs/spec-05-restaurant-discovery-search.md) ·
> [story-04](../../sdd/stories/story-04-restaurant-discovery-menu-browsing.md) ·
> FR-4.1 – FR-4.7 · BR-R2, BR-R3, BR-D5.1 – BR-D5.6

**Priority rationale.** Mostly Medium — a wrong sort order is annoying and
immediately visible, and no money or access depends on it. Two exceptions are
Critical: **visibility** (an unapproved restaurant must never be reachable) and
**sort-parameter validation** (an allow-list failure is an SQL injection
vector).

---

## Visibility

### TC-115 — Only ACTIVE restaurants appear in the listing
**Spec** spec-05 · **Story** story-04 · **AC** AC-04-01 · **Rules** BR-R2
**Type** API · **Priority** Critical
**Pre** `REST_A` ACTIVE, `REST_PENDING` pending, `REST_SUSPENDED` suspended, `REST_REJECTED` rejected all exist.
**Steps** 1. `GET /api/restaurants` anonymously.
**Expected** 200; `REST_A` present; the other three absent.

### TC-116 — A non-ACTIVE restaurant is 404 by direct ID
**Spec** spec-05 · **Story** story-04 · **AC** AC-04-02 · **Rules** BR-R2
**Type** Security · **Priority** Critical
**Steps** 1. `GET /api/restaurants/{REST_PENDING}`, `{REST_SUSPENDED}`, `{REST_REJECTED}`. 2. `GET /api/restaurants/{REST_PENDING}/menu`.
**Expected** 404 on all four — not a redacted record, not a 403.

### TC-117 — Public payloads expose no owner or internal data
**Spec** spec-05 · **Story** story-04 · **AC** — · **Rules** security §9
**Type** Security · **Priority** High
**Steps** 1. `GET /api/restaurants` and `GET /api/restaurants/{REST_A}`. 2. Serialize both bodies.
**Expected** No `ownerUserId`, owner email, `approvedByUserId`, `rejectionReason` or any user PII at any depth.

---

## Pagination

### TC-118 — Pagination metadata is correct at a boundary
**Spec** spec-05 · **Story** story-04 · **AC** AC-04-03 · **Rules** FR-4.1, NFR-4
**Type** API · **Priority** Medium
**Pre** Exactly 21 ACTIVE restaurants.
**Steps** 1. `GET /api/restaurants?page=2&limit=20`.
**Expected** 200; `data.length === 1`; `meta.pagination = { page: 2, limit: 20, total: 21, totalPages: 2 }`.

### TC-119 — Limit is capped at 100
**Spec** spec-05 · **Story** story-04 · **AC** AC-04-04 · **Rules** NFR-4
**Type** API · **Priority** Medium
**Data** `MAL_LIMIT`
**Steps** 1. `GET /api/restaurants?limit=500`. 2. `?limit=100`. 3. `?limit=101`. 4. `?limit=0`.
**Expected** 422 · 200 · 422 · 422.

### TC-120 — A page beyond the last returns an empty list, not 404
**Spec** spec-05 · **Story** story-04 · **AC** — · **Rules** spec-05 edge cases
**Type** API · **Priority** Low
**Steps** 1. `GET /api/restaurants?page=999`.
**Expected** 200 with `data: []` and accurate `meta.pagination`.

### TC-121 — Negative or non-numeric page is rejected
**Spec** spec-05 · **Story** story-04 · **AC** — · **Rules** validation §15
**Type** API · **Priority** Medium
**Data** `MAL_NEG_PAGE`
**Steps** 1. `?page=-1`, `?page=0`, `?page=abc`.
**Expected** 422 each.

---

## Filtering and sorting

### TC-122 — Cuisine filter returns only matching restaurants
**Spec** spec-05 · **Story** story-04 · **AC** — · **Rules** FR-4.2
**Type** API · **Priority** Medium
**Steps** 1. `GET /api/restaurants?cuisine=LEVANTINE`.
**Expected** 200; every result has `cuisineType: "LEVANTINE"`.

### TC-123 — Invalid cuisine value is rejected
**Spec** spec-05 · **Story** story-04 · **AC** — · **Rules** validation §15
**Type** API · **Priority** Low
**Steps** 1. `?cuisine=MARTIAN`.
**Expected** 422.

### TC-124 — `openNow` filters on computed orderability
**Spec** spec-05 · **Story** story-04 · **AC** AC-04-08 · **Rules** BR-D5.3, BR-R3
**Type** Integration · **Priority** High
**Pre** `REST_A` open, `REST_CLOSED` outside hours, `REST_PAUSED` not accepting.
**Steps** 1. `GET /api/restaurants?openNow=true`.
**Expected** Only `REST_A`. `REST_PAUSED` is excluded even though it is within its hours — orderability is the conjunction, not just the clock.

### TC-125 — The SQL `openNow` filter agrees with the JS orderability function
**Spec** spec-05 · **Story** story-04 · **AC** AC-04-06, AC-04-07 · **Rules** BR-R3
**Type** Service · **Priority** Critical
**Steps** 1. Build a fixture set spanning every status/accepting/hours combination. 2. Compute `isOrderable` in JS for each. 3. Run the `openNow=true` query. 4. Compare the two sets.
**Expected** Identical membership.
**Notes** `openNow` is the one place the orderability rule is expressed twice — once in SQL for filtering, once in JS for the flag. This case exists specifically to stop them drifting.

### TC-126 — Minimum-rating filter
**Spec** spec-05 · **Story** story-04 · **AC** — · **Rules** FR-4.2
**Type** API · **Priority** Medium
**Steps** 1. `?minRating=4`. 2. `?minRating=0`. 3. `?minRating=6`.
**Expected** Step 1 → only restaurants with `ratingAverage ≥ 4`. Steps 2 and 3 → 422 (valid range is 1–5).

### TC-127 — Each sort option orders correctly
**Spec** spec-05 · **Story** story-04 · **AC** — · **Rules** FR-4.2
**Type** API · **Priority** Medium
**Steps** 1. `?sort=deliveryFee&order=asc`. 2. `?sort=name&order=desc`. 3. `?sort=newest`. 4. `?sort=rating&order=desc`.
**Expected** Each result set is correctly ordered by that field.

### TC-128 — Unrated restaurants sort last under rating sort
**Spec** spec-05 · **Story** story-04 · **AC** AC-04-05 · **Rules** BR-D5.6
**Type** API · **Priority** Medium
**Pre** `REST_UNRATED` has `rating_count = 0`; others have ratings including a 1-star.
**Steps** 1. `GET /api/restaurants?sort=rating&order=desc`.
**Expected** Rated restaurants appear first in descending order; `REST_UNRATED` is **last**, below the 1-star restaurant.
**Notes** A new restaurant is not a bad restaurant. Treating a null aggregate as 0.00 would be both unfair and factually wrong.

### TC-129 — Sort parameter is allow-listed
**Spec** spec-05 · **Story** story-04 · **AC** AC-04-12 · **Rules** BR-D5.4, NFR-9
**Type** Security · **Priority** Critical
**Data** `MAL_SORT`, `MAL_SORT_2`
**Steps** 1. `?sort=passwordHash`. 2. `?sort=password_hash`. 3. `?sort=name;DROP TABLE users`. 4. `?order=sideways`.
**Expected** 422 each, **before any SQL is built**; `users` still exists.

### TC-130 — Combined filters apply together
**Spec** spec-05 · **Story** story-04 · **AC** — · **Rules** FR-4.2
**Type** API · **Priority** Medium
**Steps** 1. `?cuisine=LEVANTINE&openNow=true&minRating=3&sort=deliveryFee&order=asc&page=1&limit=10`.
**Expected** Every result satisfies all four constraints simultaneously and is correctly ordered and paginated.

### TC-131 — No matching results returns an empty list
**Spec** spec-05 · **Story** story-04 · **AC** AC-04-16 · **Rules** spec-05 edge cases
**Type** API · **Priority** Low
**Steps** 1. Apply filters that match nothing.
**Expected** 200 with `data: []` and `meta.pagination.total = 0` — an empty result is not an error.

---

## Search

### TC-132 — Search matches partially and case-insensitively across both groups
**Spec** spec-05 · **Story** story-04 · **AC** AC-04-09 · **Rules** BR-D5.1
**Type** API · **Priority** Medium
**Steps** 1. `GET /api/search?q=rill`. 2. `?q=GRILL`. 3. `?q=olive`.
**Expected** "Mixed Grill" is returned under `foodItems` and "Olive Grill" under `restaurants`; matching is mid-word and case-insensitive.

### TC-133 — Search excludes items from non-ACTIVE restaurants
**Spec** spec-05 · **Story** story-04 · **AC** AC-04-10 · **Rules** BR-D5.2
**Type** Security · **Priority** High
**Pre** `REST_SUSPENDED` has an item whose name matches the query.
**Steps** 1. `GET /api/search?q=<that name>`.
**Expected** Neither the restaurant nor its item appears in either group.

### TC-134 — Search escapes SQL wildcards and metacharacters
**Spec** spec-05 · **Story** story-04 · **AC** AC-04-11 · **Rules** BR-D5.1, NFR-9
**Type** Security · **Priority** Critical
**Data** `MAL_WILDCARD`, `MAL_WILDCARD_2`, `MAL_SQL_1`, `MAL_SQL_2`
**Steps** 1. `?q=%`. 2. `?q=_`. 3. `?q=' OR 1=1 --`. 4. `?q='; DROP TABLE users; --`. 5. `?q=a` (1 char). 6. `?q=   `.
**Expected** Steps 1–2 → treated as literal text, **not** a match-everything pattern. Steps 3–4 → literal; `users` still exists; no extra rows. Steps 5–6 → 422 (minimum 2 characters, trimmed).
**Notes** Unescaped, a search for `%` returns the entire table and turns the search box into a full-table-scan button — a availability problem as well as a correctness one.

---

## Gap-closure cases (added during coverage analysis)

> IDs continue above TC-406 per [test-plan §2](../test-plan.md#2-test-case-id-allocation),
> because the TC-115–TC-134 block was full.

### TC-414 — An inactive category is hidden from the customer-facing menu
**Spec** spec-05, spec-04 · **Story** story-04 · **AC** AC-04-13 · **Rules** BR-R7, FR-4.4
**Type** API · **Priority** High
**Pre** `REST_A` has `CAT_A_INACTIVE` containing `ITEM_IN_INACTIVE_CAT` (which is itself available).
**Steps** 1. `GET /api/restaurants/{REST_A}/menu` anonymously. 2. Compare against the owner's view from `GET /api/restaurant/categories`.
**Expected** Neither the inactive category nor its items appear in the public menu; the owner's view still shows both, so the restaurant can see what it has hidden.
**Notes** The customer-facing half of TC-098, which asserts the same rule from the owner's side. Both exist because the projections are built by different code paths.

### TC-415 — Filter state round-trips through the URL
**Spec** spec-05 · **Story** story-04 · **AC** AC-04-15 · **Rules** frontend-architecture §5
**Type** Component · **Priority** Medium
**Steps** 1. Apply a cuisine filter, `openNow`, a minimum rating and a sort. 2. Reload the page. 3. Navigate to a restaurant and press the browser Back button. 4. Copy the URL into a fresh session.
**Expected** The query string reflects every active filter; all four survive the reload, the Back navigation and the fresh session — a filtered list is shareable and does not reset.
