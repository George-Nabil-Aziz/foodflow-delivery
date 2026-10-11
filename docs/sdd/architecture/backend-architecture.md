# Backend Architecture

> Parent: [master-sdd.md](../master-sdd.md) · Node.js 20 LTS · Express 4 · Knex · PostgreSQL 16 · Zod

## 1. Directory structure

```text
backend/
├── src/
│   ├── app.js                      # express app assembly (no listen)
│   ├── server.js                   # config load, db connect, listen, jobs, shutdown
│   ├── config/
│   │   ├── index.js                # Zod-validated env → frozen config object
│   │   └── knexfile.js
│   ├── shared/
│   │   ├── db/
│   │   │   ├── knex.js             # pool, NUMERIC parser override
│   │   │   └── transaction.js      # withTransaction(fn, trx?) — reuses a passed trx
│   │   ├── errors/
│   │   │   ├── AppError.js         # base + ValidationError, NotFoundError,
│   │   │   │                       #   ConflictError, ForbiddenError, UnauthorizedError
│   │   │   ├── codes.js            # the single error-code registry
│   │   │   └── pgErrorMapper.js    # 23505/23503/23514 → AppError
│   │   ├── http/
│   │   │   ├── envelope.js         # ok(data, meta), fail(error, meta)
│   │   │   └── pagination.js       # parse + meta builder
│   │   ├── logger.js               # pino, redacts password/token fields
│   │   ├── money.js                # add/multiply/round on minor units
│   │   ├── constants.js            # enum mirrors of the DB types
│   │   └── jwt.js                  # sign/verify access tokens
│   ├── middleware/
│   │   ├── requestId.js
│   │   ├── authenticate.js
│   │   ├── authorize.js
│   │   ├── validate.js
│   │   ├── rateLimiters.js
│   │   ├── notFound.js
│   │   └── errorHandler.js         # terminal handler
│   ├── modules/
│   │   ├── auth/       { auth.routes.js, auth.controller.js, auth.service.js,
│   │   │                 auth.repository.js, auth.schemas.js, auth.mapper.js, index.js }
│   │   ├── users/      { … , addresses.service.js }
│   │   ├── restaurants/{ … , hours.service.js, orderability.js }
│   │   ├── menu/       { … , categories.service.js, items.service.js }
│   │   ├── discovery/  { discovery.routes.js, discovery.controller.js, discovery.service.js,
│   │   │                 discovery.repository.js }
│   │   ├── cart/       { … , cartValidator.js }
│   │   ├── orders/     { … , orderStateMachine.js, orderPricing.js, orderNumber.js }
│   │   ├── delivery/   { … , dispatchService.js, offerService.js }
│   │   ├── reviews/    { … , ratingAggregator.js }
│   │   └── admin/      { … , stats.service.js, audit.service.js }
│   ├── jobs/
│   │   ├── index.js                # registry + start/stop
│   │   ├── runLocked.js            # pg_try_advisory_lock wrapper
│   │   ├── dispatch.job.js
│   │   ├── offerExpiry.job.js
│   │   ├── orderTimeout.job.js
│   │   └── unassignedEscalation.job.js
│   └── routes.js                   # mounts every module router under /api
├── migrations/
├── seeds/
└── tests/
    ├── unit/
    ├── integration/
    ├── helpers/                    # db reset, auth factories, fixtures
    └── setup.js
```

Files are split by responsibility, not by layer-wide dumping grounds: there is
no `controllers/` folder holding thirty unrelated controllers. Everything that
changes together — the cart's routes, controller, service, repository, schemas
and mapper — sits in `modules/cart/`.

## 2. Layer contract

```text
route → controller → service → repository → database
```

| Layer | May | May not |
|-------|-----|---------|
| **route** | Declare method, path, middleware chain | Contain any logic |
| **controller** | Read `req.validated`, call **one** service method, shape the response via a mapper, set the status code | Contain business rules, touch Knex, build error objects |
| **service** | Business rules, transactions, calls to other modules' `index.js`, throwing `AppError` | Reference `req`/`res`, write SQL strings |
| **repository** | Knex queries, row↔domain mapping, translating PG errors | Decide anything, call other repositories from other modules |

A controller calling a repository directly is a review-blocking defect: it means
a rule can be bypassed by a second caller later.

