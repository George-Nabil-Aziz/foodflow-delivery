import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { knex, resetDatabase } from '../helpers/db.js';
import {
  makeUser, makeAddress, makeStockedRestaurant, makeItem, authHeader,
} from '../helpers/factories.js';

beforeEach(async () => { await resetDatabase(); });

/** A restaurant whose main dish has a required Size and an optional Extras group. */
async function setup() {
  const customer = await makeUser({ role: 'CUSTOMER' });
  const address = await makeAddress(customer);
  const admin = await makeUser({ role: 'ADMIN' });
  const r = await makeStockedRestaurant({ name: 'Olive Grill' });

  const size = await request(app).post(`/api/restaurant/items/${r.main.id}/option-groups`)
    .set(authHeader(r.owner))
    .send({
      name: 'Size', minSelect: 1, maxSelect: 1,
      options: [{ name: 'Regular', priceDelta: '0.00' }, { name: 'Large', priceDelta: '12.50' }],
    });
  const extras = await request(app).post(`/api/restaurant/items/${r.main.id}/option-groups`)
    .set(authHeader(r.owner))
    .send({
      name: 'Extras', minSelect: 0, maxSelect: 2, displayOrder: 1,
      options: [
        { name: 'Cheese', priceDelta: '5.00' }, { name: 'Bacon', priceDelta: '7.25' }, { name: 'Pickles', priceDelta: '1.00' },
      ],
    });
  const ids = (res) => Object.fromEntries(res.body.data.options.map((o) => [o.name, o.id]));
  return {
    customer, address, admin, ...r,
    sizeGroup: size.body.data, extrasGroup: extras.body.data,
    size: ids(size), extra: ids(extras),
  };
}

const add = (customer, foodItemId, body = {}) =>
  request(app).post('/api/cart/items').set(authHeader(customer)).send({ foodItemId, ...body });
const getCart = (customer) => request(app).get('/api/cart').set(authHeader(customer));
const checkout = (customer, address) =>
  request(app).post('/api/orders').set(authHeader(customer))
    .send({ addressId: address.id, paymentMethod: 'CASH_ON_DELIVERY' });

