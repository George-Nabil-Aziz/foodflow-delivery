import { knex } from '../../shared/db/knex.js';
import { config } from '../../config/index.js';

/** Periods the owner may pick, in days (BR-RA1). */
export const PERIOD_DAYS = [7, 30, 90];
export const TOP_ITEMS = 5;

const rows = (sql, bindings) => knex.raw(sql, bindings).then((r) => r.rows);

/**
 * One restaurant's trading summary for the last `days` days. Read-only SQL
 * aggregation over existing tables, uncached, in the style of the admin
 * dashboard statistics: a wrong number is worse than a slow one.
 *
 * Every figure is for orders PLACED in the window (`placed_at`), so the
 * cancellation rate compares like with like: of the orders that started in
 * the window and have finished, how many ended in a cancellation. Orders
 * still in progress are in neither side of that fraction.
 *
 * Money. "Revenue" is the food the restaurant sold: orders.subtotal (the sum of
 * its item line totals) minus orders.discount_amount, DELIVERED orders only.
 * Delivery fee and tax are left out because neither is the restaurant's sale
 * (the fee pays for delivery, tax is collected on behalf of the state), and the
 * discount is taken off because the customer did not pay for that part of the
 * food (BR-RA3). The average order value uses the same figure.
 *
 * Time zone. The hour of day is the platform's wall clock (PLATFORM_TIMEZONE,
 * Africa/Cairo), the same zone the opening hours are read in; a UTC hour would
 * put the lunch rush at the wrong bar (BR-RA5).
 */
export async function restaurantAnalytics(restaurantId, days) {
  const zone = config.platformTimezone;
  // A parameterised interval: `days` has been through the schema, but nothing
  // reaches the SQL as text regardless.
  const [summary] = await rows(
    `
    SELECT
      count(*) FILTER (WHERE status = 'DELIVERED')   AS delivered,
      count(*) FILTER (WHERE status = 'CANCELLED')   AS cancelled,
      COALESCE(sum(subtotal - discount_amount) FILTER (WHERE status = 'DELIVERED'), 0.00) AS revenue,
      round(avg(subtotal - discount_amount) FILTER (WHERE status = 'DELIVERED'), 2) AS average_order_value
    FROM orders
    WHERE restaurant_id = ? AND placed_at >= now() - (?::int * interval '1 day')
    `,
    [restaurantId, days],
  );

  const [topItems, byHour, [prep]] = await Promise.all([
    // Grouped on the snapshot name, as the admin leaderboard is: it is what the
    // customer bought, and it survives the item being renamed or deleted.
    rows(
      `
      SELECT oi.item_name_snapshot AS name, sum(oi.quantity) AS quantity, sum(oi.line_total) AS revenue
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.restaurant_id = ? AND o.status = 'DELIVERED'
        AND o.placed_at >= now() - (?::int * interval '1 day')
      GROUP BY oi.item_name_snapshot
      ORDER BY quantity DESC, name ASC
      LIMIT ?
      `,
      [restaurantId, days, TOP_ITEMS],
    ),
    rows(
      `
      SELECT EXTRACT(HOUR FROM placed_at AT TIME ZONE ?)::int AS hour, count(*) AS orders
      FROM orders
      WHERE restaurant_id = ? AND status = 'DELIVERED'
        AND placed_at >= now() - (?::int * interval '1 day')
      GROUP BY 1
      `,
      [zone, restaurantId, days],
    ),
    // Accepted (CONFIRMED) to ready (READY_FOR_PICKUP), from the event log: the
    // first time each was reached. An order that never got ready has no pair
    // and is not in the average.
    rows(
      `
      SELECT AVG(EXTRACT(EPOCH FROM (ready.at - accepted.at)) / 60) AS avg_minutes
      FROM orders o
      JOIN LATERAL (
        SELECT min(created_at) AS at FROM order_status_events
        WHERE order_id = o.id AND to_status = 'CONFIRMED'
      ) accepted ON true
      JOIN LATERAL (
        SELECT min(created_at) AS at FROM order_status_events
        WHERE order_id = o.id AND to_status = 'READY_FOR_PICKUP'
      ) ready ON true
      WHERE o.restaurant_id = ? AND o.placed_at >= now() - (?::int * interval '1 day')
        AND accepted.at IS NOT NULL AND ready.at IS NOT NULL AND ready.at >= accepted.at
      `,
      [restaurantId, days],
    ),
  ]);

  const delivered = Number(summary.delivered);
  const cancelled = Number(summary.cancelled);
  const finished = delivered + cancelled;

  const hourCounts = new Map(byHour.map((h) => [h.hour, Number(h.orders)]));

  return {
    periodDays: days,
    timezone: zone,
    deliveredOrders: delivered,
    revenue: summary.revenue,
    // Money stays a string; the average is rounded by the database on NUMERIC,
    // so no float is ever made. Null with no delivered orders.
    averageOrderValue: summary.average_order_value,
    cancelledOrders: cancelled,
    // Null, not 0, with nothing finished: "no data" is not "no cancellations".
    cancellationRate: finished === 0 ? null : Math.round((cancelled / finished) * 1000) / 10,
    topItems: topItems.map((i) => ({ name: i.name, quantity: Number(i.quantity), revenue: i.revenue })),
    ordersByHour: Array.from({ length: 24 }, (_, hour) => ({ hour, orders: hourCounts.get(hour) ?? 0 })),
    averagePreparationMinutes:
      prep.avg_minutes == null ? null : Math.round(Number(prep.avg_minutes) * 10) / 10,
  };
}
