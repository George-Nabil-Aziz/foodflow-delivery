import { z } from 'zod';
import { CUISINE_TYPES } from '../../shared/constants.js';
import { paginationQuery } from '../../shared/validation/common.js';

export const listRestaurantsQuery = paginationQuery.extend({
  cuisine: z.enum(CUISINE_TYPES).optional(),
  openNow: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  minRating: z.coerce.number().min(1, 'must be between 1 and 5').max(5, 'must be between 1 and 5').optional(),
  q: z.string().trim().min(1, 'must not be blank').max(60).optional(),
  // Allow-listed. Anything else is rejected before any SQL is built.
  sort: z.enum(['rating', 'deliveryFee', 'name', 'newest']).default('rating'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const searchQuery = z.object({
  q: z.string().trim().min(1, 'must not be blank').max(60),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});