describe('owner: managing option groups and options', () => {
  it('creates a group with options, listed on the item and on the public menu', async () => {
    const { owner, restaurant, main, soup } = await setup();

    const groups = await request(app).get(`/api/restaurant/items/${main.id}/option-groups`).set(authHeader(owner));
    expect(groups.status).toBe(200);
    expect(groups.body.data.map((g) => g.name)).toEqual(['Size', 'Extras']);
    expect(groups.body.data[0]).toMatchObject({ minSelect: 1, maxSelect: 1, isRequired: true });
    expect(groups.body.data[0].options.map((o) => [o.name, o.priceDelta])).toEqual([['Regular', '0.00'], ['Large', '12.50']]);

    const items = await request(app).get('/api/restaurant/items').set(authHeader(owner));
    expect(items.body.data.find((i) => i.id === main.id).optionGroups).toHaveLength(2);
    expect(items.body.data.find((i) => i.id === soup.id).optionGroups).toEqual([]);

    const menu = await request(app).get(`/api/restaurants/${restaurant.id}/menu`);
    const publicMain = menu.body.data.flatMap((c) => c.items).find((i) => i.id === main.id);
    expect(publicMain.optionGroups.map((g) => g.name)).toEqual(['Size', 'Extras']);
  });

  it('refuses invalid groups and options', async () => {
    const { owner, main } = await setup();
    const post = (body) => request(app).post(`/api/restaurant/items/${main.id}/option-groups`).set(authHeader(owner)).send(body);
    const one = [{ name: 'A', priceDelta: '1.00' }];

    expect((await post({ name: 'Bad', minSelect: 2, maxSelect: 1, options: one })).status).toBe(422);
    expect((await post({ name: 'Bad', minSelect: 0, maxSelect: 0, options: one })).status).toBe(422);
    expect((await post({ name: 'Bad', minSelect: 2, maxSelect: 2, options: one })).status).toBe(422); // only one option
    expect((await post({ name: 'Bad', options: [] })).status).toBe(422);
    expect((await post({ name: 'Bad', options: [{ name: 'A', priceDelta: '-1.00' }] })).status).toBe(422);
    expect((await post({ name: 'Bad', options: [{ name: 'A', priceDelta: '1.005' }] })).status).toBe(422);
    expect((await post({ name: '', options: one })).status).toBe(422);
    // A duplicate group name on the same item.
    expect((await post({ name: 'size', options: one })).status).toBe(409);
  });

  it("is scoped to the owner's own restaurant and to restaurant owners", async () => {
    const { owner, customer, main, sizeGroup, size } = await setup();
    const other = await makeStockedRestaurant();

    for (const [method, path, body] of [
      ['get', `/api/restaurant/items/${main.id}/option-groups`],
      ['patch', `/api/restaurant/option-groups/${sizeGroup.id}`, { name: 'Hacked' }],
      ['delete', `/api/restaurant/option-groups/${sizeGroup.id}`],
      ['patch', `/api/restaurant/options/${size.Large}`, { priceDelta: '0.00' }],
      ['patch', `/api/restaurant/options/${size.Large}/availability`, { isAvailable: false }],
      ['delete', `/api/restaurant/options/${size.Large}`],
    ]) {
      const res = await request(app)[method](path).set(authHeader(other.owner)).send(body);
      expect(res.status, `${method} ${path}`).toBe(404);
    }
    const asCustomer = await request(app).get(`/api/restaurant/items/${main.id}/option-groups`).set(authHeader(customer));
    expect(asCustomer.status).toBe(403);
    expect((await knex('item_options').where({ id: size.Large }).first()).price_delta).toBe('12.50');
    expect(owner).toBeDefined();
  });

  it('edits and reorders groups and options, and toggles availability', async () => {
    const { owner, main, sizeGroup, extrasGroup, extra } = await setup();
    const h = authHeader(owner);

    const renamed = await request(app).patch(`/api/restaurant/option-groups/${extrasGroup.id}`).set(h)
      .send({ name: 'Add-ons', maxSelect: 3 });
    expect(renamed.body.data).toMatchObject({ name: 'Add-ons', minSelect: 0, maxSelect: 3 });
    // min above max is refused on update too.
    expect((await request(app).patch(`/api/restaurant/option-groups/${extrasGroup.id}`).set(h)
      .send({ minSelect: 4 })).status).toBe(422);

    const reordered = await request(app).put(`/api/restaurant/items/${main.id}/option-groups/order`).set(h)
      .send({ groups: [{ id: extrasGroup.id, displayOrder: 0 }, { id: sizeGroup.id, displayOrder: 1 }] });
    expect(reordered.body.data.map((g) => g.name)).toEqual(['Add-ons', 'Size']);

    const option = await request(app).patch(`/api/restaurant/options/${extra.Cheese}`).set(h)
      .send({ name: 'Extra cheese', priceDelta: '6.00' });
    expect(option.body.data.options.find((o) => o.id === extra.Cheese)).toMatchObject({ name: 'Extra cheese', priceDelta: '6.00' });

    const off = await request(app).patch(`/api/restaurant/options/${extra.Bacon}/availability`).set(h).send({ isAvailable: false });
    expect(off.body.data.options.find((o) => o.id === extra.Bacon).isAvailable).toBe(false);

    const added = await request(app).post(`/api/restaurant/option-groups/${extrasGroup.id}/options`).set(h)
      .send({ name: 'Jalapenos', priceDelta: '2.00' });
    expect(added.status).toBe(201);
    expect(added.body.data.options).toHaveLength(4);

    const moved = await request(app).put(`/api/restaurant/option-groups/${extrasGroup.id}/options/order`).set(h)
      .send({ options: [{ id: extra.Pickles, displayOrder: 0 }, { id: extra.Cheese, displayOrder: 1 }] });
    expect(moved.body.data.options[0].name).toBe('Pickles');
  });

  it('refuses to delete the option a required group needs, and soft-deletes the rest', async () => {
    const { owner, extrasGroup, size, extra } = await setup();
    const h = authHeader(owner);

    // Size needs one; deleting Large leaves one: fine. Deleting Regular too would not.
    expect((await request(app).delete(`/api/restaurant/options/${size.Large}`).set(h)).status).toBe(200);
    const blocked = await request(app).delete(`/api/restaurant/options/${size.Regular}`).set(h);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('OPTION_GROUP_UNSATISFIABLE');

    // Soft delete: the row stays so a cart line can still name it.
    expect((await knex('item_options').where({ id: size.Large }).first()).deleted_at).not.toBeNull();

    expect((await request(app).delete(`/api/restaurant/option-groups/${extrasGroup.id}`).set(h)).status).toBe(204);
    expect((await knex('item_options').where({ id: extra.Cheese }).first()).deleted_at).not.toBeNull();
  });
});

