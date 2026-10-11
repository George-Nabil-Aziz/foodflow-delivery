/**
 * orders, order_items, order_status_events.
 *
 * This is where goal G2 lives. `order_items` snapshots name, description and
 * price at checkout and nothing reads `food_items` for an order afterwards;
 * `chk_orders_totals` means a wrong total cannot be persisted at all.
 */
export async function up(knex) {
  await knex.raw(`
    CREATE TABLE orders (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_number              text NOT NULL,
      customer_user_id          uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      restaurant_id             uuid NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
      driver_user_id            uuid NULL REFERENCES users(id) ON DELETE SET NULL,
      delivery_address_id       uuid NULL REFERENCES customer_addresses(id) ON DELETE SET NULL,
      delivery_address_snapshot jsonb NOT NULL,
      restaurant_name_snapshot  text NOT NULL,
      status                    order_status NOT NULL DEFAULT 'PENDING',
      dispatch_state            dispatch_state NOT NULL DEFAULT 'NOT_REQUIRED',
      subtotal                  numeric(10,2) NOT NULL,
      delivery_fee              numeric(10,2) NOT NULL,
      tax_amount                numeric(10,2) NOT NULL,
      total_amount              numeric(10,2) NOT NULL,
      payment_method            payment_method NOT NULL DEFAULT 'CASH_ON_DELIVERY',
      customer_note             text NULL,
      cancelled_by              actor_type NULL,
      cancellation_reason       cancellation_reason NULL,
      cancellation_note         text NULL,
      placed_at                 timestamptz NOT NULL DEFAULT now(),
      confirmed_at              timestamptz NULL,
      preparing_at              timestamptz NULL,
      ready_at                  timestamptz NULL,
      picked_up_at              timestamptz NULL,
      delivered_at              timestamptz NULL,
      cancelled_at              timestamptz NULL,
      escalated_at              timestamptz NULL,
      created_at                timestamptz NOT NULL DEFAULT now(),
      updated_at                timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_orders_amounts_nonneg CHECK (
        subtotal >= 0 AND delivery_fee >= 0 AND tax_amount >= 0 AND total_amount >= 0
      ),
      CONSTRAINT chk_orders_totals CHECK (
        total_amount = subtotal + delivery_fee + tax_amount
      ),
      CONSTRAINT chk_orders_cancel_fields CHECK (
        status <> 'CANCELLED' OR (cancelled_by IS NOT NULL AND cancellation_reason IS NOT NULL)
      )
    );
  `);
  await knex.raw('CREATE UNIQUE INDEX uq_orders_order_number ON orders (order_number)');
  await knex.raw('CREATE INDEX idx_orders_customer ON orders (customer_user_id, created_at DESC)');
  await knex.raw('CREATE INDEX idx_orders_restaurant_status ON orders (restaurant_id, status, created_at DESC)');
  await knex.raw('CREATE INDEX idx_orders_driver ON orders (driver_user_id, status)');
  await knex.raw(`
    CREATE INDEX idx_orders_dispatch ON orders (dispatch_state, confirmed_at)
    WHERE status IN ('CONFIRMED','PREPARING','READY_FOR_PICKUP')
  `);
  await knex.raw(`
    CREATE INDEX idx_orders_pending_timeout ON orders (status, placed_at)
    WHERE status = 'PENDING'
  `);
  await knex.raw(`
    CREATE INDEX idx_orders_delivered_at ON orders (delivered_at)
    WHERE status = 'DELIVERED'
  `);
  await knex.raw('CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at()');

  await knex.raw(`
    CREATE TABLE order_items (
      id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id                   uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      food_item_id               uuid NULL REFERENCES food_items(id) ON DELETE SET NULL,
      item_name_snapshot         text NOT NULL,
      item_description_snapshot  text NULL,
      unit_price                 numeric(10,2) NOT NULL,
      quantity                   integer NOT NULL,
      line_total                 numeric(10,2) NOT NULL,
      notes                      text NULL,
      created_at                 timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_order_items_quantity CHECK (quantity BETWEEN 1 AND 20),
      CONSTRAINT chk_order_items_price CHECK (unit_price > 0),
      CONSTRAINT chk_order_items_line_total CHECK (line_total = unit_price * quantity)
    );
  `);
  await knex.raw('CREATE INDEX idx_order_items_order ON order_items (order_id)');

  await knex.raw(`
    CREATE TABLE order_status_events (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id      uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      from_status   order_status NULL,
      to_status     order_status NOT NULL,
      actor_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
      actor_role    actor_type NOT NULL,
      reason        text NULL,
      note          text NULL,
      created_at    timestamptz NOT NULL DEFAULT now()
    );
  `);
  await knex.raw('CREATE INDEX idx_status_events_order ON order_status_events (order_id, created_at)');
}

export async function down(knex) {
  await knex.raw('DROP TABLE IF EXISTS order_status_events CASCADE');
  await knex.raw('DROP TABLE IF EXISTS order_items CASCADE');
  await knex.raw('DROP TABLE IF EXISTS orders CASCADE');
}
