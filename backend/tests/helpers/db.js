import { knex } from '../../src/shared/db/knex.js';

const TABLES = [
  'payments', 'order_status_events', 'order_items', 'delivery_assignments', 'reviews', 'orders',
  'cart_items', 'carts', 'food_items', 'menu_categories', 'restaurant_hours',
  'driver_profiles', 'restaurants', 'admin_audit_logs', 'notifications',
  'refresh_tokens', 'customer_addresses', 'users',
];

/** Tests run against real PostgreSQL: the design leans on partial unique
 *  indexes, check constraints and FOR UPDATE, none of which exist in a mock. */
export async function resetDatabase() {
  await knex.raw(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
}

export async function migrateLatest() {
  await knex.migrate.latest();
}

export async function closeDb() {
  await knex.destroy();
}

export { knex };
