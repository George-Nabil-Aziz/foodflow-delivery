/**
 * Delivery zones (spec-18). Each restaurant delivers within a radius of its own
 * coordinates. Existing rows get the default, so nothing that worked before
 * stops working; the owner narrows or widens it from the profile screen.
 */
export async function up(knex) {
  await knex.raw(`
    ALTER TABLE restaurants
      ADD COLUMN delivery_radius_km numeric(4,1) NOT NULL DEFAULT 8,
      ADD CONSTRAINT chk_restaurants_delivery_radius
        CHECK (delivery_radius_km BETWEEN 1 AND 30)
  `);
}

export async function down(knex) {
  await knex.raw(`
    ALTER TABLE restaurants
      DROP CONSTRAINT chk_restaurants_delivery_radius,
      DROP COLUMN delivery_radius_km
  `);
}
