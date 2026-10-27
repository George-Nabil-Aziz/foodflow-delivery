import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { addressApi, cartApi, orderApi, paymentApi } from '@/services/api.js';
import CheckoutView from '@/views/customer/CheckoutView.vue';
import RestaurantCard from '@/components/customer/RestaurantCard.vue';
import FoodItemCard from '@/components/customer/FoodItemCard.vue';
import { setLocale } from '@/i18n/index.js';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  RouterLink: { props: ['to'], template: '<a><slot /></a>' },
}));

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  setLocale('en');
});

const restaurant = (overrides = {}) => ({
  id: 'r1', name: 'Olive Grill', cuisineType: 'LEVANTINE', coverImageUrl: null,
  deliveryFee: '25.00', minimumOrderAmount: '100.00', avgPreparationMinutes: 25,
  ratingAverage: '4.50', ratingCount: 10, isOrderable: true, ...overrides,
});

/** spec-18 FR-18.3: the card says so when the restaurant will not deliver here. */
describe('RestaurantCard delivery zone', () => {
  it('says it does not deliver when the server reports deliversToAddress false', () => {
    const wrapper = mount(RestaurantCard, {
      props: { restaurant: restaurant({ deliversToAddress: false, distanceKm: 12.3 }) },
    });
    expect(wrapper.text()).toContain("Doesn't deliver to your address");
    expect(wrapper.text()).toContain('12.3 km');
  });

  it('shows the distance, and no warning, when it delivers', () => {
    const wrapper = mount(RestaurantCard, {
      props: { restaurant: restaurant({ deliversToAddress: true, distanceKm: 2.4 }) },
    });
    expect(wrapper.text()).not.toContain("Doesn't deliver");
    expect(wrapper.text()).toContain('2.4 km');
  });

  it('adds nothing for an anonymous visitor, where the fields are absent', () => {
    const wrapper = mount(RestaurantCard, { props: { restaurant: restaurant() } });
    expect(wrapper.text()).not.toContain("Doesn't deliver");
    expect(wrapper.text()).not.toContain('Distance');
  });

  it('is translated', () => {
    setLocale('ar');
    const wrapper = mount(RestaurantCard, {
      props: { restaurant: restaurant({ deliversToAddress: false, distanceKm: 12.3 }) },
    });
    expect(wrapper.text()).toContain('لا يوصّل إلى عنوانك');
  });
});

describe('FoodItemCard delivery zone', () => {
  const item = { id: 'i1', name: 'Mixed Grill', price: '58.00', imageUrl: null, isAvailable: true };

  it('cannot be added when the restaurant does not deliver to the address, and says why', () => {
    const wrapper = mount(FoodItemCard, {
      props: { item, restaurantOrderable: true, deliverable: false },
    });
    expect(wrapper.find('button').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain("Doesn't deliver to your address");
  });

  it('can be added by default', () => {
    const wrapper = mount(FoodItemCard, { props: { item } });
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined();
  });
});

describe('checkout refused for the delivery zone', () => {
  it('shows a specific message with the distance and the radius', async () => {
    vi.spyOn(cartApi, 'get').mockResolvedValue({
      data: {
        id: 'cart-1', restaurant: { id: 'r1', name: 'Olive Grill', isOrderable: true },
        items: [{ id: 'l1', name: 'Mixed Grill', quantity: 1, unitPrice: '58.00', lineTotal: '58.00', issues: [] }],
        totals: { subtotal: '58.00', deliveryFee: '12.00', taxAmount: '8.70', total: '78.70' },
        issues: [], itemCount: 1, meetsMinimum: true, minimumShortfall: '0.00', canCheckout: true,
      },
    });
    vi.spyOn(addressApi, 'list').mockResolvedValue({
      data: [{ id: 'a1', label: 'Home', line1: '1 Road', city: 'Cairo', isDefault: true }],
    });
    vi.spyOn(paymentApi, 'config').mockResolvedValue({ data: { cardEnabled: false } });
    vi.spyOn(orderApi, 'checkout').mockRejectedValue(Object.assign(new Error('x'), {
      code: 'OUTSIDE_DELIVERY_ZONE',
      details: [{ field: 'addressId', distanceKm: 14.2, radiusKm: 8 }],
    }));

    const wrapper = mount(CheckoutView);
    await flushPromises();
    await wrapper.find('button.w-full').trigger('click');
    await flushPromises();

    const alert = wrapper.find('[role="alert"]');
    expect(alert.text()).toContain('delivers within 8 km');
    expect(alert.text()).toContain('14.2 km away');
  });
});
