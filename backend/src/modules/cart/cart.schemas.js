import { z } from 'zod';
import { CART_ITEM_MAX_QTY, CART_ITEM_MIN_QTY } from '../../shared/constants.js';
import { optionalTrimmed, uuid } from '../../shared/validation/common.js';
import { optionIds } from '../menu/index.js';

const quantity = z.coerce
  .number()
  .int('must be a whole number')
  .min(CART_ITEM_MIN_QTY, `must be at least ${CART_ITEM_MIN_QTY}`)
  .max(CART_ITEM_MAX_QTY, `must be at most ${CART_ITEM_MAX_QTY}`);

export const addItemSchema = z.object({
  foodItemId: uuid,
  quantity: quantity.default(1),
  notes: optionalTrimmed(200),
  // Ids only; the server derives groups and prices (BR-IO4).
  optionIds,
});

export const addItemQuery = z.object({
  replace: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});

/** Quantity 0 is deliberately invalid: removal is DELETE. Conflating them makes
 *  "remove" reachable by an off-by-one in a stepper (BR-C5). */
export const updateQuantitySchema = z.object({ quantity });

/** A code is matched case-insensitively, so it is only trimmed here. */
export const applyDiscountSchema = z.object({
  code: z.string().trim().min(1, 'is required').max(40, 'must be at most 40 characters'),
});

export const lineParam =z.object({ itemId: uuid });
