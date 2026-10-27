/**
 * discount_codes, order_discounts, and the discount on orders and carts.
 *
 * `orders.discount_amount` is the only money column added to an order. The
 * totals check becomes
 *
 *   total = subtotal - discount_amount + delivery_fee + tax_amount
 *
 * so a wrong discounted total is still unpersistable (G2). Tax is charged on
 * the discounted subtotal; that rule lives in orderPricing, the constraint only
 * guards the sum. Existing orders get 0 and keep satisfying the check.
 */
export async function up(knex) {
  await knex.raw(`
    CREATE TABLE discount_codes (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      code                citext NOT NULL,
      description         text NULL,
      discount_type       text NOT NULL,
      value               numeric(10,2) NOT NULL,
      max_discount_amount numeric(10,2) NULL,
      min_subtotal        numeric(10,2) NOT NULL DEFAULT 0,
      restaurant_id       uuid NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      starts_at           timestamptz NULL,
      ends_at             timestamptz NULL,
      usage_limit         integer NULL,
      per_customer_limit  integer NULL,
      is_active           boolean NOT NULL DEFAULT true,
      deleted_at          timestamptz NULL,
      created_by          uuid NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_discount_type CHECK (discount_type IN ('PERCENT','FIXED')),
      CONSTRAINT chk_discount_value CHECK (
        value > 0 AND (discount_type <> 'PERCENT' OR value <= 100)
      ),
      CONSTRAINT chk_discount_cap CHECK (
        max_discount_amount IS NULL OR (discount_type = 'PERCENT' AND max_discount_amount > 0)
      ),
      CONSTRAINT chk_discount_min_subtotal CHECK (min_subtotal >= 0),
      CONSTRAINT chk_discount_window CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at),
      CONSTRAINT chk_discount_limits CHECK (
        (usage_limit IS NULL OR usage_limit >= 1) AND (per_customer_limit IS NULL OR per_customer_limit >= 1)
      )
    );
  `);
  // citext makes this case-insensitive; a deleted code releases its spelling.
  await knex.raw('CREATE UNIQUE INDEX uq_discount_codes_code ON discount_codes (code) WHERE deleted_at IS NULL');
  await knex.raw('CREATE INDEX idx_discount_codes_restaurant ON discount_codes (restaurant_id) WHERE restaurant_id IS NOT NULL');
  await knex.raw('CREATE TRIGGER trg_discount_codes_updated BEFORE UPDATE ON discount_codes FOR EACH ROW EXECUTE FUNCTION set_updated_at()');

  await knex.raw('ALTER TABLE orders ADD COLUMN discount_amount numeric(10,2) NOT NULL DEFAULT 0');
  await knex.raw('ALTER TABLE orders DROP CONSTRAINT chk_orders_totals');
  await knex.raw(`
    ALTER TABLE orders ADD CONSTRAINT chk_orders_totals CHECK (
      total_amount = subtotal - discount_amount + delivery_fee + tax_amount
    )
  `);
  await knex.raw(`
    ALTER TABLE orders ADD CONSTRAINT chk_orders_discount CHECK (
      discount_amount >= 0 AND discount_amount <= subtotal
    )
  `);

  // One row per order that used a code. The code is copied, not only linked:
  // the discount code may later be edited, deactivated or deleted (BR-DC10).
  await knex.raw(`
    CREATE TABLE order_discounts (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id         uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      discount_code_id uuid NULL REFERENCES discount_codes(id) ON DELETE SET NULL,
      code_snapshot    text NOT NULL,
      amount           numeric(10,2) NOT NULL,
      created_at       timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_order_discounts_amount CHECK (amount > 0)
    );
  `);
  await knex.raw('CREATE UNIQUE INDEX uq_order_discounts_order ON order_discounts (order_id)');
  await knex.raw('CREATE INDEX idx_order_discounts_code ON order_discounts (discount_code_id)');

  // The code a customer has applied to their active cart.
  await knex.raw('ALTER TABLE carts ADD COLUMN discount_code_id uuid NULL REFERENCES discount_codes(id) ON DELETE SET NULL');
}

export async function down(knex) {
  await knex.raw('ALTER TABLE carts DROP COLUMN IF EXISTS discount_code_id');
  await knex.raw('DROP TABLE IF EXISTS order_discounts CASCADE');
  await knex.raw('ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_discount');
  await knex.raw('ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_totals');
  await knex.raw('ALTER TABLE orders DROP COLUMN IF EXISTS discount_amount');
  await knex.raw(`
    ALTER TABLE orders ADD CONSTRAINT chk_orders_totals CHECK (
      total_amount = subtotal + delivery_fee + tax_amount
    )
  `);
  await knex.raw('DROP TABLE IF EXISTS discount_codes CASCADE');
}
