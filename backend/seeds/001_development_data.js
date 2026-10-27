import bcrypt from 'bcryptjs';
import { config } from '../src/config/index.js';
import { showcaseRestaurants, menuFor } from './data/showcase-restaurants.js';
import {
  makeRng, YEAR_START, DAY, between, addMinutes, ymd, DISTRICTS, STREETS, CANCELLATIONS,
  COMMENTS, HIDDEN_REVIEWS, ratingsFor, moodFor,
} from './data/history.js';

/**
 * Development seed.
 *
 * Every credential is a documented development placeholder resolved from the
 * environment. Customers use name-based @gmail.com addresses and every other
 * account uses @foodflow.com; no mail is ever sent.
 * Nothing here is a real secret.
 *
 * Creates a superset of the fixtures in docs/testing/test-data.md, so every
 * screen has something to render on a fresh clone and the E2E scenarios have
 * the states they need.
 */
/** [district, city, street, latitude, longitude] for the filler customers' homes. */
const SEED_DISTRICTS = [
  ['Maadi', 'Cairo', 'Road 9', 29.9602, 31.2569],
  ['Nasr City', 'Cairo', 'Abbas El Akkad Street', 30.0561, 31.3301],
  ['Mohandessin', 'Giza', 'Gameat El Dowal Street', 30.0571, 31.2003],
  ['Heliopolis', 'Cairo', 'El Merghany Street', 30.0911, 31.3225],
  ['Zamalek', 'Cairo', '26th of July Street', 30.0626, 31.2197],
  ['Dokki', 'Giza', 'Mesaha Street', 30.0385, 31.2108],
  ['Garden City', 'Cairo', 'Kasr El Aini Street', 30.0354, 31.2317],
  ['New Cairo', 'Cairo', 'South 90th Street', 30.0074, 31.4913],
];

