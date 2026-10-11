# Test Cases — Validation (TC-301 – TC-322)

> Covers [master-sdd §15](../../sdd/master-sdd.md#15-validation) ·
> [spec-01](../../sdd/specs/spec-01-platform-foundation-api-contract.md) ·
> FR-10.2 · BR-F2

**Principle under test.** *Backend validation is the source of truth. Frontend
validation exists only to improve UX and is never trusted.* Every case in this
file therefore calls the **API directly**, bypassing the UI entirely — a rule
proven only through the browser is not proven at all.

**Priority rationale.** Mass-assignment stripping and type-confusion handling
are Critical (they are security controls). Field-level format rules are Medium —
they produce a bad message, not a breach.

---

## The validation pipeline

### TC-301 — Unknown keys are stripped before reaching the service
**Spec** spec-01 · **Story** story-01 · **AC** AC-01-07 · **Rules** BR-F2, NFR-9
**Type** Security · **Priority** Critical
**Steps** 1. `POST /api/auth/register` with `role`, `status`, `id`, `createdAt`, `isAdmin` and `__proto__` added. 2. `PATCH /api/me` with `email`, `role`, `status`. 3. `POST /api/orders` with `totalAmount`, `subtotal`.
**Expected** Each request succeeds on its legitimate fields; every injected key is absent from the persisted row and from the response.
**Notes** Mass assignment is closed by Zod's default object behaviour, not by a blocklist — so a new column added tomorrow is protected without anyone remembering to add it.

### TC-302 — Controllers never read unvalidated input
**Spec** spec-01 · **Story** story-01 · **AC** — · **Rules** BR-F2
**Type** Service · **Priority** Critical
**Steps** 1. Statically scan `src/modules/**` for references to `req.body`, `req.query` and `req.params` outside `middleware/validate.js`.
**Expected** No matches.
**Notes** A lint rule backs this; the test makes the rule's failure visible as a red test rather than a warning nobody reads.

### TC-303 — Validation errors name the offending field
**Spec** spec-01 · **Story** story-01 · **AC** — · **Rules** FR-10.2
**Type** API · **Priority** High
**Steps** 1. Submit a registration with three simultaneously invalid fields.
**Expected** 422 `VALIDATION_ERROR` with a `details[]` entry per field, each carrying `field` and a human-readable `issue`; all three reported at once rather than one at a time.

### TC-304 — Malformed JSON is handled by the envelope
**Spec** spec-01 · **Story** story-01 · **AC** AC-01-05 · **Rules** FR-10.3
**Type** API · **Priority** High
**Data** `MAL_JSON`
**Steps** 1. `POST` with `Content-Type: application/json` and body `{oops`.
**Expected** 400 `MALFORMED_REQUEST` **inside the envelope** — not Express's default HTML error page.

### TC-305 — Oversized bodies are rejected
**Spec** spec-01 · **Story** story-01 · **AC** — · **Rules** NFR-9
**Type** Security · **Priority** Medium
**Data** `MAL_BIG_BODY`
**Steps** 1. `POST` a 200 KB JSON body.
**Expected** 413 normalized into the envelope; the request never reaches a service.

### TC-306 — Type confusion is rejected rather than coerced dangerously
**Spec** spec-01 · **Story** story-01 · **AC** — · **Rules** FR-10.2
**Type** Security · **Priority** Critical
**Steps** 1. Send `quantity: []`, `quantity: {}`, `quantity: null`, `email: ["a@b.com"]`, `foodItemId: { "$ne": null }`, `restaurantRating: true`.
**Expected** 422 each; no value is silently coerced into something usable; no database error surfaces.
**Notes** The object-valued cases matter even though this is SQL rather than Mongo — a permissive parser would pass a structure a repository never expected.

### TC-307 — Malformed UUIDs are rejected cleanly
**Spec** spec-01 · **Story** story-01 · **AC** — · **Rules** validation §15
**Type** API · **Priority** Medium
**Data** `MAL_UUID`
**Steps** 1. `GET /api/orders/not-a-uuid`. 2. `/api/restaurants/12345`. 3. `/api/cart/items/<39-char string>`.
**Expected** 400 or 422 with a clear message; **never** a raw PostgreSQL `invalid input syntax for type uuid` error reaching the client.

### TC-308 — Empty and whitespace-only strings are rejected on required fields
**Spec** spec-01 · **Story** story-02, story-03 · **AC** — · **Rules** validation §15
**Type** API · **Priority** Medium
**Steps** 1. Submit `fullName: ""` then `"   "`; `name: ""` then `"\t\n"`; `reason: "     "`.
**Expected** 422 each — values are trimmed before length checks, so whitespace cannot satisfy a minimum length.

### TC-309 — Missing required fields are reported individually
**Spec** spec-01 · **Story** story-02 · **AC** — · **Rules** validation §15
**Type** API · **Priority** Medium
**Steps** 1. `POST /api/auth/register` with an empty body. 2. `POST /api/cart/items` with no `foodItemId`. 3. `POST /api/reviews` with no `restaurantRating`.
**Expected** 422 each, with every missing field listed in `details[]`.

---

## Field rules by domain

### TC-310 — Email format rules
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** BR-A1, validation §15
**Type** API · **Priority** Medium
**Data** `REG_BAD_EMAIL_1..4`
**Steps** 1. Register with `not-an-email`, `""`, `"   "`, `a@`, `@b.com`, a 256-char address, and a valid address.
**Expected** 422 for the first six; 201 for the last. The accepted address is normalized to lowercase.

### TC-311 — Password rules including the bcrypt ceiling
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** BR-A2
**Type** API · **Priority** High
**Data** `REG_PW_SHORT`, `REG_PW_LONG`, `REG_PW_NO_DIGIT`, `REG_PW_NO_LETTER`, `REG_PW_BOUNDARY_MIN`, `REG_PW_BOUNDARY_MAX`
**Steps** 1. Submit 7 chars, 8 chars, 72 chars, 73 chars, letters-only, digits-only.
**Expected** 422 · 201 · 201 · **422** · 422 · 422.
**Notes** The 73-character rejection is explicit rather than a silent truncation — otherwise a 100-character password would be no stronger than its first 72 bytes and the user would never be told.

### TC-312 — Phone format
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** validation §15
**Type** API · **Priority** Low
**Data** `REG_BAD_PHONE`
**Steps** 1. Submit `+966501234567`, `abc123`, `+0501234567`, a 20-digit number, and `""`.
**Expected** 201 · 422 · 422 (leading zero after `+`) · 422 · 422.

### TC-313 — Address field rules
**Spec** spec-02 · **Story** story-02 · **AC** — · **Rules** validation §15
**Type** API · **Priority** Medium
**Steps** 1. `line1` of 4 and 5 chars; `city` of 1 and 2 chars; `label` of 51 chars; `latitude` 91 and −91; `longitude` 181; latitude without longitude.
**Expected** 422 · 201 · 422 · 201 · 422 · 422 · 422 · 422 · 422 respectively.

### TC-314 — Monetary field rules
**Spec** spec-03, spec-04 · **Story** story-03 · **AC** AC-03-14 · **Rules** BR-R4, BR-R5
**Type** API · **Priority** High
**Steps** 1. `price`: `"0"`, `"-1.00"`, `"12.345"`, `"9999.99"`, `"10000.00"`, `"abc"`, `1e5`. 2. `deliveryFee`: `"-0.01"`, `"0.00"`. 3. `minimumOrderAmount`: `"-1"`.
**Expected** Prices → 422 · 422 · 422 · **201** · 422 · 422 · 422. Fees → 422 · 200. Minimum → 422.
**Notes** `"9999.99"` and `"0.00"` must be **accepted**; a test that only checks rejections would pass with an over-strict validator that blocks legitimate values.

### TC-315 — Quantity rules
**Spec** spec-06 · **Story** story-05 · **AC** AC-05-07 · **Rules** BR-C5
**Type** API · **Priority** High
**Steps** 1. Submit `-1`, `0`, `1`, `20`, `21`, `1.5`, `"3"`, `1e10`, `"abc"`.
**Expected** 422 · 422 · 200 · 200 · 422 · 422 · 200 · 422 · 422.

### TC-316 — Rating rules
**Spec** spec-09 · **Story** story-09 · **AC** AC-09-18 · **Rules** BR-V3
**Type** API · **Priority** Medium
**Steps** 1. Submit `0`, `1`, `5`, `6`, `3.5`, `-1`, `"4"`.
**Expected** 422 · 201 · 201 · 422 · 422 · 422 · 201.

### TC-317 — Enum fields reject unknown values
**Spec** multiple · **Story** multiple · **AC** — · **Rules** validation §15
**Type** API · **Priority** Medium
**Steps** 1. `role: "SUPERUSER"`. 2. `cuisineType: "MARTIAN"`. 3. `paymentMethod: "BITCOIN"`. 4. `availability: "SLEEPING"`. 5. `vehicleType: "SPACESHIP"`. 6. `reason: "BECAUSE"`. 7. `scope: "everything"`.
**Expected** 422 each with the field named.

### TC-318 — Text length ceilings
**Spec** multiple · **Story** multiple · **AC** AC-09-17 · **Rules** validation §15
**Type** API · **Priority** Medium
**Steps** 1. `customerNote` 500 then 501 chars. 2. `comment` 1000 then 1001. 3. `notes` (cart) 200 then 201. 4. `description` (item) 1000 then 1001. 5. `reason` 300 then 301.
**Expected** Accept at the limit, 422 one character over, in every pair.

### TC-319 — Pagination and sort parameters
**Spec** spec-05 · **Story** story-04 · **AC** AC-04-04, AC-04-12 · **Rules** NFR-4, BR-D5.4
**Type** API · **Priority** High
**Steps** 1. `page`: `0`, `-1`, `1`, `abc`, `1.5`. 2. `limit`: `0`, `1`, `100`, `101`, `100000`. 3. `sort`: an allow-listed value, `password_hash`, `name; DROP TABLE`. 4. `order`: `asc`, `desc`, `sideways`.
**Expected** Valid values accepted; everything else 422 before any SQL is built.

### TC-320 — Date-range parameters
**Spec** spec-10 · **Story** story-10 · **AC** — · **Rules** validation
**Type** API · **Priority** Low
**Steps** 1. `from=2026-09-01&to=2026-09-30`. 2. `from` after `to`. 3. `from=not-a-date`.
**Expected** 200 · 422 · 422.

### TC-321 — Opening-hours payload rules
**Spec** spec-03 · **Story** story-03 · **AC** AC-03-07, AC-03-08 · **Rules** BR-R10, BR-R11
**Type** API · **Priority** High
**Data** `HOURS_FULL_WEEK`, `HOURS_MISSING_DAY`, `HOURS_DUPLICATE_DAY`, `HOURS_OVERNIGHT`, `HOURS_EQUAL`
**Steps** 1. Full valid week. 2. Six days. 3. Eight entries with a duplicate. 4. `dayOfWeek: 7`. 5. `opensAt: "25:00"`. 6. Overnight range. 7. Equal times.
**Expected** 200 · 422 · 422 · 422 · 422 · 422 · 422; the stored week is unchanged on every failure.

### TC-322 — Frontend and backend rules agree
**Spec** spec-01 · **Story** story-02 · **AC** — · **Rules** validation §15
**Type** Unit · **Priority** Medium
**Steps** 1. Compare `frontend/src/utils/validationRules.js` against the backend Zod schemas for the shared fields — email, password, name, phone, price, quantity, rating, comment lengths.
**Expected** Every shared rule has the same bounds on both sides.
**Notes** A mismatch is not a security hole (the backend still wins) but it is a UX defect: the client either blocks a valid value or lets an invalid one through to an avoidable round trip.
