import { describe, it, expect } from 'vitest';
import { money } from '../../src/shared/money.js';
import { computeTotals, discountAmountFor, meetsMinimum } from '../../src/modules/orders/orderPricing.js';

const lines = [
  { unitPrice: '58.00', quantity: 2 },
  { unitPrice: '18.00', quantity: 1 },
]; // subtotal 134.00

const price = (discount, over = {}) =>
  computeTotals({ lines, deliveryFee: '12.00', taxRate: 0.15, discount, ...over });

describe('money.percentOf / money.min', () => {
  it('rounds half-up at two decimals', () => {
    expect(money.percentOf('10.10', '5.00')).toBe('0.51'); // 0.505
    expect(money.percentOf('33.33', '12.50')).toBe('4.17'); // 4.16625
    expect(money.percentOf('134.00', '10.00')).toBe('13.40');
    expect(money.percentOf('0.00', '10.00')).toBe('0.00');
  });

  it('takes the smaller amount', () => {
    expect(money.min('5.00', '7.00')).toBe('5.00');
    expect(money.min('7.00', '5.00')).toBe('5.00');
  });
});

describe('computeTotals with a discount (BR-DC4)', () => {
  it('is unchanged without a discount', () => {
    const t = price(null);
    expect(t.discountAmount).toBe('0.00');
    expect(t.totalAmount).toBe('166.10');
  });

  it('applies a percentage to the subtotal and taxes the discounted amount', () => {
    const t = price({ type: 'PERCENT', value: '10.00' });
    expect(t.subtotal).toBe('134.00');
    expect(t.discountAmount).toBe('13.40');
    expect(t.taxAmount).toBe('18.09'); // 120.60 x 0.15
    expect(t.deliveryFee).toBe('12.00');
    expect(t.totalAmount).toBe('150.69');
  });

  it('caps a percentage at the maximum discount', () => {
    const t = price({ type: 'PERCENT', value: '50.00', maxDiscount: '20.00' });
    expect(t.discountAmount).toBe('20.00'); // 67.00 uncapped
    expect(t.taxAmount).toBe('17.10'); // 114.00 x 0.15
    expect(t.totalAmount).toBe('143.10');
  });

  it('does not cap when the percentage is under the cap', () => {
    expect(price({ type: 'PERCENT', value: '10.00', maxDiscount: '50.00' }).discountAmount).toBe('13.40');
  });

  it('applies a fixed amount', () => {
    const t = price({ type: 'FIXED', value: '25.00' });
    expect(t.discountAmount).toBe('25.00');
    expect(t.taxAmount).toBe('16.35'); // 109.00 x 0.15
    expect(t.totalAmount).toBe('137.35');
  });

  it('never takes a fixed discount below zero and never discounts the delivery fee', () => {
    const t = price({ type: 'FIXED', value: '500.00' });
    expect(t.discountAmount).toBe('134.00');
    expect(t.taxAmount).toBe('0.00');
    expect(t.totalAmount).toBe('12.00');
  });

  it('rounds the discount once, then the tax once', () => {
    const t = computeTotals({
      lines: [{ unitPrice: '11.11', quantity: 3 }], deliveryFee: '0.00', taxRate: 0.15,
      discount: { type: 'PERCENT', value: '12.50' },
    });
    expect(t.subtotal).toBe('33.33');
    expect(t.discountAmount).toBe('4.17');
    expect(t.taxAmount).toBe('4.37'); // 29.16 x 0.15 = 4.374
    expect(t.totalAmount).toBe('33.53');
  });

  it('satisfies the database identity total = subtotal - discount + fee + tax', () => {
    for (const discount of [null, { type: 'PERCENT', value: '33.33' }, { type: 'FIXED', value: '7.77' }]) {
      const t = price(discount);
      const sum = money.add(money.add(money.subtract(t.subtotal, t.discountAmount), t.deliveryFee), t.taxAmount);
      expect(sum).toBe(t.totalAmount);
    }
  });

  it('handles an empty cart', () => {
    expect(discountAmountFor('0.00', { type: 'FIXED', value: '5.00' })).toBe('0.00');
  });
});

describe('the minimum order is judged before the discount (BR-DC5)', () => {
  it('uses the pre-discount subtotal', () => {
    const t = price({ type: 'FIXED', value: '120.00' });
    expect(meetsMinimum(t.subtotal, '30.00')).toBe(true);
    // The discounted subtotal would be 14.00, which would fail a 30.00 minimum.
    expect(money.subtract(t.subtotal, t.discountAmount)).toBe('14.00');
  });
});
