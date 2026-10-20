import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { knex, resetDatabase } from '../helpers/db.js';
import {
  makeUser, makeAddress, makeStockedRestaurant, makeItem, makeCart, authHeader,
} from '../helpers/factories.js';

beforeEach(async () => { await resetDatabase(); });

async function setup() {
  const admin = await makeUser({ role: 'ADMIN' });
  const customer = await makeUser({ role: 'CUSTOMER' });
  const address = await makeAddress(customer);
  const stocked = await makeStockedRestaurant();
  return { admin, customer, address, ...stocked };
}

const place = (admin, body) => request(app).post('/api/admin/orders').set(authHeader(admin)).send(body);

describe('an admin places an order for a customer', () => {
  it('prices it on the server, attributes it to the admin and audits it', async () => {
    const { admin, customer, address, restaurant, main, soup } = await setup();
    const res = await place(admin, {
      customerUserId: customer.id, restaurantId: restaurant.id, addressId: address.id,
      items: [{ foodItemId: main.id, quantity: 2 }, { foodItemId: soup.id, quantity: 1, notes: 'No onion' }],
    });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');

    const order = await knex('orders').where({ id: res.body.data.id }).first();
    expect(order.customer_user_id).toBe(customer.id);
    expect(order.subtotal).toBe('134.00');
    expect(order.payment_method).toBe('CASH_ON_DELIVERY');

    const [event] = await knex('order_status_events').where({ order_id: order.id });
    expect(event).toMatchObject({ actor_user_id: admin.id, actor_role: 'ADMIN', to_status: 'PENDING' });
    expect(await knex('admin_audit_logs').where({ action: 'ORDER_PLACED', entity_id: order.id })).toHaveLength(1);

    // The customer sees it as their own order.
    const mine = await request(app).get('/api/orders').set(authHeader(customer));
    expect(mine.body.data.map((o) => o.id)).toEqual([order.id]);
  });

  it("leaves the customer's cart untouched", async () => {
    const { admin, customer, address, restaurant, main } = await setup();
    const cart = await makeCart(customer, restaurant, [{ item: main, quantity: 3 }]);
    await place(admin, {
      customerUserId: customer.id, restaurantId: restaurant.id, addressId: address.id,
      items: [{ foodItemId: main.id, quantity: 1 }],
    }).expect(201);

    expect((await knex('carts').where({ id: cart.id }).first()).status).toBe('ACTIVE');
    expect(await knex('cart_items').where({ cart_id: cart.id })).toHaveLength(1);
  });

  it("lists the customer's addresses for the page", async () => {
    const { admin, customer, address } = await setup();
    const res = await request(app).get(`/api/admin/users/${customer.id}/addresses`).set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.data.map((a) => a.id)).toEqual([address.id]);
  });

  it('rejects an item of another restaurant, an unavailable item and a short order', async () => {
    const { admin, customer, address, restaurant, category, soup } = await setup();
    const other = await makeStockedRestaurant();
    const off = await makeItem(restaurant, category, { isAvailable: false });
    const base = { customerUserId: customer.id, restaurantId: restaurant.id, addressId: address.id };

    expect((await place(admin, { ...base, items: [{ foodItemId: other.main.id, quantity: 1 }] })).status).toBe(404);
    expect((await place(admin, { ...base, items: [{ foodItemId: off.id, quantity: 1 }] })).status).toBe(422);
    // 18.00 is under the 30.00 minimum.
    const short = await place(admin, { ...base, items: [{ foodItemId: soup.id, quantity: 1 }] });
    expect(short.status).toBe(422);
    expect(short.body.error.code).toBe('BELOW_MINIMUM_ORDER');
    expect(await knex('orders')).toHaveLength(0);
  });

  it("rejects another customer's address and a suspended customer", async () => {
    const { admin, customer, restaurant, main } = await setup();
    const stranger = await makeUser({ role: 'CUSTOMER' });
    const strangersAddress = await makeAddress(stranger);
    const items = [{ foodItemId: main.id, quantity: 1 }];

    expect((await place(admin, {
      customerUserId: customer.id, restaurantId: restaurant.id, addressId: strangersAddress.id, items,
    })).status).toBe(404);

    const suspended = await makeUser({ role: 'CUSTOMER', status: 'SUSPENDED' });
    const theirs = await makeAddress(suspended);
    expect((await place(admin, {
      customerUserId: suspended.id, restaurantId: restaurant.id, addressId: theirs.id, items,
    })).status).toBe(422);
  });

  it('is for admins only', async () => {
    const { customer, address, restaurant, main } = await setup();
    const res = await place(customer, {
      customerUserId: customer.id, restaurantId: restaurant.id, addressId: address.id,
      items: [{ foodItemId: main.id, quantity: 1 }],
    });
    expect(res.status).toBe(403);
  });
});
