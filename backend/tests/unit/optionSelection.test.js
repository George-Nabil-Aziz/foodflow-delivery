import { describe, it, expect } from 'vitest';
import {
  selectOptions, unitPriceWith, lineKeyOf, normalizeNote, PROBLEMS,
} from '../../src/modules/menu/optionSelection.js';
import { validateLines, collectIssues } from '../../src/modules/cart/cartValidator.js';

const opt = (id, name, delta = '0.00', extra = {}) => ({
  id, name, price_delta: delta, is_available: true, display_order: 0, ...extra,
});
const group = (id, name, min, max, options, order = 0) => ({
  id, name, min_select: min, max_select: max, display_order: order, options,
});

const size = group('g-size', 'Size', 1, 1, [opt('s-reg', 'Regular'), opt('s-lg', 'Large', '12.50')]);
const extras = group('g-ext', 'Extras', 0, 2, [
  opt('e-ch', 'Cheese', '5.00'), opt('e-bc', 'Bacon', '7.25'), opt('e-pk', 'Pickles', '1.00'),
], 1);

describe('selectOptions', () => {
  it('accepts a valid choice and lists it in group then option order', () => {
    const { chosen, problems } = selectOptions([extras, size], ['e-bc', 's-lg']);
    expect(problems).toEqual([]);
    expect(chosen.map((o) => o.name)).toEqual(['Large', 'Bacon']);
    expect(chosen[0]).toMatchObject({ groupName: 'Size', priceDelta: '12.50' });
  });

  it('requires a choice in a group with min 1', () => {
    const { problems } = selectOptions([size, extras], []);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ code: PROBLEMS.GROUP_MIN, groupId: 'g-size' });
    expect(problems[0].message).toBe('Choose one from "Size".');
  });

  it('enforces both ends of a min/max range', () => {
    const range = group('g', 'Toppings', 2, 3, [opt('a', 'A'), opt('b', 'B'), opt('c', 'C'), opt('d', 'D')]);
    expect(selectOptions([range], ['a']).problems[0]).toMatchObject({ code: PROBLEMS.GROUP_MIN });
    expect(selectOptions([range], ['a', 'b']).problems).toEqual([]);
    expect(selectOptions([range], ['a', 'b', 'c']).problems).toEqual([]);
    expect(selectOptions([range], ['a', 'b', 'c', 'd']).problems[0]).toMatchObject({ code: PROBLEMS.GROUP_MAX });
  });

  it('accepts no choice in an optional group', () => {
    expect(selectOptions([extras], []).problems).toEqual([]);
  });

  it('flags an unavailable option and an unknown one', () => {
    const off = group('g', 'Sauce', 0, 1, [opt('x', 'Garlic', '0.00', { is_available: false })]);
    expect(selectOptions([off], ['x']).problems.map((p) => p.code)).toEqual([PROBLEMS.UNAVAILABLE]);
    expect(selectOptions([size], ['s-reg', 'nope']).problems.map((p) => p.code)).toEqual([PROBLEMS.REMOVED]);
  });

  it('counts a repeated id once', () => {
    expect(selectOptions([size], ['s-lg', 's-lg']).problems).toEqual([]);
  });

  it('with no groups, any option is unknown', () => {
    expect(selectOptions([], ['s-reg']).problems[0].code).toBe(PROBLEMS.REMOVED);
    expect(selectOptions([], []).problems).toEqual([]);
  });
});

describe('unitPriceWith', () => {
  it('adds the deltas to the base price in exact decimal arithmetic', () => {
    const { chosen } = selectOptions([size, extras], ['s-lg', 'e-ch', 'e-bc']);
    expect(unitPriceWith('58.00', chosen)).toBe('82.75');
    expect(unitPriceWith('0.10', [{ priceDelta: '0.20' }])).toBe('0.30');
    expect(unitPriceWith('58.00', [])).toBe('58.00');
  });
});