export async function seed(knex) {
  // Order matters: children before parents.
  await knex('discount_codes').del();
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

  // Join dates are spread over 2026 (admins first, customers keep arriving),
  // so the admin lists sort and read like a platform with a history.
  const rng = makeRng(2026);
  const now = new Date();
  const JOIN_WINDOW = {
    ADMIN: [YEAR_START, new Date('2026-02-15T00:00:00Z')],
    RESTAURANT: [YEAR_START, new Date('2026-06-30T00:00:00Z')],
    DRIVER: [new Date('2026-01-15T00:00:00Z'), new Date('2026-07-31T00:00:00Z')],
    CUSTOMER: [YEAR_START, new Date('2026-08-31T00:00:00Z')],
  };
  const joined = (role) => between(rng, ...JOIN_WINDOW[role]);

  const mkUser = (email, fullName, phone, role, extra = {}) => {
    const createdAt = joined(role);
    return {
      email,
      password_hash: role === 'ADMIN' ? adminHash : userHash,
      full_name: fullName,
      phone,
      role,
      status: 'ACTIVE',
      created_at: createdAt,
      updated_at: createdAt,
      ...extra,
    };
  };
  const suspended = { status: 'SUSPENDED' };

  // Customers sign in with their own name (sara.idris@gmail.com). Beyond the
  // four fixtures, these fill the admin user list with enough rows to page.
  const customerEmail = (fullName) => `${fullName.toLowerCase().replace(' ', '.')}@gmail.com`;
  const moreCustomers = [
    'Ahmed Mansour', 'Mona Khalil', 'Youssef Adel', 'Hana Mostafa', 'Karim Nabil',
    'Salma Fathy', 'Mahmoud Gamal', 'Farida Hassan', 'Tarek Samir', 'Laila Ashraf',
    'Hassan Ragab', 'Yasmin Fouad', 'Mostafa Ezzat', 'Rana Tawfik', 'Amr Shawky',
    'Dina Lotfy', 'Khaled Zaki', 'Nour Hamdy', 'Ibrahim Sobhy', 'Malak Sherif',
    'Ziad Wahba', 'Reem Selim', 'Adham Kamel', 'Jana Magdy', 'Sherif Anwar',
    'Habiba Saad',
  ].map((fullName, i) => mkUser(customerEmail(fullName), fullName, `+2010011111${15 + i}`, 'CUSTOMER',
    // A few suspended accounts among them, so the Suspended filter has rows.
    [5, 12, 19].includes(i) ? suspended : {}));

  const users = await knex('users')
    .insert([
      mkUser(config.seed.adminEmail, 'Sayed Hanafy', '+201000000001', 'ADMIN'),
      mkUser('raya.johonson@foodflow.com', 'Raya Johonson', '+201000000002', 'ADMIN'),
      // Five admins in all, two of them suspended; same password as the first.
      mkUser('nadia.farouk@foodflow.com', 'Nadia Farouk', '+201000000003', 'ADMIN'),
      mkUser('omar.said@foodflow.com', 'Omar Said', '+201000000004', 'ADMIN', suspended),
      mkUser('rami.fikry@foodflow.com', 'Rami Fikry', '+201000000005', 'ADMIN', suspended),
      mkUser('sara.idris@gmail.com', 'Sara Idris', '+201001111111', 'CUSTOMER'),
      mkUser('omar.haddad@gmail.com', 'Omar Haddad', '+201001111112', 'CUSTOMER'),
      mkUser('nora.fresh@gmail.com', 'Nora Fresh', '+201001111113', 'CUSTOMER'),
      mkUser('sam.suspended@gmail.com', 'Sam Suspended', '+201001111114', 'CUSTOMER', { status: 'SUSPENDED' }),
      ...moreCustomers,
      mkUser('olive.grill@foodflow.com', 'Layla Grill', '+201002222221', 'RESTAURANT'),
      mkUser('pasta.house@foodflow.com', 'Marco Pasta', '+201002222222', 'RESTAURANT'),
      mkUser('new.spice@foodflow.com', 'Pending Owner', '+201002222223', 'RESTAURANT'),
      mkUser('paused.kitchen@foodflow.com', 'Suspended Owner', '+201002222224', 'RESTAURANT'),
      mkUser('dawn.bakery@foodflow.com', 'Closed Owner', '+201002222225', 'RESTAURANT'),
      mkUser('blue.sea@foodflow.com', 'Paused Owner', '+201002222226', 'RESTAURANT'),
      mkUser('corner.diner@foodflow.com', 'Hamdy Shaker', '+201002222227', 'RESTAURANT', suspended),
      mkUser('rejected.bistro@foodflow.com', 'Tamer Bistro', '+201002222228', 'RESTAURANT'),
      mkUser('driver@foodflow.com', 'Ali Wheels', '+201003333331', 'DRIVER'),
      mkUser('driver.b@foodflow.com', 'Bilal Swift', '+201003333332', 'DRIVER'),
      mkUser('driver.pending@foodflow.com', 'Pending Driver', '+201003333333', 'DRIVER'),
      // Past-delivery drivers: offline, so they never compete for live offers.
      mkUser('karim.road@foodflow.com', 'Karim Road', '+201003333334', 'DRIVER'),
      mkUser('mina.pedal@foodflow.com', 'Mina Pedal', '+201003333335', 'DRIVER'),
      mkUser('hesham.cruise@foodflow.com', 'Hesham Cruise', '+201003333336', 'DRIVER'),
      mkUser('fady.halt@foodflow.com', 'Fady Halt', '+201003333337', 'DRIVER', suspended),
      mkUser('waleed.stop@foodflow.com', 'Waleed Stop', '+201003333338', 'DRIVER', suspended),
    ])
    .returning('*');

  const byEmail = Object.fromEntries(users.map((u) => [u.email, u]));

  /* --------------------------------------------------------- addresses */

  await knex('customer_addresses').insert([
    {
      user_id: byEmail['sara.idris@gmail.com'].id,
      label: 'Home', line1: '26 Abu El Feda Street', city: 'Cairo', district: 'Zamalek',
      postal_code: '11211', latitude: 30.0650, longitude: 31.2210, is_default: true,
    },
    {
      user_id: byEmail['sara.idris@gmail.com'].id,
      label: 'Work', line1: '15 Tahrir Street', city: 'Giza', district: 'Dokki',
      latitude: 30.0380, longitude: 31.2120, is_default: false,
    },
    {
      user_id: byEmail['omar.haddad@gmail.com'].id,
      label: 'Home', line1: '8 Baghdad Street', city: 'Cairo', district: 'Heliopolis',
      latitude: 30.0890, longitude: 31.3260, is_default: true,
    },
    // Every other customer has a home address too, so an admin can place an
    // order for any of them. Nora stays without one: she is the empty-state
    // fixture (docs/testing/test-data.md).
    ...users
      .filter((u) => u.role === 'CUSTOMER'
        && !['sara.idris@gmail.com', 'omar.haddad@gmail.com', 'nora.fresh@gmail.com'].includes(u.email))
      .map((u, i) => {
        const [district, city, street, latitude, longitude] = SEED_DISTRICTS[i % SEED_DISTRICTS.length];
        return {
          user_id: u.id, label: 'Home', line1: `${10 + i} ${street}`, city, district,
          latitude, longitude, is_default: true,
        };
      }),
  ]);

  /* ------------------------------------------------------- restaurants */

  const restaurantSeeds = [
    { owner: 'olive.grill@foodflow.com', name: 'Olive Grill', slug: 'olive-grill', cuisine: 'LEVANTINE',
      status: 'ACTIVE', accepting: true, fee: '25.00', min: '150.00', prep: 25,
      desc: 'Charcoal-grilled Levantine classics, made to order.',
      lat: 30.0626, lng: 31.2197, district: 'Zamalek' },
    { owner: 'pasta.house@foodflow.com', name: 'Pasta House', slug: 'pasta-house', cuisine: 'ITALIAN',
      status: 'ACTIVE', accepting: true, fee: '20.00', min: '100.00', prep: 20,
      desc: 'Fresh pasta, slow sauces, no shortcuts.',
      lat: 30.0561, lng: 31.2001, district: 'Mohandessin' },
    { owner: 'dawn.bakery@foodflow.com', name: 'Dawn Bakery', slug: 'dawn-bakery', cuisine: 'DESSERTS',
      status: 'ACTIVE', accepting: true, fee: '20.00', min: '100.00', prep: 15,
      desc: 'Morning pastries and cakes.', closedToday: true,
      lat: 30.0384, lng: 31.2123, district: 'Dokki' },
    { owner: 'blue.sea@foodflow.com', name: 'Blue Sea', slug: 'blue-sea', cuisine: 'SEAFOOD',
      status: 'ACTIVE', accepting: false, fee: '35.00', min: '200.00', prep: 35,
      desc: 'Daily catch, grilled or fried.',
      lat: 29.9602, lng: 31.2569, district: 'Maadi' },
    { owner: 'new.spice@foodflow.com', name: 'New Spice', slug: 'new-spice', cuisine: 'INDIAN',
      status: 'PENDING_APPROVAL', accepting: true, fee: '25.00', min: '0.00', prep: 30,
      desc: 'Awaiting platform approval.', lat: 30.0911, lng: 31.3225, district: 'Heliopolis' },
    { owner: 'paused.kitchen@foodflow.com', name: 'Paused Kitchen', slug: 'paused-kitchen', cuisine: 'BURGERS',
      status: 'SUSPENDED', accepting: true, fee: '25.00', min: '120.00', prep: 20,
      desc: 'Temporarily suspended by an administrator.', lat: 30.0561, lng: 31.3301, district: 'Nasr City' },
    { owner: 'corner.diner@foodflow.com', name: 'Corner Diner', slug: 'corner-diner', cuisine: 'BURGERS',
      status: 'SUSPENDED', accepting: false, fee: '20.00', min: '90.00', prep: 20,
      desc: 'Suspended along with its owner after repeated complaints.', lat: 30.0444, lng: 31.2357, district: 'Garden City' },
    { owner: 'rejected.bistro@foodflow.com', name: 'Rejected Bistro', slug: 'rejected-bistro', cuisine: 'ITALIAN',
      status: 'REJECTED', accepting: true, fee: '30.00', min: '150.00', prep: 25,
      desc: 'Application rejected.', rejection: 'Commercial registration number could not be verified.',
      lat: 30.0131, lng: 31.4089, district: 'New Cairo' },
  ];

  /** Opened a few days after the owner joined; approved (if ever) a few days later. */
  const restaurantDates = (ownerJoined, status) => {
    const createdAt = addMinutes(ownerJoined, rng.int(1, 4) * 24 * 60);
    const decided = addMinutes(createdAt, rng.int(1, 6) * 24 * 60 + rng.int(0, 600));
    return {
      created_at: createdAt,
      updated_at: status === 'PENDING_APPROVAL' ? createdAt : decided,
      approved_at: status === 'ACTIVE' || status === 'SUSPENDED' ? decided : null,
    };
  };

  const restaurants = await knex('restaurants')
    .insert(
      restaurantSeeds.map((r) => ({
        owner_user_id: byEmail[r.owner].id,
        name: r.name,
        slug: r.slug,
        description: r.desc,
        cuisine_type: r.cuisine,
        phone: '+201001234567',
        email: `hello@${r.slug}.foodflow.com`,
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
        rejection_reason: r.rejection ?? null,
        ...restaurantDates(byEmail[r.owner].created_at, r.status),
        approved_by_user_id: ['ACTIVE', 'SUSPENDED'].includes(r.status) ? byEmail[config.seed.adminEmail].id : null,
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

  // Profile created with the account; approved a few days later.
  const driverRow = (email, fields) => {
    const createdAt = byEmail[email].created_at;
    return {
      user_id: byEmail[email].id,
      created_at: createdAt,
      updated_at: createdAt,
      approved_at: fields.status === 'PENDING_APPROVAL' ? null : addMinutes(createdAt, rng.int(1, 5) * 24 * 60),
      ...fields,
    };
  };

  await knex('driver_profiles').insert([
    driverRow('driver@foodflow.com', { vehicle_type: 'MOTORCYCLE', vehicle_plate: 'ن ط ق 1234',
      status: 'ACTIVE', availability: 'AVAILABLE', current_latitude: 30.0630, current_longitude: 31.2190,
      location_updated_at: knex.fn.now() }),
    driverRow('driver.b@foodflow.com', { vehicle_type: 'CAR', vehicle_plate: 'س ع د 5678',
      status: 'ACTIVE', availability: 'AVAILABLE', current_latitude: 30.0560, current_longitude: 31.2010,
      location_updated_at: knex.fn.now() }),
    // A bicycle has no plate.
    driverRow('driver.pending@foodflow.com', { vehicle_type: 'BICYCLE', vehicle_plate: null,
      status: 'PENDING_APPROVAL', availability: 'OFFLINE' }),
    driverRow('karim.road@foodflow.com', { vehicle_type: 'MOTORCYCLE', vehicle_plate: 'ك ر م 3141',
      status: 'ACTIVE', availability: 'OFFLINE' }),
    driverRow('mina.pedal@foodflow.com', { vehicle_type: 'BICYCLE', vehicle_plate: null,
      status: 'ACTIVE', availability: 'OFFLINE' }),
    driverRow('hesham.cruise@foodflow.com', { vehicle_type: 'CAR', vehicle_plate: 'ه ش م 2718',
      status: 'ACTIVE', availability: 'OFFLINE' }),
    driverRow('fady.halt@foodflow.com', { vehicle_type: 'MOTORCYCLE', vehicle_plate: 'ف د ي 1618',
      status: 'SUSPENDED', availability: 'OFFLINE' }),
    driverRow('waleed.stop@foodflow.com', { vehicle_type: 'CAR', vehicle_plate: 'و ل د 1414',
      status: 'SUSPENDED', availability: 'OFFLINE' }),
  ]);

  /* ------------------------------------------------------------ orders */

  const address = await knex('customer_addresses')
    .where({ user_id: byEmail['sara.idris@gmail.com'].id, is_default: true })
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
        customer_user_id: byEmail['sara.idris@gmail.com'].id,
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
      actor_user_id: byEmail['sara.idris@gmail.com'].id, actor_role: 'CUSTOMER',
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
      driver_user_id: byEmail['driver@foodflow.com'].id,
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
      driver_user_id: byEmail['driver@foodflow.com'].id,
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
    driver_user_id: byEmail['driver@foodflow.com'].id,
    status: 'COMPLETED',
    expires_at: knex.raw("now() - interval '30 minutes'"),
    responded_at: knex.raw("now() - interval '40 minutes'"),
    distance_km: '2.40',
  });

  /* ----------------------------------------------------------- reviews */

  await knex('reviews').insert({
    order_id: delivered.id,
    customer_user_id: byEmail['sara.idris@gmail.com'].id,
    restaurant_id: bySlug['olive-grill'].id,
    driver_user_id: byEmail['driver@foodflow.com'].id,
    restaurant_rating: 5,
    driver_rating: 4,
    comment: 'Fast and hot. The grill was excellent.',
  });

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
      email: `hello@${s.slug}.foodflow.com`,
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
      ...restaurantDates(ownerByEmail[s.owner].created_at, 'ACTIVE'),
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

  const showcaseItems = await knex('food_items').insert(showcaseRows.flatMap((r) =>
    menuFor(r.cuisine_type).flatMap(([categoryName, dishes]) => {
      const category = showcaseCategories.find((c) => c.restaurant_id === r.id && c.name === categoryName);
      return dishes.map(([name, description, price], i) => ({
        restaurant_id: r.id, category_id: category.id, name, description, price, display_order: i + 1,
      }));
    })))
    .returning('*');

  /* ------------------------------------------------------- order history */

  // Past orders across the year: mostly delivered, some cancelled, placed by
  // the filler customers (the named fixtures keep their documented history)
  // at the original two restaurants and a slice of the showcase, carried by
  // every driver who has ever been approved.
  const historyCustomers = users.filter((u) => u.role === 'CUSTOMER'
    && !['sara.idris@gmail.com', 'omar.haddad@gmail.com', 'nora.fresh@gmail.com', 'sam.suspended@gmail.com'].includes(u.email));
  const historyRestaurants = [bySlug['olive-grill'], bySlug['pasta-house'],
    ...showcaseRows.filter((_, i) => i % 3 === 0)];
  const historyDrivers = await knex('driver_profiles').whereNotNull('approved_at');
  const menuOf = (restaurantId) => [...items, ...showcaseItems]
    .filter((i) => i.restaurant_id === restaurantId && i.is_available);

  const DELIVERED_COUNT = 75;
  const CANCELLED_COUNT = 14;
  const historyOrders = [];

  for (let n = 1; n <= DELIVERED_COUNT + CANCELLED_COUNT; n += 1) {
    const delivered = n <= DELIVERED_COUNT;
    // The date first, spread over the year; then only people and places that
    // existed a day before it: joined, approved, on the road.
    const placedAt = between(rng, new Date('2026-02-01T09:00:00Z'), new Date(now.getTime() - 2 * DAY));
    const before = (date) => date && date.getTime() + DAY < placedAt.getTime();
    const customers = historyCustomers.filter((c) => before(c.created_at));
    const openRestaurants = historyRestaurants.filter((r) => before(r.approved_at));
    const drivers = historyDrivers.filter((d) => before(d.approved_at));
    if (!customers.length || !openRestaurants.length || !drivers.length) continue;
    const customer = rng.pick(customers);
    const restaurant = rng.pick(openRestaurants);
    const driver = rng.pick(drivers);

    const menu = menuOf(restaurant.id);
    const lines = Array.from({ length: rng.int(1, 3) }, () => rng.pick(menu))
      .filter((it, i, all) => all.indexOf(it) === i)
      .map((it) => ({ item: it, qty: rng.int(1, 3) }));
    const subtotal = lines.reduce((sum, l) => sum + Number(l.item.price) * l.qty, 0).toFixed(2);
    const fee = restaurant.delivery_fee;
    const tax = (Math.round(Number(subtotal) * config.taxRate * 100) / 100).toFixed(2);
    const total = (Number(subtotal) + Number(fee) + Number(tax)).toFixed(2);

    const [city, district] = rng.pick(DISTRICTS);
    const snapshot = {
      label: rng.pick(['Home', 'Work', 'Home']), line1: `${rng.int(1, 120)} ${rng.pick(STREETS)}`, line2: null,
      city, district, postalCode: null, latitude: null, longitude: null,
    };

    const order = {
      order_number: `FF-${ymd(placedAt)}-H${String(n).padStart(3, '0')}`,
      customer_user_id: customer.id,
      restaurant_id: restaurant.id,
      delivery_address_id: null,
      delivery_address_snapshot: JSON.stringify(snapshot),
      restaurant_name_snapshot: restaurant.name,
      subtotal, delivery_fee: fee, tax_amount: tax, total_amount: total,
      placed_at: placedAt,
      created_at: placedAt,
    };
    // Each step a few minutes after the last, with who took it.
    const events = [{ to: 'PENDING', at: placedAt, role: 'CUSTOMER', actor: customer.id }];

    if (delivered) {
      const confirmedAt = addMinutes(placedAt, rng.int(1, 6));
      const preparingAt = addMinutes(confirmedAt, rng.int(1, 4));
      const readyAt = addMinutes(preparingAt, restaurant.avg_preparation_minutes + rng.int(-5, 15));
      const pickedUpAt = addMinutes(readyAt, rng.int(3, 15));
      const deliveredAt = addMinutes(pickedUpAt, rng.int(10, 40));
      Object.assign(order, {
        status: 'DELIVERED', dispatch_state: 'COMPLETED', driver_user_id: driver.user_id,
        confirmed_at: confirmedAt, preparing_at: preparingAt, ready_at: readyAt,
        picked_up_at: pickedUpAt, delivered_at: deliveredAt, updated_at: deliveredAt,
      });
      events.push(
        { from: 'PENDING', to: 'CONFIRMED', at: confirmedAt, role: 'RESTAURANT', actor: restaurant.owner_user_id },
        { from: 'CONFIRMED', to: 'PREPARING', at: preparingAt, role: 'RESTAURANT', actor: restaurant.owner_user_id },
        { from: 'PREPARING', to: 'READY_FOR_PICKUP', at: readyAt, role: 'RESTAURANT', actor: restaurant.owner_user_id },
        { from: 'READY_FOR_PICKUP', to: 'OUT_FOR_DELIVERY', at: pickedUpAt, role: 'DRIVER', actor: driver.user_id },
        { from: 'OUT_FOR_DELIVERY', to: 'DELIVERED', at: deliveredAt, role: 'DRIVER', actor: driver.user_id },
      );
    } else {
      const cancel = rng.pick(CANCELLATIONS);
      const cancelledAt = addMinutes(placedAt, rng.int(2, 25));
      Object.assign(order, {
        status: 'CANCELLED', dispatch_state: 'NOT_REQUIRED',
        cancelled_at: cancelledAt, cancelled_by: cancel.by,
        cancellation_reason: cancel.reason, cancellation_note: cancel.note, updated_at: cancelledAt,
      });
      const actor = { CUSTOMER: customer.id, RESTAURANT: restaurant.owner_user_id,
        ADMIN: byEmail[config.seed.adminEmail].id, SYSTEM: null }[cancel.by];
      events.push({ from: 'PENDING', to: 'CANCELLED', at: cancelledAt, role: cancel.by, actor, reason: cancel.reason });
    }
    historyOrders.push({ order, lines, events, delivered, customer, restaurant, driver });
  }

  const insertedHistory = await knex('orders').insert(historyOrders.map((h) => h.order)).returning('*');
  insertedHistory.forEach((row, i) => { historyOrders[i].row = row; });

  await knex('order_items').insert(historyOrders.flatMap(({ row, lines }) => lines.map((l) => ({
    order_id: row.id,
    food_item_id: l.item.id,
    item_name_snapshot: l.item.name,
    item_description_snapshot: l.item.description,
    unit_price: l.item.price,
    quantity: l.qty,
    line_total: (Number(l.item.price) * l.qty).toFixed(2),
    created_at: row.placed_at,
  }))));

  await knex('order_status_events').insert(historyOrders.flatMap(({ row, events }) => events.map((e) => ({
    order_id: row.id, from_status: e.from ?? null, to_status: e.to,
    actor_user_id: e.actor, actor_role: e.role, reason: e.reason ?? null, created_at: e.at,
  }))));

  const deliveredHistory = historyOrders.filter((h) => h.delivered);
  await knex('delivery_assignments').insert(deliveredHistory.map(({ row }) => {
    const offeredAt = addMinutes(row.ready_at, -rng.int(2, 6));
    return {
      order_id: row.id,
      driver_user_id: row.driver_user_id,
      status: 'COMPLETED',
      distance_km: (rng.int(8, 75) / 10).toFixed(2),
      offered_at: offeredAt,
      expires_at: addMinutes(offeredAt, 2),
      responded_at: addMinutes(offeredAt, 1),
      created_at: offeredAt,
      updated_at: row.delivered_at,
    };
  }));

  /* ------------------------------------------------------ review history */

  // Sixty reviews of those deliveries: happy, so-so and unhappy customers,
  // a few left without a comment, and a handful a moderator has hidden.
  const REVIEW_COUNT = 60;
  const hiddenSlots = new Set([7, 19, 31, 44, 56]);
  let hiddenIndex = 0;
  const reviewRows = deliveredHistory.slice(0, REVIEW_COUNT).map(({ row }, i) => {
    const createdAt = new Date(Math.min(
      addMinutes(row.delivered_at, rng.int(20, 48 * 60)).getTime(),
      now.getTime() - 60 * 60 * 1000,
    ));
    const base = {
      order_id: row.id,
      customer_user_id: row.customer_user_id,
      restaurant_id: row.restaurant_id,
      driver_user_id: row.driver_user_id,
      created_at: createdAt,
      updated_at: createdAt,
    };
    if (hiddenSlots.has(i)) {
      const hidden = HIDDEN_REVIEWS[hiddenIndex++ % HIDDEN_REVIEWS.length];
      return {
        ...base, restaurant_rating: 1, driver_rating: null, comment: hidden.comment,
        status: 'HIDDEN', moderation_reason: hidden.reason,
        hidden_by_user_id: byEmail[rng.pick([config.seed.adminEmail, 'raya.johonson@foodflow.com'])].id,
        updated_at: addMinutes(createdAt, rng.int(30, 24 * 60)),
      };
    }
    const mood = moodFor(rng);
    const rating = ratingsFor(rng, mood);
    return {
      ...base, restaurant_rating: rating.restaurant, driver_rating: rating.driver,
      comment: rng.pick(COMMENTS[mood]), status: 'PUBLISHED',
    };
  });
  await knex('reviews').insert(reviewRows);

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

  /* -------------------------------------------------------------- cart */

  const [cart] = await knex('carts')
    .insert({
      customer_user_id: byEmail['omar.haddad@gmail.com'].id,
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

  /* ------------------------------------------------------- favourites */

  // Sara has a shortlist, so the Favourites page and the filled hearts have
  // something to show. One restaurant that cannot take orders right now is
  // included to show the "unavailable" state. The favourites tables are emptied
  // by the cascades from users and restaurants above.
  const saraId = byEmail['sara.idris@gmail.com'].id;
  const favouriteRestaurants = [bySlug['olive-grill'], bySlug['pasta-house'], bySlug['dawn-bakery']].filter(Boolean);
  await knex('favourite_restaurants').insert(favouriteRestaurants.map((r) => ({ user_id: saraId, restaurant_id: r.id })));
  await knex('favourite_items').insert(['Truffle Pasta', 'Mixed Grill'].map(item).filter(Boolean)
    .map((i) => ({ user_id: saraId, food_item_id: i.id })));

  /* ---------------------------------------------------- discount codes */

  const createdBy = byEmail[config.seed.adminEmail].id;
  await knex('discount_codes').insert([
    { code: 'WELCOME10', description: '10% off, up to 100.00', discount_type: 'PERCENT', value: '10.00',
      max_discount_amount: '100.00', min_subtotal: '100.00', per_customer_limit: 1, created_by: createdBy },
    { code: 'SAVE50', description: '50.00 off orders of 300.00 or more', discount_type: 'FIXED', value: '50.00',
      min_subtotal: '300.00', usage_limit: 100, created_by: createdBy },
    { code: 'GRILL15', description: '15% off at Olive Grill', discount_type: 'PERCENT', value: '15.00',
      restaurant_id: bySlug['olive-grill']?.id ?? null, created_by: createdBy },
    { code: 'OLDDEAL', description: 'An expired code, for the Expired filter', discount_type: 'PERCENT', value: '20.00',
      ends_at: new Date(Date.now() - 7 * 24 * 3600 * 1000), created_by: createdBy },
  ]);

  // eslint-disable-next-line no-console
  console.log(`Seed complete.
  Admin:      ${config.seed.adminEmail} / ${config.seed.adminPassword}
  Customer:   sara.idris@gmail.com / ${config.seed.userPassword}
  Restaurant: olive.grill@foodflow.com / ${config.seed.userPassword}
  Driver:     driver@foodflow.com / ${config.seed.userPassword}
  (development credentials only - see backend/.env.example)
  Restaurants: ${restaurantSeeds.length + showcase.length} (${showcase.length} showcase)
  Orders seeded: ${counter} (including delivered ${delivered.order_number} and unreviewed ${deliveredUnreviewed.order_number})
  History:    ${insertedHistory.length} past orders (${deliveredHistory.length} delivered), ${reviewRows.length + 1} reviews in all`);
}
