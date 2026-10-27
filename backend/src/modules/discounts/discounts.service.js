import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
import { money } from '../../shared/money.js';
import { toLimitOffset, paginationMeta } from '../../shared/http/pagination.js';
import * as repo from './discounts.repository.js';
import * as restaurants from '../restaurants/index.js';

/* ------------------------------------------------------------- validation */

const reject = (code, issue, extra = {}) => new ValidationError(code, {
  details: [{ field: 'code', issue, ...extra }],
});

/**
 * Decides whether `row` may be used on an order, throwing the specific error
 * if not (BR-DC2..DC7). The caller supplies the pre-discount subtotal, so the
 * minimum is judged on the same figure the restaurant minimum is.
 *
 * Usage is counted from non-cancelled `order_discounts`; callers that must be
 * race-free (checkout) read `row` with FOR UPDATE first, which serializes every
 * redemption of one code.
 *
 * @returns the pricing spec `computeTotals` takes as `discount`.
 */
async function evaluate(row, { customerUserId, restaurantId, subtotal }, trx) {
  if (!row || row.deleted_at || !row.is_active) {
    throw reject('DISCOUNT_CODE_INVALID', 'This discount code is not valid.');
  }
  const now = new Date();
  if (row.starts_at && row.starts_at > now) {
    throw reject('DISCOUNT_CODE_EXPIRED', 'This discount code is not active yet.', { startsAt: row.starts_at });
  }
  if (row.ends_at && row.ends_at <= now) {
    throw reject('DISCOUNT_CODE_EXPIRED', 'This discount code has expired.', { endsAt: row.ends_at });
  }
  if (row.restaurant_id && row.restaurant_id !== restaurantId) {
    throw reject('DISCOUNT_CODE_NOT_APPLICABLE', 'This discount code is for a different restaurant.');
  }
  if (money.compare(subtotal, row.min_subtotal) < 0) {
    throw reject(
      'DISCOUNT_CODE_NOT_APPLICABLE',
      `This discount code needs an order of at least ${row.min_subtotal}.`,
      { required: row.min_subtotal, actual: subtotal, shortfall: money.subtract(row.min_subtotal, subtotal) },
    );
  }
  if (row.usage_limit != null && (await repo.countUsage(row.id, trx)) >= row.usage_limit) {
    throw reject('DISCOUNT_CODE_LIMIT_REACHED', 'This discount code has reached its usage limit.');
  }
  if (
    row.per_customer_limit != null
    && (await repo.countUsageByCustomer(row.id, customerUserId, trx)) >= row.per_customer_limit
  ) {
    throw reject('DISCOUNT_CODE_LIMIT_REACHED', 'You have already used this discount code the maximum number of times.');
  }
  return toPricingSpec(row);
}

const toPricingSpec = (row) => ({
  id: row.id,
  code: row.code,
  type: row.discount_type,
  value: row.value,
  maxDiscount: row.max_discount_amount,
});

/**
 * Checkout path: locks the code row for the rest of the transaction, so two
 * checkouts racing for the last use are serialized and the second one sees the
 * first one's redemption (BR-DC7).
 */
export async function validateForOrder({ code, customerUserId, restaurantId, subtotal }, trx) {
  const row = await repo.findByCode(code, trx, { forUpdate: true });
  return evaluate(row, { customerUserId, restaurantId, subtotal }, trx);
}

/** Cart path: the same rules without the lock; checkout re-validates. */
export async function validateForCart({ code, codeId, customerUserId, restaurantId, subtotal }, trx) {
  const row = codeId ? await repo.findById(codeId, trx) : await repo.findByCode(code, trx);
  return evaluate(row, { customerUserId, restaurantId, subtotal }, trx);
}

/** Resolves a code string for the cart, or rejects it as invalid. */
export async function findCodeForCart(code, trx) {
  const row = await repo.findByCode(code, trx);
  if (!row) throw reject('DISCOUNT_CODE_INVALID', 'This discount code is not valid.');
  return row;
}

export const getCodeById = repo.findById;

/** Stores the snapshot that outlives the code itself (BR-DC10). */
export function recordRedemption({ orderId, discountCodeId, code, amount }, trx) {
  return repo.insertRedemption(
    { order_id: orderId, discount_code_id: discountCodeId, code_snapshot: code, amount },
    trx,
  );
}