describe('line identity', () => {
  it('is the same for the same options in any order, and for the same note', () => {
    expect(lineKeyOf(['b', 'a'], 'x')).toBe(lineKeyOf(['a', 'b', 'a'], 'x'));
  });
  it('differs by options or by note', () => {
    expect(lineKeyOf(['a'], null)).not.toBe(lineKeyOf(['b'], null));
    expect(lineKeyOf(['a'], 'x')).not.toBe(lineKeyOf(['a'], null));
    expect(lineKeyOf([], 'x')).not.toBe(lineKeyOf([], null));
  });
  it('is empty for a plain line, matching lines made before options existed', () => {
    expect(lineKeyOf([], null)).toBe('');
    expect(lineKeyOf(undefined, undefined)).toBe('');
  });
  it('treats a blank note as no note', () => {
    expect(normalizeNote('   ')).toBeNull();
    expect(normalizeNote(null)).toBeNull();
    expect(normalizeNote('  no onions ')).toBe('no onions');
  });
});

describe('cart revalidation with options', () => {
  const item = { id: 'i1', name: 'Mixed Grill', description: null, price: '58.00', image_url: null, is_available: true, deleted_at: null };
  const line = (optionIds, seen = '70.50') => ({
    id: 'l1', food_item_id: 'i1', quantity: 2, notes: 'no onions', price_seen_at_add: seen, optionIds,
  });
  const ctx = (groups, rows = []) => ({
    groupsByItem: new Map([['i1', groups]]),
    optionsById: new Map(rows.map((r) => [r.id, r])),
  });

  it('prices base + deltas live and reports no issue for a healthy line', () => {
    const [l] = validateLines([line(['s-lg'])], [item], ctx([size, extras]));
    expect(l.issues).toEqual([]);
    expect(l.unitPrice).toBe('70.50');
    expect(l.lineTotal).toBe('141.00');
    expect(l.options).toEqual([expect.objectContaining({ name: 'Large', isRemoved: false })]);
    expect(l.notes).toBe('no onions');
  });

  it('maps each problem to its cart issue', () => {
    const off = group('g-size', 'Size', 1, 1, [opt('s-reg', 'Regular'), opt('s-lg', 'Large', '12.50', { is_available: false })]);
    expect(validateLines([line(['s-lg'])], [item], ctx([off]))[0].issues).toEqual(['OPTION_UNAVAILABLE']);

    const gone = validateLines([line(['s-lg'])], [item], ctx([group('g-size', 'Size', 0, 1, [opt('s-reg', 'Regular')])],
      [{ id: 's-lg', name: 'Large', group_name: 'Size', price_delta: '12.50' }]))[0];
    expect(gone.issues).toContain('OPTION_REMOVED');
    expect(gone.options[0]).toMatchObject({ name: 'Large', groupName: 'Size', isRemoved: true });
    expect(gone.unitPrice).toBe('58.00');

    // The group now requires two; the line has one.
    const stricter = group('g-size', 'Size', 2, 2, [opt('s-reg', 'Regular'), opt('s-lg', 'Large', '12.50')]);
    expect(validateLines([line(['s-lg'])], [item], ctx([stricter]))[0].issues).toEqual(['OPTIONS_CHANGED']);
  });

  it('flags a changed option price as PRICE_CHANGED', () => {
    const pricier = group('g-size', 'Size', 1, 1, [opt('s-lg', 'Large', '20.00')]);
    const [l] = validateLines([line(['s-lg'])], [item], ctx([pricier]));
    expect(l.issues).toEqual(['PRICE_CHANGED']);
    expect(l.unitPrice).toBe('78.00');
  });

  it('flags a required group added after the line was made', () => {
    const [l] = validateLines([line([], '58.00')], [item], ctx([size]));
    expect(collectIssues([l])).toEqual(['OPTIONS_CHANGED']);
  });

  it('is unchanged for lines without options', () => {
    const [l] = validateLines([line([], '58.00')], [item]);
    expect(l.issues).toEqual([]);
    expect(l.options).toEqual([]);
    expect(l.unitPrice).toBe('58.00');
  });
});
