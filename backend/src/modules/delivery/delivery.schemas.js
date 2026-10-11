import { z } from 'zod';
import { VEHICLE_TYPES } from '../../shared/constants.js';
import { latitude, longitude, optionalTrimmed, trimmedString, uuid } from '../../shared/validation/common.js';

export const updateDriverProfileSchema = z
  .object({
    vehicleType: z.enum(VEHICLE_TYPES).optional(),
    vehiclePlate: trimmedString(2, 20).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });

/** ON_DELIVERY is deliberately absent: it is system-set. Accepting it from a
 *  client would let a driver fabricate an assignment state (FR-7.7). */
export const availabilitySchema = z.object({
  availability: z.enum(['OFFLINE', 'AVAILABLE']),
});

export const locationSchema = z.object({ latitude, longitude });

export const declineSchema = z.object({ reason: optionalTrimmed(200) });

export const offerParam = z.object({ id: uuid });
export const orderParam = z.object({ orderId: uuid });

export const deliveriesQuery = z.object({
  scope: z.enum(['active', 'history']).default('active'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
