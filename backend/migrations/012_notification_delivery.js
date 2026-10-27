/**
 * Delivery state for notifications (spec-13). Each row is one message to one
 * recipient on one channel, so a retry resends exactly that message.
 */
export async function up(knex) {
  await knex.raw(`
    ALTER TABLE notifications
      ADD COLUMN status          text NOT NULL DEFAULT 'QUEUED',
      ADD COLUMN attempts        integer NOT NULL DEFAULT 0,
      ADD COLUMN last_error      text NULL,
      ADD COLUMN recipient       text NULL,
      ADD COLUMN next_attempt_at timestamptz NULL,
      ADD COLUMN dedupe_key      text NULL,
      ADD CONSTRAINT chk_notifications_status
        CHECK (status IN ('QUEUED','SENT','FAILED','SKIPPED'))
  `);
  // Rows written by the old stub were only ever logged.
  await knex.raw("UPDATE notifications SET status = 'SKIPPED'");
  // sent_at used to default to creation time; it now means "actually sent".
  await knex.raw('ALTER TABLE notifications ALTER COLUMN sent_at DROP NOT NULL');
  await knex.raw('ALTER TABLE notifications ALTER COLUMN sent_at DROP DEFAULT');
  // The same message (template + entity + channel + recipient) is stored once,
  // so a repeated trigger or a retry loop cannot text a phone twice.
  await knex.raw(
    'CREATE UNIQUE INDEX uq_notifications_dedupe ON notifications (dedupe_key) WHERE dedupe_key IS NOT NULL',
  );
  await knex.raw(`
    CREATE INDEX idx_notifications_retry ON notifications (next_attempt_at)
    WHERE status = 'FAILED'
  `);
  await knex.raw(`
    CREATE INDEX idx_notifications_recipient_sent ON notifications (recipient, channel, sent_at)
    WHERE status = 'SENT'
  `);
}

export async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_notifications_recipient_sent');
  await knex.raw('DROP INDEX IF EXISTS idx_notifications_retry');
  await knex.raw('DROP INDEX IF EXISTS uq_notifications_dedupe');
  await knex.raw('UPDATE notifications SET sent_at = created_at WHERE sent_at IS NULL');
  await knex.raw('ALTER TABLE notifications ALTER COLUMN sent_at SET DEFAULT now()');
  await knex.raw('ALTER TABLE notifications ALTER COLUMN sent_at SET NOT NULL');
  await knex.raw(`
    ALTER TABLE notifications
      DROP CONSTRAINT chk_notifications_status,
      DROP COLUMN dedupe_key, DROP COLUMN next_attempt_at, DROP COLUMN recipient,
      DROP COLUMN last_error, DROP COLUMN attempts, DROP COLUMN status
  `);
}
