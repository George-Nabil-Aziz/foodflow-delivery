import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useCartStore } from '@/stores/cart.store.js';
import { discountErrorText, isPositiveAmount } from '@/utils/discount.js';

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
});

describe('cart store with a discount', () => {
  const priced = {
    data: {
      id: 'cart-1',
      restaurant: { id: 'r1', name: 'Olive Grill', isOrderable: true },
      items: [{ id: 'l1', name: 'Mixed Grill', quantity: 2, unitPrice: '58.00', lineTotal: '116.00', issues: [] }],
      totals: { subtotal: '134.00', discountAmount: '13.40', deliveryFee: '12.00', taxAmount: '18.09', total: '150.69' },
      discount: { code: 'SAVE10', type: 'PERCENT', value: '10.00', amount: '13.40' },
      discountIssue: null,
      issues: [],
      itemCount: 2,
      meetsMinimum: true,
      canCheckout: true,
    },
  };

  it('takes the discount and the total verbatim from the server', async () => {
    const cart = useCartStore();
    const { cartApi } = await import('@/services/api.js');
    vi.spyOn(cartApi, 'applyDiscount').mockResolvedValue(priced);

    await cart.applyDiscount('save10');

    expect(cartApi.applyDiscount).toHaveBeenCalledWith('save10');
    expect(cart.discount.code).toBe('SAVE10');
    expect(cart.totals.discountAmount).toBe('13.40');
    expect(cart.totals.total).toBe('150.69');
  });

  it('exposes a stored code the server no longer accepts', async () => {
    const cart = useCartStore();
    const { cartApi } = await import('@/services/api.js');
    vi.spyOn(cartApi, 'get').mockResolvedValue({
      data: {
        ...priced.data, discount: null, canCheckout: false,
        discountIssue: { code: 'DISCOUNT_CODE_EXPIRED', discountCode: 'SAVE10', message: 'x' },
      },
    });
    await cart.load();
    expect(cart.discount).toBeNull();
    expect(cart.discountIssue.discountCode).toBe('SAVE10');
    expect(cart.canCheckout).toBe(false);
  });

  it('defaults to no discount before any load', () => {
    const cart = useCartStore();
    expect(cart.discount).toBeNull();
    expect(cart.totals.discountAmount).toBe('0.00');
  });
});

describe('discountErrorText', () => {
  it('names the reason for each code', () => {
    expect(discountErrorText({ code: 'DISCOUNT_CODE_INVALID' })).toMatch(/not valid/);
    expect(discountErrorText({ code: 'DISCOUNT_CODE_EXPIRED', details: [{ endsAt: 'x' }] })).toMatch(/expired/);
    expect(discountErrorText({ code: 'DISCOUNT_CODE_EXPIRED', details: [{ startsAt: 'x' }] })).toMatch(/not active yet/);
    expect(discountErrorText({ code: 'DISCOUNT_CODE_NOT_APPLICABLE', details: [{}] })).toMatch(/different restaurant/);
    expect(discountErrorText({
      code: 'DISCOUNT_CODE_NOT_APPLICABLE', details: [{ shortfall: '20.00', required: '50.00' }],
    })).toMatch(/20\.00.*50\.00/);
    expect(discountErrorText({
      code: 'DISCOUNT_CODE_LIMIT_REACHED', message: 'm', details: [{ issue: 'This discount code has reached its usage limit.' }],
    })).toMatch(/usage limit/);
  });

  it('treats only a positive amount as a discount line', () => {
    expect(isPositiveAmount('13.40')).toBe(true);
    expect(isPositiveAmount('0.00')).toBe(false);
    expect(isPositiveAmount(undefined)).toBe(false);
  });
});