describe('customer: adding an item with options', () => {
  it('prices the line as base + chosen deltas, computed by the server', async () => {
    const { customer, main, size, extra } = await setup();
    const res = await add(customer, main.id, { quantity: 2, optionIds: [size.Large, extra.Cheese, extra.Bacon] });

    expect(res.status).toBe(200);
    const [line] = res.body.data.items;
    expect(line.basePrice).toBe('58.00');
    expect(line.unitPrice).toBe('82.75'); // 58 + 12.50 + 5.00 + 7.25
    expect(line.lineTotal).toBe('165.50');
    expect(line.options.map((o) => [o.groupName, o.name, o.priceDelta])).toEqual([
      ['Size', 'Large', '12.50'], ['Extras', 'Cheese', '5.00'], ['Extras', 'Bacon', '7.25'],
    ]);
    expect(res.body.data.totals.subtotal).toBe('165.50');
    expect(res.body.data.canCheckout).toBe(true);
    // The stored cart holds ids and no price of its own beyond the change detector.
    expect(await knex('cart_item_options')).toHaveLength(3);
  });

  it('refuses a missing required choice, too many choices and unavailable options', async () => {
    const { customer, owner, main, size, extra, soup } = await setup();
    const code = (res) => [res.status, res.body.error?.code];

    expect(code(await add(customer, main.id))).toEqual([422, 'ITEM_OPTIONS_INVALID']);
    expect(code(await add(customer, main.id, { optionIds: [extra.Cheese] }))).toEqual([422, 'ITEM_OPTIONS_INVALID']);
    expect(code(await add(customer, main.id, { optionIds: [size.Regular, size.Large] }))).toEqual([422, 'ITEM_OPTIONS_INVALID']);
    expect(code(await add(customer, main.id, { optionIds: [size.Regular, extra.Cheese, extra.Bacon, extra.Pickles] })))
      .toEqual([422, 'ITEM_OPTIONS_INVALID']);

    // An option of a different item, and an id that does not exist at all.
    expect(code(await add(customer, soup.id, { optionIds: [size.Regular] }))).toEqual([422, 'ITEM_OPTIONS_INVALID']);
    expect(code(await add(customer, main.id, { optionIds: [size.Regular, '00000000-0000-0000-0000-000000000000'] })))
      .toEqual([422, 'ITEM_OPTIONS_INVALID']);

    await request(app).patch(`/api/restaurant/options/${extra.Cheese}/availability`).set(authHeader(owner)).send({ isAvailable: false });
    const off = await add(customer, main.id, { optionIds: [size.Regular, extra.Cheese] });
    expect(code(off)).toEqual([422, 'ITEM_OPTIONS_INVALID']);
    expect(off.body.error.details[0].issue).toMatch(/unavailable/);

    expect((await getCart(customer)).body.data.items).toEqual([]);
  });

  it('ignores a client-supplied price and a repeated option id', async () => {
    const { customer, main, size } = await setup();
    const res = await add(customer, main.id, { optionIds: [size.Large, size.Large], unitPrice: '1.00', priceDelta: '0.00' });
    expect(res.status).toBe(200);
    expect(res.body.data.items[0].unitPrice).toBe('70.50');
  });

  it('adds an item without groups exactly as before', async () => {
    const { customer, soup } = await setup();
    const res = await add(customer, soup.id, { quantity: 3 });
    expect(res.status).toBe(200);
    expect(res.body.data.items[0]).toMatchObject({ unitPrice: '18.00', lineTotal: '54.00', options: [] });
  });

  it('keeps different options or notes on separate lines and merges identical ones', async () => {
    const { customer, main, size, extra } = await setup();

    await add(customer, main.id, { optionIds: [size.Regular] });
    await add(customer, main.id, { optionIds: [size.Large] });
    // Same choices in another order, with the same (empty) note: merges.
    await add(customer, main.id, { optionIds: [extra.Cheese, size.Regular] });
    await add(customer, main.id, { optionIds: [size.Regular, extra.Cheese] });
    let cart = (await getCart(customer)).body.data;
    expect(cart.items).toHaveLength(3);
    expect(cart.items.map((l) => l.quantity).sort()).toEqual([1, 1, 2]);

    // A note makes a line of its own; the same note merges, a blank note is no note.
    await add(customer, main.id, { optionIds: [size.Regular], notes: 'no onions' });
    await add(customer, main.id, { optionIds: [size.Regular], notes: '  no onions ' });
    await add(customer, main.id, { optionIds: [size.Regular], notes: '   ' });
    cart = (await getCart(customer)).body.data;
    expect(cart.items).toHaveLength(4);
    const noted = cart.items.find((l) => l.notes === 'no onions');
    expect(noted.quantity).toBe(2);
    expect(cart.items.find((l) => l.options.length === 1 && l.options[0].name === 'Regular' && l.notes === null).quantity).toBe(2);
    expect(cart.itemCount).toBe(7);
  });

  it('keeps a line note on an item that has no options, and caps it at 200 characters', async () => {
    const { customer, soup } = await setup();
    const res = await add(customer, soup.id, { notes: 'extra hot' });
    expect(res.body.data.items[0].notes).toBe('extra hot');
    const other = await add(customer, soup.id, { notes: 'mild' });
    expect(other.body.data.items).toHaveLength(2);

    expect((await add(customer, soup.id, { notes: 'x'.repeat(201) })).status).toBe(422);
    expect((await add(customer, soup.id, { notes: 'x'.repeat(200) })).status).toBe(200);
  });
});

