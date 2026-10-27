/**
 * Card payments (spec-11): the `payments` table and the enum values the order
 * tables need to refer to it.
 *
 * One payment per order. The amount is copied from `orders.total_amount` at
 * checkout and is what a gateway-reported payment is compared against, so a
 * payment for a different amount can never mark the order paid (BR-P2).
 */
export async function up(knex) {
  // New enum values cannot be used inside this transaction, and nothing here does.
  await knex.raw(`ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'CARD'`);
  await knex.raw(`ALTER TYPE cancellation_reason ADD VALUE IF NOT EXISTS 'PAYMENT_TIMEOUT'`);

  await knex.raw(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
        CREATE TYPE payment_status AS ENUM
          ('INITIATED','PAID','FAILED','REFUNDING','REFUNDED','REFUND_FAILED');
      END IF;
    END $$;
  `);

  await knex.raw(`
    CREATE TABLE payments (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id            uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
      customer_user_id    uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      provider            text NOT NULL,
      provider_payment_id text NULL,
      amount              numeric(10,2) NOT NULL,
      currency            char(3) NOT NULL,
      status              payment_status NOT NULL DEFAULT 'INITIATED',
      refunded_amount     numeric(10,2) NOT NULL DEFAULT 0,
      failure_message     text NULL,
      refund_error        text NULL,
      refund_attempts     integer NOT NULL DEFAULT 0,
      refund_started_at   timestamptz NULL,
      paid_at             timestamptz NULL,
      refunded_at         timestamptz NULL,
      metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_payments_provider CHECK (provider IN ('moyasar','fake')),
      CONSTRAINT chk_payments_amount CHECK (amount > 0),
      CONSTRAINT chk_payments_refund CHECK (refunded_amount >= 0 AND refunded_amount <= amount)
    );
  `);
  await knex.raw('CREATE UNIQUE INDEX uq_payments_order ON payments (order_id)');
  // A gateway payment can settle at most one order.
  await knex.raw(`
    CREATE UNIQUE INDEX uq_payments_provider_payment ON payments (provider, provider_payment_id)
    WHERE provider_payment_id IS NOT NULL
  `);
  await knex.raw('CREATE INDEX idx_payments_status ON payments (status, created_at)');
  await knex.raw('CREATE INDEX idx_payments_customer ON payments (customer_user_id)');
  await knex.raw('CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at()');
}

export async function down(knex) {
  await knex.raw('DROP TABLE IF EXISTS payments CASCADE');
  await knex.raw('DROP TYPE IF EXISTS payment_status');
  // PostgreSQL cannot drop enum values; 'CARD' and 'PAYMENT_TIMEOUT' remain
  // on their types, harmless once nothing references them.
}
