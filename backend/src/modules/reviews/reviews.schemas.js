import { z } from 'zod';
import { optionalTrimmed, paginationQuery, uuid } from '../../shared/validation/common.js';

const rating = z.coerce.number().int('must be a whole number').min(1).max(5);

export const createReviewSchema = z.object({
  orderId: uuid,
  restaurantRating: rating,
  driverRating: rating.optional().nullable(),
  // Stored as plain text and rendered as text; no HTML is ever interpreted.
  comment: optionalTrimmed(1000),
});

export const updateReviewSchema = z
  .object({
    restaurantRating: rating.optional(),
    driverRating: rating.optional().nullable(),
    comment: optionalTrimmed(1000),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });

export const reviewsQuery = paginationQuery;
