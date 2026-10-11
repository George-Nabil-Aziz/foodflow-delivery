/**
 * delivery_assignments.
 *
 * The three partial unique indexes are the concurrency mechanism, not a safety
 * net: the accept path deliberately lets the insert fail rather than
 * pre-checking, because check-then-insert is precisely the race being defended
 * against (BR-D5, NFR-8).
 */
export async function up(knex) {
  await knex.raw(`
    CREATE TABLE delivery_assignments (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id       uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      driver_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status         assignment_status NOT NULL DEFAULT 'OFFERED',
      distance_km    numeric(6,2) NULL,
      offered_at     timestamptz NOT NULL DEFAULT now(),
      expires_at     timestamptz NOT NULL,
      responded_at   timestamptz NULL,
      decline_reason text NULL,
      created_at     timestamptz NOT NULL DEFAULT now(),
      updated_at     timestamptz NOT NULL DEFAULT now()
    );
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX uq_assignments_driver_active ON delivery_assignments (driver_user_id)
    WHERE status = 'ACCEPTED'
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX uq_assignments_order_accepted ON delivery_assignments (order_id)
    WHERE status = 'ACCEPTED'
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX uq_assignments_order_open ON delivery_assignments (order_id)
    WHERE status = 'OFFERED'
  `);
  await knex.raw(`
    CREATE INDEX idx_assignments_expiry ON delivery_assignments (status, expires_at)
    WHERE status = 'OFFERED'
  `);
  await knex.raw('CREATE INDEX idx_assignments_driver ON delivery_assignments (driver_user_id, status)');
  await knex.raw('CREATE INDEX idx_assignments_order ON delivery_assignments (order_id)');
  await knex.raw('CREATE TRIGGER trg_assignments_updated BEFORE UPDATE ON delivery_assignments FOR EACH ROW EXECUTE FUNCTION set_updated_at()');
}

export async function down(knex) {
  await knex.raw('DROP TABLE IF EXISTS delivery_assignments CASCADE');
}