describe('cart revalidation of options', () => {
  const line = async (customer) => (await getCart(customer)).body.data;

  it('reports an option that became unavailable, and blocks checkout', async () => {
    const { customer, address, owner, main, size, extra } = await setup();
    await add(customer, main.id, { optionIds: [size.Regular, extra.Cheese] });
    await request(app).patch(`/api/restaurant/options/${extra.Cheese}/availability`).set(authHeader(owner)).send({ isAvailable: false });

    const cart = await line(customer);
    expect(cart.items[0].issues).toEqual(['OPTION_UNAVAILABLE']);
    expect(cart.issues).toEqual(['OPTION_UNAVAILABLE']);
    expect(cart.canCheckout).toBe(false);

    const res = await checkout(customer, address);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CART_HAS_ISSUES');
    expect(await knex('orders')).toHaveLength(0);

    // Switching it back on clears the issue.
    await request(app).patch(`/api/restaurant/options/${extra.Cheese}/availability`).set(authHeader(owner)).send({ isAvailable: true });
    expect((await line(customer)).canCheckout).toBe(true);
  });

  it('reports an option that was deleted, still naming it', async () => {
    const { customer, owner, main, size, extra } = await setup();
    await add(customer, main.id, { optionIds: [size.Regular, extra.Cheese] });
    await request(app).delete(`/api/restaurant/options/${extra.Cheese}`).set(authHeader(owner)).expect(200);

    const cart = await line(customer);
    // Losing a priced option also moves the unit price, so that is reported too.
    expect(cart.items[0].issues).toEqual(['OPTION_REMOVED', 'PRICE_CHANGED']);
    expect(cart.items[0].options.find((o) => o.isRemoved)).toMatchObject({ name: 'Cheese', groupName: 'Extras' });
    // A removed option is not charged.
    expect(cart.items[0].unitPrice).toBe('58.00');
    expect(cart.canCheckout).toBe(false);
  });

  it('reports a group whose rules changed: new required group, raised minimum, lowered maximum', async () => {
    const { customer, owner, main, soup, size, extra, extrasGroup } = await setup();
    const h = authHeader(owner);

    await add(customer, main.id, { optionIds: [size.Regular, extra.Cheese, extra.Bacon] });
    await request(app).patch(`/api/restaurant/option-groups/${extrasGroup.id}`).set(h).send({ maxSelect: 1 });
    expect((await line(customer)).items[0].issues).toEqual(['OPTIONS_CHANGED']);
    await request(app).patch(`/api/restaurant/option-groups/${extrasGroup.id}`).set(h).send({ maxSelect: 2 });
    expect((await line(customer)).canCheckout).toBe(true);

    await request(app).delete('/api/cart').set(authHeader(customer));

    // A required group added after the item was put in the cart.
    await add(customer, soup.id);
    await request(app).post(`/api/restaurant/items/${soup.id}/option-groups`).set(h)
      .send({ name: 'Bread', minSelect: 1, maxSelect: 1, options: [{ name: 'Pita' }, { name: 'Toast' }] });
    const cart = await line(customer);
    expect(cart.items[0].issues).toEqual(['OPTIONS_CHANGED']);
    expect(cart.canCheckout).toBe(false);
  });

  it('prices from live data: a changed option price is a price change, not a stale total', async () => {
    const { customer, owner, main, size } = await setup();
    await add(customer, main.id, { optionIds: [size.Large] });
    await request(app).patch(`/api/restaurant/options/${size.Large}`).set(authHeader(owner)).send({ priceDelta: '20.00' });

    const cart = await line(customer);
    expect(cart.items[0].unitPrice).toBe('78.00');
    expect(cart.items[0].issues).toEqual(['PRICE_CHANGED']);
    expect(cart.totals.subtotal).toBe('78.00');
  });

  it('reports an item with a required group that has no available option as unorderable', async () => {
    const { customer, owner, main, size } = await setup();
    const h = authHeader(owner);
    await request(app).patch(`/api/restaurant/options/${size.Regular}/availability`).set(h).send({ isAvailable: false });
    await request(app).patch(`/api/restaurant/options/${size.Large}/availability`).set(h).send({ isAvailable: false });
    const res = await add(customer, main.id, { optionIds: [size.Large] });
    expect(res.status).toBe(422);
  });
});

