/** reviews. Aggregates on restaurants and driver_profiles are written only here. */
export async function up(knex) {
  await knex.raw(`
    CREATE TABLE reviews (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id          uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      customer_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      restaurant_id     uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      driver_user_id    uuid NULL REFERENCES users(id) ON DELETE SET NULL,
      restaurant_rating smallint NOT NULL,
      driver_rating     smallint NULL,
      comment           text NULL,
      status            review_status NOT NULL DEFAULT 'PUBLISHED',
      hidden_by_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
      moderation_reason text NULL,
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_reviews_restaurant_rating CHECK (restaurant_rating BETWEEN 1 AND 5),
      CONSTRAINT chk_reviews_driver_rating_range CHECK (driver_rating IS NULL OR driver_rating BETWEEN 1 AND 5),
      CONSTRAINT chk_reviews_driver_rating CHECK (driver_rating IS NULL OR driver_user_id IS NOT NULL),
      CONSTRAINT chk_reviews_comment_length CHECK (comment IS NULL OR length(comment) <= 1000)
    );
  `);
  await knex.raw('CREATE UNIQUE INDEX uq_reviews_order ON reviews (order_id)');
  await knex.raw(`
    CREATE INDEX idx_reviews_restaurant ON reviews (restaurant_id, created_at DESC)
    WHERE status = 'PUBLISHED'
  `);
  await knex.raw(`
    CREATE INDEX idx_reviews_driver ON reviews (driver_user_id)
    WHERE status = 'PUBLISHED'
  `);
  await knex.raw('CREATE INDEX idx_reviews_customer ON reviews (customer_user_id, created_at DESC)');
  await knex.raw('CREATE TRIGGER trg_reviews_updated BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION set_updated_at()');
}

export async function down(knex) {
  await knex.raw('DROP TABLE IF EXISTS reviews CASCADE');
}
