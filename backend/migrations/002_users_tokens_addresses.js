/** users, refresh_tokens, customer_addresses. */
export async function up(knex) {
  await knex.raw(`
    CREATE TABLE users (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email             citext NOT NULL,
      password_hash     text NOT NULL,
      full_name         text NOT NULL,
      phone             text NOT NULL,
      role              user_role NOT NULL,
      status            user_status NOT NULL DEFAULT 'ACTIVE',
      email_verified_at timestamptz NULL,
      last_login_at     timestamptz NULL,
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now(),
      deleted_at        timestamptz NULL
    );
  `);
  // BR-A1: email is unique case-insensitively. CITEXT plus this index is what
  // makes "Sara@x.com" and "sara@x.com" the same account.
  await knex.raw('CREATE UNIQUE INDEX uq_users_email ON users (email)');
  await knex.raw(
    'CREATE INDEX idx_users_role_status ON users (role, status) WHERE deleted_at IS NULL',
  );
  await knex.raw('CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at()');

  await knex.raw(`
    CREATE TABLE refresh_tokens (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash     text NOT NULL,
      family_id      uuid NOT NULL,
      replaced_by_id uuid NULL REFERENCES refresh_tokens(id) ON DELETE SET NULL,
      expires_at     timestamptz NOT NULL,
      revoked_at     timestamptz NULL,
      user_agent     text NULL,
      ip_address     text NULL,
      created_at     timestamptz NOT NULL DEFAULT now(),
      updated_at     timestamptz NOT NULL DEFAULT now()
    );
  `);
  await knex.raw('CREATE UNIQUE INDEX uq_refresh_token_hash ON refresh_tokens (token_hash)');
  await knex.raw('CREATE INDEX idx_refresh_user_active ON refresh_tokens (user_id) WHERE revoked_at IS NULL');
  await knex.raw('CREATE INDEX idx_refresh_family ON refresh_tokens (family_id)');

  await knex.raw(`
    CREATE TABLE customer_addresses (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label       text NULL,
      line1       text NOT NULL,
      line2       text NULL,
      city        text NOT NULL,
      district    text NULL,
      postal_code text NULL,
      latitude    numeric(9,6) NULL,
      longitude   numeric(9,6) NULL,
      is_default  boolean NOT NULL DEFAULT false,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      deleted_at  timestamptz NULL
    );
  `);
  // BR-A7 enforced by the database, not by hope: at most one default address.
  await knex.raw(`
    CREATE UNIQUE INDEX uq_addresses_one_default ON customer_addresses (user_id)
    WHERE is_default AND deleted_at IS NULL
  `);
  await knex.raw('CREATE INDEX idx_addresses_user ON customer_addresses (user_id) WHERE deleted_at IS NULL');
  await knex.raw('CREATE TRIGGER trg_addresses_updated BEFORE UPDATE ON customer_addresses FOR EACH ROW EXECUTE FUNCTION set_updated_at()');
}

export async function down(knex) {
  await knex.raw('DROP TABLE IF EXISTS customer_addresses CASCADE');
  await knex.raw('DROP TABLE IF EXISTS refresh_tokens CASCADE');
  await knex.raw('DROP TABLE IF EXISTS users CASCADE');
}
