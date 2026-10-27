import { z } from 'zod';
import { CANCELLATION_REASONS, ORDER_STATUSES, PAYMENT_METHODS } from '../../shared/constants.js';
import { optionalTrimmed, paginationQuery, uuid } from '../../shared/validation/common.js';

/**
 * Checkout input. Note what is absent: every monetary field.
 * A price sent by a client is stripped here and never reaches the service
 * (BR-O5) - price tampering is closed by the schema, not by a check.
 */
export const checkoutSchema = z.object({
  addressId: uuid,
  customerNote: optionalTrimmed(500),
  paymentMethod: z.enum(PAYMENT_METHODS).default('CASH_ON_DELIVERY'),
});

/** The gateway payment id the browser got back after paying. Only a pointer: the gateway is asked. */
export const confirmPaymentSchema = z.object({
  providerPaymentId: z.string().trim().min(1).max(100),
});

export const customerCancelSchema = z.object({
  reason: z.enum(CANCELLATION_REASONS).default('CUSTOMER_CHANGED_MIND'),
});

export const restaurantReasonSchema = z.object({
  reason: z.enum(CANCELLATION_REASONS),
  note: optionalTrimmed(300),
});

export const ordersQuery = paginationQuery.extend({
  scope: z.enum(['active', 'past']).optional(),
});

export const restaurantOrdersQuery = paginationQuery.extend({
  scope: z.enum(['active', 'history']).default('active'),
  status: z.enum(ORDER_STATUSES).optional(),
});
