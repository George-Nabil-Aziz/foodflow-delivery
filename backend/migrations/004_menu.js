/** menu_categories, food_items and the restaurant-consistency trigger. */
export async function up(knex) {
  await knex.raw(`
    CREATE TABLE menu_categories (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      name          text NOT NULL,
      description   text NULL,
      display_order integer NOT NULL DEFAULT 0,
      is_active     boolean NOT NULL DEFAULT true,
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now(),
      deleted_at    timestamptz NULL,
      CONSTRAINT chk_categories_order CHECK (display_order BETWEEN 0 AND 999)
    );
  `);
  // BR-R3. The partial predicate lets a deleted name be reused.
  await knex.raw(`
    CREATE UNIQUE INDEX uq_categories_restaurant_name
    ON menu_categories (restaurant_id, lower(name)) WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX idx_categories_restaurant ON menu_categories (restaurant_id, display_order)
    WHERE deleted_at IS NULL
  `);
  await knex.raw('CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON menu_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at()');

  await knex.raw(`
    CREATE TABLE food_items (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      category_id   uuid NOT NULL REFERENCES menu_categories(id) ON DELETE RESTRICT,
      name          text NOT NULL,
      description   text NULL,
      price         numeric(10,2) NOT NULL,
      image_url     text NULL,
      is_available  boolean NOT NULL DEFAULT true,
      display_order integer NOT NULL DEFAULT 0,
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now(),
      deleted_at    timestamptz NULL,
      CONSTRAINT chk_food_items_price CHECK (price > 0 AND price <= 9999.99)
    );
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX uq_food_items_category_name
    ON food_items (category_id, lower(name)) WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX idx_food_items_restaurant_available ON food_items (restaurant_id, is_available)
    WHERE deleted_at IS NULL
  `);
  await knex.raw('CREATE INDEX idx_food_items_category ON food_items (category_id) WHERE deleted_at IS NULL');
  await knex.raw('CREATE INDEX idx_food_items_name_trgm ON food_items USING GIN (name gin_trgm_ops)');
  await knex.raw('CREATE TRIGGER trg_food_items_updated BEFORE UPDATE ON food_items FOR EACH ROW EXECUTE FUNCTION set_updated_at()');

  // food_items.restaurant_id is denormalized because it is the most-filtered
  // column in the system. This trigger stops it drifting from the category's
  // restaurant, which is what makes the denormalization safe (BR-R6).
  await knex.raw(`
    CREATE OR REPLACE FUNCTION assert_item_category_same_restaurant() RETURNS trigger AS $$
    DECLARE cat_restaurant uuid;
    BEGIN
      SELECT restaurant_id INTO cat_restaurant FROM menu_categories WHERE id = NEW.category_id;
      IF cat_restaurant IS NULL THEN
        RAISE EXCEPTION 'category % does not exist', NEW.category_id
          USING ERRCODE = '23503';
      END IF;
      IF cat_restaurant <> NEW.restaurant_id THEN
        RAISE EXCEPTION 'category % belongs to a different restaurant', NEW.category_id
          USING ERRCODE = '23514', CONSTRAINT = 'chk_item_category_restaurant';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await knex.raw(`
    CREATE TRIGGER trg_food_items_category_restaurant
    BEFORE INSERT OR UPDATE OF category_id, restaurant_id ON food_items
    FOR EACH ROW EXECUTE FUNCTION assert_item_category_same_restaurant();
  `);
}

export async function down(knex) {
  await knex.raw('DROP FUNCTION IF EXISTS assert_item_category_same_restaurant() CASCADE');
  await knex.raw('DROP TABLE IF EXISTS food_items CASCADE');
  await knex.raw('DROP TABLE IF EXISTS menu_categories CASCADE');
}
