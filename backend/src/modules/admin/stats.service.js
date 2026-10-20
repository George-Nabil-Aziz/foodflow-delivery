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

  const rows = (sql) => knex.raw(sql).then((r) => r.rows);
  const [today, topDrivers, topCustomers, topRated, topItems, activity] = await Promise.all([
    rows(`
      SELECT
        (SELECT count(*) FROM users WHERE role = 'CUSTOMER' AND created_at >= date_trunc('day', now())) AS new_customers,
        (SELECT count(*) FROM reviews WHERE created_at >= date_trunc('day', now()))                   AS reviews,
        (SELECT count(*) FROM orders WHERE delivered_at >= date_trunc('day', now()))                  AS delivered,
        (SELECT count(*) FROM orders WHERE cancelled_at >= date_trunc('day', now()))                  AS cancelled,
        (SELECT count(*) FROM orders WHERE status IN ('PENDING','CONFIRMED','PREPARING','READY_FOR_PICKUP','OUT_FOR_DELIVERY')) AS in_progress,
        (SELECT AVG(restaurant_rating) FROM reviews WHERE created_at >= now() - interval '30 days')   AS avg_rating_30d
    `),
    // The 30-day leaderboards, one per party.
    rows(`
      SELECT u.id, u.full_name AS name, count(o.id) AS deliveries, d.rating_average, d.rating_count
      FROM orders o JOIN users u ON u.id = o.driver_user_id JOIN driver_profiles d ON d.user_id = u.id
      WHERE o.status = 'DELIVERED' AND o.delivered_at >= now() - interval '30 days'
      GROUP BY u.id, u.full_name, d.rating_average, d.rating_count ORDER BY deliveries DESC LIMIT 5
    `),
    rows(`
      SELECT u.id, u.full_name AS name, count(o.id) AS orders, COALESCE(sum(o.total_amount), 0) AS spent
      FROM orders o JOIN users u ON u.id = o.customer_user_id
      WHERE o.status = 'DELIVERED' AND o.delivered_at >= now() - interval '30 days'
      GROUP BY u.id, u.full_name ORDER BY spent DESC LIMIT 5
    `),
    // At least three reviews, so one 5-star review cannot top the chart.
    rows(`
      SELECT id, name, rating_average, rating_count FROM restaurants
      WHERE deleted_at IS NULL AND status = 'ACTIVE' AND rating_count >= 3
      ORDER BY rating_average DESC, rating_count DESC LIMIT 5
    `),
    rows(`
      SELECT oi.item_name_snapshot AS name, r.name AS restaurant, sum(oi.quantity) AS quantity
      FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN restaurants r ON r.id = o.restaurant_id
      WHERE o.status = 'DELIVERED' AND o.delivered_at >= now() - interval '30 days'
      GROUP BY oi.item_name_snapshot, r.name ORDER BY quantity DESC LIMIT 5
    `),
    // One feed of what just happened: order moves, sign-ups and reviews.
    rows(`
      (SELECT 'ORDER' AS kind, e.created_at AS at, o.id AS ref_id, o.order_number::text AS ref, e.to_status::text AS detail,
              o.restaurant_name_snapshot AS subject, NULL::smallint AS rating
         FROM order_status_events e JOIN orders o ON o.id = e.order_id
         ORDER BY e.created_at DESC LIMIT 20)
      UNION ALL
      (SELECT 'SIGNUP', created_at, id, full_name, role::text, email, NULL
         FROM users ORDER BY created_at DESC LIMIT 20)
      UNION ALL
      (SELECT 'REVIEW', v.created_at, v.id, u.full_name, v.comment, r.name, v.restaurant_rating
         FROM reviews v JOIN users u ON u.id = v.customer_user_id JOIN restaurants r ON r.id = v.restaurant_id
         ORDER BY v.created_at DESC LIMIT 20)
      ORDER BY at DESC LIMIT 20
    `),
  ]);
  const [day] = today;

  return {
    today: {
      newCustomers: Number(day.new_customers),
      reviews: Number(day.reviews),
      delivered: Number(day.delivered),
      cancelled: Number(day.cancelled),
      inProgress: Number(day.in_progress),
    },
    averageRating30d: day.avg_rating_30d == null ? null : Number(Number(day.avg_rating_30d).toFixed(2)),
    topDrivers: topDrivers.map((d) => ({
      id: d.id, name: d.name, deliveries: Number(d.deliveries),
      ratingAverage: d.rating_average, ratingCount: Number(d.rating_count),
    })),
    topCustomers: topCustomers.map((c) => ({ id: c.id, name: c.name, orders: Number(c.orders), spent: c.spent })),
    topRated: topRated.map((r) => ({
      id: r.id, name: r.name, ratingAverage: r.rating_average, ratingCount: Number(r.rating_count),
    })),
    topItems: topItems.map((i) => ({ name: i.name, restaurant: i.restaurant, quantity: Number(i.quantity) })),
    activity: activity.map((a) => ({
      kind: a.kind, at: a.at, refId: a.ref_id, ref: a.ref, detail: a.detail, subject: a.subject, rating: a.rating,
    })),
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
