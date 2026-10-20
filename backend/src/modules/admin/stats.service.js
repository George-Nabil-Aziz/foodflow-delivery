import { knex } from '../../shared/db/knex.js';
import { config } from '../../config/index.js';

/**
 * Platform statistics. A small set of grouped aggregates, not one query per
 * tile. Read-only and uncached: at this scale correctness beats a cache, and a
 * wrong number on an operations dashboard is worse than a slow one.
 */
export async function platformStats() {
  const [orderRows] = await knex
    .raw(
      `
    SELECT
      count(*) FILTER (WHERE placed_at >= date_trunc('day', now()))  AS today,
      count(*) FILTER (WHERE status = 'PENDING')                     AS pending,
      count(*) FILTER (WHERE status = 'CONFIRMED')                   AS confirmed,
      count(*) FILTER (WHERE status = 'PREPARING')                   AS preparing,
      count(*) FILTER (WHERE status = 'READY_FOR_PICKUP')            AS ready_for_pickup,
      count(*) FILTER (WHERE status = 'OUT_FOR_DELIVERY')            AS out_for_delivery,
      count(*) FILTER (WHERE status = 'DELIVERED')                   AS delivered,
      count(*) FILTER (WHERE status = 'CANCELLED')                   AS cancelled,
      -- GMV counts DELIVERED orders only. Counting cancelled orders as revenue
      -- would make the metric a lie (BR-AD9).
      COALESCE(sum(total_amount) FILTER (
        WHERE status = 'DELIVERED' AND delivered_at >= date_trunc('day', now())), 0) AS gmv_today,
      COALESCE(sum(total_amount) FILTER (
        WHERE status = 'DELIVERED' AND delivered_at >= now() - interval '30 days'), 0) AS gmv_30d,
      AVG(EXTRACT(EPOCH FROM (delivered_at - picked_up_at)) / 60) FILTER (
        WHERE status = 'DELIVERED' AND picked_up_at IS NOT NULL AND delivered_at IS NOT NULL
      ) AS avg_delivery_minutes
    FROM orders
    `,
    )
    .then((r) => r.rows);

  const [accountRows] = await knex
    .raw(
      `
    SELECT
      (SELECT count(*) FROM users WHERE role = 'CUSTOMER' AND deleted_at IS NULL)         AS customers,
      (SELECT count(*) FROM restaurants WHERE status = 'ACTIVE' AND deleted_at IS NULL)   AS active_restaurants,
      (SELECT count(*) FROM restaurants WHERE status = 'PENDING_APPROVAL' AND deleted_at IS NULL) AS pending_restaurants,
      (SELECT count(*) FROM driver_profiles d JOIN users u ON u.id = d.user_id AND u.deleted_at IS NULL
        WHERE d.status = 'ACTIVE')                                                        AS active_drivers,
      (SELECT count(*) FROM driver_profiles d JOIN users u ON u.id = d.user_id AND u.deleted_at IS NULL
        WHERE d.availability = 'ON_DELIVERY')                                             AS drivers_on_delivery,
      (SELECT count(*) FROM driver_profiles d JOIN users u ON u.id = d.user_id AND u.deleted_at IS NULL
        WHERE d.status = 'PENDING_APPROVAL')                                              AS pending_drivers
    `,
    )
    .then((r) => r.rows);

  const [backlogRow] = await knex
    .raw(
      `
    SELECT count(*) AS unassigned FROM orders
    WHERE dispatch_state = 'UNASSIGNED'
      AND status IN ('CONFIRMED','PREPARING','READY_FOR_PICKUP')
      AND confirmed_at < now() - (? || ' minutes')::interval
    `,
      [config.unassignedEscalationMinutes],
    )
    .then((r) => r.rows);

  const topRestaurants = await knex
    .raw(
      `
    SELECT r.id, r.name, count(o.id) AS orders, COALESCE(sum(o.total_amount), 0) AS gmv
    FROM orders o JOIN restaurants r ON r.id = o.restaurant_id
    WHERE o.status = 'DELIVERED' AND o.delivered_at >= now() - interval '30 days'
    GROUP BY r.id, r.name ORDER BY gmv DESC LIMIT 5
    `,
    )
    .then((r) => r.rows);

  return {
    orders: {
      today: Number(orderRows.today),
      byStatus: {
        PENDING: Number(orderRows.pending),
        CONFIRMED: Number(orderRows.confirmed),
        PREPARING: Number(orderRows.preparing),
        READY_FOR_PICKUP: Number(orderRows.ready_for_pickup),
        OUT_FOR_DELIVERY: Number(orderRows.out_for_delivery),
        DELIVERED: Number(orderRows.delivered),
        CANCELLED: Number(orderRows.cancelled),
      },
    },
    gmv: { today: orderRows.gmv_today, last30Days: orderRows.gmv_30d },
    accounts: {
      customers: Number(accountRows.customers),
      activeRestaurants: Number(accountRows.active_restaurants),
      pendingRestaurants: Number(accountRows.pending_restaurants),
      activeDrivers: Number(accountRows.active_drivers),
      driversOnDelivery: Number(accountRows.drivers_on_delivery),
      pendingDrivers: Number(accountRows.pending_drivers),
    },
    topRestaurants: topRestaurants.map((t) => ({
      id: t.id, name: t.name, orders: Number(t.orders), gmv: t.gmv,
    })),
    unassignedBacklog: Number(backlogRow.unassigned),
    averageDeliveryMinutes:
      orderRows.avg_delivery_minutes == null ? null : Math.round(Number(orderRows.avg_delivery_minutes)),
  };
}
