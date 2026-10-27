/**
 * favourite_restaurants, favourite_items (spec-16).
 *
 * One table per kind rather than a polymorphic (kind, target_id) pair, so each
 * target is a real foreign key and a hard-deleted restaurant or item cannot
 * leave a dangling favourite behind. The composite primary key is what makes
 * "favourite it twice" one row (BR-FV2): the insert is ON CONFLICT DO NOTHING.
 *
 * Restaurants and items are soft-deleted, so the cascade only fires on a hard
 * delete; a soft-deleted target keeps its row and is shown as unavailable.
 */
export async function up(knex) {
  await knex.raw(`
    CREATE TABLE favourite_restaurants (
      user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      created_at    timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, restaurant_id)
    );
  `);
  await knex.raw('CREATE INDEX idx_favourite_restaurants_user ON favourite_restaurants (user_id, created_at DESC)');

  await knex.raw(`
    CREATE TABLE favourite_items (
      user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      food_item_id uuid NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,
      created_at   timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, food_item_id)
    );
  `);
  await knex.raw('CREATE INDEX idx_favourite_items_user ON favourite_items (user_id, created_at DESC)');
}

export async function down(knex) {
  await knex.raw('DROP TABLE IF EXISTS favourite_items');
  await knex.raw('DROP TABLE IF EXISTS favourite_restaurants');
}
