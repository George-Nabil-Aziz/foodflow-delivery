import bcrypt from 'bcryptjs';
import { config } from '../src/config/index.js';
import { showcaseRestaurants, menuFor } from './data/showcase-restaurants.js';

/**
 * Development seed.
 *
 * Every credential is a documented development placeholder resolved from the
 * environment; all emails use @example.com / .test, which cannot receive mail.
 * Nothing here is a real secret.
 *
 * Creates a superset of the fixtures in docs/testing/test-data.md, so every
 * screen has something to render on a fresh clone and the E2E scenarios have
 * the states they need.
 */
export async function seed(knex) {
  // Order matters: children before parents.
  await knex('order_status_events').del();
  await knex('order_items').del();
  await knex('delivery_assignments').del();
  await knex('reviews').del();
  await knex('orders').del();
  await knex('cart_items').del();
  await knex('carts').del();
  await knex('food_items').del();
  await knex('menu_categories').del();
  await knex('restaurant_hours').del();
  await knex('driver_profiles').del();
  await knex('restaurants').del();
  await knex('admin_audit_logs').del();
  await knex('notifications').del();
  await knex('refresh_tokens').del();
  await knex('users').del();

  const adminHash = await bcrypt.hash(config.seed.adminPassword, config.bcryptRounds);
  const userHash = await bcrypt.hash(config.seed.userPassword, config.bcryptRounds);

  /* ------------------------------------------------------------- users */

  const mkUser = (email, fullName, phone, role, extra = {}) => ({
    email,
    password_hash: role === 'ADMIN' ? adminHash : userHash,
    full_name: fullName,
    phone,
    role,
    status: 'ACTIVE',
    ...extra,
  });

  const users = await knex('users')
    .insert([
      mkUser(config.seed.adminEmail, 'Platform Admin', '+201000000001', 'ADMIN'),
      mkUser('admin.b@example.com', 'Second Admin', '+201000000002', 'ADMIN'),
      mkUser('customer@example.com', 'Sara Idris', '+201001111111', 'CUSTOMER'),
      mkUser('customer.b@example.com', 'Omar Haddad', '+201001111112', 'CUSTOMER'),
      mkUser('customer.new@example.com', 'Nora Fresh', '+201001111113', 'CUSTOMER'),
      mkUser('customer.suspended@example.com', 'Sam Suspended', '+201001111114', 'CUSTOMER', { status: 'SUSPENDED' }),
      mkUser('owner@example.com', 'Layla Grill', '+201002222221', 'RESTAURANT'),
      mkUser('owner.b@example.com', 'Marco Pasta', '+201002222222', 'RESTAURANT'),
      mkUser('owner.pending@example.com', 'Pending Owner', '+201002222223', 'RESTAURANT'),
      mkUser('owner.suspended@example.com', 'Suspended Owner', '+201002222224', 'RESTAURANT'),
      mkUser('owner.closed@example.com', 'Closed Owner', '+201002222225', 'RESTAURANT'),
      mkUser('owner.paused@example.com', 'Paused Owner', '+201002222226', 'RESTAURANT'),
      mkUser('driver@example.com', 'Ali Wheels', '+201003333331', 'DRIVER'),
      mkUser('driver.b@example.com', 'Bilal Swift', '+201003333332', 'DRIVER'),
      mkUser('driver.pending@example.com', 'Pending Driver', '+201003333333', 'DRIVER'),
    ])
    .returning('*');

  const byEmail = Object.fromEntries(users.map((u) => [u.email, u]));

  /* --------------------------------------------------------- addresses */

  await knex('customer_addresses').insert([
    {
      user_id: byEmail['customer@example.com'].id,
      label: 'Home', line1: '26 Abu El Feda Street', city: 'Cairo', district: 'Zamalek',
      postal_code: '11211', latitude: 30.0650, longitude: 31.2210, is_default: true,
    },
    {
      user_id: byEmail['customer@example.com'].id,
      label: 'Work', line1: '15 Tahrir Street', city: 'Giza', district: 'Dokki',
      latitude: 30.0380, longitude: 31.2120, is_default: false,
    },
    {
      user_id: byEmail['customer.b@example.com'].id,
      label: 'Home', line1: '8 Baghdad Street', city: 'Cairo', district: 'Heliopolis',
      latitude: 30.0890, longitude: 31.3260, is_default: true,
    },
  ]);

  /* ------------------------------------------------------- restaurants */

  const restaurantSeeds = [
    { owner: 'owner@example.com', name: 'Olive Grill', slug: 'olive-grill', cuisine: 'LEVANTINE',
      status: 'ACTIVE', accepting: true, fee: '25.00', min: '150.00', prep: 25,
      desc: 'Charcoal-grilled Levantine classics, made to order.',
      lat: 30.0626, lng: 31.2197, district: 'Zamalek' },
    { owner: 'owner.b@example.com', name: 'Pasta House', slug: 'pasta-house', cuisine: 'ITALIAN',
      status: 'ACTIVE', accepting: true, fee: '20.00', min: '100.00', prep: 20,
      desc: 'Fresh pasta, slow sauces, no shortcuts.',
      lat: 30.0561, lng: 31.2001, district: 'Mohandessin' },
    { owner: 'owner.closed@example.com', name: 'Dawn Bakery', slug: 'dawn-bakery', cuisine: 'DESSERTS',
      status: 'ACTIVE', accepting: true, fee: '20.00', min: '100.00', prep: 15,
      desc: 'Morning pastries and cakes.', closedToday: true,
      lat: 30.0384, lng: 31.2123, district: 'Dokki' },
    { owner: 'owner.paused@example.com', name: 'Blue Sea', slug: 'blue-sea', cuisine: 'SEAFOOD',
      status: 'ACTIVE', accepting: false, fee: '35.00', min: '200.00', prep: 35,
      desc: 'Daily catch, grilled or fried.',
      lat: 29.9602, lng: 31.2569, district: 'Maadi' },
    { owner: 'owner.pending@example.com', name: 'New Spice', slug: 'new-spice', cuisine: 'INDIAN',
      status: 'PENDING_APPROVAL', accepting: true, fee: '25.00', min: '0.00', prep: 30,
      desc: 'Awaiting platform approval.', lat: 30.0911, lng: 31.3225, district: 'Heliopolis' },
    { owner: 'owner.suspended@example.com', name: 'Paused Kitchen', slug: 'paused-kitchen', cuisine: 'BURGERS',
      status: 'SUSPENDED', accepting: true, fee: '25.00', min: '120.00', prep: 20,
      desc: 'Temporarily suspended by an administrator.', lat: 30.0561, lng: 31.3301, district: 'Nasr City' },
  ];

  const restaurants = await knex('restaurants')
    .insert(
      restaurantSeeds.map((r) => ({
        owner_user_id: byEmail[r.owner].id,
        name: r.name,
        slug: r.slug,
        description: r.desc,
        cuisine_type: r.cuisine,
        phone: '+201001234567',
        email: `hello@${r.slug}.example.com`,
        logo_url: null,
        cover_image_url: null,
        address_line1: `${r.name} Street`,
        city: 'Cairo',
        district: r.district,
        latitude: r.lat,
        longitude: r.lng,
        delivery_fee: r.fee,
        minimum_order_amount: r.min,
        avg_preparation_minutes: r.prep,
        status: r.status,
        is_accepting_orders: r.accepting,
        approved_at: r.status === 'ACTIVE' ? knex.fn.now() : null,
        approved_by_user_id: r.status === 'ACTIVE' ? byEmail[config.seed.adminEmail].id : null,
      })),
    )
    .returning('*');

  const bySlug = Object.fromEntries(restaurants.map((r) => [r.slug, r]));

  // Opening hours: open all day so the seed works whenever it is run, except
  // Dawn Bakery, which is deliberately closed today to exercise CLOSED_NOW.
  const todayIndex = new Date().getDay();
  const hourRows = [];
  for (const r of restaurantSeeds) {
    for (let day = 0; day < 7; day += 1) {
      const closed = r.closedToday && day === todayIndex;
      hourRows.push({
        restaurant_id: bySlug[r.slug].id,
        day_of_week: day,
        is_closed: closed,
        opens_at: closed ? null : '00:00',
        closes_at: closed ? null : '23:59',
      });
    }
  }
  await knex('restaurant_hours').insert(hourRows);

  /* -------------------------------------------------------------- menu */

  const categories = await knex('menu_categories')
    .insert([
      { restaurant_id: bySlug['olive-grill'].id, name: 'Mains', display_order: 1 },
      { restaurant_id: bySlug['olive-grill'].id, name: 'Soups', display_order: 2 },
      { restaurant_id: bySlug['olive-grill'].id, name: 'Seasonal', display_order: 3, is_active: false },
      { restaurant_id: bySlug['olive-grill'].id, name: 'Drinks', display_order: 4 },
      { restaurant_id: bySlug['pasta-house'].id, name: 'Pasta', display_order: 1 },
      { restaurant_id: bySlug['pasta-house'].id, name: 'Salads', display_order: 2 },
      { restaurant_id: bySlug['dawn-bakery'].id, name: 'Pastries', display_order: 1 },
      { restaurant_id: bySlug['blue-sea'].id, name: 'Grilled', display_order: 1 },
      { restaurant_id: bySlug['new-spice'].id, name: 'Curries', display_order: 1 },
      { restaurant_id: bySlug['paused-kitchen'].id, name: 'Burgers', display_order: 1 },
    ])
    .returning('*');

  const cat = (slug, name) =>
    categories.find((c) => c.restaurant_id === bySlug[slug].id && c.name === name);

  const items = await knex('food_items')
    .insert([
      // Olive Grill
      { restaurant_id: bySlug['olive-grill'].id, category_id: cat('olive-grill', 'Mains').id,
        name: 'Mixed Grill', description: 'Lamb, chicken and kofta over spiced rice.',
        price: '385.00', display_order: 1 },
      { restaurant_id: bySlug['olive-grill'].id, category_id: cat('olive-grill', 'Mains').id,
        name: 'Lamb Chops', description: 'Four chops, charcoal grilled.',
        price: '620.00', display_order: 2, is_available: false },
      { restaurant_id: bySlug['olive-grill'].id, category_id: cat('olive-grill', 'Soups').id,
        name: 'Lentil Soup', description: 'Red lentils, cumin, lemon.', price: '75.00', display_order: 1 },
      { restaurant_id: bySlug['olive-grill'].id, category_id: cat('olive-grill', 'Soups').id,
        name: 'Side Salad', description: 'Tomato, cucumber, parsley.', price: '45.00', display_order: 2 },
      { restaurant_id: bySlug['olive-grill'].id, category_id: cat('olive-grill', 'Seasonal').id,
        name: 'Pumpkin Stew', description: 'Available in season only.', price: '160.00', display_order: 1 },
      // Pasta House
      { restaurant_id: bySlug['pasta-house'].id, category_id: cat('pasta-house', 'Pasta').id,
        name: 'Truffle Pasta', description: 'Tagliatelle, cream, black truffle.',
        price: '420.00', display_order: 1 },
      { restaurant_id: bySlug['pasta-house'].id, category_id: cat('pasta-house', 'Pasta').id,
        name: 'Arrabbiata', description: 'Penne, chilli, garlic, tomato.', price: '210.00', display_order: 2 },
      { restaurant_id: bySlug['pasta-house'].id, category_id: cat('pasta-house', 'Salads').id,
        name: 'Caprese', description: 'Buffalo mozzarella and basil.', price: '180.00', display_order: 1 },
      // Others
      { restaurant_id: bySlug['dawn-bakery'].id, category_id: cat('dawn-bakery', 'Pastries').id,
        name: 'Almond Croissant', description: 'Baked each morning.', price: '65.00' },
      { restaurant_id: bySlug['blue-sea'].id, category_id: cat('blue-sea', 'Grilled').id,
        name: 'Grilled Sea Bass', description: 'Whole fish with rice.', price: '450.00' },
      { restaurant_id: bySlug['new-spice'].id, category_id: cat('new-spice', 'Curries').id,
        name: 'Butter Chicken', description: 'Tomato and cream curry.', price: '260.00' },
      { restaurant_id: bySlug['paused-kitchen'].id, category_id: cat('paused-kitchen', 'Burgers').id,
        name: 'Double Smash', description: 'Two patties, aged cheddar.', price: '240.00' },
    ])
    .returning('*');

  const item = (name) => items.find((i) => i.name === name);

  /* ----------------------------------------------------- driver profiles */

  await knex('driver_profiles').insert([
    { user_id: byEmail['driver@example.com'].id, vehicle_type: 'MOTORCYCLE', vehicle_plate: 'ن ط ق 1234',
      status: 'ACTIVE', availability: 'AVAILABLE', current_latitude: 30.0630, current_longitude: 31.2190,
      location_updated_at: knex.fn.now(), approved_at: knex.fn.now() },
    { user_id: byEmail['driver.b@example.com'].id, vehicle_type: 'CAR', vehicle_plate: 'س ع د 5678',
      status: 'ACTIVE', availability: 'AVAILABLE', current_latitude: 30.0560, current_longitude: 31.2010,
      location_updated_at: knex.fn.now(), approved_at: knex.fn.now() },
    { user_id: byEmail['driver.pending@example.com'].id, vehicle_type: 'BICYCLE', vehicle_plate: 'م ص ر 9012',
      status: 'PENDING_APPROVAL', availability: 'OFFLINE' },
  ]);

  /* ------------------------------------------------------------ orders */

  const address = await knex('customer_addresses')
    .where({ user_id: byEmail['customer@example.com'].id, is_default: true })
    .first();

  const snapshot = {
    label: address.label, line1: address.line1, line2: address.line2,
    city: address.city, district: address.district, postalCode: address.postal_code,
    latitude: address.latitude, longitude: address.longitude,
  };

  let counter = 0;
  const makeOrder = async ({ status, extra = {}, lines }) => {
    counter += 1;
    const subtotal = lines
      .reduce((sum, l) => sum + Number(l.price) * l.qty, 0)
      .toFixed(2);
    const fee = bySlug['olive-grill'].delivery_fee;
    const tax = (Math.round(Number(subtotal) * config.taxRate * 100) / 100).toFixed(2);
    const total = (Number(subtotal) + Number(fee) + Number(tax)).toFixed(2);

    const [order] = await knex('orders')
      .insert({
        order_number: `FF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-SEED${String(counter).padStart(2, '0')}`,
        customer_user_id: byEmail['customer@example.com'].id,
        restaurant_id: bySlug['olive-grill'].id,
        delivery_address_id: address.id,
        delivery_address_snapshot: JSON.stringify(snapshot),
        restaurant_name_snapshot: bySlug['olive-grill'].name,
        status,
        subtotal,
        delivery_fee: fee,
        tax_amount: tax,
        total_amount: total,
        ...extra,
      })
      .returning('*');

    await knex('order_items').insert(
      lines.map((l) => ({
        order_id: order.id,
        food_item_id: item(l.name).id,
        item_name_snapshot: item(l.name).name,
        item_description_snapshot: item(l.name).description,
        unit_price: l.price,
        quantity: l.qty,
        line_total: (Number(l.price) * l.qty).toFixed(2),
      })),
    );

    await knex('order_status_events').insert({
      order_id: order.id, from_status: null, to_status: 'PENDING',
      actor_user_id: byEmail['customer@example.com'].id, actor_role: 'CUSTOMER',
    });
    return order;
  };

  const lines = [{ name: 'Mixed Grill', price: '385.00', qty: 2 }, { name: 'Lentil Soup', price: '75.00', qty: 1 }];

  await makeOrder({ status: 'PENDING', lines });
  await makeOrder({ status: 'CONFIRMED', lines, extra: { confirmed_at: knex.fn.now(), dispatch_state: 'UNASSIGNED' } });
  await makeOrder({ status: 'PREPARING', lines, extra: { confirmed_at: knex.fn.now(), preparing_at: knex.fn.now(), dispatch_state: 'UNASSIGNED' } });
  await makeOrder({ status: 'READY_FOR_PICKUP', lines, extra: { confirmed_at: knex.fn.now(), preparing_at: knex.fn.now(), ready_at: knex.fn.now(), dispatch_state: 'UNASSIGNED' } });

  const delivered = await makeOrder({
    status: 'DELIVERED',
    lines: [{ name: 'Mixed Grill', price: '385.00', qty: 1 }],
    extra: {
      driver_user_id: byEmail['driver@example.com'].id,
      dispatch_state: 'COMPLETED',
      confirmed_at: knex.fn.now(), preparing_at: knex.fn.now(), ready_at: knex.fn.now(),
      picked_up_at: knex.raw("now() - interval '35 minutes'"),
      delivered_at: knex.raw("now() - interval '5 minutes'"),
    },
  });

  const deliveredUnreviewed = await makeOrder({
    status: 'DELIVERED',
    lines: [{ name: 'Lentil Soup', price: '75.00', qty: 2 }],
    extra: {
      driver_user_id: byEmail['driver@example.com'].id,
      dispatch_state: 'COMPLETED',
      confirmed_at: knex.fn.now(), preparing_at: knex.fn.now(), ready_at: knex.fn.now(),
      picked_up_at: knex.raw("now() - interval '50 minutes'"),
      delivered_at: knex.raw("now() - interval '20 minutes'"),
    },
  });

  await makeOrder({
    status: 'CANCELLED',
    lines: [{ name: 'Side Salad', price: '45.00', qty: 1 }],
    extra: {
      cancelled_at: knex.fn.now(), cancelled_by: 'RESTAURANT',
      cancellation_reason: 'OUT_OF_STOCK', cancellation_note: 'Grill is down for repair.',
    },
  });

  await knex('delivery_assignments').insert({
    order_id: delivered.id,
    driver_user_id: byEmail['driver@example.com'].id,
    status: 'COMPLETED',
    expires_at: knex.raw("now() - interval '30 minutes'"),
    responded_at: knex.raw("now() - interval '40 minutes'"),
    distance_km: '2.40',
  });

  /* ----------------------------------------------------------- reviews */

  await knex('reviews').insert({
    order_id: delivered.id,
    customer_user_id: byEmail['customer@example.com'].id,
    restaurant_id: bySlug['olive-grill'].id,
    driver_user_id: byEmail['driver@example.com'].id,
    restaurant_rating: 5,
    driver_rating: 4,
    comment: 'Fast and hot. The grill was excellent.',
  });

  // Aggregates are maintained by the reviews module in production; the seed
  // computes them directly because it bypasses the service layer.
  await knex.raw(`
    UPDATE restaurants r SET
      rating_average = COALESCE((SELECT ROUND(AVG(restaurant_rating)::numeric, 2) FROM reviews
                                 WHERE restaurant_id = r.id AND status = 'PUBLISHED'), 0),
      rating_count   = (SELECT count(*) FROM reviews WHERE restaurant_id = r.id AND status = 'PUBLISHED')
  `);
  await knex.raw(`
    UPDATE driver_profiles d SET
      rating_average = COALESCE((SELECT ROUND(AVG(driver_rating)::numeric, 2) FROM reviews
                                 WHERE driver_user_id = d.user_id AND driver_rating IS NOT NULL
                                   AND status = 'PUBLISHED'), 0),
      rating_count   = (SELECT count(*) FROM reviews WHERE driver_user_id = d.user_id
                        AND driver_rating IS NOT NULL AND status = 'PUBLISHED')
  `);

  /* ------------------------------------------- showcase restaurants */

  // A marketplace-sized listing for browsing and pagination; see
  // seeds/data/showcase-restaurants.js. Added after everything above, so the
  // fixtures the tests rely on are untouched.
  const showcase = showcaseRestaurants();

  const showcaseOwners = await knex('users')
    .insert(showcase.map((s) => mkUser(s.owner, s.ownerName, s.phone, 'RESTAURANT')))
    .returning('*');
  const ownerByEmail = Object.fromEntries(showcaseOwners.map((u) => [u.email, u]));

  const showcaseRows = await knex('restaurants')
    .insert(showcase.map((s) => ({
      owner_user_id: ownerByEmail[s.owner].id,
      name: s.name,
      slug: s.slug,
      description: `${s.name} - ${s.district}, ${s.city}.`,
      cuisine_type: s.cuisine,
      phone: s.phone,
      email: `hello@${s.slug}.example.com`,
      address_line1: `${s.name} Street`,
      city: s.city,
      district: s.district,
      latitude: s.lat,
      longitude: s.lng,
      delivery_fee: s.fee,
      minimum_order_amount: s.min,
      avg_preparation_minutes: s.prep,
      status: 'ACTIVE',
      is_accepting_orders: s.accepting,
      approved_at: knex.fn.now(),
      approved_by_user_id: byEmail[config.seed.adminEmail].id,
    })))
    .returning('*');

  await knex('restaurant_hours').insert(showcaseRows.flatMap((r) =>
    Array.from({ length: 7 }, (_, day) => ({
      restaurant_id: r.id, day_of_week: day, is_closed: false, opens_at: '00:00', closes_at: '23:59',
    }))));

  const showcaseCategories = await knex('menu_categories')
    .insert(showcaseRows.flatMap((r) =>
      menuFor(r.cuisine_type).map(([name], i) => ({ restaurant_id: r.id, name, display_order: i + 1 }))))
    .returning('*');

  await knex('food_items').insert(showcaseRows.flatMap((r) =>
    menuFor(r.cuisine_type).flatMap(([categoryName, dishes]) => {
      const category = showcaseCategories.find((c) => c.restaurant_id === r.id && c.name === categoryName);
      return dishes.map(([name, description, price], i) => ({
        restaurant_id: r.id, category_id: category.id, name, description, price, display_order: i + 1,
      }));
    })));

  /* -------------------------------------------------------------- cart */

  const [cart] = await knex('carts')
    .insert({
      customer_user_id: byEmail['customer.b@example.com'].id,
      restaurant_id: bySlug['pasta-house'].id,
      status: 'ACTIVE',
    })
    .returning('*');

  await knex('cart_items').insert({
    cart_id: cart.id,
    food_item_id: item('Truffle Pasta').id,
    quantity: 1,
    price_seen_at_add: '420.00',
  });

  // eslint-disable-next-line no-console
  console.log(`Seed complete.
  Admin:      ${config.seed.adminEmail} / ${config.seed.adminPassword}
  Customer:   customer@example.com / ${config.seed.userPassword}
  Restaurant: owner@example.com / ${config.seed.userPassword}
  Driver:     driver@example.com / ${config.seed.userPassword}
  (development credentials only - see backend/.env.example)
  Restaurants: ${restaurantSeeds.length + showcase.length} (${showcase.length} showcase)
  Orders seeded: ${counter} (including delivered ${delivered.order_number} and unreviewed ${deliveredUnreviewed.order_number})`);
}
