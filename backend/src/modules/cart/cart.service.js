import { config } from '../../config/index.js';
import { withTransaction } from '../../shared/db/transaction.js';
import { knex } from '../../shared/db/knex.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
import { money } from '../../shared/money.js';
import * as repo from './cart.repository.js';
import { validateLines, collectIssues } from './cartValidator.js';
import * as menu from '../menu/index.js';
import * as restaurants from '../restaurants/index.js';
import * as discounts from '../discounts/index.js';
import { computeTotals, meetsMinimum, shortfall } from '../orders/index.js';

/** Lazily creates the single ACTIVE cart. The partial unique index
 *  `uq_carts_one_active` is what makes concurrent creation safe (BR-C1). */
async function getOrCreateCart(customerUserId, trx) {
  const existing = await repo.findActiveCartForUpdate(customerUserId, trx);
  if (existing) return existing;

  // The insert conflicts silently rather than raising, because a raised unique
  // violation would abort this transaction and take the recovery read with it.
  const created = await repo.createCart(customerUserId, trx);
  if (created) return created;

  // Lost the race: the winner's row is now visible, so re-read and continue.
  return repo.findActiveCartForUpdate(customerUserId, trx);
}

/** Builds the full cart payload: live prices, per-line issues, server totals. */
async function buildCartView(cart, trx, strict = false) {
  if (!cart) {
    return emptyCartView();
  }

  const lines = await repo.listLines(cart.id, trx);
  if (!lines.length) {
    return { ...emptyCartView(), id: cart.id };
  }

  const liveItems = await menu.getItemsByIds(lines.map((l) => l.food_item_id), trx);
  const restaurant = cart.restaurant_id
    ? await restaurants.getRestaurantById(cart.restaurant_id, trx)
    : null;
  const orderability = await restaurants.orderabilityFor(restaurant, trx);

  const validated = validateLines(lines, liveItems, {
    restaurantOrderable: orderability.isOrderable,
  });
  const issues = collectIssues(validated);

  const pricing = {
    lines: validated.map((l) => ({ unitPrice: l.unitPrice, quantity: l.quantity })),
    deliveryFee: restaurant?.delivery_fee ?? money.ZERO,
    taxRate: config.taxRate,
  };
  // An applied code is re-judged on every view: a code that expired or no
  // longer fits the cart stays visible with the reason, but is not priced.
  const { discount, discountIssue } = await resolveDiscount(cart, computeTotals(pricing).subtotal, trx, strict);
  const totals = computeTotals({ ...pricing, discount });

  const minimumMet = meetsMinimum(totals.subtotal, restaurant?.minimum_order_amount ?? 0);

  return {
    id: cart.id,
    restaurant: restaurant
      ? {
          id: restaurant.id,
          name: restaurant.name,
          logoUrl: restaurant.logo_url,
          deliveryFee: restaurant.delivery_fee,
          minimumOrderAmount: restaurant.minimum_order_amount,
          isOrderable: orderability.isOrderable,
          unavailableReason: orderability.isOrderable ? null : orderability.reason,
        }
      : null,
    items: validated,
    totals: {
      subtotal: totals.subtotal,
      deliveryFee: totals.deliveryFee,
      discountAmount: totals.discountAmount,
      taxAmount: totals.taxAmount,
      total: totals.totalAmount,
    },
    discount: discount
      ? { code: discount.code, type: discount.type, value: discount.value, amount: totals.discountAmount }
      : null,
    discountIssue,
    issues,
    itemCount: validated.reduce((sum, l) => sum + l.quantity, 0),
    meetsMinimum: minimumMet,
    minimumShortfall: shortfall(totals.subtotal, restaurant?.minimum_order_amount ?? 0),
    // The server's verdict. The client must not re-derive it: duplicating the
    // arithmetic guarantees the two eventually disagree, about money.
    canCheckout:
      validated.length > 0 && issues.length === 0 && minimumMet && orderability.isOrderable
      && !discountIssue,
  };
}

/**
 * Judges the cart's applied code against its current contents. Only a
 * validation failure is swallowed into `discountIssue`; anything else is a bug.
 * `strict` rethrows, for the apply call that must report the failure itself.
 */
