# FoodFlow — Traceability Matrix

> Generated from [test-cases/](test-cases/) and [e2e-scenarios.md](e2e-scenarios.md).
> Regenerate after adding or editing a case.
>
> Chain: **Spec → Story → Acceptance Criterion → Test Case**. Numbering in each
> column is independent — `TC-001` is not tied to `spec-01` or `story-01`, and a
> single story maps to many cases.

## Summary

**Total: 424 test cases** (TC-001 – TC-424, all IDs unique, no gaps).

### By priority

| Priority | Cases | Share |
|---|--:|--:|
| Critical | 168 | 40% |
| High | 159 | 38% |
| Medium | 82 | 19% |
| Low | 15 | 4% |

### By test type

| Type | Cases |
|---|--:|
| API | 171 |
| Security | 85 |
| Integration | 57 |
| Service | 54 |
| Unit | 23 |
| Component | 20 |
| E2E | 14 |
| A11y | 1 |

### By category

| Category | Cases | File |
|---|--:|---|
| Platform Foundation | 13 | [test-cases/platform-foundation.md](test-cases/platform-foundation.md) |
| Authentication | 28 | [test-cases/authentication.md](test-cases/authentication.md) |
| Authorization | 26 | [test-cases/authorization.md](test-cases/authorization.md) |
| Users | 16 | [test-cases/users.md](test-cases/users.md) |
| Restaurants | 22 | [test-cases/restaurants.md](test-cases/restaurants.md) |
| Menu | 24 | [test-cases/menu.md](test-cases/menu.md) |
| Discovery | 22 | [test-cases/discovery.md](test-cases/discovery.md) |
| Cart | 32 | [test-cases/cart.md](test-cases/cart.md) |
| Orders | 30 | [test-cases/orders.md](test-cases/orders.md) |
| State Machine | 32 | [test-cases/order-state-machine.md](test-cases/order-state-machine.md) |
| Delivery | 26 | [test-cases/delivery.md](test-cases/delivery.md) |
| Reviews | 22 | [test-cases/reviews.md](test-cases/reviews.md) |
| Admin | 25 | [test-cases/admin.md](test-cases/admin.md) |
| Validation | 22 | [test-cases/validation.md](test-cases/validation.md) |
| Security | 24 | [test-cases/security.md](test-cases/security.md) |
| Edge Cases | 22 | [test-cases/edge-cases.md](test-cases/edge-cases.md) |
| Frontend | 24 | [test-cases/frontend.md](test-cases/frontend.md) |
| E2E | 14 | [e2e-scenarios.md](e2e-scenarios.md) |

---

## Full matrix