describe('checkout snapshots options', () => {
  it('stores options and note, totals include the deltas, and history survives menu edits', async () => {
    const { customer, address, owner, restaurant, main, soup, size, extra } = await setup();
    await add(customer, main.id, { quantity: 2, optionIds: [size.Large, extra.Cheese], notes: 'no onions' });
    await add(customer, soup.id);

    const res = await checkout(customer, address);
    expect(res.status).toBe(201);
    // 2 x (58 + 12.50 + 5.00) + 18 = 169.00; tax and fee as for any order.
    expect(res.body.data.subtotal).toBe('169.00');
    const order = res.body.data;
    const grill = order.items.find((i) => i.name === main.name);
    expect(grill).toMatchObject({ unitPrice: '75.50', quantity: 2, lineTotal: '151.00', notes: 'no onions' });
    expect(grill.options).toEqual([
      { groupName: 'Size', name: 'Large', priceDelta: '12.50' },
      { groupName: 'Extras', name: 'Cheese', priceDelta: '5.00' },
    ]);
    expect(order.items.find((i) => i.name === soup.name).options).toEqual([]);
    expect(order.totalAmount).toBe((Number(order.subtotal) + 12 + Number(order.taxAmount)).toFixed(2));

    // Rename, reprice, delete: the order does not move (BR-O1).
    const h = authHeader(owner);
    await request(app).patch(`/api/restaurant/options/${size.Large}`).set(h).send({ name: 'XL', priceDelta: '30.00' });
    await request(app).delete(`/api/restaurant/options/${extra.Cheese}`).set(h);
    await request(app).delete(`/api/restaurant/option-groups/${(await knex('item_option_groups').where({ name: 'Size' }).first()).id}`).set(h);

    const again = await request(app).get(`/api/orders/${order.id}`).set(authHeader(customer));
    const kept = again.body.data.items.find((i) => i.name === main.name);
    expect(kept.options).toEqual(grill.options);
    expect(kept.unitPrice).toBe('75.50');
    expect(again.body.data.totalAmount).toBe(order.totalAmount);

    // The restaurant and the admin see the same options and note.
    const forRestaurant = await request(app).get(`/api/restaurant/orders/${order.id}`).set(h);
    expect(forRestaurant.body.data.items.find((i) => i.name === main.name))
      .toMatchObject({ notes: 'no onions', options: grill.options });
    const admin = await makeUser({ role: 'ADMIN' });
    const forAdmin = await request(app).get(`/api/admin/orders/${order.id}`).set(authHeader(admin));
    expect(forAdmin.body.data.items.find((i) => i.name === main.name))
      .toMatchObject({ notes: 'no onions', options: grill.options });
    expect(restaurant).toBeDefined();
  });

  it('keeps two lines of one item with different options as two order lines', async () => {
    const { customer, address, main, size } = await setup();
    await add(customer, main.id, { optionIds: [size.Regular] });
    await add(customer, main.id, { optionIds: [size.Large] });
    const res = await checkout(customer, address);
    expect(res.status).toBe(201);
    expect(res.body.data.items.map((i) => i.unitPrice).sort()).toEqual(['58.00', '70.50']);
    expect(await knex('order_item_options')).toHaveLength(2);
  });

  it('prices a discount on the subtotal including option deltas', async () => {
    const { customer, address, main, size } = await setup();
    await knex('discount_codes').insert({ code: 'FIVER', discount_type: 'FIXED', value: '10.00' });
    await add(customer, main.id, { optionIds: [size.Large] });
    const applied = await request(app).post('/api/cart/discount').set(authHeader(customer)).send({ code: 'FIVER' });
    expect(applied.body.data.totals).toMatchObject({ subtotal: '70.50', discountAmount: '10.00' });

    const res = await checkout(customer, address);
    expect(res.body.data).toMatchObject({ subtotal: '70.50', discountAmount: '10.00' });
  });

  it('does not let a stale cart through when an option vanished between view and checkout', async () => {
    const { customer, address, owner, main, size } = await setup();
    await add(customer, main.id, { optionIds: [size.Large] });
    await request(app).delete(`/api/restaurant/options/${size.Large}`).set(authHeader(owner)).expect(200);
    const res = await checkout(customer, address);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CART_HAS_ISSUES');
    expect(res.body.error.details[0].codes).toContain('OPTION_REMOVED');
  });
});

