/**
 * carts, cart_items.
 *
 * `price_seen_at_add` is a deliberate, narrow exception to ADR-008 (carts store
 * no prices): it is write-once, read only to detect PRICE_CHANGED, and never
 * enters a total or an order. Without it a price could change between add and
 * checkout with no way to tell the customer.
 */
export async function up(knex) {
  await knex.raw(`
    CREATE TABLE carts (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      restaurant_id    uuid NULL REFERENCES restaurants(id) ON DELETE SET NULL,
      status           cart_status NOT NULL DEFAULT 'ACTIVE',
      created_at       timestamptz NOT NULL DEFAULT now(),
      updated_at       timestamptz NOT NULL DEFAULT now()
    );
  `);
  // BR-C1 as a database invariant: a race cannot produce two active carts.
  await knex.raw(`
    CREATE UNIQUE INDEX uq_carts_one_active ON carts (customer_user_id)
    WHERE status = 'ACTIVE'
  `);
  await knex.raw('CREATE INDEX idx_carts_customer ON carts (customer_user_id, status)');
  await knex.raw('CREATE TRIGGER trg_carts_updated BEFORE UPDATE ON carts FOR EACH ROW EXECUTE FUNCTION set_updated_at()');

  await knex.raw(`
    CREATE TABLE cart_items (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      cart_id           uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
      food_item_id      uuid NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,
      quantity          integer NOT NULL,
      notes             text NULL,
      price_seen_at_add numeric(10,2) NOT NULL,
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_cart_items_quantity CHECK (quantity BETWEEN 1 AND 20)
    );
  `);
  // BR-C6: adding an existing item increments its line rather than duplicating.
  await knex.raw('CREATE UNIQUE INDEX uq_cart_items_line ON cart_items (cart_id, food_item_id)');
  await knex.raw('CREATE INDEX idx_cart_items_cart ON cart_items (cart_id)');
  await knex.raw('CREATE TRIGGER trg_cart_items_updated BEFORE UPDATE ON cart_items FOR EACH ROW EXECUTE FUNCTION set_updated_at()');
}

export async function down(knex) {
  await knex.raw('DROP TABLE IF EXISTS cart_items CASCADE');
  await knex.raw('DROP TABLE IF EXISTS carts CASCADE');
}