async function resolveDiscount(cart, subtotal, trx, strict) {
  if (!cart.discount_code_id) return { discount: null, discountIssue: null };
  try {
    const discount = await discounts.validateForCart({
      codeId: cart.discount_code_id,
      customerUserId: cart.customer_user_id,
      restaurantId: cart.restaurant_id,
      subtotal,
    }, trx);
    return { discount, discountIssue: null };
  } catch (err) {
    if (!(err instanceof ValidationError) || strict) throw err;
    const row = await discounts.getCodeById(cart.discount_code_id, trx);
    return {
      discount: null,
      discountIssue: { code: err.code, discountCode: row?.code ?? null, message: err.publicMessage, details: err.details },
    };
  }
}

function emptyCartView() {
  return {
    id: null,
    restaurant: null,
    items: [],
    totals: {
      subtotal: money.ZERO, deliveryFee: money.ZERO, discountAmount: money.ZERO,
      taxAmount: money.ZERO, total: money.ZERO,
    },
    discount: null,
    discountIssue: null,
    issues: [],
    itemCount: 0,
    meetsMinimum: false,
    minimumShortfall: money.ZERO,
    canCheckout: false,
  };
}

/** An empty cart is 200 with an empty list, never 404 (FR-5.10). */
export async function getCart(customerUserId) {
  const cart = await repo.findActiveCart(customerUserId);
  return buildCartView(cart);
}

/**
 * Add an item.
 *
 * The cross-restaurant case is the important one: it is a conflict carrying
 * both restaurant names, never a silent mix and never a silent wipe (BR-C3).
 * Switching requires an explicit `replace=true`, which clears and rebinds in
 * the same transaction (BR-C4).
 */
export async function addItem(customerUserId, { foodItemId, quantity, notes }, { replace = false } = {}) {
  return withTransaction(async (trx) => {
    const cart = await getOrCreateCart(customerUserId, trx);

    const item = await menu.assertItemOrderable(foodItemId, trx);
    await restaurants.assertOrderable(item.restaurant_id, trx);

    const lineCount = await repo.countLines(cart.id, trx);
    const boundRestaurantId = lineCount > 0 ? cart.restaurant_id : null;

    if (boundRestaurantId && boundRestaurantId !== item.restaurant_id) {
      if (!replace) {
        const [current, requested] = await Promise.all([
          restaurants.getRestaurantById(boundRestaurantId, trx),
          restaurants.getRestaurantById(item.restaurant_id, trx),
        ]);
        throw new ConflictError('CART_RESTAURANT_MISMATCH', {
          details: [{
            field: 'foodItemId',
            issue: `Your cart is from "${current?.name}"; this item belongs to "${requested?.name}".`,
            currentRestaurant: { id: current?.id, name: current?.name, itemCount: lineCount },
            requestedRestaurant: { id: requested?.id, name: requested?.name },
          }],
        });
      }
      // Explicit switch: clear, rebind, add - one transaction. The clear
      // happens AFTER validation, so a failing add never empties the cart.
      await repo.clearLines(cart.id, trx);
      // A code was applied to the old restaurant's cart, not this one.
      await repo.setDiscount(cart.id, null, trx);
    }

    if (!boundRestaurantId || boundRestaurantId !== item.restaurant_id) {
      await repo.setRestaurant(cart.id, item.restaurant_id, trx);
    }

    await repo.upsertLine(
      { cartId: cart.id, foodItemId, quantity, notes, price: item.price },
      trx,
    );

    const refreshed = await repo.findActiveCart(customerUserId, trx);
    return buildCartView(refreshed, trx);
  });
}

export async function updateQuantity(customerUserId, lineId, quantity) {
  return withTransaction(async (trx) => {
    const cart = await repo.findActiveCartForUpdate(customerUserId, trx);
    if (!cart) throw new NotFoundError('RESOURCE_NOT_FOUND');
    const updated = await repo.updateLineQuantity(lineId, cart.id, quantity, trx);
    if (!updated) throw new NotFoundError('RESOURCE_NOT_FOUND');
    return buildCartView(cart, trx);
  });
}

