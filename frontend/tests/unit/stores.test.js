import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useCartStore } from '@/stores/cart.store.js';
import { useAuthStore } from '@/stores/auth.store.js';
import { useUiStore } from '@/stores/ui.store.js';
import { rules, validate } from '@/composables/useValidation.js';
import { formatMoney } from '@/utils/money.js';
import {
  restaurantActions, canCustomerCancel, isTerminal, STATUS_LABEL,
} from '@/utils/orderStatus.js';

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
});

/**
 * TC-382: the cart store mirrors the server and computes nothing. Duplicating
 * the arithmetic client-side guarantees the two eventually disagree - about
 * money.
 */
describe('TC-382: cart store mirrors the server', () => {
  const envelope = {
    data: {
      id: 'cart-1',
      restaurant: { id: 'r1', name: 'Olive Grill', isOrderable: true },
      items: [{ id: 'l1', name: 'Mixed Grill', quantity: 2, unitPrice: '58.00', lineTotal: '116.00', issues: [] }],
      totals: { subtotal: '134.00', deliveryFee: '12.00', taxAmount: '20.10', total: '166.10' },
      issues: [],
      itemCount: 3,
      meetsMinimum: true,
      minimumShortfall: '0.00',
      canCheckout: true,
    },
  };

  it('takes totals verbatim from the response', async () => {
    const cart = useCartStore();
    const { cartApi } = await import('@/services/api.js');
    vi.spyOn(cartApi, 'get').mockResolvedValue(envelope);

    await cart.load();

    expect(cart.totals).toEqual(envelope.data.totals);
    expect(cart.itemCount).toBe(3);
    expect(cart.canCheckout).toBe(true);
    expect(cart.restaurant.name).toBe('Olive Grill');
  });

  it('takes canCheckout from the server rather than deriving it', async () => {
    const cart = useCartStore();
    const { cartApi } = await import('@/services/api.js');
    // A cart that looks fine but the server says cannot check out.
    vi.spyOn(cartApi, 'get').mockResolvedValue({
      data: { ...envelope.data, canCheckout: false, issues: ['PRICE_CHANGED'] },
    });

    await cart.load();
    expect(cart.canCheckout).toBe(false);
    expect(cart.issues).toEqual(['PRICE_CHANGED']);
  });

  it('reports an empty cart safely before any load', () => {
    const cart = useCartStore();
    expect(cart.isEmpty).toBe(true);
    expect(cart.itemCount).toBe(0);
    expect(cart.totals.total).toBe('0.00');
    expect(cart.canCheckout).toBe(false);
  });
});

describe('TC-373: auth store session lifecycle', () => {
  it('persists and restores a session', () => {
    const auth = useAuthStore();
    auth.setSession({
      user: { id: 'u1', role: 'CUSTOMER', email: 'a@example.com' },
      accessToken: 'at', refreshToken: 'rt',
    });
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.role).toBe('CUSTOMER');

    setActivePinia(createPinia());
    const restored = useAuthStore();
    restored.restore();
    expect(restored.isAuthenticated).toBe(true);
    expect(restored.user.email).toBe('a@example.com');
  });

  it('clears everything on logout, leaving no token behind', () => {
    const auth = useAuthStore();
    auth.setSession({ user: { id: 'u1', role: 'CUSTOMER' }, accessToken: 'at', refreshToken: 'rt' });
    auth.clear();

    expect(auth.isAuthenticated).toBe(false);
    expect(auth.accessToken).toBeNull();
    expect(localStorage.getItem('foodflow.session')).toBeNull();
  });

  it('survives corrupt storage rather than crashing the app', () => {
    localStorage.setItem('foodflow.session', 'not json');
    const auth = useAuthStore();
    expect(() => auth.restore()).not.toThrow();
    expect(auth.isAuthenticated).toBe(false);
  });
});

describe('ui store toasts', () => {
  it('adds and dismisses toasts', () => {
    const ui = useUiStore();
    const id = ui.toastError('Something failed');
    expect(ui.toasts).toHaveLength(1);
    expect(ui.toasts[0].variant).toBe('error');
    ui.dismiss(id);
    expect(ui.toasts).toHaveLength(0);
  });
});

