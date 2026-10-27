import { z } from 'zod';
import { moneyAmount, trimmedString, uuid } from '../../shared/validation/common.js';

const displayOrder = z.coerce.number().int().min(0).max(999);
const selectCount = z.coerce.number().int().min(0).max(20);

const optionFields = {
  name: trimmedString(1, 60),
  // BR-IO2: zero or more, so a free choice ("No onions") is a normal option.
  priceDelta: moneyAmount({ min: 0, max: 9999.99 }).default('0.00'),
  isAvailable: z.boolean().default(true),
  displayOrder: displayOrder.optional(),
};

const optionInput = z.object(optionFields);

const minMax = (v) => v.maxSelect >= 1 && v.maxSelect >= v.minSelect;
const minMaxMessage = { message: 'maxSelect must be at least 1 and at least minSelect', path: ['maxSelect'] };

export const createGroupSchema = z
  .object({
    name: trimmedString(1, 60),
    minSelect: selectCount.default(0),
    maxSelect: selectCount.default(1),
    displayOrder: displayOrder.optional(),
    options: z.array(optionInput).min(1, 'at least one option is required').max(30),
  })
  .refine(minMax, minMaxMessage);

export const updateGroupSchema = z
  .object({
    name: trimmedString(1, 60).optional(),
    minSelect: selectCount.optional(),
    maxSelect: selectCount.optional(),
    displayOrder: displayOrder.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });

export const reorderGroupsSchema = z.object({
  groups: z.array(z.object({ id: uuid, displayOrder })).min(1),
});

export const createOptionSchema = optionInput;

export const updateOptionSchema = z
  .object({
    name: trimmedString(1, 60).optional(),
    priceDelta: moneyAmount({ min: 0, max: 9999.99 }).optional(),
    isAvailable: z.boolean().optional(),
    displayOrder: displayOrder.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });

export const reorderOptionsSchema = z.object({
  options: z.array(z.object({ id: uuid, displayOrder })).min(1),
});

export const itemParam = z.object({ itemId: uuid });
export const groupParam = z.object({ groupId: uuid });
export const optionParam = z.object({ optionId: uuid });

/**
 * The option ids a customer (or an admin) chose for one line. Ids only: the
 * group is derived from the option, so a client cannot claim an option belongs
 * to a group it does not, and no price is ever accepted (BR-IO4, BR-C8).
 */
export const optionIds = z.array(uuid).max(30).default([]);
