import { z } from 'zod';
import { CUISINE_TYPES } from '../../shared/constants.js';
import {
  latitude, longitude, moneyAmount, optionalTrimmed, phone, trimmedString,
} from '../../shared/validation/common.js';

/** http(s) only. The value lands in an <img src>, so a javascript: or data:
 *  URL is an XSS vector rather than a formatting mistake. */
const imageUrl = z
  .string()
  .trim()
  .max(500, 'must be at most 500 characters')
  .refine((v) => /^https?:\/\//i.test(v), { message: 'must be an http(s) URL' })
  .optional()
  .nullable();

export const updateRestaurantSchema = z.object({
  name: trimmedString(2, 120).optional(),
  description: optionalTrimmed(2000),
  cuisineType: z.enum(CUISINE_TYPES).optional(),
  phone: phone.optional(),
  email: z.string().trim().toLowerCase().email().optional().nullable(),
  logoUrl: imageUrl,
  coverImageUrl: imageUrl,
  addressLine1: optionalTrimmed(200),
  city: optionalTrimmed(100),
  district: optionalTrimmed(100),
  latitude: latitude.optional(),
  longitude: longitude.optional(),
  deliveryFee: moneyAmount({ min: 0, max: 999.99 }).optional(),
  minimumOrderAmount: moneyAmount({ min: 0, max: 9999.99 }).optional(),
  avgPreparationMinutes: z.coerce.number().int().min(5).max(180).optional(),
  // One decimal (the column is NUMERIC(4,1)); the bounds mirror its CHECK.
  deliveryRadiusKm: z.coerce.number().min(1).max(30).transform((v) => Math.round(v * 10) / 10).optional(),
});

const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:mm');

const hoursEntry = z
  .object({
    dayOfWeek: z.coerce.number().int().min(0).max(6),
    isClosed: z.boolean().default(false),
    opensAt: timeString.optional().nullable(),
    closesAt: timeString.optional().nullable(),
  })
  .refine((v) => v.isClosed || (v.opensAt && v.closesAt), {
    message: 'opensAt and closesAt are required unless the day is closed',
    path: ['opensAt'],
  })
  .refine((v) => v.isClosed || !v.opensAt || !v.closesAt || v.closesAt > v.opensAt, {
    message: 'closesAt must be later than opensAt. Overnight hours are not supported in this version; use 23:59.',
    path: ['closesAt'],
  });

/** A full-week replacement (ADR-014). A partial update makes "clear Tuesday"
 *  and "do not touch Tuesday" indistinguishable in JSON. */
export const replaceHoursSchema = z.object({
  hours: z
    .array(hoursEntry)
    .length(7, 'exactly 7 entries are required, one per day of week')
    .refine((rows) => new Set(rows.map((r) => r.dayOfWeek)).size === 7, {
      message: 'each dayOfWeek 0-6 must appear exactly once',
    }),
});

export const acceptingOrdersSchema = z.object({ isAcceptingOrders: z.boolean() });
