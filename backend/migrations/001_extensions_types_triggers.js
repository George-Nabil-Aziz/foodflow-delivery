/**
 * Extensions, enum types and the shared updated_at trigger.
 *
 * Every enum type is created here, including ones nothing uses yet, so the type
 * vocabulary lives in one migration instead of scattered CREATE TYPE statements
 * across the six that follow.
 */
export async function up(knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS citext');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pg_trgm');

  const types = [
    [`user_role`, `'CUSTOMER','RESTAURANT','DRIVER','ADMIN'`],
    [`user_status`, `'ACTIVE','SUSPENDED'`],
    [`restaurant_status`, `'PENDING_APPROVAL','ACTIVE','SUSPENDED','REJECTED'`],
    [`driver_status`, `'PENDING_APPROVAL','ACTIVE','SUSPENDED'`],
    [`driver_availability`, `'OFFLINE','AVAILABLE','ON_DELIVERY'`],
    [`vehicle_type`, `'BICYCLE','MOTORCYCLE','CAR'`],
    [`cart_status`, `'ACTIVE','CONVERTED','ABANDONED'`],
    [
      `order_status`,
      `'PENDING','CONFIRMED','PREPARING','READY_FOR_PICKUP','OUT_FOR_DELIVERY','DELIVERED','CANCELLED'`,
    ],
    [`dispatch_state`, `'NOT_REQUIRED','UNASSIGNED','OFFERED','ASSIGNED','COMPLETED'`],
    [`actor_type`, `'CUSTOMER','RESTAURANT','DRIVER','ADMIN','SYSTEM'`],
    [
      `cancellation_reason`,
      `'CUSTOMER_CHANGED_MIND','CUSTOMER_ORDERED_BY_MISTAKE','RESTAURANT_TOO_BUSY','RESTAURANT_CLOSED','OUT_OF_STOCK','NO_DRIVER_AVAILABLE','UNDELIVERABLE_ADDRESS','ADMIN_INTERVENTION','ACCEPT_TIMEOUT'`,
    ],
    [`assignment_status`, `'OFFERED','ACCEPTED','DECLINED','EXPIRED','CANCELLED','COMPLETED'`],
    [`payment_method`, `'CASH_ON_DELIVERY'`],
    [`review_status`, `'PUBLISHED','HIDDEN'`],
  ];

  for (const [name, values] of types) {
    await knex.raw(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${name}') THEN
          CREATE TYPE ${name} AS ENUM (${values});
        END IF;
      END $$;
    `);
  }

  await knex.raw(`
    CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
}

export async function down(knex) {
  await knex.raw('DROP FUNCTION IF EXISTS set_updated_at() CASCADE');
  const types = [
    'review_status', 'payment_method', 'assignment_status', 'cancellation_reason',
    'actor_type', 'dispatch_state', 'order_status', 'cart_status', 'vehicle_type',
    'driver_availability', 'driver_status', 'restaurant_status', 'user_status', 'user_role',
  ];
  for (const t of types) await knex.raw(`DROP TYPE IF EXISTS ${t}`);
}
