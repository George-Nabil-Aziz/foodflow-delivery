import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import ItemOptionsDialog from '@/components/customer/ItemOptionsDialog.vue';
import LineOptions from '@/components/shared/LineOptions.vue';
import { useAddToCart } from '@/composables/useAddToCart.js';
import { useAuthStore } from '@/stores/auth.store.js';
import { cartApi } from '@/services/api.js';
import {
  previewUnitPrice, groupProblems, cannotBeOrdered, summarizeOptions, previewLineTotal,
} from '@/utils/itemOptions.js';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
});

const item = {
  id: 'item-1', name: 'Mixed Grill', description: 'Lamb.', price: '58.00', isAvailable: true,
  optionGroups: [
    {
      id: 'g-size', name: 'Size', minSelect: 1, maxSelect: 1, isRequired: true,
      options: [
        { id: 's-reg', name: 'Regular', priceDelta: '0.00', isAvailable: true },
        { id: 's-lg', name: 'Large', priceDelta: '12.50', isAvailable: true },
      ],
    },
    {
      id: 'g-ext', name: 'Extras', minSelect: 0, maxSelect: 2, isRequired: false,
      options: [
        { id: 'e-ch', name: 'Cheese', priceDelta: '5.00', isAvailable: true },
        { id: 'e-bc', name: 'Bacon', priceDelta: '7.25', isAvailable: true },
        { id: 'e-pk', name: 'Pickles', priceDelta: '1.00', isAvailable: true },
        { id: 'e-off', name: 'Truffle', priceDelta: '9.00', isAvailable: false },
      ],
    },
  ],
};

describe('option preview helpers', () => {
  it('sums deltas in cents, with no float error', () => {
    expect(previewUnitPrice('58.00', item.optionGroups, ['s-lg', 'e-ch', 'e-bc'])).toBe('82.75');
    expect(previewUnitPrice('0.10', [{ options: [{ id: 'a', priceDelta: '0.20' }] }], ['a'])).toBe('0.30');
    expect(previewLineTotal('82.75', 3)).toBe('248.25');
  });

  it('reports groups whose min or max is broken', () => {
    expect(groupProblems(item.optionGroups, [])).toEqual({ 'g-size': 'min' });
    expect(groupProblems(item.optionGroups, ['s-reg'])).toEqual({});
    expect(groupProblems(item.optionGroups, ['s-reg', 'e-ch', 'e-bc', 'e-pk'])).toEqual({ 'g-ext': 'max' });
  });

  it('knows when no available option can satisfy a required group', () => {
    expect(cannotBeOrdered(item.optionGroups)).toBe(false);
    const dead = [{ minSelect: 1, options: [{ isAvailable: false }] }];
    expect(cannotBeOrdered(dead)).toBe(true);
  });

  it('summarizes options by group', () => {
    expect(summarizeOptions([
      { groupName: 'Size', name: 'Large' }, { groupName: 'Extras', name: 'Cheese' }, { groupName: 'Extras', name: 'Bacon' },
    ])).toBe('Size: Large · Extras: Cheese, Bacon');
  });
});

