import { describe, it, expect } from 'vitest';
import { money } from '../../src/shared/money.js';
import { computeTotals, meetsMinimum, shortfall } from '../../src/modules/orders/orderPricing.js';

describe('TC-160 / money: arithmetic without floating-point drift', () => {
  it('adds the canonical float trap correctly', () => {
    expect(money.add('0.10', '0.20')).toBe('0.30');
    // Proof the naive implementation would have failed.
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it('multiplies a unit price by a quantity', () => {
    expect(money.multiply('58.00', 2)).toBe('116.00');
    expect(money.multiply('18.00', 1)).toBe('18.00');
    expect(money.multiply('0.01', 3)).toBe('0.03');
  });

  it('sums a list of line totals', () => {
    expect(money.sum(['116.00', '18.00'])).toBe('134.00');
    expect(money.sum([])).toBe('0.00');
  });

  it('subtracts and compares', () => {
    expect(money.subtract('30.00', '9.00')).toBe('21.00');
    expect(money.compare('10.00', '10.00')).toBe(0);
    expect(money.compare('9.99', '10.00')).toBe(-1);
    expect(money.compare('10.01', '10.00')).toBe(1);
  });

  it('rounds tax half-up at two decimals', () => {
    expect(money.roundTax('134.00', 0.15)).toBe('20.10');
    // 0.10 * 0.15 = 0.015 -> 0.02 proves the rounding DIRECTION, which a test
    // using only clean numbers would never pin down.
    expect(money.roundTax('0.10', 0.15)).toBe('0.02');
    expect(money.roundTax('0.00', 0.15)).toBe('0.00');
  });

  it('normalizes accepted representations', () => {
    expect(money.format(58)).toBe('58.00');
    expect(money.format('58')).toBe('58.00');
    expect(money.format('58.5')).toBe('58.50');
  });

  it('refuses values that are not money', () => {
    expect(() => money.add('abc', '1.00')).toThrow(/invalid amount/);
    expect(() => money.add('1.005', '1.00')).toThrow(/invalid amount/);
    expect(() => money.multiply('1.00', 1.5)).toThrow(/integer/);
  });

  it('handles large but in-range amounts', () => {
    expect(money.multiply('9999.99', 20)).toBe('199999.80');
  });
});

describe('TC-167 / orderPricing: the canonical order', () => {
  const lines = [
    { unitPrice: '58.00', quantity: 2 },
    { unitPrice: '18.00', quantity: 1 },
  ];

  it('computes the documented totals exactly', () => {
    const totals = computeTotals({ lines, deliveryFee: '12.00', taxRate: 0.15 });
    expect(totals.subtotal).toBe('134.00');
    expect(totals.deliveryFee).toBe('12.00');
    expect(totals.taxAmount).toBe('20.10');
    expect(totals.totalAmount).toBe('166.10');
  });

  it('satisfies the database check constraint identity', () => {
    const t = computeTotals({ lines, deliveryFee: '12.00', taxRate: 0.15 });
    expect(money.add(money.add(t.subtotal, t.deliveryFee), t.taxAmount)).toBe(t.totalAmount);
  });

  it('applies tax to the subtotal only, not the delivery fee (A-03)', () => {
    const withFee = computeTotals({ lines, deliveryFee: '100.00', taxRate: 0.15 });
    const noFee = computeTotals({ lines, deliveryFee: '0.00', taxRate: 0.15 });
    expect(withFee.taxAmount).toBe(noFee.taxAmount);
  });

  it('prices each line', () => {
    const t = computeTotals({ lines, deliveryFee: '12.00', taxRate: 0.15 });
    expect(t.lines.map((l) => l.lineTotal)).toEqual(['116.00', '18.00']);
  });

  it('handles an empty cart', () => {
    const t = computeTotals({ lines: [], deliveryFee: '12.00', taxRate: 0.15 });
    expect(t.subtotal).toBe('0.00');
    expect(t.totalAmount).toBe('12.00');
  });
});

describe('TC-161 / minimum order', () => {
  it('detects a subtotal at, above and below the minimum', () => {
    expect(meetsMinimum('30.00', '30.00')).toBe(true);
    expect(meetsMinimum('30.01', '30.00')).toBe(true);
    expect(meetsMinimum('29.99', '30.00')).toBe(false);
  });

  it('reports the shortfall so the UI can say how much more is needed', () => {
    expect(shortfall('9.00', '30.00')).toBe('21.00');
    expect(shortfall('30.00', '30.00')).toBe('0.00');
    expect(shortfall('40.00', '30.00')).toBe('0.00');
  });
});
