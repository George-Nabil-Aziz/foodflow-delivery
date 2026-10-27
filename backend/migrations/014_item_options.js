/**
 * Item options (spec-15): option groups and options on a menu item, the options
 * a customer picked on a cart line, and the options snapshotted onto an order.
 *
 * Groups and options are soft-deleted. A cart line points at an option by id,
 * and a hard delete would silently turn "this option was removed" into "you
 * never chose one"; keeping the row lets revalidation report it (BR-IO8).
 *
 * `cart_items.line_key` identifies a line: the sorted option ids plus the note,
 * or '' for a plain line. It replaces the old one-line-per-item rule with
 * one-line-per-(item, options, note), so the same dish with different options
 * is a separate line and identical choices merge (BR-IO6). `price_seen_at_add`
 * now holds the whole unit price (base + deltas), so a changed option price is
 * detected like a changed item price.
 *
 * `order_item_options` copies group and option names and the delta, so later
 * menu edits never change history (BR-O1). `order_items.unit_price` already
 * includes the deltas, so chk_order_items_line_total is unchanged.
 */
export async function up(knex) {
  await knex.raw(`
    CREATE TABLE item_option_groups (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      food_item_id  uuid NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,
      name          text NOT NULL,
      min_select    integer NOT NULL DEFAULT 0,
      max_select    integer NOT NULL DEFAULT 1,
      display_order integer NOT NULL DEFAULT 0,
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now(),
      deleted_at    timestamptz NULL,
      CONSTRAINT chk_option_groups_select CHECK (
        min_select >= 0 AND max_select >= 1 AND max_select >= min_select AND max_select <= 20
      ),
      CONSTRAINT chk_option_groups_order CHECK (display_order BETWEEN 0 AND 999)
    );
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX uq_option_groups_item_name
    ON item_option_groups (food_item_id, lower(name)) WHERE deleted_at IS NULL
  `);
  await knex.raw('CREATE INDEX idx_option_groups_item ON item_option_groups (food_item_id) WHERE deleted_at IS NULL');
  await knex.raw('CREATE TRIGGER trg_option_groups_updated BEFORE UPDATE ON item_option_groups FOR EACH ROW EXECUTE FUNCTION set_updated_at()');

  await knex.raw(`
    CREATE TABLE item_options (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      group_id      uuid NOT NULL REFERENCES item_option_groups(id) ON DELETE CASCADE,
      name          text NOT NULL,
      price_delta   numeric(10,2) NOT NULL DEFAULT 0,
      is_available  boolean NOT NULL DEFAULT true,
      display_order integer NOT NULL DEFAULT 0,
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now(),
      deleted_at    timestamptz NULL,
      CONSTRAINT chk_item_options_delta CHECK (price_delta >= 0 AND price_delta <= 9999.99),
      CONSTRAINT chk_item_options_order CHECK (display_order BETWEEN 0 AND 999)
    );
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX uq_item_options_group_name
    ON item_options (group_id, lower(name)) WHERE deleted_at IS NULL
  `);
  await knex.raw('CREATE INDEX idx_item_options_group ON item_options (group_id) WHERE deleted_at IS NULL');
  await knex.raw('CREATE TRIGGER trg_item_options_updated BEFORE UPDATE ON item_options FOR EACH ROW EXECUTE FUNCTION set_updated_at()');

  await knex.raw("ALTER TABLE cart_items ADD COLUMN line_key text NOT NULL DEFAULT ''");
  await knex.raw("UPDATE cart_items SET line_key = CASE WHEN notes IS NULL OR notes = '' THEN '' ELSE '|' || notes END");
  await knex.raw('DROP INDEX uq_cart_items_line');
  await knex.raw('CREATE UNIQUE INDEX uq_cart_items_line ON cart_items (cart_id, food_item_id, line_key)');

  await knex.raw(`
    CREATE TABLE cart_item_options (
      cart_item_id uuid NOT NULL REFERENCES cart_items(id) ON DELETE CASCADE,
      option_id    uuid NOT NULL REFERENCES item_options(id) ON DELETE CASCADE,
      PRIMARY KEY (cart_item_id, option_id)
    );
  `);
  await knex.raw('CREATE INDEX idx_cart_item_options_option ON cart_item_options (option_id)');

  await knex.raw(`
    CREATE TABLE order_item_options (
      id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_item_id        uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
      group_name_snapshot  text NOT NULL,
      option_name_snapshot text NOT NULL,
      price_delta          numeric(10,2) NOT NULL DEFAULT 0,
      created_at           timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_order_item_options_delta CHECK (price_delta >= 0)
    );
  `);
  await knex.raw('CREATE INDEX idx_order_item_options_item ON order_item_options (order_item_id)');
}

export async function down(knex) {
  await knex.raw('DROP TABLE IF EXISTS order_item_options CASCADE');
  await knex.raw('DROP TABLE IF EXISTS cart_item_options CASCADE');
  await knex.raw('DROP INDEX IF EXISTS uq_cart_items_line');
  // Lines that differed only by options or note would collide here: keep the oldest.
  await knex.raw(`
    DELETE FROM cart_items c USING cart_items d
    WHERE c.cart_id = d.cart_id AND c.food_item_id = d.food_item_id
      AND (c.created_at, c.id) > (d.created_at, d.id)
  `);
  await knex.raw('CREATE UNIQUE INDEX uq_cart_items_line ON cart_items (cart_id, food_item_id)');
  await knex.raw('ALTER TABLE cart_items DROP COLUMN IF EXISTS line_key');
  await knex.raw('DROP TABLE IF EXISTS item_options CASCADE');
  await knex.raw('DROP TABLE IF EXISTS item_option_groups CASCADE');
}