export async function removeItem(customerUserId, lineId) {
  return withTransaction(async (trx) => {
    const cart = await repo.findActiveCartForUpdate(customerUserId, trx);
    if (!cart) throw new NotFoundError('RESOURCE_NOT_FOUND');

    const line = await repo.findLine(lineId, cart.id, trx);
    if (!line) throw new NotFoundError('RESOURCE_NOT_FOUND');
    await repo.deleteLine(lineId, cart.id, trx);

    // Removing the last line unbinds the restaurant, so the next add from any
    // restaurant succeeds without a conflict (BR-C2).
    if ((await repo.countLines(cart.id, trx)) === 0) {
      await repo.setRestaurant(cart.id, null, trx);
      await repo.setDiscount(cart.id, null, trx);
    }
    const refreshed = await repo.findActiveCart(customerUserId, trx);
    return buildCartView(refreshed, trx);
  });
}

export async function clearCart(customerUserId) {
  return withTransaction(async (trx) => {
    const cart = await repo.findActiveCartForUpdate(customerUserId, trx);
    if (!cart) return; // Idempotent.
    await repo.clearLines(cart.id, trx);
    await repo.setRestaurant(cart.id, null, trx);
    await repo.setDiscount(cart.id, null, trx);
  });
}

/**
 * Applies a code to the cart. The code is judged against the cart as it is now
 * and an unusable one is rejected with its specific error, leaving the cart
 * unchanged. Checkout judges it again, because the world moves (BR-DC8).
 */
export async function applyDiscount(customerUserId, code) {
  return withTransaction(async (trx) => {
    const cart = await repo.findActiveCartForUpdate(customerUserId, trx);
    if (!cart || (await repo.countLines(cart.id, trx)) === 0) throw new ValidationError('CART_EMPTY');
    const row = await discounts.findCodeForCart(code, trx);
    // Rejection throws, which rolls this write back with the transaction.
    const updated = await repo.setDiscount(cart.id, row.id, trx);
    return buildCartView(updated, trx, true);
  });
}

export async function removeDiscount(customerUserId) {
  return withTransaction(async (trx) => {
    const cart = await repo.findActiveCartForUpdate(customerUserId, trx);
    if (!cart) return buildCartView(null, trx);
    const updated = await repo.setDiscount(cart.id, null, trx);
    return buildCartView(updated, trx);
  });
}

/* ------------------------------------------------- cross-module interface */

/** Row-locked cart plus its lines, for the checkout transaction. */
export async function getActiveCartForCheckout(customerUserId, trx) {
  const cart = await repo.findActiveCartForUpdate(customerUserId, trx);
  if (!cart) return null;
  const lines = await repo.listLines(cart.id, trx);
  let discountCode = null;
  if (cart.discount_code_id) {
    const row = await discounts.getCodeById(cart.discount_code_id, trx);
    // A deleted code must not match a new code that reuses its spelling.
    if (!row || row.deleted_at) throw new ValidationError('DISCOUNT_CODE_INVALID');
    discountCode = row.code;
  }
  return { id: cart.id, restaurantId: cart.restaurant_id, items: lines, discountCode };
}

/** Revalidates a locked cart against live menu data, for checkout. */
export async function revalidateLines(cart, trx) {
  const liveItems = await menu.getItemsByIds(cart.items.map((l) => l.food_item_id), trx);
  return validateLines(cart.items, liveItems);
}

export const markConverted = repo.markConverted;

/** Header badge count, cheap enough to call on every page. */
export async function getItemCount(customerUserId) {
  const cart = await repo.findActiveCart(customerUserId);
  if (!cart) return 0;
  const row = await knex('cart_items').where({ cart_id: cart.id }).sum({ total: 'quantity' }).first();
  return Number(row?.total ?? 0);
}

export function assertQuantityInRange(quantity) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
    throw new ValidationError('VALIDATION_ERROR', {
      details: [{ field: 'quantity', issue: 'must be an integer between 1 and 20' }],
    });
  }
}