| Test Case | Title | Spec | Story | AC | Type | Priority |
|---|---|---|---|---|---|---|
| [TC-001](test-cases/authentication.md#tc-001--register-a-customer-with-valid-data) | Register a customer with valid data | spec-02 | story-02 | AC-02-01 | API | Critical |
| [TC-002](test-cases/authentication.md#tc-002--registration-response-never-exposes-a-password-field) | Registration response never exposes a password field | spec-02 | story-02 | AC-02-01 | Security | Critical |
| [TC-003](test-cases/authentication.md#tc-003--password-is-stored-as-a-bcrypt-hash-never-plaintext) | Password is stored as a bcrypt hash, never plaintext | spec-02 | story-02 | AC-02-01 | Service | Critical |
| [TC-004](test-cases/authentication.md#tc-004--duplicate-email-is-rejected) | Duplicate email is rejected | spec-02 | story-02 | AC-02-02 | API | High |
| [TC-005](test-cases/authentication.md#tc-005--duplicate-email-is-rejected-case-insensitively) | Duplicate email is rejected case-insensitively | spec-02 | story-02 | AC-02-02 | API | High |
| [TC-006](test-cases/authentication.md#tc-006--registering-role-admin-is-refused-not-downgraded) | Registering role ADMIN is refused, not downgraded | spec-02 | story-02 | AC-02-03 | Security | Critical |
| [TC-007](test-cases/authentication.md#tc-007--registering-role-driver-is-refused) | Registering role DRIVER is refused | spec-02 | story-02 | AC-02-03 | Security | Critical |
| [TC-008](test-cases/authentication.md#tc-008--unknown-role-value-is-rejected-by-schema) | Unknown role value is rejected by schema | spec-02 | story-02 | AC-02-03 | API | High |
| [TC-009](test-cases/authentication.md#tc-009--mass-assignment-keys-are-stripped) | Mass-assignment keys are stripped | spec-02 | story-02 | AC-02-04 | Security | Critical |
| [TC-010](test-cases/authentication.md#tc-010--restaurant-registration-creates-the-pending-restaurant-shell) | Restaurant registration creates the pending restaurant shell | spec-02, spec-03 | story-02, story-03 | AC-02-01, AC-03-01 | API | High |
| [TC-011](test-cases/authentication.md#tc-011--restaurant-registration-rolls-back-entirely-on-failure) | Restaurant registration rolls back entirely on failure | spec-02 | story-02 | AC-02-01 | Service | Critical |
| [TC-012](test-cases/authentication.md#tc-012--login-with-valid-credentials-issues-a-token-pair) | Login with valid credentials issues a token pair | spec-02 | story-02 | AC-02-05 | API | Critical |
| [TC-013](test-cases/authentication.md#tc-013--login-with-the-wrong-password-is-refused) | Login with the wrong password is refused | spec-02 | story-02 | AC-02-05 | API | Critical |
| [TC-014](test-cases/authentication.md#tc-014--login-with-an-unknown-email-returns-the-identical-response) | Login with an unknown email returns the identical response | spec-02 | story-02 | AC-02-06 | Security | Critical |
| [TC-015](test-cases/authentication.md#tc-015--unknown-email-and-wrong-password-timings-are-comparable) | Unknown-email and wrong-password timings are comparable | spec-02 | story-02 | AC-02-06 | Security | High |
| [TC-016](test-cases/authentication.md#tc-016--suspended-user-cannot-log-in) | Suspended user cannot log in | spec-02 | story-02 | AC-02-07 | API | Critical |
| [TC-017](test-cases/authentication.md#tc-017--soft-deleted-user-cannot-log-in) | Soft-deleted user cannot log in | spec-02 | story-02 | — | API | High |
| [TC-018](test-cases/authentication.md#tc-018--login-is-rate-limited-per-ip-and-email) | Login is rate-limited per IP and email | spec-02 | story-02 | — | Security | High |
| [TC-019](test-cases/authentication.md#tc-019--a-valid-access-token-authenticates-a-request) | A valid access token authenticates a request | spec-02 | story-02 | — | API | Critical |
| [TC-020](test-cases/authentication.md#tc-020--an-expired-access-token-is-rejected-with-a-distinct-code) | An expired access token is rejected with a distinct code | spec-02 | story-02 | AC-02-09 | API | Critical |
| [TC-021](test-cases/authentication.md#tc-021--a-missing-token-is-rejected) | A missing token is rejected | spec-02 | story-02 | — | API | Critical |
| [TC-022](test-cases/authentication.md#tc-022--refresh-rotates-the-token-pair-and-invalidates-the-old-token) | Refresh rotates the token pair and invalidates the old token | spec-02 | story-02 | AC-02-09 | API | Critical |
| [TC-023](test-cases/authentication.md#tc-023--refresh-token-reuse-revokes-the-entire-family) | Refresh-token reuse revokes the entire family | spec-02 | story-02 | AC-02-10 | Security | Critical |
| [TC-024](test-cases/authentication.md#tc-024--refresh-tokens-are-stored-hashed-never-in-the-clear) | Refresh tokens are stored hashed, never in the clear | spec-02 | story-02 | — | Service | Critical |
| [TC-025](test-cases/authentication.md#tc-025--logout-revokes-the-presented-refresh-token-only) | Logout revokes the presented refresh token only | spec-02 | story-02 | — | API | High |
| [TC-026](test-cases/authentication.md#tc-026--changing-the-password-revokes-every-session) | Changing the password revokes every session | spec-02 | story-02 | AC-02-12 | Security | Critical |
| [TC-027](test-cases/authentication.md#tc-027--change-password-requires-the-correct-current-password) | Change-password requires the correct current password | spec-02 | story-02 | AC-02-12 | API | Critical |
| [TC-028](test-cases/authentication.md#tc-028--a-token-minted-before-suspension-stops-working-immediately) | A token minted before suspension stops working immediately | spec-02 | story-02, story-10 | AC-02-08 | Security | Critical |
| [TC-029](test-cases/authorization.md#tc-029--every-protected-endpoint-rejects-anonymous-callers) | Every protected endpoint rejects anonymous callers | spec-02 | story-02 | — | API | Critical |
| [TC-030](test-cases/authorization.md#tc-030--every-protected-endpoint-rejects-the-wrong-role) | Every protected endpoint rejects the wrong role | spec-02 | story-02 | — | API | Critical |
| [TC-031](test-cases/authorization.md#tc-031--default-deny-router-audit-no-route-lacks-a-guard) | Default-deny router audit: no route lacks a guard | spec-01, spec-02 | story-01, story-02 | — | Service | Critical |
| [TC-032](test-cases/authorization.md#tc-032--customer-cannot-reach-admin-endpoints) | Customer cannot reach admin endpoints | spec-10 | story-10 | AC-10-14 | Security | Critical |
| [TC-033](test-cases/authorization.md#tc-033--customer-cannot-manage-any-restaurants-menu) | Customer cannot manage any restaurant's menu | spec-04 | story-03 | — | Security | Critical |
| [TC-034](test-cases/authorization.md#tc-034--customer-cannot-perform-restaurant-order-transitions) | Customer cannot perform restaurant order transitions | spec-07 | story-07 | — | Security | Critical |
| [TC-035](test-cases/authorization.md#tc-035--customer-cannot-reach-driver-endpoints) | Customer cannot reach driver endpoints | spec-08 | story-08 | — | Security | Critical |
| [TC-036](test-cases/authorization.md#tc-036--customer-cannot-read-another-customers-order) | Customer cannot read another customer's order | spec-07 | story-06 | AC-06-17 | Security | Critical |
| [TC-037](test-cases/authorization.md#tc-037--customer-cannot-cancel-another-customers-order) | Customer cannot cancel another customer's order | spec-07 | story-06 | AC-06-17 | Security | Critical |
| [TC-038](test-cases/authorization.md#tc-038--customer-cannot-read-another-customers-address) | Customer cannot read another customer's address | spec-02 | story-02 | AC-02-15 | Security | Critical |
| [TC-039](test-cases/authorization.md#tc-039--customer-cannot-modify-another-customers-cart-line) | Customer cannot modify another customer's cart line | spec-06 | story-05 | AC-05-17 | Security | Critical |
| [TC-040](test-cases/authorization.md#tc-040--restaurant-cannot-read-or-modify-another-restaurants-profile) | Restaurant cannot read or modify another restaurant's profile | spec-03 | story-03 | — | Security | Critical |
| [TC-041](test-cases/authorization.md#tc-041--restaurant-cannot-manage-another-restaurants-menu-items) | Restaurant cannot manage another restaurant's menu items | spec-04 | story-03 | AC-03-17 | Security | Critical |
| [TC-042](test-cases/authorization.md#tc-042--restaurant-cannot-assign-its-item-to-another-restaurants-category) | Restaurant cannot assign its item to another restaurant's category | spec-04 | story-03 | AC-03-16 | API | High |
| [TC-043](test-cases/authorization.md#tc-043--restaurant-cannot-act-on-another-restaurants-order) | Restaurant cannot act on another restaurant's order | spec-07 | story-07 | AC-07-10 | Security | Critical |
| [TC-044](test-cases/authorization.md#tc-044--restaurant-cannot-reach-admin-or-driver-endpoints) | Restaurant cannot reach admin or driver endpoints | spec-08, spec-10 | story-08, story-10 | AC-10-14 | Security | Critical |
| [TC-045](test-cases/authorization.md#tc-045--restaurant-cannot-write-its-own-status-or-rating) | Restaurant cannot write its own status or rating | spec-03 | story-03 | — | Security | Critical |
| [TC-046](test-cases/authorization.md#tc-046--unapproved-restaurant-is-blocked-from-operational-routes) | Unapproved restaurant is blocked from operational routes | spec-03 | story-03 | AC-03-03 | API | High |
| [TC-047](test-cases/authorization.md#tc-047--driver-cannot-act-on-another-drivers-assignment) | Driver cannot act on another driver's assignment | spec-08 | story-08 | AC-08-15 | Security | Critical |
| [TC-048](test-cases/authorization.md#tc-048--driver-cannot-accept-an-offer-made-to-another-driver) | Driver cannot accept an offer made to another driver | spec-08 | story-08 | AC-08-15 | Security | Critical |
| [TC-049](test-cases/authorization.md#tc-049--driver-cannot-modify-restaurant-or-menu-data) | Driver cannot modify restaurant or menu data | spec-03, spec-04 | story-03 | — | Security | Critical |
| [TC-050](test-cases/authorization.md#tc-050--driver-cannot-reach-admin-endpoints) | Driver cannot reach admin endpoints | spec-10 | story-10 | AC-10-14 | Security | Critical |
| [TC-051](test-cases/authorization.md#tc-051--unapproved-or-suspended-driver-is-blocked-from-all-driver-routes) | Unapproved or suspended driver is blocked from all driver routes | spec-08 | story-08 | AC-08-02 | API | High |
| [TC-052](test-cases/authorization.md#tc-052--driver-cannot-set-availability-to-on_delivery) | Driver cannot set availability to ON_DELIVERY | spec-08 | story-08 | AC-08-11 | Security | High |
| [TC-053](test-cases/authorization.md#tc-053--admin-can-perform-every-administrative-operation) | Admin can perform every administrative operation | spec-10 | story-10 | AC-10-01 | API | High |
| [TC-054](test-cases/authorization.md#tc-054--admin-cannot-suspend-their-own-account) | Admin cannot suspend their own account | spec-10 | story-10 | — | API | High |
| [TC-055](test-cases/users.md#tc-055--authenticated-user-retrieves-their-own-profile) | Authenticated user retrieves their own profile | spec-02 | story-02 | — | API | High |
| [TC-056](test-cases/users.md#tc-056--get-apime-includes-the-role-specific-block) | `GET /api/me` includes the role-specific block | spec-02, spec-03, spec-08 | story-02 | — | API | High |
| [TC-057](test-cases/users.md#tc-057--profile-never-exposes-the-password-hash) | Profile never exposes the password hash | spec-02 | story-02 | — | Security | Critical |
| [TC-058](test-cases/users.md#tc-058--user-updates-their-own-name-and-phone) | User updates their own name and phone | spec-02 | story-02 | — | API | High |
| [TC-059](test-cases/users.md#tc-059--profile-update-ignores-email-role-and-status) | Profile update ignores email, role and status | spec-02 | story-02 | AC-02-04 | Security | Critical |
| [TC-060](test-cases/users.md#tc-060--profile-update-rejects-invalid-data) | Profile update rejects invalid data | spec-02 | story-02 | — | API | Medium |
| [TC-061](test-cases/users.md#tc-061--unauthenticated-profile-access-is-refused) | Unauthenticated profile access is refused | spec-02 | story-02 | — | API | Critical |
| [TC-062](test-cases/users.md#tc-062--first-address-becomes-the-default-automatically) | First address becomes the default automatically | spec-02 | story-02 | AC-02-13 | API | High |
| [TC-063](test-cases/users.md#tc-063--setting-a-new-default-clears-the-previous-one) | Setting a new default clears the previous one | spec-02 | story-02 | AC-02-14 | Service | High |
| [TC-064](test-cases/users.md#tc-064--concurrent-set-default-requests-cannot-create-two-defaults) | Concurrent set-default requests cannot create two defaults | spec-02 | story-02 | AC-02-14 | Service | Critical |
| [TC-065](test-cases/users.md#tc-065--setting-default-on-an-already-default-address-is-idempotent) | Setting default on an already-default address is idempotent | spec-02 | story-02 | — | API | Low |
| [TC-066](test-cases/users.md#tc-066--customer-lists-only-their-own-addresses) | Customer lists only their own addresses | spec-02 | story-02 | AC-02-15 | API | Critical |
| [TC-067](test-cases/users.md#tc-067--address-update-and-delete-are-scoped-to-the-owner) | Address update and delete are scoped to the owner | spec-02 | story-02 | AC-02-15 | Security | Critical |
| [TC-068](test-cases/users.md#tc-068--address-deletion-is-a-soft-delete) | Address deletion is a soft delete | spec-02 | story-02 | — | Service | High |
| [TC-069](test-cases/users.md#tc-069--deleting-an-address-referenced-by-an-order-leaves-the-order-intact) | Deleting an address referenced by an order leaves the order intact | spec-02, spec-07 | story-02, story-06 | — | Service | Critical |
| [TC-070](test-cases/users.md#tc-070--deleting-the-default-address-leaves-no-default) | Deleting the default address leaves no default | spec-02 | story-02 | — | API | Medium |
| [TC-071](test-cases/restaurants.md#tc-071--owner-retrieves-their-own-restaurant-profile) | Owner retrieves their own restaurant profile | spec-03 | story-03 | AC-03-01 | API | High |
| [TC-072](test-cases/restaurants.md#tc-072--newly-registered-restaurant-is-pending_approval-and-invisible) | Newly registered restaurant is PENDING_APPROVAL and invisible | spec-03 | story-03 | AC-03-01 | API | High |
| [TC-073](test-cases/restaurants.md#tc-073--pending-restaurant-can-edit-profile-and-hours) | Pending restaurant can edit profile and hours | spec-03 | story-03 | AC-03-02 | API | High |
| [TC-074](test-cases/restaurants.md#tc-074--owner-updates-profile-fields) | Owner updates profile fields | spec-03 | story-03 | — | API | Medium |
| [TC-075](test-cases/restaurants.md#tc-075--changing-the-restaurant-name-does-not-change-its-slug) | Changing the restaurant name does not change its slug | spec-03 | story-03 | — | Service | Medium |
| [TC-076](test-cases/restaurants.md#tc-076--slug-collisions-are-suffixed) | Slug collisions are suffixed | spec-03 | story-03 | — | Unit | Low |
| [TC-077](test-cases/restaurants.md#tc-077--invalid-restaurant-data-is-rejected) | Invalid restaurant data is rejected | spec-03 | story-03 | — | API | Medium |
| [TC-078](test-cases/restaurants.md#tc-078--owner-replaces-the-full-week-of-opening-hours) | Owner replaces the full week of opening hours | spec-03 | story-03 | — | API | High |
| [TC-079](test-cases/restaurants.md#tc-079--hours-payload-missing-a-day-is-rejected-atomically) | Hours payload missing a day is rejected atomically | spec-03 | story-03 | AC-03-07 | API | High |
| [TC-080](test-cases/restaurants.md#tc-080--duplicate-day-in-the-hours-payload-is-rejected) | Duplicate day in the hours payload is rejected | spec-03 | story-03 | — | API | Medium |
| [TC-081](test-cases/restaurants.md#tc-081--overnight-hours-are-rejected) | Overnight hours are rejected | spec-03 | story-03 | AC-03-08 | API | Medium |
| [TC-082](test-cases/restaurants.md#tc-082--equal-open-and-close-times-are-rejected) | Equal open and close times are rejected | spec-03 | story-03 | — | API | Low |
| [TC-083](test-cases/restaurants.md#tc-083--a-closed-day-needs-no-times) | A closed day needs no times | spec-03 | story-03 | — | API | Low |
| [TC-084](test-cases/restaurants.md#tc-084--orderability-truth-table) | Orderability truth table | spec-03 | story-03 | AC-03-09 | Unit | Critical |
| [TC-085](test-cases/restaurants.md#tc-085--orderability-boundary-minutes) | Orderability boundary minutes | spec-03 | story-03 | AC-03-09 | Unit | High |
| [TC-086](test-cases/restaurants.md#tc-086--toggling-accepting-orders-changes-orderability-immediately) | Toggling accepting-orders changes orderability immediately | spec-03 | story-03 | AC-03-09 | API | High |
| [TC-087](test-cases/restaurants.md#tc-087--accepting-orders-toggle-requires-an-active-restaurant) | Accepting-orders toggle requires an ACTIVE restaurant | spec-03 | story-03 | — | API | Medium |
| [TC-088](test-cases/restaurants.md#tc-088--admin-approval-makes-a-restaurant-visible-and-orderable) | Admin approval makes a restaurant visible and orderable | spec-03, spec-10 | story-03 | AC-03-04 | Integration | High |
| [TC-089](test-cases/restaurants.md#tc-089--approving-a-restaurant-with-no-available-items-is-refused) | Approving a restaurant with no available items is refused | spec-10 | story-03 | AC-03-05 | API | High |
| [TC-090](test-cases/restaurants.md#tc-090--rejection-reason-is-surfaced-to-the-owner) | Rejection reason is surfaced to the owner | spec-10 | story-03 | AC-03-06 | Integration | High |
| [TC-091](test-cases/menu.md#tc-091--owner-creates-a-category) | Owner creates a category | spec-04 | story-03 | — | API | High |
| [TC-092](test-cases/menu.md#tc-092--duplicate-category-name-in-one-restaurant-is-rejected-case-insensitively) | Duplicate category name in one restaurant is rejected case-insensitively | spec-04 | story-03 | AC-03-10 | API | High |
| [TC-093](test-cases/menu.md#tc-093--the-same-category-name-is-allowed-in-a-different-restaurant) | The same category name is allowed in a different restaurant | spec-04 | story-03 | AC-03-10 | API | Medium |
| [TC-094](test-cases/menu.md#tc-094--a-soft-deleted-category-name-can-be-reused) | A soft-deleted category name can be reused | spec-04 | story-03 | — | Service | Medium |
| [TC-095](test-cases/menu.md#tc-095--owner-updates-a-category) | Owner updates a category | spec-04 | story-03 | — | API | Medium |
| [TC-096](test-cases/menu.md#tc-096--deleting-a-non-empty-category-is-refused) | Deleting a non-empty category is refused | spec-04 | story-03 | AC-03-11 | API | High |
| [TC-097](test-cases/menu.md#tc-097--deleting-an-empty-category-succeeds-as-a-soft-delete) | Deleting an empty category succeeds as a soft delete | spec-04 | story-03 | — | Service | Medium |
| [TC-098](test-cases/menu.md#tc-098--deactivating-a-category-hides-its-items-without-changing-their-flags) | Deactivating a category hides its items without changing their flags | spec-04 | story-03 | AC-03-12 | Integration | High |
| [TC-099](test-cases/menu.md#tc-099--bulk-reorder-is-atomic) | Bulk reorder is atomic | spec-04 | story-03 | — | Service | Medium |
| [TC-100](test-cases/menu.md#tc-100--duplicate-displayorder-values-still-produce-deterministic-ordering) | Duplicate displayOrder values still produce deterministic ordering | spec-04 | story-03 | — | Service | Low |
| [TC-101](test-cases/menu.md#tc-101--owner-creates-a-food-item) | Owner creates a food item | spec-04 | story-03 | — | API | High |
| [TC-102](test-cases/menu.md#tc-102--duplicate-item-name-within-a-category-is-rejected) | Duplicate item name within a category is rejected | spec-04 | story-03 | — | API | Medium |
| [TC-103](test-cases/menu.md#tc-103--the-same-item-name-is-allowed-in-a-different-category) | The same item name is allowed in a different category | spec-04 | story-03 | — | API | Low |
| [TC-104](test-cases/menu.md#tc-104--price-boundary-values) | Price boundary values | spec-04 | story-03 | AC-03-14 | API | High |
| [TC-105](test-cases/menu.md#tc-105--price-is-stored-and-returned-as-an-exact-decimal-string) | Price is stored and returned as an exact decimal string | spec-04 | story-03 | — | Service | Critical |
| [TC-106](test-cases/menu.md#tc-106--item-name-and-description-length-boundaries) | Item name and description length boundaries | spec-04 | story-03 | — | API | Medium |
| [TC-107](test-cases/menu.md#tc-107--dangerous-image-url-schemes-are-rejected) | Dangerous image URL schemes are rejected | spec-04 | story-03 | AC-03-15 | Security | High |
| [TC-108](test-cases/menu.md#tc-108--cross-restaurant-category-assignment-is-refused) | Cross-restaurant category assignment is refused | spec-04 | story-03 | AC-03-16 | API | High |
| [TC-109](test-cases/menu.md#tc-109--another-restaurants-item-is-unreachable) | Another restaurant's item is unreachable | spec-04 | story-03 | AC-03-17 | Security | Critical |
| [TC-110](test-cases/menu.md#tc-110--availability-toggle-changes-only-availability) | Availability toggle changes only availability | spec-04 | story-03 | AC-03-13 | API | High |
| [TC-111](test-cases/menu.md#tc-111--an-unavailable-item-still-appears-on-the-public-menu-flagged) | An unavailable item still appears on the public menu, flagged | spec-04 | story-03, story-04 | AC-04-14 | API | High |
| [TC-112](test-cases/menu.md#tc-112--item-deletion-is-a-soft-delete-and-removes-it-from-the-public-menu) | Item deletion is a soft delete and removes it from the public menu | spec-04 | story-03 | — | Service | High |
| [TC-113](test-cases/menu.md#tc-113--owner-listing-includes-inactive-categories-and-unavailable-items) | Owner listing includes inactive categories and unavailable items | spec-04 | story-03 | — | API | Medium |
| [TC-114](test-cases/menu.md#tc-114--public-menu-fetch-issues-no-n1-queries) | Public menu fetch issues no N+1 queries | spec-04 | story-03 | — | Service | Medium |
| [TC-115](test-cases/discovery.md#tc-115--only-active-restaurants-appear-in-the-listing) | Only ACTIVE restaurants appear in the listing | spec-05 | story-04 | AC-04-01 | API | Critical |
| [TC-116](test-cases/discovery.md#tc-116--a-non-active-restaurant-is-404-by-direct-id) | A non-ACTIVE restaurant is 404 by direct ID | spec-05 | story-04 | AC-04-02 | Security | Critical |
| [TC-117](test-cases/discovery.md#tc-117--public-payloads-expose-no-owner-or-internal-data) | Public payloads expose no owner or internal data | spec-05 | story-04 | — | Security | High |
| [TC-118](test-cases/discovery.md#tc-118--pagination-metadata-is-correct-at-a-boundary) | Pagination metadata is correct at a boundary | spec-05 | story-04 | AC-04-03 | API | Medium |
| [TC-119](test-cases/discovery.md#tc-119--limit-is-capped-at-100) | Limit is capped at 100 | spec-05 | story-04 | AC-04-04 | API | Medium |
| [TC-120](test-cases/discovery.md#tc-120--a-page-beyond-the-last-returns-an-empty-list-not-404) | A page beyond the last returns an empty list, not 404 | spec-05 | story-04 | — | API | Low |
| [TC-121](test-cases/discovery.md#tc-121--negative-or-non-numeric-page-is-rejected) | Negative or non-numeric page is rejected | spec-05 | story-04 | — | API | Medium |
| [TC-122](test-cases/discovery.md#tc-122--cuisine-filter-returns-only-matching-restaurants) | Cuisine filter returns only matching restaurants | spec-05 | story-04 | — | API | Medium |
| [TC-123](test-cases/discovery.md#tc-123--invalid-cuisine-value-is-rejected) | Invalid cuisine value is rejected | spec-05 | story-04 | — | API | Low |
| [TC-124](test-cases/discovery.md#tc-124--opennow-filters-on-computed-orderability) | `openNow` filters on computed orderability | spec-05 | story-04 | AC-04-08 | Integration | High |
| [TC-125](test-cases/discovery.md#tc-125--the-sql-opennow-filter-agrees-with-the-js-orderability-function) | The SQL `openNow` filter agrees with the JS orderability function | spec-05 | story-04 | AC-04-06, AC-04-07 | Service | Critical |
| [TC-126](test-cases/discovery.md#tc-126--minimum-rating-filter) | Minimum-rating filter | spec-05 | story-04 | — | API | Medium |
| [TC-127](test-cases/discovery.md#tc-127--each-sort-option-orders-correctly) | Each sort option orders correctly | spec-05 | story-04 | — | API | Medium |
| [TC-128](test-cases/discovery.md#tc-128--unrated-restaurants-sort-last-under-rating-sort) | Unrated restaurants sort last under rating sort | spec-05 | story-04 | AC-04-05 | API | Medium |
| [TC-129](test-cases/discovery.md#tc-129--sort-parameter-is-allow-listed) | Sort parameter is allow-listed | spec-05 | story-04 | AC-04-12 | Security | Critical |
| [TC-130](test-cases/discovery.md#tc-130--combined-filters-apply-together) | Combined filters apply together | spec-05 | story-04 | — | API | Medium |
| [TC-131](test-cases/discovery.md#tc-131--no-matching-results-returns-an-empty-list) | No matching results returns an empty list | spec-05 | story-04 | AC-04-16 | API | Low |
| [TC-132](test-cases/discovery.md#tc-132--search-matches-partially-and-case-insensitively-across-both-groups) | Search matches partially and case-insensitively across both groups | spec-05 | story-04 | AC-04-09 | API | Medium |
| [TC-133](test-cases/discovery.md#tc-133--search-excludes-items-from-non-active-restaurants) | Search excludes items from non-ACTIVE restaurants | spec-05 | story-04 | AC-04-10 | Security | High |
| [TC-134](test-cases/discovery.md#tc-134--search-escapes-sql-wildcards-and-metacharacters) | Search escapes SQL wildcards and metacharacters | spec-05 | story-04 | AC-04-11 | Security | Critical |
| [TC-135](test-cases/cart.md#tc-135--first-add-creates-a-cart-and-binds-it-to-the-restaurant) | First add creates a cart and binds it to the restaurant | spec-06 | story-05 | AC-05-01 | API | High |
| [TC-136](test-cases/cart.md#tc-136--reading-a-cart-that-has-never-existed-returns-an-empty-cart) | Reading a cart that has never existed returns an empty cart | spec-06 | story-05 | AC-05-16 | API | High |
| [TC-137](test-cases/cart.md#tc-137--concurrent-first-adds-produce-exactly-one-cart) | Concurrent first adds produce exactly one cart | spec-06 | story-05 | AC-05-18 | Service | Critical |
| [TC-138](test-cases/cart.md#tc-138--adding-to-an-existing-cart-of-the-same-restaurant-succeeds) | Adding to an existing cart of the same restaurant succeeds | spec-06 | story-05 | — | API | High |
| [TC-139](test-cases/cart.md#tc-139--cross-restaurant-add-returns-a-conflict-with-both-restaurant-names) | Cross-restaurant add returns a conflict with both restaurant names | spec-06 | story-05 | AC-05-02 | API | Critical |
| [TC-140](test-cases/cart.md#tc-140--a-rejected-cross-restaurant-add-leaves-the-cart-byte-identical) | A rejected cross-restaurant add leaves the cart byte-identical | spec-06 | story-05 | AC-05-02 | Service | Critical |
| [TC-141](test-cases/cart.md#tc-141--replacetrue-clears-rebinds-and-adds-atomically) | `?replace=true` clears, rebinds and adds atomically | spec-06 | story-05 | AC-05-04 | Service | Critical |
| [TC-142](test-cases/cart.md#tc-142--replace-on-a-failing-add-does-not-empty-the-cart) | Replace on a failing add does not empty the cart | spec-06 | story-05 | — | Service | Critical |
| [TC-143](test-cases/cart.md#tc-143--emptying-the-cart-unbinds-the-restaurant) | Emptying the cart unbinds the restaurant | spec-06 | story-05 | AC-05-15 | API | High |
| [TC-144](test-cases/cart.md#tc-144--delete-apicart-empties-and-unbinds-idempotently) | `DELETE /api/cart` empties and unbinds, idempotently | spec-06 | story-05 | — | API | Medium |
| [TC-145](test-cases/cart.md#tc-145--adding-an-existing-item-increments-its-line) | Adding an existing item increments its line | spec-06 | story-05 | AC-05-05 | API | High |
| [TC-146](test-cases/cart.md#tc-146--increment-caps-at-20-rather-than-failing) | Increment caps at 20 rather than failing | spec-06 | story-05 | AC-05-06 | API | High |
| [TC-147](test-cases/cart.md#tc-147--quantity-boundary-values-on-add-and-update) | Quantity boundary values on add and update | spec-06 | story-05 | AC-05-07, AC-05-08 | API | High |
| [TC-148](test-cases/cart.md#tc-148--quantity-update-sets-an-absolute-value) | Quantity update sets an absolute value | spec-06 | story-05 | — | API | High |
| [TC-149](test-cases/cart.md#tc-149--removing-a-line-leaves-the-rest-intact) | Removing a line leaves the rest intact | spec-06 | story-05 | — | API | High |
| [TC-150](test-cases/cart.md#tc-150--an-unavailable-item-cannot-be-added) | An unavailable item cannot be added | spec-06 | story-05 | AC-05-09 | API | High |
| [TC-151](test-cases/cart.md#tc-151--an-item-in-an-inactive-category-cannot-be-added) | An item in an inactive category cannot be added | spec-06 | story-05 | — | API | High |
| [TC-152](test-cases/cart.md#tc-152--a-soft-deleted-item-cannot-be-added) | A soft-deleted item cannot be added | spec-06 | story-05 | — | API | High |
| [TC-153](test-cases/cart.md#tc-153--items-of-a-closed-or-paused-restaurant-cannot-be-added) | Items of a closed or paused restaurant cannot be added | spec-06 | story-05 | AC-05-10 | API | High |
| [TC-154](test-cases/cart.md#tc-154--the-cart-stores-no-price-column) | The cart stores no price column | spec-06 | story-05 | — | Service | Critical |
| [TC-155](test-cases/cart.md#tc-155--cart-reads-show-live-menu-prices) | Cart reads show live menu prices | spec-06 | story-05 | AC-05-11 | Integration | Critical |
| [TC-156](test-cases/cart.md#tc-156--a-price-change-raises-price_changed-and-blocks-checkout) | A price change raises PRICE_CHANGED and blocks checkout | spec-06 | story-05 | AC-05-11 | Integration | Critical |
| [TC-157](test-cases/cart.md#tc-157--an-item-becoming-unavailable-raises-item_unavailable-on-read) | An item becoming unavailable raises ITEM_UNAVAILABLE on read | spec-06 | story-05 | AC-05-12 | Integration | Critical |
| [TC-158](test-cases/cart.md#tc-158--a-deleted-item-disappears-from-the-cart) | A deleted item disappears from the cart | spec-06 | story-05 | AC-05-13 | Integration | High |
| [TC-159](test-cases/cart.md#tc-159--totals-are-computed-server-side-and-correctly) | Totals are computed server-side and correctly | spec-06 | story-05 | — | API | Critical |
| [TC-160](test-cases/cart.md#tc-160--tax-rounding-is-half-up-at-two-decimals) | Tax rounding is half-up at two decimals | spec-06 | story-05 | — | Unit | Critical |
| [TC-161](test-cases/cart.md#tc-161--below-minimum-cart-reports-the-shortfall-and-blocks-checkout) | Below-minimum cart reports the shortfall and blocks checkout | spec-06 | story-05 | AC-05-14 | API | High |
| [TC-162](test-cases/cart.md#tc-162--cancheckout-truth-table) | `canCheckout` truth table | spec-06 | story-05 | — | Unit | Critical |
| [TC-163](test-cases/cart.md#tc-163--cart-revalidation-issues-no-n1-queries) | Cart revalidation issues no N+1 queries | spec-06 | story-05 | — | Service | Medium |
| [TC-164](test-cases/cart.md#tc-164--another-customers-cart-line-is-unreachable) | Another customer's cart line is unreachable | spec-06 | story-05 | AC-05-17 | Security | Critical |
| [TC-165](test-cases/cart.md#tc-165--non-customer-roles-cannot-use-cart-endpoints) | Non-customer roles cannot use cart endpoints | spec-06 | story-05 | — | Security | Critical |
| [TC-166](test-cases/cart.md#tc-166--cart-survives-logout-and-login) | Cart survives logout and login | spec-06 | story-05 | — | Integration | Medium |
| [TC-167](test-cases/orders.md#tc-167--checkout-produces-correct-totals-from-a-two-line-cart) | Checkout produces correct totals from a two-line cart | spec-07, spec-06 | story-06 | AC-06-01 | API | Critical |
| [TC-168](test-cases/orders.md#tc-168--the-database-rejects-an-order-whose-total-does-not-reconcile) | The database rejects an order whose total does not reconcile | spec-07 | story-06 | — | Service | Critical |
| [TC-169](test-cases/orders.md#tc-169--the-database-rejects-a-line-total-that-does-not-reconcile) | The database rejects a line total that does not reconcile | spec-07 | story-06 | — | Service | Critical |
| [TC-170](test-cases/orders.md#tc-170--the-checkout-request-contains-no-prices) | The checkout request contains no prices | spec-07 | story-06 | AC-06-02 | Security | Critical |
| [TC-171](test-cases/orders.md#tc-171--client-supplied-totals-are-ignored) | Client-supplied totals are ignored | spec-07 | story-06 | AC-06-03 | Security | Critical |
| [TC-172](test-cases/orders.md#tc-172--menu-changes-after-checkout-never-alter-the-order) | Menu changes after checkout never alter the order | spec-07 | story-06 | AC-06-04 | Integration | Critical |
| [TC-173](test-cases/orders.md#tc-173--the-delivery-address-is-snapshotted) | The delivery address is snapshotted | spec-07 | story-06 | — | Integration | Critical |
| [TC-174](test-cases/orders.md#tc-174--the-delivery-fee-and-restaurant-name-are-snapshotted) | The delivery fee and restaurant name are snapshotted | spec-07 | story-06 | — | Integration | Critical |
| [TC-175](test-cases/orders.md#tc-175--order-number-format-and-uniqueness) | Order number format and uniqueness | spec-07 | story-06 | — | Unit | Medium |
| [TC-176](test-cases/orders.md#tc-176--checkout-with-an-empty-cart-is-refused) | Checkout with an empty cart is refused | spec-07 | story-06 | AC-06-05 | API | High |
| [TC-177](test-cases/orders.md#tc-177--checkout-with-an-unavailable-line-is-refused) | Checkout with an unavailable line is refused | spec-07 | story-06 | AC-06-06 | API | Critical |
| [TC-178](test-cases/orders.md#tc-178--checkout-below-the-minimum-order-amount-is-refused) | Checkout below the minimum order amount is refused | spec-07 | story-06 | AC-06-07 | API | High |
| [TC-179](test-cases/orders.md#tc-179--checkout-against-a-restaurant-that-closed-mid-session-is-refused) | Checkout against a restaurant that closed mid-session is refused | spec-07 | story-06 | AC-06-08 | Integration | High |
| [TC-180](test-cases/orders.md#tc-180--checkout-with-another-customers-address-is-refused) | Checkout with another customer's address is refused | spec-07 | story-06 | AC-06-09 | Security | Critical |
| [TC-181](test-cases/orders.md#tc-181--checkout-with-a-non-existent-or-malformed-address-id) | Checkout with a non-existent or malformed address ID | spec-07 | story-06 | — | API | Medium |
| [TC-182](test-cases/orders.md#tc-182--checkout-rejects-an-unsupported-payment-method) | Checkout rejects an unsupported payment method | spec-07 | story-06 | — | API | Medium |
| [TC-183](test-cases/orders.md#tc-183--a-failure-mid-checkout-leaves-nothing-behind) | A failure mid-checkout leaves nothing behind | spec-07 | story-06 | AC-06-11 | Service | Critical |
| [TC-184](test-cases/orders.md#tc-184--a-double-submitted-checkout-creates-exactly-one-order) | A double-submitted checkout creates exactly one order | spec-07 | story-06 | — | Service | Critical |
| [TC-185](test-cases/orders.md#tc-185--successful-checkout-converts-the-cart-and-allows-a-fresh-one) | Successful checkout converts the cart and allows a fresh one | spec-07 | story-06 | AC-06-10 | Integration | High |
| [TC-186](test-cases/orders.md#tc-186--a-customer-may-hold-several-open-orders-at-once) | A customer may hold several open orders at once | spec-07 | story-06 | — | Integration | Medium |
| [TC-187](test-cases/orders.md#tc-187--customer-lists-their-own-orders-with-activepast-scoping) | Customer lists their own orders with active/past scoping | spec-07 | story-06 | — | API | High |
| [TC-188](test-cases/orders.md#tc-188--order-detail-includes-items-totals-and-the-status-timeline) | Order detail includes items, totals and the status timeline | spec-07 | story-06 | — | API | High |
| [TC-189](test-cases/orders.md#tc-189--order-detail-is-scoped-to-the-owning-customer) | Order detail is scoped to the owning customer | spec-07 | story-06 | AC-06-17 | Security | Critical |
| [TC-190](test-cases/orders.md#tc-190--the-polling-endpoint-returns-a-minimal-payload) | The polling endpoint returns a minimal payload | spec-07 | story-06 | AC-06-19 | API | Medium |
| [TC-191](test-cases/orders.md#tc-191--driver-contact-appears-only-once-out-for-delivery) | Driver contact appears only once out for delivery | spec-07 | story-06 | — | Security | High |
| [TC-192](test-cases/orders.md#tc-192--an-unassigned-order-reports-a-dispatch-state-not-an-error) | An unassigned order reports a dispatch state, not an error | spec-07 | story-06 | AC-06-20 | API | High |
| [TC-193](test-cases/orders.md#tc-193--customer-cancels-a-pending-order) | Customer cancels a PENDING order | spec-07 | story-06 | AC-06-12 | API | Critical |
| [TC-194](test-cases/orders.md#tc-194--customer-cancels-a-confirmed-order) | Customer cancels a CONFIRMED order | spec-07 | story-06 | AC-06-13 | API | Critical |
| [TC-195](test-cases/orders.md#tc-195--customer-cannot-cancel-from-preparing-onward) | Customer cannot cancel from PREPARING onward | spec-07 | story-06 | AC-06-14, AC-06-15 | API | Critical |
| [TC-196](test-cases/orders.md#tc-196--the-accept-timeout-job-cancels-a-stale-pending-order-as-system) | The accept-timeout job cancels a stale PENDING order as SYSTEM | spec-07 | story-06 | AC-06-18 | Service | High |
| [TC-197](test-cases/order-state-machine.md#tc-197--the-implementations-transition-table-matches-the-sdd) | The implementation's transition table matches the SDD | spec-07 | story-06 | — | Unit | Critical |
| [TC-198](test-cases/order-state-machine.md#tc-198--all-245-status--status--role-combinations-are-adjudicated-correctly) | All 245 status × status × role combinations are adjudicated correctly | spec-07 | story-06 | — | Unit | Critical |
| [TC-199](test-cases/order-state-machine.md#tc-199--self-transitions-are-refused-for-every-status-and-actor) | Self-transitions are refused for every status and actor | spec-07 | story-06 | — | Unit | Critical |
| [TC-200](test-cases/order-state-machine.md#tc-200--terminal-states-permit-no-outgoing-transition) | Terminal states permit no outgoing transition | spec-07 | story-06 | AC-06-15, AC-07-09 | Unit | Critical |
| [TC-201](test-cases/order-state-machine.md#tc-201--status-skipping-is-refused) | Status skipping is refused | spec-07 | story-07 | AC-07-06 | API | Critical |
| [TC-202](test-cases/order-state-machine.md#tc-202--backwards-transitions-are-refused) | Backwards transitions are refused | spec-07 | story-07 | — | API | Critical |
| [TC-203](test-cases/order-state-machine.md#tc-203--t1-restaurant-accepts-a-pending-order) | T1: restaurant accepts a PENDING order | spec-07 | story-07 | AC-07-01 | API | Critical |
| [TC-204](test-cases/order-state-machine.md#tc-204--t3-restaurant-starts-preparing) | T3: restaurant starts preparing | spec-07 | story-07 | AC-07-04 | API | Critical |
| [TC-205](test-cases/order-state-machine.md#tc-205--t5-restaurant-marks-ready) | T5: restaurant marks ready | spec-07 | story-07 | AC-07-05 | API | Critical |
| [TC-206](test-cases/order-state-machine.md#tc-206--t7-assigned-driver-marks-pick-up) | T7: assigned driver marks pick-up | spec-07, spec-08 | story-08 | AC-08-13 | API | Critical |
| [TC-207](test-cases/order-state-machine.md#tc-207--t9-assigned-driver-marks-delivered) | T9: assigned driver marks delivered | spec-07, spec-08 | story-08 | AC-08-14 | Integration | Critical |
| [TC-208](test-cases/order-state-machine.md#tc-208--t2t4-customer-cancellation-at-both-permitted-points) | T2/T4: customer cancellation at both permitted points | spec-07 | story-06 | AC-06-12, AC-06-13 | API | Critical |
| [TC-209](test-cases/order-state-machine.md#tc-209--t2-restaurant-rejects-a-pending-order-with-a-reason) | T2: restaurant rejects a PENDING order with a reason | spec-07 | story-07 | AC-07-02 | API | Critical |
| [TC-210](test-cases/order-state-machine.md#tc-210--t4t6-restaurant-cancels-from-confirmed-and-preparing) | T4/T6: restaurant cancels from CONFIRMED and PREPARING | spec-07 | story-07 | AC-07-07, AC-07-11 | API | Critical |
| [TC-211](test-cases/order-state-machine.md#tc-211--t8t10-admin-force-cancels-late-stage-orders) | T8/T10: admin force-cancels late-stage orders | spec-07, spec-10 | story-10 | AC-10-06 | Integration | Critical |
| [TC-212](test-cases/order-state-machine.md#tc-212--customer-cannot-perform-restaurant-transitions) | Customer cannot perform restaurant transitions | spec-07 | story-06 | — | Security | Critical |
| [TC-213](test-cases/order-state-machine.md#tc-213--customer-cannot-cancel-at-preparing-even-though-the-edge-exists) | Customer cannot cancel at PREPARING even though the edge exists | spec-07 | story-06 | AC-06-14 | API | Critical |
| [TC-214](test-cases/order-state-machine.md#tc-214--restaurant-cannot-perform-driver-transitions) | Restaurant cannot perform driver transitions | spec-07 | story-07 | AC-07-08 | Security | Critical |
| [TC-215](test-cases/order-state-machine.md#tc-215--driver-cannot-perform-restaurant-transitions) | Driver cannot perform restaurant transitions | spec-07 | story-08 | — | Security | Critical |
| [TC-216](test-cases/order-state-machine.md#tc-216--driver-cannot-act-on-an-order-they-were-not-assigned) | Driver cannot act on an order they were not assigned | spec-08 | story-08 | AC-08-15 | Security | Critical |
| [TC-217](test-cases/order-state-machine.md#tc-217--driver-cannot-pick-up-before-the-order-is-ready) | Driver cannot pick up before the order is ready | spec-08 | story-08 | AC-08-12 | API | Critical |
| [TC-218](test-cases/order-state-machine.md#tc-218--driver-cannot-deliver-before-pick-up) | Driver cannot deliver before pick-up | spec-08 | story-08 | — | API | Critical |
| [TC-219](test-cases/order-state-machine.md#tc-219--restaurant-cannot-act-on-another-restaurants-order) | Restaurant cannot act on another restaurant's order | spec-07 | story-07 | AC-07-10 | Security | Critical |
| [TC-220](test-cases/order-state-machine.md#tc-220--reason-is-mandatory-for-restaurant-and-admin-cancellations) | Reason is mandatory for restaurant and admin cancellations | spec-07 | story-07, story-10 | AC-07-03, AC-10-08 | API | High |
| [TC-221](test-cases/order-state-machine.md#tc-221--customer-cancellation-defaults-its-reason) | Customer cancellation defaults its reason | spec-07 | story-06 | — | API | Medium |
| [TC-222](test-cases/order-state-machine.md#tc-222--the-database-refuses-a-cancellation-without-attribution) | The database refuses a cancellation without attribution | spec-07 | story-06 | — | Service | Critical |
| [TC-223](test-cases/order-state-machine.md#tc-223--every-transition-writes-exactly-one-status-event) | Every transition writes exactly one status event | spec-07 | story-06 | — | Service | Critical |
| [TC-224](test-cases/order-state-machine.md#tc-224--system-transitions-record-a-null-actor) | SYSTEM transitions record a null actor | spec-07 | story-06 | AC-06-18 | Service | High |
| [TC-225](test-cases/order-state-machine.md#tc-225--concurrent-transitions-are-serialized-by-the-row-lock) | Concurrent transitions are serialized by the row lock | spec-07 | story-06, story-07 | AC-06-16, AC-07-12 | Service | Critical |
| [TC-226](test-cases/order-state-machine.md#tc-226--two-staff-accepting-the-same-order-produce-one-transition) | Two staff accepting the same order produce one transition | spec-07 | story-07 | AC-07-12 | Service | Critical |
| [TC-227](test-cases/order-state-machine.md#tc-227--transitions-fire-the-correct-side-effects) | Transitions fire the correct side effects | spec-07 | story-07, story-08 | — | Service | Critical |
| [TC-228](test-cases/order-state-machine.md#tc-228--a-suspended-restaurant-can-still-complete-in-flight-orders) | A suspended restaurant can still complete in-flight orders | spec-07 | story-07 | AC-07-13 | Integration | High |
| [TC-229](test-cases/delivery.md#tc-229--admin-creates-a-driver-account-with-a-one-time-password) | Admin creates a driver account with a one-time password | spec-10 | story-08 | AC-08-01 | API | High |
| [TC-230](test-cases/delivery.md#tc-230--driver-self-registration-is-impossible) | Driver self-registration is impossible | spec-02 | story-08 | — | Security | Critical |
| [TC-231](test-cases/delivery.md#tc-231--a-pending_approval-driver-is-inert) | A PENDING_APPROVAL driver is inert | spec-08 | story-08 | AC-08-02 | API | High |
| [TC-232](test-cases/delivery.md#tc-232--admin-approval-activates-the-driver) | Admin approval activates the driver | spec-10 | story-08 | AC-08-03 | Integration | High |
| [TC-233](test-cases/delivery.md#tc-233--driver-updates-vehicle-details) | Driver updates vehicle details | spec-08 | story-08 | — | API | Medium |
| [TC-234](test-cases/delivery.md#tc-234--driver-toggles-availability) | Driver toggles availability | spec-08 | story-08 | — | API | High |
| [TC-235](test-cases/delivery.md#tc-235--availability-cannot-be-set-to-on_delivery-by-a-client) | Availability cannot be set to ON_DELIVERY by a client | spec-08 | story-08 | AC-08-11 | Security | High |
| [TC-236](test-cases/delivery.md#tc-236--driver-cannot-go-offline-during-an-active-delivery) | Driver cannot go offline during an active delivery | spec-08 | story-08 | AC-08-10 | API | High |
| [TC-237](test-cases/delivery.md#tc-237--driver-location-updates-are-validated) | Driver location updates are validated | spec-08 | story-08 | — | API | Medium |
| [TC-238](test-cases/delivery.md#tc-238--dispatch-begins-when-an-order-is-confirmed) | Dispatch begins when an order is confirmed | spec-08 | story-08 | AC-08-04 | Integration | High |
| [TC-239](test-cases/delivery.md#tc-239--only-active-and-available-drivers-are-candidates) | Only ACTIVE and AVAILABLE drivers are candidates | spec-08 | story-08 | — | Service | High |
| [TC-240](test-cases/delivery.md#tc-240--candidates-are-ranked-by-distance-with-null-locations-last) | Candidates are ranked by distance, with null locations last | spec-08 | story-08 | — | Unit | Medium |
| [TC-241](test-cases/delivery.md#tc-241--only-one-live-offer-exists-per-order) | Only one live offer exists per order | spec-08 | story-08 | — | Service | High |
| [TC-242](test-cases/delivery.md#tc-242--an-expired-offer-is-re-dispatched-to-a-different-driver) | An expired offer is re-dispatched to a different driver | spec-08 | story-08 | AC-08-07 | Integration | High |
| [TC-243](test-cases/delivery.md#tc-243--accepting-an-expired-offer-is-refused) | Accepting an expired offer is refused | spec-08 | story-08 | AC-08-07 | API | High |
| [TC-244](test-cases/delivery.md#tc-244--a-declined-offer-is-never-re-offered-to-the-same-driver) | A declined offer is never re-offered to the same driver | spec-08 | story-08 | AC-08-08 | Integration | High |
| [TC-245](test-cases/delivery.md#tc-245--accepting-an-offer-assigns-the-driver) | Accepting an offer assigns the driver | spec-08 | story-08 | AC-08-05 | API | Critical |
| [TC-246](test-cases/delivery.md#tc-246--two-drivers-accepting-the-same-offer-exactly-one-wins) | Two drivers accepting the same offer: exactly one wins | spec-08 | story-08 | AC-08-06 | Service | Critical |
| [TC-247](test-cases/delivery.md#tc-247--a-driver-cannot-hold-two-accepted-deliveries) | A driver cannot hold two accepted deliveries | spec-08 | story-08 | AC-08-09 | API | Critical |
| [TC-248](test-cases/delivery.md#tc-248--a-driver-on-a-delivery-receives-no-new-offers) | A driver on a delivery receives no new offers | spec-08 | story-08 | — | Integration | High |
| [TC-249](test-cases/delivery.md#tc-249--with-no-drivers-available-the-order-is-never-cancelled) | With no drivers available the order is never cancelled | spec-08 | story-08 | AC-08-18 | Integration | Critical |
| [TC-250](test-cases/delivery.md#tc-250--an-order-unassigned-past-15-minutes-escalates-to-the-admin-backlog) | An order unassigned past 15 minutes escalates to the admin backlog | spec-08 | story-08 | AC-08-18 | Integration | High |
| [TC-251](test-cases/delivery.md#tc-251--a-driver-coming-online-picks-up-a-waiting-order) | A driver coming online picks up a waiting order | spec-08 | story-08 | — | Integration | High |
| [TC-252](test-cases/delivery.md#tc-252--offers-disclose-distance-and-district-but-not-the-full-address) | Offers disclose distance and district but not the full address | spec-08 | story-08 | AC-08-16 | Security | Critical |
| [TC-253](test-cases/delivery.md#tc-253--an-accepted-delivery-discloses-what-the-driver-needs-and-nothing-more) | An accepted delivery discloses what the driver needs and nothing more | spec-08 | story-08 | AC-08-17 | Security | Critical |
| [TC-254](test-cases/delivery.md#tc-254--delivery-history-is-scoped-and-complete) | Delivery history is scoped and complete | spec-08 | story-08 | — | API | Medium |
| [TC-255](test-cases/reviews.md#tc-255--customer-reviews-a-delivered-order) | Customer reviews a delivered order | spec-09 | story-09 | AC-09-01 | API | High |
| [TC-256](test-cases/reviews.md#tc-256--a-non-delivered-order-is-not-reviewable) | A non-delivered order is not reviewable | spec-09 | story-09 | AC-09-02 | API | High |
| [TC-257](test-cases/reviews.md#tc-257--a-cancelled-order-is-never-reviewable) | A cancelled order is never reviewable | spec-09 | story-09 | AC-09-03 | API | High |
| [TC-258](test-cases/reviews.md#tc-258--one-review-per-order) | One review per order | spec-09 | story-09 | AC-09-04 | API | High |
| [TC-259](test-cases/reviews.md#tc-259--concurrent-double-submit-creates-exactly-one-review) | Concurrent double-submit creates exactly one review | spec-09 | story-09 | AC-09-05 | Service | Critical |
| [TC-260](test-cases/reviews.md#tc-260--only-the-orders-own-customer-may-review-it) | Only the order's own customer may review it | spec-09 | story-09 | AC-09-06 | Security | Critical |
| [TC-261](test-cases/reviews.md#tc-261--a-delivered-order-stays-reviewable-indefinitely) | A delivered order stays reviewable indefinitely | spec-09 | story-09 | — | Service | Low |
| [TC-262](test-cases/reviews.md#tc-262--restaurant-rating-boundary-values) | Restaurant rating boundary values | spec-09 | story-09 | AC-09-18 | API | High |
| [TC-263](test-cases/reviews.md#tc-263--driver-rating-requires-a-driver-on-the-order) | Driver rating requires a driver on the order | spec-09 | story-09 | AC-09-07 | API | High |
| [TC-264](test-cases/reviews.md#tc-264--the-database-enforces-the-driver-rating-rule) | The database enforces the driver-rating rule | spec-09 | story-09 | AC-09-07 | Service | Medium |
| [TC-265](test-cases/reviews.md#tc-265--driver-rating-updates-the-drivers-aggregate) | Driver rating updates the driver's aggregate | spec-09 | story-09 | AC-09-08 | Integration | High |
| [TC-266](test-cases/reviews.md#tc-266--comment-length-boundaries) | Comment length boundaries | spec-09 | story-09 | AC-09-17 | API | Medium |
| [TC-267](test-cases/reviews.md#tc-267--review-omits-no-required-traceability-fields) | Review omits no required traceability fields | spec-09 | story-09 | — | Service | Medium |
| [TC-268](test-cases/reviews.md#tc-268--edit-inside-24-hours-succeeds-and-recomputes) | Edit inside 24 hours succeeds and recomputes | spec-09 | story-09 | AC-09-09 | Integration | High |
| [TC-269](test-cases/reviews.md#tc-269--edit-after-24-hours-is-refused) | Edit after 24 hours is refused | spec-09 | story-09 | AC-09-10 | API | High |
| [TC-270](test-cases/reviews.md#tc-270--edit-window-boundary) | Edit-window boundary | spec-09 | story-09 | AC-09-09, AC-09-10 | Unit | Medium |
| [TC-271](test-cases/reviews.md#tc-271--another-customer-cannot-edit-a-review) | Another customer cannot edit a review | spec-09 | story-09 | — | Security | Critical |
| [TC-272](test-cases/reviews.md#tc-272--aggregate-arithmetic-across-a-review-set) | Aggregate arithmetic across a review set | spec-09 | story-09 | AC-09-11 | Unit | Critical |
| [TC-273](test-cases/reviews.md#tc-273--hiding-a-review-lowers-the-aggregate-and-removes-it-from-public-view) | Hiding a review lowers the aggregate and removes it from public view | spec-09, spec-10 | story-09, story-10 | AC-09-12, AC-10-10 | Integration | Critical |
| [TC-274](test-cases/reviews.md#tc-274--restoring-a-hidden-review-reverses-both-effects) | Restoring a hidden review reverses both effects | spec-09, spec-10 | story-09, story-10 | AC-09-13, AC-10-11 | Integration | Critical |
| [TC-275](test-cases/reviews.md#tc-275--a-restaurant-whose-only-review-is-hidden-returns-to-unrated) | A restaurant whose only review is hidden returns to unrated | spec-09 | story-09 | AC-09-14 | Integration | High |
| [TC-276](test-cases/reviews.md#tc-276--public-review-payloads-carry-no-pii-beyond-a-display-name) | Public review payloads carry no PII beyond a display name | spec-09 | story-09 | AC-09-15, AC-09-16 | Security | Critical |
| [TC-277](test-cases/admin.md#tc-277--admin-lists-and-filters-users) | Admin lists and filters users | spec-10 | story-10 | — | API | Medium |
| [TC-278](test-cases/admin.md#tc-278--suspending-a-user-revokes-sessions-and-blocks-the-live-token) | Suspending a user revokes sessions and blocks the live token | spec-10 | story-10 | AC-10-01 | Security | Critical |
| [TC-279](test-cases/admin.md#tc-279--reactivation-restores-access) | Reactivation restores access | spec-10 | story-10 | — | Integration | High |
| [TC-280](test-cases/admin.md#tc-280--admin-cannot-suspend-their-own-account) | Admin cannot suspend their own account | spec-10 | story-10 | AC-10-02 | API | High |
| [TC-281](test-cases/admin.md#tc-281--an-admin-can-suspend-a-different-admin) | An admin can suspend a different admin | spec-10 | story-10 | — | API | Medium |
| [TC-282](test-cases/admin.md#tc-282--suspension-requires-a-reason) | Suspension requires a reason | spec-10 | story-10 | — | API | Medium |
| [TC-283](test-cases/admin.md#tc-283--suspending-a-restaurant-hides-it-without-stranding-in-flight-orders) | Suspending a restaurant hides it without stranding in-flight orders | spec-10 | story-10 | AC-10-05 | Integration | Critical |
| [TC-284](test-cases/admin.md#tc-284--reactivating-a-restaurant-restores-visibility) | Reactivating a restaurant restores visibility | spec-10 | story-10 | — | Integration | High |
| [TC-285](test-cases/admin.md#tc-285--approving-an-already-active-restaurant-is-refused) | Approving an already-ACTIVE restaurant is refused | spec-10 | story-10 | — | API | Low |
| [TC-286](test-cases/admin.md#tc-286--a-rejected-restaurant-can-be-approved-later) | A rejected restaurant can be approved later | spec-10 | story-10 | — | Integration | Low |
| [TC-287](test-cases/admin.md#tc-287--suspending-a-driver-mid-delivery-is-refused) | Suspending a driver mid-delivery is refused | spec-10 | story-10 | AC-10-03 | API | High |
| [TC-288](test-cases/admin.md#tc-288--suspending-a-driver-who-only-holds-an-unaccepted-offer-succeeds) | Suspending a driver who only holds an unaccepted offer succeeds | spec-10 | story-10 | AC-10-04 | Integration | Medium |
| [TC-289](test-cases/admin.md#tc-289--driver-listing-supports-status-and-availability-filters) | Driver listing supports status and availability filters | spec-10 | story-10 | — | API | Medium |
| [TC-290](test-cases/admin.md#tc-290--duplicate-driver-email-is-refused) | Duplicate driver email is refused | spec-10 | story-10 | — | API | Medium |
| [TC-291](test-cases/admin.md#tc-291--admin-views-any-order-with-its-full-event-log) | Admin views any order with its full event log | spec-10 | story-10 | — | API | Medium |
| [TC-292](test-cases/admin.md#tc-292--admin-order-list-supports-filtering-by-status-restaurant-and-date) | Admin order list supports filtering by status, restaurant and date | spec-10 | story-10 | — | API | Medium |
| [TC-293](test-cases/admin.md#tc-293--force-cancel-releases-the-driver-and-cancels-the-assignment) | Force-cancel releases the driver and cancels the assignment | spec-10 | story-10 | AC-10-06 | Integration | Critical |
| [TC-294](test-cases/admin.md#tc-294--force-cancelling-a-terminal-order-is-refused) | Force-cancelling a terminal order is refused | spec-10 | story-10 | AC-10-07 | API | Critical |
| [TC-295](test-cases/admin.md#tc-295--the-stuck-order-view-surfaces-the-three-stuck-categories) | The stuck-order view surfaces the three stuck categories | spec-10 | story-10 | AC-10-13 | Integration | High |
| [TC-296](test-cases/admin.md#tc-296--gmv-counts-only-delivered-orders) | GMV counts only delivered orders | spec-10 | story-10 | AC-10-12 | Service | High |
| [TC-297](test-cases/admin.md#tc-297--status-breakdown-and-account-counts-match-the-fixture) | Status breakdown and account counts match the fixture | spec-10 | story-10 | AC-10-12 | Service | Medium |
| [TC-298](test-cases/admin.md#tc-298--average-delivery-time-is-computed-from-pickup-to-delivery) | Average delivery time is computed from pickup to delivery | spec-10 | story-10 | — | Unit | Medium |
| [TC-299](test-cases/admin.md#tc-299--every-mutating-admin-endpoint-writes-exactly-one-audit-row) | Every mutating admin endpoint writes exactly one audit row | spec-10 | story-10 | AC-10-09 | Service | Critical |
| [TC-300](test-cases/admin.md#tc-300--a-failed-admin-mutation-writes-no-audit-row) | A failed admin mutation writes no audit row | spec-10 | story-10 | AC-10-09 | Service | High |
| [TC-301](test-cases/validation.md#tc-301--unknown-keys-are-stripped-before-reaching-the-service) | Unknown keys are stripped before reaching the service | spec-01 | story-01 | AC-01-07 | Security | Critical |
| [TC-302](test-cases/validation.md#tc-302--controllers-never-read-unvalidated-input) | Controllers never read unvalidated input | spec-01 | story-01 | — | Service | Critical |
| [TC-303](test-cases/validation.md#tc-303--validation-errors-name-the-offending-field) | Validation errors name the offending field | spec-01 | story-01 | — | API | High |
| [TC-304](test-cases/validation.md#tc-304--malformed-json-is-handled-by-the-envelope) | Malformed JSON is handled by the envelope | spec-01 | story-01 | AC-01-05 | API | High |
| [TC-305](test-cases/validation.md#tc-305--oversized-bodies-are-rejected) | Oversized bodies are rejected | spec-01 | story-01 | — | Security | Medium |
| [TC-306](test-cases/validation.md#tc-306--type-confusion-is-rejected-rather-than-coerced-dangerously) | Type confusion is rejected rather than coerced dangerously | spec-01 | story-01 | — | Security | Critical |
| [TC-307](test-cases/validation.md#tc-307--malformed-uuids-are-rejected-cleanly) | Malformed UUIDs are rejected cleanly | spec-01 | story-01 | — | API | Medium |
| [TC-308](test-cases/validation.md#tc-308--empty-and-whitespace-only-strings-are-rejected-on-required-fields) | Empty and whitespace-only strings are rejected on required fields | spec-01 | story-02, story-03 | — | API | Medium |
| [TC-309](test-cases/validation.md#tc-309--missing-required-fields-are-reported-individually) | Missing required fields are reported individually | spec-01 | story-02 | — | API | Medium |
| [TC-310](test-cases/validation.md#tc-310--email-format-rules) | Email format rules | spec-02 | story-02 | — | API | Medium |
| [TC-311](test-cases/validation.md#tc-311--password-rules-including-the-bcrypt-ceiling) | Password rules including the bcrypt ceiling | spec-02 | story-02 | — | API | High |
| [TC-312](test-cases/validation.md#tc-312--phone-format) | Phone format | spec-02 | story-02 | — | API | Low |
| [TC-313](test-cases/validation.md#tc-313--address-field-rules) | Address field rules | spec-02 | story-02 | — | API | Medium |
| [TC-314](test-cases/validation.md#tc-314--monetary-field-rules) | Monetary field rules | spec-03, spec-04 | story-03 | AC-03-14 | API | High |
| [TC-315](test-cases/validation.md#tc-315--quantity-rules) | Quantity rules | spec-06 | story-05 | AC-05-07 | API | High |
| [TC-316](test-cases/validation.md#tc-316--rating-rules) | Rating rules | spec-09 | story-09 | AC-09-18 | API | Medium |
| [TC-317](test-cases/validation.md#tc-317--enum-fields-reject-unknown-values) | Enum fields reject unknown values | multiple | multiple | — | API | Medium |
| [TC-318](test-cases/validation.md#tc-318--text-length-ceilings) | Text length ceilings | multiple | multiple | AC-09-17 | API | Medium |
| [TC-319](test-cases/validation.md#tc-319--pagination-and-sort-parameters) | Pagination and sort parameters | spec-05 | story-04 | AC-04-04, AC-04-12 | API | High |
| [TC-320](test-cases/validation.md#tc-320--date-range-parameters) | Date-range parameters | spec-10 | story-10 | — | API | Low |
| [TC-321](test-cases/validation.md#tc-321--opening-hours-payload-rules) | Opening-hours payload rules | spec-03 | story-03 | AC-03-07, AC-03-08 | API | High |
| [TC-322](test-cases/validation.md#tc-322--frontend-and-backend-rules-agree) | Frontend and backend rules agree | spec-01 | story-02 | — | Unit | Medium |
| [TC-323](test-cases/security.md#tc-323--a-tampered-payload-is-rejected) | A tampered payload is rejected | spec-02 | story-02 | — | Security | Critical |
| [TC-324](test-cases/security.md#tc-324--an-alg-none-token-is-rejected) | An `alg: none` token is rejected | spec-02 | story-02 | — | Security | Critical |
| [TC-325](test-cases/security.md#tc-325--a-token-signed-with-the-wrong-secret-is-rejected) | A token signed with the wrong secret is rejected | spec-02 | story-02 | — | Security | Critical |
| [TC-326](test-cases/security.md#tc-326--issuer-and-audience-claims-are-verified) | Issuer and audience claims are verified | spec-02 | story-02 | — | Security | High |
| [TC-327](test-cases/security.md#tc-327--a-token-for-a-soft-deleted-user-is-rejected) | A token for a soft-deleted user is rejected | spec-02 | story-02 | — | Security | High |
| [TC-328](test-cases/security.md#tc-328--garbage-and-malformed-authorization-headers) | Garbage and malformed Authorization headers | spec-02 | story-02 | — | Security | Medium |
| [TC-329](test-cases/security.md#tc-329--sql-injection-through-search-is-inert) | SQL injection through search is inert | spec-05 | story-04 | AC-04-11 | Security | Critical |
| [TC-330](test-cases/security.md#tc-330--sql-injection-through-body-fields-is-inert) | SQL injection through body fields is inert | spec-01 | story-02 | — | Security | Critical |
| [TC-331](test-cases/security.md#tc-331--injection-through-path-and-query-identifiers-is-inert) | Injection through path and query identifiers is inert | spec-01 | story-01 | — | Security | High |
| [TC-332](test-cases/security.md#tc-332--stored-xss-payloads-are-returned-as-data-not-markup) | Stored XSS payloads are returned as data, not markup | spec-09 | story-09 | AC-09-16 | Security | Critical |
| [TC-333](test-cases/security.md#tc-333--no-v-html-anywhere-in-user-content-rendering) | No `v-html` anywhere in user-content rendering | spec-09 | story-09 | — | Security | Critical |
| [TC-334](test-cases/security.md#tc-334--dangerous-url-schemes-cannot-be-stored-in-image-fields) | Dangerous URL schemes cannot be stored in image fields | spec-04 | story-03 | AC-03-15 | Security | High |
| [TC-335](test-cases/security.md#tc-335--no-endpoint-ever-returns-a-password-hash) | No endpoint ever returns a password hash | spec-02 | story-02 | — | Security | Critical |
| [TC-336](test-cases/security.md#tc-336--cross-role-pii-boundaries-hold) | Cross-role PII boundaries hold | multiple | story-07, story-08, story-09 | AC-08-16, AC-08-17, AC-09-15 | Security | Critical |
| [TC-337](test-cases/security.md#tc-337--phone-masking-happens-server-side) | Phone masking happens server-side | spec-08 | story-08 | AC-08-17 | Security | High |
| [TC-338](test-cases/security.md#tc-338--error-responses-leak-no-internals) | Error responses leak no internals | spec-01 | story-01 | AC-01-06 | Security | High |
| [TC-339](test-cases/security.md#tc-339--ownership-failures-return-404-not-403) | Ownership failures return 404, not 403 | multiple | multiple | AC-02-15, AC-06-17, AC-07-10 | Security | Critical |
| [TC-340](test-cases/security.md#tc-340--security-headers-are-present) | Security headers are present | spec-01 | story-01 | — | Security | Medium |
| [TC-341](test-cases/security.md#tc-341--cors-allows-only-configured-origins) | CORS allows only configured origins | spec-01 | story-01 | — | Security | High |
| [TC-342](test-cases/security.md#tc-342--a-wildcard-cors-origin-is-impossible-in-production) | A wildcard CORS origin is impossible in production | spec-01 | story-01 | AC-01-08 | Security | High |
| [TC-343](test-cases/security.md#tc-343--a-weak-jwt-secret-prevents-boot) | A weak JWT secret prevents boot | spec-01 | story-01 | AC-01-08 | Security | Critical |
| [TC-344](test-cases/security.md#tc-344--authentication-endpoints-are-rate-limited) | Authentication endpoints are rate-limited | spec-02 | story-02 | — | Security | High |
| [TC-345](test-cases/security.md#tc-345--secrets-never-appear-in-logs) | Secrets never appear in logs | spec-01 | story-01 | — | Security | Critical |
| [TC-346](test-cases/security.md#tc-346--dependency-audit-is-clean-at-high-and-critical) | Dependency audit is clean at high and critical | spec-01 | story-01 | — | Security | Medium |
| [TC-347](test-cases/edge-cases.md#tc-347--restaurant-is-suspended-while-a-customer-holds-its-items) | Restaurant is suspended while a customer holds its items | spec-06, spec-03 | story-05 | — | Integration | High |
| [TC-348](test-cases/edge-cases.md#tc-348--restaurant-closes-for-the-day-between-cart-and-checkout) | Restaurant closes for the day between cart and checkout | spec-06 | story-05, story-06 | AC-06-08 | Integration | High |
| [TC-349](test-cases/edge-cases.md#tc-349--item-becomes-unavailable-between-cart-and-checkout) | Item becomes unavailable between cart and checkout | spec-06 | story-05, story-06 | AC-05-12, AC-06-06 | Integration | Critical |
| [TC-350](test-cases/edge-cases.md#tc-350--price-changes-between-adding-and-checking-out) | Price changes between adding and checking out | spec-06 | story-05 | AC-05-11 | Integration | Critical |
| [TC-351](test-cases/edge-cases.md#tc-351--item-is-deleted-while-sitting-in-a-cart) | Item is deleted while sitting in a cart | spec-04, spec-06 | story-05 | AC-05-13 | Integration | High |
| [TC-352](test-cases/edge-cases.md#tc-352--category-is-deactivated-while-its-item-is-in-a-cart) | Category is deactivated while its item is in a cart | spec-04, spec-06 | story-05 | — | Integration | Medium |
| [TC-353](test-cases/edge-cases.md#tc-353--two-tabs-add-from-different-restaurants-simultaneously) | Two tabs add from different restaurants simultaneously | spec-06 | story-05 | AC-05-18 | Service | Critical |
| [TC-354](test-cases/edge-cases.md#tc-354--customer-cancels-at-the-exact-moment-the-restaurant-accepts) | Customer cancels at the exact moment the restaurant accepts | spec-07 | story-06 | AC-06-16 | Service | Critical |
| [TC-355](test-cases/edge-cases.md#tc-355--checkout-is-submitted-twice-in-rapid-succession) | Checkout is submitted twice in rapid succession | spec-07 | story-06 | — | Service | Critical |
| [TC-356](test-cases/edge-cases.md#tc-356--restaurant-rejects-an-order-the-customer-is-already-cancelling) | Restaurant rejects an order the customer is already cancelling | spec-07 | story-06, story-07 | — | Service | High |
| [TC-357](test-cases/edge-cases.md#tc-357--admin-force-cancels-while-the-driver-marks-delivered) | Admin force-cancels while the driver marks delivered | spec-07, spec-10 | story-10 | — | Service | Critical |
| [TC-358](test-cases/edge-cases.md#tc-358--restaurant-is-suspended-mid-order) | Restaurant is suspended mid-order | spec-07, spec-10 | story-07 | AC-07-13 | Integration | High |
| [TC-359](test-cases/edge-cases.md#tc-359--customer-account-is-suspended-with-an-order-in-flight) | Customer account is suspended with an order in flight | spec-07, spec-10 | story-10 | — | Integration | High |
| [TC-360](test-cases/edge-cases.md#tc-360--driver-accepts-at-the-exact-moment-the-offer-expires) | Driver accepts at the exact moment the offer expires | spec-08 | story-08 | AC-08-07 | Service | High |
| [TC-361](test-cases/edge-cases.md#tc-361--order-is-cancelled-while-a-driver-holds-it) | Order is cancelled while a driver holds it | spec-08 | story-08 | AC-08-19 | Integration | High |
| [TC-362](test-cases/edge-cases.md#tc-362--driver-never-marks-an-order-delivered) | Driver never marks an order delivered | spec-08, spec-10 | story-08 | — | Integration | Medium |
| [TC-363](test-cases/edge-cases.md#tc-363--every-eligible-driver-declines) | Every eligible driver declines | spec-08 | story-08 | AC-08-08, AC-08-18 | Integration | High |
| [TC-364](test-cases/edge-cases.md#tc-364--historical-order-survives-deletion-of-everything-it-referenced) | Historical order survives deletion of everything it referenced | spec-07 | story-06 | AC-06-04 | Integration | Critical |
| [TC-365](test-cases/edge-cases.md#tc-365--reviewing-remains-possible-after-the-restaurant-is-suspended) | Reviewing remains possible after the restaurant is suspended | spec-09 | story-09 | — | Integration | Medium |
| [TC-366](test-cases/edge-cases.md#tc-366--a-search-that-matches-nothing-is-not-an-error) | A search that matches nothing is not an error | spec-05 | story-04 | AC-04-16 | API | Low |
| [TC-367](test-cases/edge-cases.md#tc-367--a-cart-left-idle-for-days-is-still-usable) | A cart left idle for days is still usable | spec-06 | story-05 | — | Integration | Medium |
| [TC-368](test-cases/edge-cases.md#tc-368--api-failure-mid-journey-leaves-no-partial-state) | API failure mid-journey leaves no partial state | spec-07 | story-06 | AC-06-11 | Integration | Critical |
| [TC-369](test-cases/frontend.md#tc-369--concurrent-401s-trigger-exactly-one-refresh) | Concurrent 401s trigger exactly one refresh | spec-02 | story-02 | AC-02-11 | Unit | Critical |
| [TC-370](test-cases/frontend.md#tc-370--a-failed-refresh-logs-out-and-redirects) | A failed refresh logs out and redirects | spec-02 | story-02 | — | Unit | High |
| [TC-371](test-cases/frontend.md#tc-371--token_expired-refreshes-while-token_invalid-logs-out) | `TOKEN_EXPIRED` refreshes while `TOKEN_INVALID` logs out | spec-02 | story-02 | AC-02-09 | Unit | High |
| [TC-372](test-cases/frontend.md#tc-372--the-envelope-is-unwrapped-and-errors-become-typed) | The envelope is unwrapped and errors become typed | spec-01 | story-01 | AC-01-10 | Unit | High |
| [TC-373](test-cases/frontend.md#tc-373--the-auth-store-restores-and-clears-a-session) | The auth store restores and clears a session | spec-02 | story-02 | — | Unit | High |
| [TC-374](test-cases/frontend.md#tc-374--protected-routes-redirect-with-a-return-path) | Protected routes redirect with a return path | spec-02 | story-02 | AC-02-16 | Component | High |
| [TC-375](test-cases/frontend.md#tc-375--a-wrong-role-visit-renders-a-403-view-not-a-silent-redirect) | A wrong-role visit renders a 403 view, not a silent redirect | spec-02 | story-02 | — | Component | High |
| [TC-376](test-cases/frontend.md#tc-376--guests-are-bounced-from-auth-only-for-guests-routes) | Guests are bounced from auth-only-for-guests routes | spec-02 | story-02 | — | Component | Medium |
| [TC-377](test-cases/frontend.md#tc-377--each-role-sees-only-its-own-navigation) | Each role sees only its own navigation | spec-02 | story-02 | — | Component | Medium |
| [TC-378](test-cases/frontend.md#tc-378--a-pending-restaurant-sees-disabled-navigation-with-a-reason) | A pending restaurant sees disabled navigation with a reason | spec-03 | story-03 | AC-03-02, AC-03-03 | Component | High |
| [TC-379](test-cases/frontend.md#tc-379--registration-form-validates-before-submitting) | Registration form validates before submitting | spec-02 | story-02 | — | Component | High |
| [TC-380](test-cases/frontend.md#tc-380--server-validation-errors-map-back-onto-form-fields) | Server validation errors map back onto form fields | spec-01 | story-02 | — | Component | High |
| [TC-381](test-cases/frontend.md#tc-381--duplicate-email-conflict-is-surfaced-on-the-email-field) | Duplicate-email conflict is surfaced on the email field | spec-02 | story-02 | AC-02-02 | Component | Medium |
| [TC-382](test-cases/frontend.md#tc-382--the-cart-store-mirrors-the-server-and-computes-nothing) | The cart store mirrors the server and computes nothing | spec-06 | story-05 | — | Unit | Critical |
| [TC-383](test-cases/frontend.md#tc-383--the-switch-restaurant-dialog-appears-on-conflict-and-defaults-to-keeping-the-cart) | The switch-restaurant dialog appears on conflict and defaults to keeping the cart | spec-06 | story-05 | AC-05-03 | Component | Critical |
| [TC-384](test-cases/frontend.md#tc-384--dismissing-the-dialog-changes-nothing) | Dismissing the dialog changes nothing | spec-06 | story-05 | AC-05-03 | Component | Critical |
| [TC-385](test-cases/frontend.md#tc-385--confirming-the-switch-retries-with-replacetrue) | Confirming the switch retries with `replace=true` | spec-06 | story-05 | AC-05-04 | Component | Critical |
| [TC-386](test-cases/frontend.md#tc-386--quantity-stepper-is-bounded-with-an-accessible-explanation) | Quantity stepper is bounded with an accessible explanation | spec-06 | story-05 | AC-05-07 | Component | High |
| [TC-387](test-cases/frontend.md#tc-387--the-checkout-button-states-why-it-is-disabled) | The checkout button states why it is disabled | spec-06 | story-05 | AC-05-14 | Component | High |
| [TC-388](test-cases/frontend.md#tc-388--an-unavailable-item-cannot-be-added-from-the-menu) | An unavailable item cannot be added from the menu | spec-04 | story-04 | AC-04-14 | Component | High |
| [TC-389](test-cases/frontend.md#tc-389--the-cancel-control-appears-only-in-the-cancellable-window) | The cancel control appears only in the cancellable window | spec-07 | story-06 | AC-06-14 | Component | High |
| [TC-390](test-cases/frontend.md#tc-390--the-action-bar-offers-only-transitions-legal-for-the-current-status) | The action bar offers only transitions legal for the current status | spec-07 | story-07 | AC-07-16 | Component | High |
| [TC-391](test-cases/frontend.md#tc-391--polling-starts-pauses-stops-and-backs-off) | Polling starts, pauses, stops and backs off | spec-07 | story-06 | AC-06-19 | Unit | High |
| [TC-392](test-cases/frontend.md#tc-392--loading-empty-and-error-states-are-distinct) | Loading, empty and error states are distinct | spec-05 | story-04 | AC-04-16 | Component | Medium |
| [TC-393](e2e-scenarios.md#tc-393--full-order-journey-customer-to-review) | Full order journey, customer to review | all | story-02, 03, 04, 05, 06, 07, 08, 09 | AC-06-01, AC-07-01, AC-08-05, AC-09-01 | E2E | Critical |
| [TC-394](e2e-scenarios.md#tc-394--restaurant-journey-onboarding-through-fulfilment) | Restaurant journey: onboarding through fulfilment | spec-02, 03, 04, 07, 10 | story-03, story-07 | AC-03-01, AC-03-04, AC-07-01 | E2E | Critical |
| [TC-395](e2e-scenarios.md#tc-395--driver-journey-provisioning-through-delivery) | Driver journey: provisioning through delivery | spec-02, 08, 10 | story-08 | AC-08-01, AC-08-03, AC-08-05, AC-08-13, AC-08-14 | E2E | Critical |
| [TC-396](e2e-scenarios.md#tc-396--admin-journey-dashboard-through-intervention) | Admin journey: dashboard through intervention | spec-10 | story-10 | AC-10-01, AC-10-06, AC-10-10, AC-10-12 | E2E | High |
| [TC-397](e2e-scenarios.md#tc-397--cart-restaurant-switch-confirmed) | Cart restaurant switch, confirmed | spec-06 | story-05 | AC-05-02, AC-05-04 | E2E | Critical |
| [TC-398](e2e-scenarios.md#tc-398--customer-cancellation-window-closes-at-preparation) | Customer cancellation window closes at preparation | spec-07 | story-06 | AC-06-12, AC-06-14 | E2E | Critical |
| [TC-399](e2e-scenarios.md#tc-399--restaurant-rejection-reaches-the-customer-with-its-reason) | Restaurant rejection reaches the customer with its reason | spec-07 | story-07 | AC-07-02 | E2E | High |
| [TC-400](e2e-scenarios.md#tc-400--no-driver-available-leaves-the-order-intact) | No driver available leaves the order intact | spec-08 | story-08 | AC-08-18 | E2E | Critical |
| [TC-401](e2e-scenarios.md#tc-401--a-menu-price-change-does-not-alter-a-placed-order) | A menu price change does not alter a placed order | spec-07 | story-06 | AC-06-04 | E2E | Critical |
| [TC-402](e2e-scenarios.md#tc-402--restaurant-approval-gates-visibility) | Restaurant approval gates visibility | spec-03, spec-10 | story-03 | AC-03-04 | E2E | High |
| [TC-403](e2e-scenarios.md#tc-403--one-driver-cannot-hold-two-deliveries) | One driver cannot hold two deliveries | spec-08 | story-08 | AC-08-09, AC-08-10 | E2E | High |
| [TC-404](e2e-scenarios.md#tc-404--admin-suspension-removes-a-restaurant-without-stranding-orders) | Admin suspension removes a restaurant without stranding orders | spec-10 | story-10 | AC-10-05 | E2E | High |
| [TC-405](e2e-scenarios.md#tc-405--review-moderation-changes-the-public-rating) | Review moderation changes the public rating | spec-09, spec-10 | story-09, story-10 | AC-09-12, AC-09-13 | E2E | High |
| [TC-406](e2e-scenarios.md#tc-406--responsive-and-accessible-smoke-pass) | Responsive and accessible smoke pass | all | story-04 – story-10 | — | E2E / A11y | High |
| [TC-407](test-cases/platform-foundation.md#tc-407--a-fresh-clone-runs-end-to-end) | A fresh clone runs end to end | spec-01 | story-01 | AC-01-01 | Integration | High |
| [TC-408](test-cases/platform-foundation.md#tc-408--health-endpoint-reports-a-healthy-system) | Health endpoint reports a healthy system | spec-01 | story-01 | AC-01-02 | API | High |
| [TC-409](test-cases/platform-foundation.md#tc-409--health-endpoint-reports-a-degraded-system) | Health endpoint reports a degraded system | spec-01 | story-01 | AC-01-03 | Integration | High |
| [TC-410](test-cases/platform-foundation.md#tc-410--every-response-carries-a-correlation-id) | Every response carries a correlation ID | spec-01 | story-01 | AC-01-04 | API | High |
| [TC-411](test-cases/platform-foundation.md#tc-411--the-frontend-renders-its-own-not-found-view) | The frontend renders its own not-found view | spec-01 | story-01 | AC-01-09 | Component | Medium |
| [TC-412](test-cases/platform-foundation.md#tc-412--withtransaction-reuses-a-passed-transaction) | `withTransaction` reuses a passed transaction | spec-01 | story-01 | — | Unit | Critical |
| [TC-413](test-cases/platform-foundation.md#tc-413--postgresql-enums-and-javascript-constants-stay-in-sync) | PostgreSQL enums and JavaScript constants stay in sync | spec-01 | story-01 | — | Service | High |
| [TC-414](test-cases/discovery.md#tc-414--an-inactive-category-is-hidden-from-the-customer-facing-menu) | An inactive category is hidden from the customer-facing menu | spec-05, spec-04 | story-04 | AC-04-13 | API | High |
| [TC-415](test-cases/discovery.md#tc-415--filter-state-round-trips-through-the-url) | Filter state round-trips through the URL | spec-05 | story-04 | AC-04-15 | Component | Medium |
| [TC-416](test-cases/restaurants.md#tc-416--an-unapproved-restaurants-order-screens-are-disabled-and-refused) | An unapproved restaurant's order screens are disabled and refused | spec-03, spec-07 | story-07 | AC-07-14 | Integration | High |
| [TC-417](test-cases/restaurants.md#tc-417--a-new-order-appears-in-the-queue-within-one-polling-interval) | A new order appears in the queue within one polling interval | spec-07 | story-07 | AC-07-15 | Integration | Medium |
| [TC-418](test-cases/admin.md#tc-418--destructive-admin-actions-require-a-stated-reason-before-confirming) | Destructive admin actions require a stated reason before confirming | spec-10 | story-10 | AC-10-15 | Component | High |
| [TC-419](test-cases/platform-foundation.md#tc-419--cuisine-list-reflects-only-cuisines-with-active-restaurants) | Cuisine list reflects only cuisines with active restaurants | spec-05 | story-04 | — | API | Medium |
| [TC-420](test-cases/platform-foundation.md#tc-420--customer-lists-their-own-reviews) | Customer lists their own reviews | spec-09 | story-09 | — | API | Medium |
| [TC-421](test-cases/platform-foundation.md#tc-421--restaurant-reads-its-own-received-reviews) | Restaurant reads its own received reviews | spec-09 | story-09 | — | API | Medium |
| [TC-422](test-cases/platform-foundation.md#tc-422--driver-reads-their-own-received-ratings) | Driver reads their own received ratings | spec-09 | story-09 | — | API | Medium |
| [TC-423](test-cases/platform-foundation.md#tc-423--restaurant-dashboard-statistics-are-scoped-and-correct) | Restaurant dashboard statistics are scoped and correct | spec-03 | story-03 | — | Service | Medium |
| [TC-424](test-cases/platform-foundation.md#tc-424--admin-audit-log-is-queryable-and-append-only) | Admin audit log is queryable and append-only | spec-10 | story-10 | AC-10-09 | API | High |
