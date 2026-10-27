import { z } from 'zod';
import {
  latitude, longitude, optionalTrimmed, phone, trimmedString,
} from '../../shared/validation/common.js';

/** Only name, phone and preferred language. email, role and status are absent by design, so they
 *  are stripped rather than blocklisted (BR-A9, ADR-005). */
export const updateProfileSchema = z
  .object({
    fullName: trimmedString(2, 100).optional(),
    phone: phone.optional(),
    preferredLanguage: z.enum(['en', 'ar']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });

const coords = z
  .object({ latitude: latitude.optional(), longitude: longitude.optional() })
  .refine((v) => (v.latitude === undefined) === (v.longitude === undefined), {
    message: 'latitude and longitude must be provided together',
    path: ['latitude'],
  });

export const createAddressSchema = z
  .object({
    label: optionalTrimmed(50),
    line1: trimmedString(5, 200),
    line2: optionalTrimmed(200),
    city: trimmedString(2, 100),
    district: optionalTrimmed(100),
    postalCode: optionalTrimmed(20),
    isDefault: z.boolean().optional(),
  })
  .and(coords);

export const updateAddressSchema = z
  .object({
    label: optionalTrimmed(50),
    line1: trimmedString(5, 200).optional(),
    line2: optionalTrimmed(200),
    city: trimmedString(2, 100).optional(),
    district: optionalTrimmed(100),
    postalCode: optionalTrimmed(20),
  })
  // An empty patch is a client error, not an empty UPDATE: without this the
  // repository would build `update({})`, which the driver rejects as a 500.
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' })
  .and(coords);
