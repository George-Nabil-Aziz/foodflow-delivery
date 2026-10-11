/** restaurants, restaurant_hours, driver_profiles. */
export async function up(knex) {
  await knex.raw(`
    CREATE TABLE restaurants (
      id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_user_id          uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      name                   text NOT NULL,
      slug                   text NOT NULL,
      description            text NULL,
      cuisine_type           text NOT NULL DEFAULT 'OTHER',
      phone                  text NULL,
      email                  text NULL,
      logo_url               text NULL,
      cover_image_url        text NULL,
      address_line1          text NULL,
      city                   text NULL,
      district               text NULL,
      latitude               numeric(9,6) NULL,
      longitude              numeric(9,6) NULL,
      delivery_fee           numeric(10,2) NOT NULL DEFAULT 0,
      minimum_order_amount   numeric(10,2) NOT NULL DEFAULT 0,
      avg_preparation_minutes integer NOT NULL DEFAULT 30,
      status                 restaurant_status NOT NULL DEFAULT 'PENDING_APPROVAL',
      is_accepting_orders    boolean NOT NULL DEFAULT true,
      rating_average         numeric(3,2) NOT NULL DEFAULT 0,
      rating_count           integer NOT NULL DEFAULT 0,
      approved_at            timestamptz NULL,
      approved_by_user_id    uuid NULL REFERENCES users(id) ON DELETE SET NULL,
      rejection_reason       text NULL,
      created_at             timestamptz NOT NULL DEFAULT now(),
      updated_at             timestamptz NOT NULL DEFAULT now(),
      deleted_at             timestamptz NULL,
      CONSTRAINT chk_restaurants_delivery_fee CHECK (delivery_fee >= 0),
      CONSTRAINT chk_restaurants_min_order CHECK (minimum_order_amount >= 0),
      CONSTRAINT chk_restaurants_prep CHECK (avg_preparation_minutes BETWEEN 5 AND 180),
      CONSTRAINT chk_restaurants_rating CHECK (rating_average >= 0 AND rating_average <= 5),
      CONSTRAINT chk_restaurants_rating_count CHECK (rating_count >= 0)
    );
  `);
  // BR-R1: one owner, one restaurant.
  await knex.raw('CREATE UNIQUE INDEX uq_restaurants_owner ON restaurants (owner_user_id)');
  await knex.raw('CREATE UNIQUE INDEX uq_restaurants_slug ON restaurants (slug)');
  await knex.raw(`
    CREATE INDEX idx_restaurants_browse ON restaurants (status, is_accepting_orders)
    WHERE deleted_at IS NULL
  `);
  await knex.raw('CREATE INDEX idx_restaurants_cuisine ON restaurants (cuisine_type)');
  await knex.raw('CREATE INDEX idx_restaurants_rating ON restaurants (rating_average DESC)');
  await knex.raw('CREATE INDEX idx_restaurants_name_trgm ON restaurants USING GIN (name gin_trgm_ops)');
  await knex.raw('CREATE TRIGGER trg_restaurants_updated BEFORE UPDATE ON restaurants FOR EACH ROW EXECUTE FUNCTION set_updated_at()');

  await knex.raw(`
    CREATE TABLE restaurant_hours (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      day_of_week   smallint NOT NULL,
      opens_at      time NULL,
      closes_at     time NULL,
      is_closed     boolean NOT NULL DEFAULT false,
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_hours_day CHECK (day_of_week BETWEEN 0 AND 6),
      CONSTRAINT chk_hours_range CHECK (
        is_closed OR (opens_at IS NOT NULL AND closes_at IS NOT NULL AND closes_at > opens_at)
      )
    );
  `);
  await knex.raw('CREATE UNIQUE INDEX uq_hours_restaurant_day ON restaurant_hours (restaurant_id, day_of_week)');

  await knex.raw(`
    CREATE TABLE driver_profiles (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      vehicle_type        vehicle_type NOT NULL DEFAULT 'MOTORCYCLE',
      vehicle_plate       text NULL,
      status              driver_status NOT NULL DEFAULT 'PENDING_APPROVAL',
      availability        driver_availability NOT NULL DEFAULT 'OFFLINE',
      current_latitude    numeric(9,6) NULL,
      current_longitude   numeric(9,6) NULL,
      location_updated_at timestamptz NULL,
      last_assigned_at    timestamptz NULL,
      rating_average      numeric(3,2) NOT NULL DEFAULT 0,
      rating_count        integer NOT NULL DEFAULT 0,
      approved_at         timestamptz NULL,
      approved_by_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_driver_rating CHECK (rating_average >= 0 AND rating_average <= 5)
    );
  `);
  await knex.raw('CREATE UNIQUE INDEX uq_driver_profiles_user ON driver_profiles (user_id)');
  // The dispatch hot path (BR-D2).
  await knex.raw('CREATE INDEX idx_drivers_dispatch ON driver_profiles (status, availability)');
  await knex.raw('CREATE TRIGGER trg_drivers_updated BEFORE UPDATE ON driver_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at()');
}

export async function down(knex) {
  await knex.raw('DROP TABLE IF EXISTS driver_profiles CASCADE');
  await knex.raw('DROP TABLE IF EXISTS restaurant_hours CASCADE');
  await knex.raw('DROP TABLE IF EXISTS restaurants CASCADE');
}
