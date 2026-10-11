import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import FoodItemCard from '@/components/customer/FoodItemCard.vue';
import StatusBadge from '@/components/shared/StatusBadge.vue';
import StarRating from '@/components/shared/StarRating.vue';
import SwitchRestaurantDialog from '@/components/customer/SwitchRestaurantDialog.vue';
import EmptyState from '@/components/shared/EmptyState.vue';
import ErrorState from '@/components/shared/ErrorState.vue';
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue';

beforeEach(() => setActivePinia(createPinia()));

const item = (overrides = {}) => ({
  id: 'i1', name: 'Mixed Grill', description: 'Lamb and chicken',
  price: '58.00', imageUrl: null, isAvailable: true, ...overrides,
});

/** TC-388: behaviour, not markup - the control is disabled AND says why. */
describe('TC-388: FoodItemCard', () => {
  it('allows adding an available item from an orderable restaurant', () => {
    const wrapper = mount(FoodItemCard, { props: { item: item(), restaurantOrderable: true } });
    const button = wrapper.find('button');
    expect(button.attributes('disabled')).toBeUndefined();

    button.trigger('click');
    expect(wrapper.emitted('add')).toHaveLength(1);
  });

  it('disables the control and states the reason when the item is unavailable', () => {
    const wrapper = mount(FoodItemCard, {
      props: { item: item({ isAvailable: false }), restaurantOrderable: true },
    });
    const button = wrapper.find('button');
    expect(button.attributes('disabled')).toBeDefined();
    expect(button.attributes('aria-label')).toMatch(/unavailable/i);
    // The reason is visible text, not just styling.
    expect(wrapper.text()).toMatch(/Unavailable/);
  });

  it('disables adding when the restaurant is not taking orders', () => {
    const wrapper = mount(FoodItemCard, {
      props: { item: item(), restaurantOrderable: false },
    });
    expect(wrapper.find('button').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toMatch(/not taking orders/i);
  });
});

describe('StatusBadge pairs colour with text', () => {
  it.each([
    ['PENDING', 'Waiting for the restaurant'],
    ['OUT_FOR_DELIVERY', 'On the way'],
    ['DELIVERED', 'Delivered'],
    ['CANCELLED', 'Cancelled'],
  ])('renders %s as readable text', (status, label) => {
    const wrapper = mount(StatusBadge, { props: { status } });
    expect(wrapper.text()).toContain(label);
  });
});

/** TC-276/NFR-14: the rating is a keyboard-operable radio group with labels. */
describe('StarRating accessibility', () => {
  it('renders a radio group with a text label per value', () => {
    const wrapper = mount(StarRating, {
      props: { modelValue: null, label: 'How was the food?', name: 'r' },
    });
    expect(wrapper.find('[role="radiogroup"]').exists()).toBe(true);
    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(5);
    expect(wrapper.text()).toContain('1 star');
    expect(wrapper.text()).toContain('5 stars');
  });

  it('emits the chosen value', async () => {
    const wrapper = mount(StarRating, { props: { modelValue: null, label: 'Rate', name: 'r' } });
    await wrapper.findAll('input[type="radio"]')[3].setValue();
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([4]);
  });
});

/**
 * TC-383/TC-384/TC-385: the switch dialog. Dismissing must change nothing;
 * replacing is the deliberate, destructive choice.
 */
describe('TC-383: SwitchRestaurantDialog', () => {
  const conflict = {
    currentRestaurant: { id: 'a', name: 'Olive Grill', itemCount: 3 },
    requestedRestaurant: { id: 'b', name: 'Pasta House' },
  };

  it('names both restaurants and the item count', () => {
    const wrapper = mount(SwitchRestaurantDialog, { props: { open: true, conflict } });
    expect(wrapper.text()).toContain('Olive Grill');
    expect(wrapper.text()).toContain('Pasta House');
    expect(wrapper.text()).toContain('3');
  });

  it('offers keep as the default and replace as destructive', () => {
    const wrapper = mount(SwitchRestaurantDialog, { props: { open: true, conflict } });
    const buttons = wrapper.findAll('button');
    const labels = buttons.map((b) => b.text());
    expect(labels).toContain('Keep my cart');
    expect(labels).toContain('Start new cart');
  });

  it('emits keep on dismissal and replace only on confirmation', async () => {
    const wrapper = mount(SwitchRestaurantDialog, { props: { open: true, conflict } });
    const buttons = wrapper.findAll('button');

    await buttons.find((b) => b.text() === 'Keep my cart').trigger('click');
    expect(wrapper.emitted('keep')).toHaveLength(1);
    expect(wrapper.emitted('replace')).toBeUndefined();

    await buttons.find((b) => b.text() === 'Start new cart').trigger('click');
    expect(wrapper.emitted('replace')).toHaveLength(1);
  });

  it('renders nothing when closed', () => {
    const wrapper = mount(SwitchRestaurantDialog, { props: { open: false, conflict } });
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });
});

/** TC-418: destructive dialogs require a reason before confirming. */
describe('TC-418: ConfirmDialog', () => {
  it('keeps confirm disabled until a sufficient reason is given', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: {
        open: true,
        config: { title: 'Suspend?', message: 'Names the consequence', requireReason: true, confirmLabel: 'Suspend' },
      },
    });

    const confirm = wrapper.findAll('button').find((b) => b.text() === 'Suspend');
    expect(confirm.attributes('disabled')).toBeDefined();

    await wrapper.find('textarea').setValue('Policy violation confirmed');
    expect(wrapper.findAll('button').find((b) => b.text() === 'Suspend').attributes('disabled'))
      .toBeUndefined();
  });

  it('requires a reason code when options are supplied', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: {
        open: true,
        config: {
          title: 'Cancel?', requireReason: true, confirmLabel: 'Cancel order',
          reasonOptions: [{ value: 'OUT_OF_STOCK', label: 'Out of stock' }],
        },
      },
    });

    await wrapper.find('textarea').setValue('Ingredients ran out');
    let confirm = wrapper.findAll('button').find((b) => b.text() === 'Cancel order');
    expect(confirm.attributes('disabled')).toBeDefined();

    await wrapper.find('select').setValue('OUT_OF_STOCK');
    confirm = wrapper.findAll('button').find((b) => b.text() === 'Cancel order');
    expect(confirm.attributes('disabled')).toBeUndefined();
  });

  it('emits cancel without a reason', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: { open: true, config: { title: 'x', requireReason: true } },
    });
    await wrapper.findAll('button').find((b) => b.text() === 'Cancel').trigger('click');
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    expect(wrapper.emitted('accept')).toBeUndefined();
  });
});

/** TC-392: empty and error states are distinct and actionable. */
describe('TC-392: empty and error states', () => {
  it('an empty state is not an error and can carry an action', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No restaurants match these filters', message: 'Try clearing them.' },
      slots: { default: '<button>Clear filters</button>' },
    });
    expect(wrapper.text()).toContain('No restaurants match these filters');
    expect(wrapper.text()).toContain('Clear filters');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('an error state announces itself and offers a retry', async () => {
    const wrapper = mount(ErrorState, { props: { message: 'Network unavailable' } });
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('retry')).toHaveLength(1);
  });
});
