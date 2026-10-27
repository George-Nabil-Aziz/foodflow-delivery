# Dependency Map

> Parent: [master-sdd.md](master-sdd.md)

This document establishes the actual dependency graph, distinguishes hard
ordering from parallel opportunity, and proves that no spec or story is
orphaned.

---

## 1. Coverage matrix

Every spec must be implemented by at least one story; every story must
implement at least one spec. **● = primary owner, ○ = contributing.**

| | st-01 | st-02 | st-03 | st-04 | st-05 | st-06 | st-07 | st-08 | st-09 | st-10 |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **spec-01** Foundation & API contract | ● | ○ | | | | | | | | |
| **spec-02** Identity & authorization | | ● | ○ | | | | | ○ | | ○ |
| **spec-03** Restaurant profile & status | | | ● | ○ | | | | | | ○ |
| **spec-04** Menu management | | | ● | ○ | ○ | | | | | |
| **spec-05** Discovery & search | | | | ● | | | | | | |
| **spec-06** Cart management | | | | | ● | ○ | | | | |
| **spec-07** Order placement & lifecycle | | | | | | ● | ● | ○ | | ○ |
| **spec-08** Delivery & driver operations | | | | | | | ○ | ● | | ○ |
| **spec-09** Reviews & ratings | | | | | | | | | ● | ○ |
| **spec-10** Administration & reporting | | | ○ | | | | | ○ | ○ | ● |

**Result:** every row has at least one ●. Every column has at least one entry.
**No orphan specs, no orphan stories.**

Spec-04 shows a contribution in story-05 because the cart's orderability checks
call `menu.assertItemOrderable`; spec-05 is the one spec with a single
implementing story, which is correct — discovery is a cohesive, self-contained
read surface.

---

## 2. Story dependency graph

```text
                         ┌────────────┐
                         │  story-01  │  Foundation & walking skeleton
                         │ (spec-01)  │
                         └─────┬──────┘
                               │ HARD — nothing compiles without it
                         ┌─────▼──────┐
                         │  story-02  │  Customer auth & profile
                         │ (spec-02)  │
                         └─────┬──────┘
                               │ HARD — every later route needs the guards
            ┌──────────────────┼──────────────────────────────┐
            │                                                 │
      ┌─────▼──────┐                                   ┌──────▼─────┐
      │  story-03  │  Restaurant onboarding + menu     │  story-10  │  Admin
      │ (03,04,10) │  (incl. admin approve/reject)     │ (02,07,09) │  (rest of it)
      └─────┬──────┘                                   └──────▲─────┘
            │ HARD — nothing to browse without menus          │
      ┌─────▼──────┐                                          │ SOFT — grows as
      │  story-04  │  Discovery & browsing                    │ entities appear
      │ (04,05)    │                                          │
      └─────┬──────┘                                          │
            │ HARD — the cart is reached from a menu          │
      ┌─────▼──────┐                                          │
      │  story-05  │  Cart                                    │
      │ (04,06)    │                                          │
      └─────┬──────┘                                          │
            │ HARD — checkout converts a cart                 │
      ┌─────▼──────┐                                          │
      │  story-06  │  Order placement & tracking              │
      │ (06,07)    │                                          │
      └─────┬──────┘                                          │
            │ HARD — nothing to process without orders        │
      ┌─────▼──────┐                                          │
      │  story-07  │  Restaurant order processing             │
      │ (07,08)    │                                          │
      └─────┬──────┘                                          │
            │ HARD — dispatch needs a CONFIRMED order         │
      ┌─────▼──────┐                                          │
      │  story-08  │  Driver onboarding & delivery ───────────┤
      │(02,07,08,10)│ (incl. admin driver provisioning)       │
      └─────┬──────┘                                          │
            │ HARD — reviews need DELIVERED orders            │
      ┌─────▼──────┐                                          │
      │  story-09  │  Reviews & ratings ──────────────────────┘
      │ (09,10)    │
      └────────────┘
```

---

## 3. Edge-by-edge rationale

| Edge | Type | Why |
|------|------|-----|
| 01 → 02 | **Hard** | The envelope, validation middleware, error classes and test harness must exist before any domain module. Without them story-02 would invent them and every later story would inherit an auth-shaped API contract. |
| 02 → 03 | **Hard** | A restaurant owner is a user with a role; registration creates the restaurant shell. The `authorize` guard does not exist before story-02. |
| 02 → 10 | **Hard** | Admin routes need `authorize('ADMIN')` and the user model to administer. |
| 03 → 04 | **Hard** | Discovery lists approved restaurants and renders menus. With no supply, every acceptance criterion would be tested against fixtures rather than the real thing. |
| 04 → 05 | **Hard (product)** | Technically the cart API only needs menu data from story-03. It is sequenced after story-04 because a cart with no way to reach a menu cannot be demonstrated or E2E-tested. This is the one edge that could be relaxed under parallel staffing — see §5. |
| 05 → 06 | **Hard** | Checkout consumes a validated cart and calls `cart.getActiveCartForCheckout`. |
| 06 → 07 | **Hard** | Restaurant actions are transitions on existing orders, adjudicated by the state machine that story-06 delivers. |
| 07 → 08 | **Hard** | Dispatch is triggered by `CONFIRMED`, which only story-07 can produce. |
| 08 → 09 | **Hard** | Reviews require `DELIVERED` orders, and driver ratings require an assigned driver. |
| 03, 07, 08, 09 → 10 | **Soft / incremental** | Each admin screen needs its entity to exist, but the admin module is additive — the user list and audit log could be built any time after story-02. |