### Example: the accept-order path

```js
// restaurants/restaurant.routes.js
router.post('/orders/:id/accept',
  authenticate,
  authorize('RESTAURANT'),
  requireApprovedRestaurant,
  validate({ params: idParamSchema }),
  ctrl.acceptOrder);

// restaurants/restaurant.controller.js
export async function acceptOrder(req, res) {
  const order = await orders.acceptForRestaurant({
    orderId: req.validated.params.id,
    ownerUserId: req.user.id,
  });
  res.json(ok(toOrderDto(order), { requestId: req.id }));
}

// orders/orders.service.js
export async function acceptForRestaurant({ orderId, ownerUserId }) {
  return withTransaction(async (trx) => {
    const restaurant = await restaurants.getByOwner(ownerUserId, { trx });   // module interface
    const order = await orderRepo.findByIdForUpdate(orderId, trx);           // SELECT … FOR UPDATE
    if (!order || order.restaurantId !== restaurant.id) throw new NotFoundError('RESOURCE_NOT_FOUND');
    assertTransition(order.status, 'CONFIRMED', { actorRole: 'RESTAURANT' }); // §7.3 table
    const updated = await orderRepo.updateStatus(orderId, 'CONFIRMED', trx);
    await orderRepo.appendEvent({ orderId, from: order.status, to: 'CONFIRMED',
                                  actorUserId: ownerUserId, actorRole: 'RESTAURANT' }, trx);
    await delivery.requestDispatch(orderId, { trx });                        // BR-D1
    return updated;
  });
}
```

Every element of the design shows up here: the role guard in the router, the
ownership check in the service, the row lock before the read-modify-write
(BR-O9), the state machine as the single authority on legality, the audit event,
and the cross-module call through a public interface.

## 3. The order state machine

`modules/orders/orderStateMachine.js` is a pure, dependency-free module — which
is what makes it exhaustively unit-testable.

```js
export const TRANSITIONS = {
  PENDING:          { CONFIRMED:        ['RESTAURANT'],
                      CANCELLED:        ['CUSTOMER','RESTAURANT','ADMIN','SYSTEM'] },
  CONFIRMED:        { PREPARING:        ['RESTAURANT'],
                      CANCELLED:        ['CUSTOMER','RESTAURANT','ADMIN'] },
  PREPARING:        { READY_FOR_PICKUP: ['RESTAURANT'],
                      CANCELLED:        ['RESTAURANT','ADMIN'] },
  READY_FOR_PICKUP: { OUT_FOR_DELIVERY: ['DRIVER'],
                      CANCELLED:        ['ADMIN'] },
  OUT_FOR_DELIVERY: { DELIVERED:        ['DRIVER'],
                      CANCELLED:        ['ADMIN'] },
  DELIVERED:        {},
  CANCELLED:        {},
};

export const REASON_REQUIRED_FOR = ['RESTAURANT', 'ADMIN'];
```

`assertTransition(from, to, { actorRole, reason })` throws
`ConflictError('INVALID_ORDER_TRANSITION')` when `to` is absent from
`TRANSITIONS[from]`, when `actorRole` is not in the permitted list, or when a
reason is required and missing. It is the **only** place a status is allowed to
change; `orderRepo.updateStatus` is not exported from the module's `index.js`.