describe('TC-322: client rules mirror the documented backend rules', () => {
  it('enforces the password rule including the bcrypt ceiling', () => {
    expect(rules.password('Ab1')).toBeTruthy();
    expect(rules.password('Passw0rd')).toBeNull();
    expect(rules.password('nodigitshere')).toBeTruthy();
    expect(rules.password('12345678')).toBeTruthy();
    expect(rules.password(`${'a'.repeat(72)}1`)).toBeTruthy();
  });

  it('enforces the price rule', () => {
    expect(rules.price('0')).toBeTruthy();
    expect(rules.price('-1')).toBeTruthy();
    expect(rules.price('12.345')).toBeTruthy();
    expect(rules.price('9999.99')).toBeNull();
    expect(rules.price('10000.00')).toBeTruthy();
    expect(rules.price('58.00')).toBeNull();
  });

  it('enforces email, phone and rating rules', () => {
    expect(rules.email('not-an-email')).toBeTruthy();
    expect(rules.email('a@b.co')).toBeNull();
    expect(rules.phone('abc')).toBeTruthy();
    expect(rules.phone('01012345678')).toBeNull();
    // Egyptian mobiles only: local or +20, on the 010/011/012/015 networks.
    expect(rules.phone('+201512345678')).toBeNull();
    expect(rules.phone('+966501234567')).toBeTruthy();
    expect(rules.phone('01312345678')).toBeTruthy();
    expect(rules.phone('0101234567')).toBeTruthy();
    expect(rules.rating(0)).toBeTruthy();
    expect(rules.rating(6)).toBeTruthy();
    expect(rules.rating(5)).toBeNull();
  });

  it('validate() reports the first failure per field', () => {
    const errors = validate({ email: '', password: 'x' }, {
      email: [rules.required('Email'), rules.email],
      password: [rules.required('Password'), rules.password],
    });
    expect(errors.email).toMatch(/required/);
    expect(errors.password).toMatch(/at least 8/);
  });
});

describe('TC-389/TC-390: UI mirrors the transition table', () => {
  it('offers only the actions legal from each status', () => {
    expect(restaurantActions('PENDING').map((a) => a.key)).toEqual(['accept', 'reject']);
    expect(restaurantActions('CONFIRMED').map((a) => a.key)).toEqual(['start-preparing', 'cancel']);
    expect(restaurantActions('PREPARING').map((a) => a.key)).toEqual(['ready', 'cancel']);
    // From here the order belongs to the driver.
    expect(restaurantActions('READY_FOR_PICKUP')).toEqual([]);
    expect(restaurantActions('OUT_FOR_DELIVERY')).toEqual([]);
    expect(restaurantActions('DELIVERED')).toEqual([]);
    expect(restaurantActions('CANCELLED')).toEqual([]);
  });

  it('shows the cancel control only inside the customer window', () => {
    expect(canCustomerCancel('PENDING')).toBe(true);
    expect(canCustomerCancel('CONFIRMED')).toBe(true);
    expect(canCustomerCancel('PREPARING')).toBe(false);
    expect(canCustomerCancel('READY_FOR_PICKUP')).toBe(false);
    expect(canCustomerCancel('DELIVERED')).toBe(false);
  });

  it('knows which statuses are terminal', () => {
    expect(isTerminal('DELIVERED')).toBe(true);
    expect(isTerminal('CANCELLED')).toBe(true);
    expect(isTerminal('PREPARING')).toBe(false);
  });

  it('pairs every status with human text, never colour alone', () => {
    for (const status of ['PENDING', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP',
      'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED']) {
      expect(STATUS_LABEL[status]).toBeTruthy();
    }
  });
});

describe('money formatting', () => {
  it('formats amounts for display only', () => {
    expect(formatMoney('166.10')).toBe('EGP 166.10');
    expect(formatMoney(0)).toBe('EGP 0.00');
    expect(formatMoney(null)).toBe('EGP 0.00');
  });
});
