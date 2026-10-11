import { z } from 'zod';
import { moneyAmount, optionalTrimmed, trimmedString, uuid } from '../../shared/validation/common.js';

/**
 * http(s) only. The value is rendered in an <img src>, so a `javascript:` or
 * `data:` URL is an XSS vector rather than a formatting mistake.
 */
const imageUrl = z
  .string()
  .trim()
  .max(500, 'must be at most 500 characters')
  .refine((v) => /^https?:\/\//i.test(v), { message: 'must be an http(s) URL' })
  .optional()
  .nullable();

export const createCategorySchema = z.object({
  name: trimmedString(2, 60),
  description: optionalTrimmed(500),
  displayOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

export const updateCategorySchema = z
  .object({
    name: trimmedString(2, 60).optional(),
    description: optionalTrimmed(500),
    displayOrder: z.coerce.number().int().min(0).max(999).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });

export const reorderCategoriesSchema = z.object({
  categories: z
    .array(z.object({ id: uuid, displayOrder: z.coerce.number().int().min(0).max(999) }))
    .min(1),
});

export const createItemSchema = z.object({
  categoryId: uuid,
  name: trimmedString(2, 120),
  description: optionalTrimmed(1000),
  // BR-R5: greater than zero, at most 9999.99, exactly two decimals.
  price: moneyAmount({ min: 0, max: 9999.99, exclusiveMin: true }),
  imageUrl,
  isAvailable: z.boolean().default(true),
  displayOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export const updateItemSchema = z
  .object({
    categoryId: uuid.optional(),
    name: trimmedString(2, 120).optional(),
    description: optionalTrimmed(1000),
    price: moneyAmount({ min: 0, max: 9999.99, exclusiveMin: true }).optional(),
    imageUrl,
    isAvailable: z.boolean().optional(),
    displayOrder: z.coerce.number().int().min(0).max(999).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });

export const availabilitySchema = z.object({ isAvailable: z.boolean() });

export const listItemsQuery = z.object({
  categoryId: uuid.optional(),
  isAvailable: z.enum(['true', 'false']).optional(),
  q: z.string().trim().min(1).max(60).optional(),
});
