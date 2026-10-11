import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  computeOrderability,
  isWithinHours,
  dayOfWeek,
  minutesOfDay,
} from '../../src/modules/restaurants/orderability.js';
import { RESTAURANT_STATUSES } from '../../src/shared/constants.js';

const openAllDay = { is_closed: false, opens_at: '00:00', closes_at: '23:59' };
const closedToday = { is_closed: true, opens_at: null, closes_at: null };

afterEach(() => vi.useRealTimers());

/**
 * TC-084: the full truth table. One pure function is the sole authority on
 * orderability; duplicating the condition anywhere else is how a UI comes to
 * offer an order the API then refuses.
 */
describe('TC-084: orderability truth table', () => {
  const combinations = [];
  for (const status of RESTAURANT_STATUSES) {
    for (const accepting of [true, false]) {
      for (const inHours of [true, false]) {
        combinations.push([status, accepting, inHours]);
      }
    }
  }

  it('covers all 16 combinations', () => {
    expect(combinations).toHaveLength(16);
  });

  it.each(combinations)(
    'status=%s accepting=%s inHours=%s',
    (status, accepting, inHours) => {
      const result = computeOrderability(
        { status, is_accepting_orders: accepting },
        inHours ? openAllDay : closedToday,
      );

      const shouldBeOrderable = status === 'ACTIVE' && accepting && inHours;
      expect(result.isOrderable).toBe(shouldBeOrderable);

      // Reasons follow a documented precedence: NOT_ACTIVE, then
      // NOT_ACCEPTING, then CLOSED_NOW.
      if (shouldBeOrderable) expect(result.reason).toBe('OK');
      else if (status !== 'ACTIVE') expect(result.reason).toBe('NOT_ACTIVE');
      else if (!accepting) expect(result.reason).toBe('NOT_ACCEPTING');
      else expect(result.reason).toBe('CLOSED_NOW');
    },
  );

  it('is orderable only for ACTIVE + accepting + in hours', () => {
    const orderable = combinations.filter(([status, accepting, inHours]) =>
      computeOrderability({ status, is_accepting_orders: accepting }, inHours ? openAllDay : closedToday)
        .isOrderable);
    expect(orderable).toHaveLength(1);
    expect(orderable[0]).toEqual(['ACTIVE', true, true]);
  });

  it('treats a missing restaurant as not orderable rather than throwing', () => {
    expect(computeOrderability(null, null).isOrderable).toBe(false);
  });
});

/**
 * TC-085: boundary minutes. Opening is inclusive, closing is exclusive - a
 * restaurant closing at 14:00 is closed at 14:00. Stated explicitly so the
 * implementation cannot silently pick the other convention (finding D-05).
 */
describe('TC-085: opening-hours boundaries', () => {
  const hours = { is_closed: false, opens_at: '12:00', closes_at: '14:00' };

  const at = (hhmm) => {
    // The platform timezone is Asia/Riyadh (UTC+3); build the UTC instant that
    // corresponds to the wanted local wall-clock time.
    const [h, m] = hhmm.split(':').map(Number);
    return new Date(Date.UTC(2026, 8, 22, h - 3, m, 0));
  };

  it('is closed one minute before opening', () => {
    expect(isWithinHours(hours, at('11:59'))).toBe(false);
  });

  it('is OPEN exactly at the opening minute', () => {
    expect(isWithinHours(hours, at('12:00'))).toBe(true);
  });

  it('is open one minute before closing', () => {
    expect(isWithinHours(hours, at('13:59'))).toBe(true);
  });

  it('is CLOSED exactly at the closing minute', () => {
    expect(isWithinHours(hours, at('14:00'))).toBe(false);
  });

  it('is closed on a day marked closed', () => {
    expect(isWithinHours(closedToday, at('13:00'))).toBe(false);
  });

  it('is closed when no hours row exists for the day', () => {
    expect(isWithinHours(null, at('13:00'))).toBe(false);
    expect(isWithinHours(undefined, at('13:00'))).toBe(false);
  });
});

describe('timezone helpers', () => {
  it('reports the day of week with Sunday as 0', () => {
    // 2026-09-20 is a Sunday.
    expect(dayOfWeek(new Date(Date.UTC(2026, 8, 20, 9, 0)))).toBe(0);
    expect(dayOfWeek(new Date(Date.UTC(2026, 8, 21, 9, 0)))).toBe(1);
  });

  it('reports minutes since midnight in the platform timezone', () => {
    // 09:00 UTC is 12:00 in Asia/Riyadh.
    expect(minutesOfDay(new Date(Date.UTC(2026, 8, 22, 9, 0)))).toBe(12 * 60);
  });
});
