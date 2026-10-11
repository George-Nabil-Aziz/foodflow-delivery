/** admin_audit_logs (append-only) and notifications (stub transport log). */
export async function up(knex) {
  await knex.raw(`
    CREATE TABLE admin_audit_logs (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      admin_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      action        text NOT NULL,
      entity_type   text NOT NULL,
      entity_id     uuid NULL,
      metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
      ip_address    text NULL,
      created_at    timestamptz NOT NULL DEFAULT now()
    );
  `);
  await knex.raw('CREATE INDEX idx_audit_entity ON admin_audit_logs (entity_type, entity_id, created_at DESC)');
  await knex.raw('CREATE INDEX idx_audit_admin ON admin_audit_logs (admin_user_id, created_at DESC)');

  await knex.raw(`
    CREATE TABLE notifications (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    uuid NULL REFERENCES users(id) ON DELETE CASCADE,
      channel    text NOT NULL DEFAULT 'IN_APP',
      template   text NOT NULL,
      payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
      sent_at    timestamptz NOT NULL DEFAULT now(),
      read_at    timestamptz NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await knex.raw('CREATE INDEX idx_notifications_user ON notifications (user_id, created_at DESC)');
}

export async function down(knex) {
  await knex.raw('DROP TABLE IF EXISTS notifications CASCADE');
  await knex.raw('DROP TABLE IF EXISTS admin_audit_logs CASCADE');
}
