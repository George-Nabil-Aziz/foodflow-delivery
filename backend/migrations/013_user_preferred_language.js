/**
 * Per-user preferred language (spec-13). Notifications are rendered in this
 * language; the web app also applies it after sign-in. NULL means the user has
 * not chosen yet: notifications fall back to English, and the web app saves
 * the language the user is browsing in rather than overriding it.
 */
export async function up(knex) {
  await knex.raw(`
    ALTER TABLE users
      ADD COLUMN preferred_language text NULL,
      ADD CONSTRAINT chk_users_preferred_language
        CHECK (preferred_language IN ('en','ar'))
  `);
}

export async function down(knex) {
  await knex.raw(`
    ALTER TABLE users
      DROP CONSTRAINT chk_users_preferred_language,
      DROP COLUMN preferred_language
  `);
}
