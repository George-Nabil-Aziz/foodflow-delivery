import { ORDERABILITY_REASONS } from '../../shared/constants.js';
import { config } from '../../config/index.js';

/**
 * The single authority on "can a customer order from this restaurant right
 * now?" (BR-R3). Pure, so the whole truth table is unit-testable.
 *
 * Every caller — listing, add-to-cart, checkout — uses this one function.
 * Duplicating the condition anywhere else is the fastest way to get a UI that
 * offers an order the API then refuses.
 *
 * Boundary convention: opening is inclusive, closing is exclusive. A restaurant
 * closing at 14:00 is closed at 14:00. (Finding D-05.)
 */
export function computeOrderability(restaurant, hoursForToday, now = new Date()) {
  if (!restaurant || restaurant.status !== 'ACTIVE') {
    return { isOrderable: false, isOpenNow: false, reason: ORDERABILITY_REASONS.NOT_ACTIVE };
  }

  const open = isWithinHours(hoursForToday, now);

  if (!restaurant.is_accepting_orders) {
    return { isOrderable: false, isOpenNow: open, reason: ORDERABILITY_REASONS.NOT_ACCEPTING };
  }
  if (!open) {
    return { isOrderable: false, isOpenNow: false, reason: ORDERABILITY_REASONS.CLOSED_NOW };
  }
  return { isOrderable: true, isOpenNow: true, reason: ORDERABILITY_REASONS.OK };
}

/** Minutes since midnight in the platform timezone. */
export function minutesOfDay(date, timeZone = config.platformTimezone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour').value);
  const minute = Number(parts.find((p) => p.type === 'minute').value);
  return hour * 60 + minute;
}

/** 0 = Sunday, matching restaurant_hours.day_of_week. */
export function dayOfWeek(date, timeZone = config.platformTimezone) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

function toMinutes(timeString) {
  if (!timeString) return null;
  const [h, m] = String(timeString).split(':');
  return Number(h) * 60 + Number(m);
}

export function isWithinHours(hoursForToday, now = new Date()) {
  if (!hoursForToday || hoursForToday.is_closed) return false;
  const opens = toMinutes(hoursForToday.opens_at);
  const closes = toMinutes(hoursForToday.closes_at);
  if (opens === null || closes === null) return false;
  const current = minutesOfDay(now);
  // Overnight ranges are not supported in v1 (BR-R11, assumption A-09); the
  // check constraint guarantees closes > opens.
  return current >= opens && current < closes;
}