/** The discount stored on an order, for its detail views. */
export async function getOrderDiscount(orderId, trx) {
  const row = await repo.findRedemption(orderId, trx);
  return row ? { code: row.code_snapshot, amount: row.amount } : null;
}

/* ------------------------------------------------------------------ admin */

const toDto = (row) => ({
  id: row.id,
  code: row.code,
  description: row.description,
  type: row.discount_type,
  value: row.value,
  maxDiscountAmount: row.max_discount_amount,
  minSubtotal: row.min_subtotal,
  restaurant: row.restaurant_id ? { id: row.restaurant_id, name: row.restaurant_name ?? null } : null,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  usageLimit: row.usage_limit,
  perCustomerLimit: row.per_customer_limit,
  isActive: row.is_active,
  state: row.state,
  stats: {
    usageCount: Number(row.usage_count ?? 0),
    totalDiscount: money.format(row.total_discount ?? money.ZERO),
  },
  createdAt: row.created_at,
});

export async function adminList(query) {
  const { limit, offset, page } = toLimitOffset(query);
  const rows = await repo.list({ q: query.q, status: query.status, limit, offset });
  return {
    data: rows.map(toDto),
    meta: paginationMeta({ page, limit, total: rows[0]?.total_count ?? 0 }),
  };
}

export async function adminGet(id, trx) {
  const row = await repo.findWithStats(id, trx);
  if (!row) throw new NotFoundError('RESOURCE_NOT_FOUND');
  return toDto(row);
}

const duplicate = () => new ConflictError('CONFLICT', {
  details: [{ field: 'code', issue: 'A discount code with this name already exists.' }],
});

async function assertRestaurantExists(restaurantId, trx) {
  if (!restaurantId) return;
  const restaurant = await restaurants.getRestaurantById(restaurantId, trx);
  if (!restaurant) {
    throw new ValidationError('VALIDATION_ERROR', {
      details: [{ field: 'restaurantId', issue: 'is not a known restaurant' }],
    });
  }
}

const toColumns = (input) => ({
  description: input.description ?? null,
  discount_type: input.type,
  value: input.value,
  max_discount_amount: input.type === 'PERCENT' ? (input.maxDiscountAmount ?? null) : null,
  min_subtotal: input.minSubtotal ?? money.ZERO,
  restaurant_id: input.restaurantId ?? null,
  starts_at: input.startsAt ?? null,
  ends_at: input.endsAt ?? null,
  usage_limit: input.usageLimit ?? null,
  per_customer_limit: input.perCustomerLimit ?? null,
});

/** Runs in the caller's transaction, so the audit row commits with it. */
export async function adminCreate(adminUserId, input, trx) {
  await assertRestaurantExists(input.restaurantId, trx);
  if (await repo.findByCode(input.code, trx)) throw duplicate();
  let row;
  try {
    row = await repo.insert({ code: input.code, ...toColumns(input), created_by: adminUserId }, trx);
  } catch (err) {
    // Two admins creating the same code at once: the unique index decides.
    if (err?.code === '23505') throw duplicate();
    throw err;
  }
  return adminGet(row.id, trx);
}

/** The code itself is immutable: orders and customers know it by name. */
export async function adminUpdate(id, input, trx) {
  const existing = await repo.findById(id, trx);
  if (!existing || existing.deleted_at) throw new NotFoundError('RESOURCE_NOT_FOUND');
  await assertRestaurantExists(input.restaurantId, trx);
  await repo.update(id, toColumns(input), trx);
  return adminGet(id, trx);
}

export async function adminSetActive(id, isActive, trx) {
  const existing = await repo.findById(id, trx);
  if (!existing || existing.deleted_at) throw new NotFoundError('RESOURCE_NOT_FOUND');
  await repo.update(id, { is_active: isActive }, trx);
  return adminGet(id, trx);
}

export async function adminDelete(id, trx) {
  const existing = await repo.findById(id, trx);
  if (!existing || existing.deleted_at) throw new NotFoundError('RESOURCE_NOT_FOUND');
  // A carts.discount_code_id pointing at it is harmless: the lookup skips
  // deleted rows, so the cart simply reports the code as invalid.
  await repo.update(id, { deleted_at: trx.fn.now(), is_active: false }, trx);
  return { id, deleted: true, code: existing.code };
}