The table above is a literal transcription of
[master-sdd §7.3](../master-sdd.md#73-order-state-machine). A test asserts the
two stay in sync by counting edges.

## 4. Validation layer

```js
// middleware/validate.js
export const validate = (schemas) => (req, _res, next) => {
  const out = {};
  for (const key of ['body', 'params', 'query']) {
    if (!schemas[key]) continue;
    const result = schemas[key].safeParse(req[key]);
    if (!result.success) return next(toValidationError(result.error));
    out[key] = result.data;          // parsed, coerced, unknown keys stripped
  }
  req.validated = out;
  next();
};
```

Two properties matter here. First, **controllers read `req.validated`, never
`req.body`** — a lint rule forbids `req.body` outside this middleware, so
unvalidated input cannot reach a service. Second, Zod object schemas strip
unknown keys by default, so `{ email, password, role: 'ADMIN', status: 'ACTIVE' }`
arrives at the service as `{ email, password }`. Mass assignment is closed by
construction rather than by remembering to blocklist fields.

Schemas live in `modules/<domain>/<domain>.schemas.js` next to the code they
guard, and are imported directly by unit tests (master-sdd §15 has the rules).

## 5. Error handling

```js
// middleware/errorHandler.js
export function errorHandler(err, req, res, _next) {
  const e = err instanceof AppError ? err : mapPgError(err);

  if (e instanceof AppError) {
    if (e.status >= 500) logger.error({ err: e, requestId: req.id }, e.message);
    else logger.warn({ code: e.code, requestId: req.id, userId: req.user?.id }, e.message);
    return res.status(e.status).json(fail(
      { code: e.code, message: e.publicMessage, details: e.details },
      { requestId: req.id },
    ));
  }

  logger.error({ err, requestId: req.id }, 'Unhandled error');
  return res.status(500).json(fail(
    { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
    { requestId: req.id },
  ));
}
```

`AppError` carries `status`, `code`, `publicMessage` and optional `details`.
The distinction between `message` (for logs) and `publicMessage` (for clients)
is what keeps internal detail from leaking while still making incidents
debuggable — the client gets a request ID and support can find the exact log
line.

`mapPgError` translates driver errors at the boundary: `23505` on
`uq_users_email` → `EMAIL_ALREADY_REGISTERED`; `23505` on `uq_reviews_order` →
`REVIEW_ALREADY_EXISTS`; `23505` on `uq_assignments_driver_active` →
`DRIVER_HAS_ACTIVE_DELIVERY`; `23503` → `RESOURCE_NOT_FOUND`. A raw PostgreSQL
message never reaches a response.

`server.js` registers `unhandledRejection` and `uncaughtException` handlers that
log and exit non-zero, plus a `SIGTERM` handler that stops accepting
connections, waits for in-flight requests, stops the jobs and drains the pool.

## 6. Concurrency

Three races exist in this domain, each closed deliberately:

| Race | Closure |
|------|---------|
| Two actors transition the same order simultaneously (e.g. customer cancels while restaurant accepts) | `SELECT … FOR UPDATE` on the order row inside the transaction, before the state check. The second transaction blocks, then re-reads the new status and fails the state check → `409` (BR-O9, NFR-8) |
| Two drivers accept the same offer | The partial unique index `uq_assignments_order_accepted`; the loser's insert raises `23505` → `409 OFFER_NO_LONGER_AVAILABLE` |
| A customer double-submits checkout | The `uq_carts_one_active` index plus `SELECT … FOR UPDATE` on the cart row; the second request finds the cart already `CONVERTED` → `422 CART_EMPTY` |

The pattern throughout is the same: **let the database arbitrate.** Application-
level check-then-act is a race; a unique index or a row lock is not.

## 7. Response mapping

Every module has a `*.mapper.js` that converts domain rows into DTOs by
**listing the fields to include**, never by deleting the ones to exclude:

```js
export const toUserDto = (u) => ({
  id: u.id, email: u.email, fullName: u.fullName,
  phone: u.phone, role: u.role, status: u.status, createdAt: u.createdAt,
});
```

An allow-list means adding `password_hash`, `reset_token` or any future secret
column to the table cannot leak it. A denylist (`delete u.passwordHash`) would
fail silently the day someone adds a column. There are role-specific mappers
where the audience differs — `toCustomerForDriverDto` returns a first name and a
masked phone and no email at all.

## 8. Testing hooks

- `app.js` exports the Express app without calling `listen`, so Supertest binds an ephemeral port per suite.
- `tests/helpers/db.js` truncates all tables between tests (`TRUNCATE … RESTART IDENTITY CASCADE`) against a dedicated `foodflow_test` database. Tests run against **real PostgreSQL**, never a mock — partial unique indexes, check constraints and `FOR UPDATE` behaviour are exactly what needs testing, and none of them exist in a fake.
- `tests/helpers/factories.js` builds users, restaurants, menus and orders in any lifecycle state, so a test that needs "an order in `PREPARING`" gets one in a line.
- `tests/helpers/auth.js` issues real tokens for a given role.
- Jobs are exported as plain async functions and invoked directly in tests; timers are never started in the test environment.