describe('admin places an order for a customer', () => {
  const place = (admin, body) => request(app).post('/api/admin/orders').set(authHeader(admin)).send(body);
  const base = (s) => ({ customerUserId: s.customer.id, restaurantId: s.restaurant.id, addressId: s.address.id });

  it('refuses an item with a required group when no choice is given', async () => {
    const s = await setup();
    const res = await place(s.admin, { ...base(s), items: [{ foodItemId: s.main.id, quantity: 1 }] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ITEM_OPTIONS_INVALID');
    expect(res.body.error.details[0].issue).toMatch(/Size/);
    expect(await knex('orders')).toHaveLength(0);
    expect(await knex('admin_audit_logs').where({ action: 'ORDER_PLACED' })).toHaveLength(0);
  });

  it('accepts choices, prices them on the server and snapshots them', async () => {
    const s = await setup();
    const res = await place(s.admin, {
      ...base(s),
      items: [
        { foodItemId: s.main.id, quantity: 1, optionIds: [s.size.Large, s.extra.Pickles], notes: 'well done' },
        { foodItemId: s.main.id, quantity: 1, optionIds: [s.size.Regular] },
        { foodItemId: s.soup.id, quantity: 1 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.subtotal).toBe('147.50'); // 71.50 + 58.00 + 18.00
    const big = res.body.data.items.find((i) => i.unitPrice === '71.50');
    expect(big).toMatchObject({ notes: 'well done' });
    expect(big.options.map((o) => o.name)).toEqual(['Large', 'Pickles']);
  });

  it('refuses unavailable, unknown and surplus options, and a truly duplicated line', async () => {
    const s = await setup();
    await request(app).patch(`/api/restaurant/options/${s.size.Large}/availability`).set(authHeader(s.owner)).send({ isAvailable: false });

    const off = await place(s.admin, { ...base(s), items: [{ foodItemId: s.main.id, quantity: 1, optionIds: [s.size.Large] }] });
    expect(off.body.error.code).toBe('ITEM_OPTIONS_INVALID');

    const surplus = await place(s.admin, {
      ...base(s), items: [{ foodItemId: s.main.id, quantity: 1, optionIds: [s.size.Regular, s.extra.Cheese, s.extra.Bacon, s.extra.Pickles] }],
    });
    expect(surplus.body.error.code).toBe('ITEM_OPTIONS_INVALID');

    const unknown = await place(s.admin, {
      ...base(s), items: [{ foodItemId: s.soup.id, quantity: 1, optionIds: [s.size.Regular] }],
    });
    expect(unknown.body.error.code).toBe('ITEM_OPTIONS_INVALID');

    const twice = await place(s.admin, {
      ...base(s),
      items: [{ foodItemId: s.main.id, quantity: 1, optionIds: [s.size.Regular] }, { foodItemId: s.main.id, quantity: 2, optionIds: [s.size.Regular] }],
    });
    expect(twice.status).toBe(422);
    expect(await knex('orders')).toHaveLength(0);
  });

  it('still places an item that has no groups without any choice', async () => {
    const s = await setup();
    const extraItem = await makeItem(s.restaurant, s.category, { price: '40.00' });
    const res = await place(s.admin, { ...base(s), items: [{ foodItemId: extraItem.id, quantity: 1 }] });
    expect(res.status).toBe(201);
    expect(res.body.data.items[0].options).toEqual([]);
  });
});
