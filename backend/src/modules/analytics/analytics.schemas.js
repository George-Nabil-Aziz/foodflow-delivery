import { z } from 'zod';
import { PERIOD_DAYS } from './analytics.service.js';

/** `days` is one of the offered periods, never free text: a 90-day ceiling
 *  keeps the aggregate cheap (BR-RA1). */
export const analyticsQuery = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((d) => PERIOD_DAYS.includes(d), { message: `must be one of ${PERIOD_DAYS.join(', ')}` })
    .default(30),
});
