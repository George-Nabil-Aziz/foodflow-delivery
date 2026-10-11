import { ConflictError } from '../../shared/errors/AppError.js';

/**
 * The order state machine — a literal transcription of master-sdd 7.3.
 *
 * Pure and dependency-free, which is what makes all 245 status x status x role
 * combinations exhaustively testable. This is the ONLY authority on whether a
 * status may change; `orderRepo.updateStatus` is not exported from the module
 * index, so there is no second path.
 */
export const TRANSITIONS = Object.freeze({
  PENDING: {
    CONFIRMED: ['RESTAURANT'],
    CANCELLED: ['CUSTOMER', 'RESTAURANT', 'ADMIN', 'SYSTEM'],
  },
  CONFIRMED: {
    PREPARING: ['RESTAURANT'],
    CANCELLED: ['CUSTOMER', 'RESTAURANT', 'ADMIN'],
  },
  PREPARING: {
    READY_FOR_PICKUP: ['RESTAURANT'],
    // Customer deliberately excluded: from here ingredients are committed.
    CANCELLED: ['RESTAURANT', 'ADMIN'],
  },
  READY_FOR_PICKUP: {
    OUT_FOR_DELIVERY: ['DRIVER'],
    CANCELLED: ['ADMIN'],
  },
  OUT_FOR_DELIVERY: {
    DELIVERED: ['DRIVER'],
    CANCELLED: ['ADMIN'],
  },
  DELIVERED: {},
  CANCELLED: {},
});

/** Actors who must supply a reason when cancelling (BR-O8). */
export const REASON_REQUIRED_FOR = Object.freeze(['RESTAURANT', 'ADMIN']);

export const TERMINAL_STATUSES = Object.freeze(['DELIVERED', 'CANCELLED']);

export const isTerminal = (status) => TERMINAL_STATUSES.includes(status);

/** Statuses an order in `from` may reach, for the actor given. */
export function allowedTransitions(from, actorRole) {
  const edges = TRANSITIONS[from] ?? {};
  return Object.entries(edges)
    .filter(([, actors]) => !actorRole || actors.includes(actorRole))
    .map(([to]) => to);
}

export function canTransition(from, to, actorRole) {
  const actors = TRANSITIONS[from]?.[to];
  return Array.isArray(actors) && actors.includes(actorRole);
}

/**
 * Throws unless the transition is in the table AND permitted for this actor AND
 * carries a reason where one is required.
 *
 * Note the two separate failures: an edge can exist but be closed to an actor.
 * PREPARING -> CANCELLED is legal, but not for a CUSTOMER.
 */
export function assertTransition(from, to, { actorRole, reason } = {}) {
  const edges = TRANSITIONS[from];

  if (!edges) {
    throw new ConflictError('INVALID_ORDER_TRANSITION', {
      message: `Unknown order status "${from}".`,
      details: [{ field: 'status', issue: `Unknown order status "${from}".` }],
    });
  }

  if (isTerminal(from)) {
    throw new ConflictError('INVALID_ORDER_TRANSITION', {
      message: `Order is ${from}, which is final; no further transitions are possible.`,
      details: [{
        field: 'status',
        issue: `Order is ${from}, which is final. No further changes are possible.`,
      }],
    });
  }

  const actors = edges[to];
  if (!Array.isArray(actors)) {
    throw new ConflictError('INVALID_ORDER_TRANSITION', {
      message: `An order cannot move from ${from} to ${to}.`,
      details: [{
        field: 'status',
        issue: `An order cannot move from ${from} to ${to}.`,
        currentStatus: from,
        allowed: allowedTransitions(from, actorRole),
      }],
    });
  }

  if (!actors.includes(actorRole)) {
    throw new ConflictError('INVALID_ORDER_TRANSITION', {
      message: `Order is ${from}; ${actorRole} may not move it to ${to}.`,
      details: [{
        field: 'status',
        issue: `Order is ${from}; ${actorRole ?? 'this actor'} may not move it to ${to}.`,
        currentStatus: from,
        allowed: allowedTransitions(from, actorRole),
      }],
    });
  }

  if (to === 'CANCELLED' && REASON_REQUIRED_FOR.includes(actorRole) && !reason) {
    throw new ConflictError('INVALID_ORDER_TRANSITION', {
      message: `A cancellation reason is required for ${actorRole}.`,
      details: [{ field: 'reason', issue: 'A cancellation reason is required.' }],
    });
  }

  return true;
}

/** Timestamp column stamped when an order reaches each status. */
export const STATUS_TIMESTAMP_COLUMN = Object.freeze({
  CONFIRMED: 'confirmed_at',
  PREPARING: 'preparing_at',
  READY_FOR_PICKUP: 'ready_at',
  OUT_FOR_DELIVERY: 'picked_up_at',
  DELIVERED: 'delivered_at',
  CANCELLED: 'cancelled_at',
});