### Two dependency cycles, both resolved by slicing

**Cycle 1 — restaurants need admin approval, admin needs restaurants.**
Spec-03 cannot be exercised end to end without spec-10's approval endpoints, and
spec-10's approval queue needs restaurants to approve. Resolved by shipping
`GET /api/admin/restaurants` and `POST .../approve|reject` **inside story-03**,
and the rest of the admin surface in story-10.

**Cycle 2 — drivers need admin provisioning, admin needs drivers.**
Same shape, same resolution: driver creation and approval ship inside story-08.

Both slices are recorded in the stories that own them, so nothing is
double-counted and story-10's scope section says explicitly what arrived early
and why.

---

## 4. Spec dependency graph

```text
spec-01 (foundation)
   ├──▶ spec-02 (identity)
   │       ├──▶ spec-03 (restaurant) ──▶ spec-04 (menu) ──┐
   │       │            │                                 │
   │       │            └────────────────┬────────────────┤
   │       │                             ▼                ▼
   │       │                        spec-05 (discovery)  spec-06 (cart)
   │       │                                                  │
   │       │                                                  ▼
   │       │                                            spec-07 (orders)
   │       │                                                  │
   │       │                                    ┌─────────────┴────────┐
   │       │                                    ▼                      ▼
   │       │                            spec-08 (delivery)      spec-09 (reviews)
   │       │                                    │                      │
   │       └────────────────────────────────────┴──────────────────────┴──▶ spec-10 (admin)
   └──▶ (every spec)
```

`spec-05` depends on spec-03 and spec-04 but **not** on spec-02 — discovery is
public. `spec-10` depends on almost everything because administration is
inherently about other people's entities. `spec-09` feeds back into `spec-05`
at runtime (it maintains the rating aggregates discovery sorts by), but that is
a data dependency, not a build-order one, so it does not create a cycle.

---

## 5. Parallelization

**Critical path:** 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09. Nine of the ten
stories are on it, which is a property of the domain: you cannot deliver an
order that was never placed from a menu that does not exist.

| Opportunity | Detail |
|-------------|--------|
| **Frontend / backend split within a story** | Each story's API contract is fully specified here, so the two halves can proceed against the documented payloads and meet at integration. This is the largest real parallelism available. |
| **story-10 alongside 04–09** | The user list, audit log and statistics screens depend only on story-02 plus whichever entity they display. A second developer can build the admin surface throughout Phases 3–5. |
| **story-04 ∥ story-05** | With more than one backend developer, the cart API (which needs only spec-04) can be built while discovery is in progress. The 04 → 05 edge is a demonstrability constraint, not a technical one. |
| **Test infrastructure** | Fixtures and factories for orders in every lifecycle state can be written during story-06 and reused by 07, 08, 09 and 10. |
| **Seed data** | Extending the seed script for each new entity can proceed alongside its story. |

**Not parallelizable:** anything that changes the order state machine. There is
one machine, one transition function and one table, and two people editing it
concurrently would produce exactly the class of bug the design exists to prevent.

---

## 6. Requirement traceability

| Requirement group | Spec | Story | Verified by |
|---|---|---|---|
| FR-1 Identity | spec-02 | story-02 | `auth.integration`, `authorization.matrix` |
| FR-2 Restaurant | spec-03 | story-03 | orderability truth table, owner isolation tests |
| FR-3 Menu | spec-04 | story-03 | menu CRUD, uniqueness and soft-delete tests |
| FR-4 Discovery | spec-05 | story-04 | listing, filter, sort and search tests |
| FR-5 Cart | spec-06 | story-05 | `cart.integration` |
| FR-6 Orders | spec-07 | story-06, story-07 | state-machine matrix, `checkout.integration` |
| FR-7 Delivery | spec-08 | story-08 | `delivery.integration` |
| FR-8 Reviews | spec-09 | story-09 | `reviews.integration` |
| FR-9 Admin | spec-10 | story-03, story-08, story-10 | `admin.integration` |
| FR-10 Foundation | spec-01 | story-01 | contract and health tests |
| FR-11 Card payments | spec-11 | story-11 | `cardPayments.test` |
| FR-12 Discount codes | spec-12 | story-12 | discount tests |
| FR-13 Notifications | spec-13 | story-13 | `notifications.test` |
| FR-14 Live updates | spec-14 | story-14 | events / SSE tests |
| NFR-1 Boundaries | spec-01 | story-01 | lint rule + fixture test |
| NFR-7 Atomicity | spec-07 | story-06 | `transactional.integration` |
| NFR-8 Concurrency | spec-07, spec-08 | story-06, story-07, story-08 | `concurrency.integration` |
| NFR-9 Security | spec-02 | story-02, and every story's security section | `authorization.matrix`, router audit test |
| NFR-13/14 UI | all frontend specs | story-04 onward | Playwright viewport and axe tests |

---

## 7. Risk-weighted ordering note

The sequence deliberately front-loads the two riskiest areas —
[risks.md](risks.md) R-01 (state-machine races) and R-02 (price and menu drift)
— into Phases 4 and 2 respectively, rather than leaving them until the end. The
snapshot behaviour is testable the moment story-06 exists, and the concurrency
behaviour the moment story-07 does. Discovering either is wrong in Phase 6 would
mean reworking the data model with orders already in it.
