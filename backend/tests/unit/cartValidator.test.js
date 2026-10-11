import { describe, it, expect } from 'vitest';
import { validateLines, collectIssues } from '../../src/modules/cart/cartValidator.js';

const line = (overrides = {}) => ({
  id: 'line-1',
  food_item_id: 'item-1',
  quantity: 2,
  notes: null,
  price_seen_at_add: '58.00',
  ...overrides,
});

const item = (overrides = {}) => ({
  id: 'item-1',
  name: 'Mixed Grill',
  description: 'Lamb, chicken and kofta.',
  price: '58.00',
  image_url: null,
  is_available: true,
  deleted_at: null,
  ...overrides,
});

/**
 * TC-156 / TC-157 / TC-158: the staleness matrix. The world moves underneath a
 * cart - prices change, items vanish, categories close - and every one of those
 * must be reported rather than silently priced.
 */
describe('cart revalidation', () => {
  it('reports no issues for a healthy line', () => {
    const [result] = validateLines([line()], [item()]);
    expect(result.issues).toEqual([]);
    expect(result.unitPrice).toBe('58.00');
    expect(result.lineTotal).toBe('116.00');
    expect(result.isAvailable).toBe(true);
  });

  it('TC-155: uses the LIVE price, not the price seen when added', () => {
    const [result] = validateLines([line()], [item({ price: '62.00' })]);
    expect(result.unitPrice).toBe('62.00');
    expect(result.lineTotal).toBe('124.00');
  });

  it('TC-156: flags PRICE_CHANGED when the live price differs', () => {
    const [result] = validateLines([line()], [item({ price: '62.00' })]);
    expect(result.issues).toContain('PRICE_CHANGED');
  });

  it('does not flag PRICE_CHANGED when the price is unchanged', () => {
    const [result] = validateLines([line()], [item({ price: '58.00' })]);
    expect(result.issues).not.toContain('PRICE_CHANGED');
  });

  it('TC-157: flags ITEM_UNAVAILABLE without removing the line', () => {
    const [result] = validateLines([line()], [item({ is_available: false })]);
    expect(result.issues).toContain('ITEM_UNAVAILABLE');
    expect(result.isAvailable).toBe(false);
    expect(result.name).toBe('Mixed Grill');
  });

  it('TC-158: flags ITEM_REMOVED when the item is gone', () => {
    const [result] = validateLines([line()], []);
    expect(result.issues).toEqual(['ITEM_REMOVED']);
    expect(result.isAvailable).toBe(false);
  });

  it('flags ITEM_REMOVED for a soft-deleted item', () => {
    const [result] = validateLines([line()], [item({ deleted_at: new Date() })]);
    expect(result.issues).toEqual(['ITEM_REMOVED']);
  });

  it('reports several issues on one line', () => {
    const [result] = validateLines([line()], [item({ price: '70.00', is_available: false })]);
    expect(result.issues).toEqual(expect.arrayContaining(['ITEM_UNAVAILABLE', 'PRICE_CHANGED']));
  });

  it('validates several lines independently', () => {
    const lines = [
      line({ id: 'a', food_item_id: 'item-1' }),
      line({ id: 'b', food_item_id: 'item-2', price_seen_at_add: '18.00', quantity: 1 }),
    ];
    const items = [item(), item({ id: 'item-2', name: 'Lentil Soup', price: '18.00' })];
    const results = validateLines(lines, items);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.issues.length === 0)).toBe(true);
    expect(results[1].lineTotal).toBe('18.00');
  });

  it('collects the distinct cart-level issue set', () => {
    const lines = [line({ id: 'a' }), line({ id: 'b', food_item_id: 'item-2' })];
    const items = [item({ is_available: false }), item({ id: 'item-2', is_available: false })];
    expect(collectIssues(validateLines(lines, items))).toEqual(['ITEM_UNAVAILABLE']);
  });

  it('returns an empty issue set for a healthy cart', () => {
    expect(collectIssues(validateLines([line()], [item()]))).toEqual([]);
  });
});
