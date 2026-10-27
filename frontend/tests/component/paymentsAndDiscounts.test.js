import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { addressApi, cartApi, paymentApi } from '@/services/api.js';
import CheckoutView from '@/views/customer/CheckoutView.vue';
import DevDiscountCodes from '@/components/customer/DevDiscountCodes.vue';
import DiscountCodeField from '@/components/customer/DiscountCodeField.vue';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  RouterLink: { props: ['to'], template: '<a><slot /></a>' },
}));

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
});

const cartEnvelope = {
  data: {
    id: 'cart-1',
    restaurant: { id: 'r1', name: 'Olive Grill', isOrderable: true },
    items: [{ id: 'l1', name: 'Mixed Grill', quantity: 2, unitPrice: '58.00', lineTotal: '116.00', issues: [] }],
    totals: { subtotal: '116.00', deliveryFee: '12.00', taxAmount: '17.40', total: '145.40' },
    issues: [],
    itemCount: 2,
    meetsMinimum: true,
    minimumShortfall: '0.00',
    canCheckout: true,
  },
};

/** spec-11 BR-P9: the Card option exists only when the server says cards are on. */
describe('checkout payment options', () => {
  async function mountCheckout(config) {
    vi.spyOn(cartApi, 'get').mockResolvedValue(cartEnvelope);
    vi.spyOn(addressApi, 'list').mockResolvedValue({ data: [] });
    vi.spyOn(paymentApi, 'config').mockImplementation(config);
    const wrapper = mount(CheckoutView);
    await flushPromises();
    return wrapper;
  }

  it('offers Card when card payments are enabled', async () => {
    const wrapper = await mountCheckout(() => Promise.resolve({ data: { cardEnabled: true } }));
    expect(wrapper.find('input[value="CASH_ON_DELIVERY"]').exists()).toBe(true);
    expect(wrapper.find('input[value="CARD"]').exists()).toBe(true);
  });

  it('hides Card when card payments are disabled', async () => {
    const wrapper = await mountCheckout(() => Promise.resolve({ data: { cardEnabled: false } }));
    expect(wrapper.find('input[value="CASH_ON_DELIVERY"]').exists()).toBe(true);
    expect(wrapper.find('input[value="CARD"]').exists()).toBe(false);
  });

  it('hides Card, and still allows cash, when the config call fails', async () => {
    const wrapper = await mountCheckout(() => Promise.reject(new Error('offline')));
    expect(wrapper.find('input[value="CASH_ON_DELIVERY"]').exists()).toBe(true);
    expect(wrapper.find('input[value="CARD"]').exists()).toBe(false);
  });
});

/** spec-12: the development-only list of seeded codes under the code field. */
describe('development discount codes', () => {
  it('lists the seeded codes and emits the one clicked', async () => {
    const wrapper = mount(DevDiscountCodes);
    const codes = wrapper.findAll('li button').map((b) => b.find('.font-mono').text());
    expect(codes).toEqual(['WELCOME10', 'SAVE50', 'GRILL15', 'OLDDEAL']);

    await wrapper.findAll('li button')[1].trigger('click');
    expect(wrapper.emitted('pick')).toEqual([['SAVE50']]);
  });

  it('applies a picked code through the cart, so the server still decides', async () => {
    vi.spyOn(cartApi, 'applyDiscount').mockResolvedValue({
      data: { ...cartEnvelope.data, discount: { code: 'SAVE50', amount: '50.00' } },
    });
    const wrapper = mount(DiscountCodeField);
    await flushPromises(); // the dev list is an async component
    expect(wrapper.findComponent(DevDiscountCodes).exists()).toBe(true);

    wrapper.findComponent(DevDiscountCodes).vm.$emit('pick', 'SAVE50');
    await flushPromises();

    expect(cartApi.applyDiscount).toHaveBeenCalledWith('SAVE50');
    expect(wrapper.text()).toContain('SAVE50');
  });
});
