/** Every event type the API can push. Clients refetch details on receipt. */
export const EVENT_TYPES = Object.freeze({
  ORDER_CREATED: 'order.created',
  ORDER_STATUS: 'order.status',
  /** A non-status change a viewer cares about, e.g. a driver was assigned. */
  ORDER_UPDATED: 'order.updated',
  OFFER_CREATED: 'offer.created',
  OFFER_EXPIRED: 'offer.expired',
  /** Accepted by the driver it was offered to. */
  OFFER_TAKEN: 'offer.taken',
  /** Declined, or its order was cancelled before anyone accepted it. */
  OFFER_WITHDRAWN: 'offer.withdrawn',
});
