# Test Cases — Users, Profiles & Addresses (TC-055 – TC-070)

> Covers [spec-02](../../sdd/specs/spec-02-identity-authentication-authorization.md) ·
> [story-02](../../sdd/stories/story-02-customer-registration-login-profile.md) ·
> FR-1.8 · BR-A6 – BR-A9

**Priority rationale.** Mostly High: profile and address failures block
checkout (an order needs an address) and can expose PII, but they do not
corrupt money or history.

---

## Profile

### TC-055 — Authenticated user retrieves their own profile
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** FR-1.8
**Type** API · **Priority** High
**Data** `CUST_A`
**Steps** 1. `GET /api/me`.
**Expected** 200; `data.user` has `id`, `email`, `fullName`, `phone`, `role`, `status`, `createdAt`; `restaurant` and `driverProfile` are null for a customer.

### TC-056 — `GET /api/me` includes the role-specific block
**Spec** spec-02, spec-03, spec-08 · **Story** story-02 · **AC** — · **Rules** FR-1.8
**Type** API · **Priority** High
**Steps** 1. `GET /api/me` as `OWNER_A`. 2. As `DRIVER_A`. 3. As `CUST_A`.
**Expected** Step 1 returns a `restaurant` block with `status` and `isOrderable`; step 2 a `driverProfile` block with `status` and `availability`; step 3 neither.
**Notes** The block exists so a client never needs a second call to learn whether its restaurant is approved.

### TC-057 — Profile never exposes the password hash
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** NFR-9
**Type** Security · **Priority** Critical
**Steps** 1. `GET /api/me`. 2. Serialize the body.
**Expected** No `password`, `passwordHash` or `password_hash` key at any depth.

### TC-058 — User updates their own name and phone
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** FR-1.8
**Type** API · **Priority** High
**Steps** 1. `PATCH /api/me` `{ fullName: "Sara Idris", phone: "+966500000001" }`.
**Expected** 200 with the updated values persisted.

### TC-059 — Profile update ignores email, role and status
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-04 · **Rules** BR-A9, NFR-9
**Type** Security · **Priority** Critical
**Steps** 1. `PATCH /api/me` `{ fullName: "X", email: "new@example.com", role: "ADMIN", status: "SUSPENDED" }`.
**Expected** 200; `fullName` updated; `email`, `role` and `status` unchanged in the database.
**Notes** Role immutability ([ADR-005](../../sdd/architecture/security.md#adr-005-single-fixed-role-per-user)) is enforced by the field's absence from the schema, not by a blocklist.

### TC-060 — Profile update rejects invalid data
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** FR-10.2
**Type** API · **Priority** Medium
**Steps** 1. `PATCH /api/me` with `fullName: "A"` (too short), then `""`, then `"   "`, then `phone: "abc"`.
**Expected** 422 each time with the offending `details[].field`; no partial update applied.

### TC-061 — Unauthenticated profile access is refused
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** FR-1.4
**Type** API · **Priority** Critical
**Steps** 1. `GET /api/me` and `PATCH /api/me` with no token.
**Expected** 401 `TOKEN_MISSING`.

---

## Addresses

### TC-062 — First address becomes the default automatically
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-13 · **Rules** BR-A7
**Type** API · **Priority** High
**Data** `CUST_NEW`
**Steps** 1. `POST /api/addresses` with a valid address.
**Expected** 201; `isDefault: true`.
**Notes** Without this, a brand-new customer's first checkout would have no default address to pre-select.

### TC-063 — Setting a new default clears the previous one
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-14 · **Rules** BR-A7
**Type** Service · **Priority** High
**Pre** `CUST_A` has three addresses; the second is default.
**Steps** 1. `POST /api/addresses/{third}/default`.
**Expected** 200; exactly one address has `is_default = true` and it is the third.
**Post** The change is atomic — no intermediate state with zero or two defaults is observable.

### TC-064 — Concurrent set-default requests cannot create two defaults
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-14 · **Rules** BR-A7, NFR-8
**Type** Service · **Priority** Critical
**Steps** 1. Fire `POST /api/addresses/{a}/default` and `POST /api/addresses/{b}/default` concurrently.
**Expected** Exactly one address ends up default; the losing request returns a 409 or is serialized, never both succeeding.
**Notes** Proves `uq_addresses_one_default` is present and doing the arbitration — a service-level check alone would lose this race.

### TC-065 — Setting default on an already-default address is idempotent
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** BR-A7
**Type** API · **Priority** Low
**Steps** 1. `POST /api/addresses/{default}/default` twice.
**Expected** 200 both times; no constraint violation; still exactly one default.

### TC-066 — Customer lists only their own addresses
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-15 · **Rules** ADR-010
**Type** API · **Priority** Critical
**Steps** 1. As `CUST_A`, `GET /api/addresses`.
**Expected** 200; the list contains only `CUST_A`'s addresses and none of `CUST_B`'s.

### TC-067 — Address update and delete are scoped to the owner
**Spec** spec-02 · **Story** story-02 · **AC** AC-02-15 · **Rules** ADR-010
**Type** Security · **Priority** Critical
**Steps** 1. As `CUST_A`, `PATCH` and `DELETE` an address ID belonging to `CUST_B`.
**Expected** 404 both times; `CUST_B`'s address untouched.

### TC-068 — Address deletion is a soft delete
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** BR-A8
**Type** Service · **Priority** High
**Steps** 1. `DELETE /api/addresses/{id}`. 2. Query the row directly.
**Expected** 204; the row still exists with `deleted_at` set and no longer appears in `GET /api/addresses`.

### TC-069 — Deleting an address referenced by an order leaves the order intact
**Spec** spec-02, spec-07 · **Story** story-02, story-06 · **AC** — · **Rules** BR-A8, BR-O6
**Type** Service · **Priority** Critical
**Pre** `ORDER_PENDING` was placed to `ADDR_A_DEFAULT`.
**Steps** 1. Delete that address. 2. `GET /api/orders/{ORDER_PENDING}`.
**Expected** The order still returns the full delivery address from its JSONB snapshot, unchanged.
**Notes** The order never reads `customer_addresses`; the FK is a convenience and is allowed to go null.

### TC-070 — Deleting the default address leaves no default
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** BR-A7
**Type** API · **Priority** Medium
**Steps** 1. Delete the default address. 2. `GET /api/addresses`. 3. Attempt checkout without specifying `addressId`.
**Expected** No address is default; checkout requires an explicit `addressId` and returns 422 without one.
**Notes** Documented in spec-02's edge cases. The UI must therefore not assume a default exists.
