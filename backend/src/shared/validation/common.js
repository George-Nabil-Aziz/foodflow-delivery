import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants.js';

// `guid`, not `uuid`: Zod 4's uuid also checks the RFC version and variant
// bits, which would turn some well-formed ids into 422 instead of 404.
export const uuid = z.guid('must be a valid identifier');
export const idParam = z.object({ id: uuid });

export const trimmedString = (min, max) =>
  z.string().trim().min(min, `must be at least ${min} characters`).max(max, `must be at most ${max} characters`);

export const optionalTrimmed = (max) =>
  z.string().trim().max(max, `must be at most ${max} characters`).optional().nullable();

/**
 * An Egyptian mobile number, local or international: 01012345678 or
 * +201012345678. The digit after the leading 1 is the network: 0, 1, 2 or 5
 * (Vodafone, Etisalat, Orange, WE).
 */
export const EGYPTIAN_MOBILE = /^(\+20|0)1[0125]\d{8}$/;

export const phone = z
  .string()
  .trim()
  .regex(EGYPTIAN_MOBILE, 'must be an Egyptian mobile number, for example 01012345678');

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .email('must be a valid email address')
  .max(255, 'must be at most 255 characters');

/**
 * 8-72 characters with at least one letter and one digit. The 72-byte ceiling
 * is bcrypt's own truncation point and is rejected explicitly rather than
 * silently truncated (BR-A2).
 */
export const password = z
  .string()
  .min(8, 'must be at least 8 characters')
  .max(72, 'must be at most 72 characters')
  .refine((v) => /[A-Za-z]/.test(v), { message: 'must contain at least one letter' })
  .refine((v) => /\d/.test(v), { message: 'must contain at least one digit' });

/** Money accepted as a string or number, normalized to 2 decimals. */
export const moneyAmount = (opts = {}) => {
  const { min = 0, max = 9999.99, exclusiveMin = false } = opts;
  return z
    .union([z.string().trim(), z.number()])
    .transform((v) => (typeof v === 'number' ? v.toFixed(2) : v))
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), { message: 'must be an amount with at most 2 decimals' })
    .refine((v) => (exclusiveMin ? Number(v) > min : Number(v) >= min), {
      message: exclusiveMin ? `must be greater than ${min}` : `must be at least ${min}`,
    })
    .refine((v) => Number(v) <= max, { message: `must be at most ${max}` })
    .transform((v) => Number(v).toFixed(2));
};

export const latitude = z.coerce.number().min(-90).max(90);
export const longitude = z.coerce.number().min(-180).max(180);

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1, 'must be at least 1').default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE, `must be at most ${MAX_PAGE_SIZE}`).default(DEFAULT_PAGE_SIZE),
});

/** Sort is always allow-listed and never interpolated into SQL (BR-D5.4). */
export const sortQuery = (allowed, fallback) =>
  z.object({
    sort: z.enum(allowed).default(fallback),
    order: z.enum(['asc', 'desc']).default('desc'),
  });

export const boolFromQuery = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => v === true || v === 'true');

/**
 * Escapes LIKE/ILIKE wildcards. Without this a search for "%" returns the whole
 * table and turns the search box into a full-table-scan button.
 */
export function escapeLikePattern(value) {
  return String(value).replace(/[\\%_]/g, (m) => '\\' + m);
}