describe('ItemOptionsDialog', () => {
  const open = () => mount(ItemOptionsDialog, { props: { open: true, item }, attachTo: document.body });
  const submit = (w) => w.find('button[type="submit"]');

  it('blocks adding until the required group is chosen, then confirms with ids and the note', async () => {
    const w = open();
    expect(submit(w).element.disabled).toBe(true);
    expect(w.text()).toContain('Make the required choices to continue.');

    await w.find('input[type="radio"][name="group-g-size"]:not(:checked)').setValue(true);
    await w.findAll('input[type="radio"]')[1].setValue(true); // Large
    expect(submit(w).element.disabled).toBe(false);

    await w.find('#line-note').setValue('  no onions ');
    await w.find('form').trigger('submit');

    const [confirm] = w.emitted('confirm');
    expect(confirm[0]).toEqual({ optionIds: ['s-lg'], notes: 'no onions', quantity: 1 });
    w.unmount();
  });

  it('updates the price as options are chosen', async () => {
    const w = open();
    await w.findAll('input[type="radio"]')[1].setValue(true); // Large 12.50
    expect(w.text()).toContain('70.50');
    await w.findAll('input[type="checkbox"]')[0].setValue(true); // Cheese 5.00
    expect(w.text()).toContain('75.50');
    w.unmount();
  });

  it('stops offering more choices at the group maximum and never offers an unavailable option', async () => {
    const w = open();
    const boxes = w.findAll('input[type="checkbox"]');
    await boxes[0].setValue(true);
    await boxes[1].setValue(true);
    expect(boxes[2].element.disabled).toBe(true); // max 2 reached
    expect(boxes[3].element.disabled).toBe(true); // unavailable
    expect(w.text()).toContain('Unavailable');
    w.unmount();
  });

  it('caps the note at 200 characters', () => {
    const w = open();
    expect(w.find('#line-note').attributes('maxlength')).toBe('200');
    w.unmount();
  });

  it('asks to cancel on the cancel button', async () => {
    const w = open();
    const cancel = w.findAll('button').find((b) => b.text() === 'Cancel');
    await cancel.trigger('click');
    expect(w.emitted('cancel')).toHaveLength(1);
    w.unmount();
  });
});

describe('LineOptions', () => {
  it('lists options with their extra price and the note, and nothing for a plain line', () => {
    const w = mount(LineOptions, {
      props: { options: [{ groupName: 'Size', name: 'Large', priceDelta: '12.50' }, { groupName: 'Extras', name: 'Plain', priceDelta: '0.00' }], notes: 'no onions' },
    });
    expect(w.text()).toContain('Size: Large');
    expect(w.text()).toContain('12.50');
    expect(w.text()).not.toContain('(+EGP 0.00)');
    expect(w.text()).toContain('no onions');
    expect(mount(LineOptions).html()).toBe('<!--v-if-->');
  });
});

describe('useAddToCart with options', () => {
  function setup() {
    const auth = useAuthStore();
    vi.spyOn(auth, 'isAuthenticated', 'get').mockReturnValue(true);
    return useAddToCart(null);
  }

  it('opens the dialog for an item with groups instead of adding it', async () => {
    const add = vi.spyOn(cartApi, 'addItem').mockResolvedValue({ data: { items: [] } });
    const c = setup();
    await c.add(item);
    expect(c.optionsOpen.value).toBe(true);
    expect(c.optionsItem.value.id).toBe('item-1');
    expect(add).not.toHaveBeenCalled();
  });

  it('sends the chosen ids and note once confirmed', async () => {
    const add = vi.spyOn(cartApi, 'addItem').mockResolvedValue({ data: { items: [] } });
    const c = setup();
    await c.add(item);
    await c.confirmOptions({ optionIds: ['s-lg'], notes: 'no onions', quantity: 2 });
    expect(add).toHaveBeenCalledWith(
      { foodItemId: 'item-1', quantity: 2, optionIds: ['s-lg'], notes: 'no onions' }, undefined,
    );
    expect(c.optionsOpen.value).toBe(false);
  });

  it('adds an item without groups exactly as before', async () => {
    const add = vi.spyOn(cartApi, 'addItem').mockResolvedValue({ data: { items: [] } });
    const c = setup();
    await c.add({ id: 'plain', name: 'Soup', price: '18.00', optionGroups: [] });
    expect(add).toHaveBeenCalledWith({ foodItemId: 'plain', quantity: 1 }, undefined);
    expect(c.optionsOpen.value).toBe(false);
  });

  it('keeps the choice through a restaurant switch', async () => {
    const mismatch = Object.assign(new Error('mismatch'), { code: 'CART_RESTAURANT_MISMATCH', details: [{}] });
    const add = vi.spyOn(cartApi, 'addItem').mockRejectedValueOnce(mismatch).mockResolvedValue({ data: { items: [] } });
    const c = setup();
    await c.add(item);
    await c.confirmOptions({ optionIds: ['s-reg'], notes: null, quantity: 1 });
    expect(c.conflictOpen.value).toBe(true);
    await c.replaceCart();
    await flushPromises();
    expect(add).toHaveBeenLastCalledWith({ foodItemId: 'item-1', quantity: 1, optionIds: ['s-reg'] }, { replace: true });
  });
});
