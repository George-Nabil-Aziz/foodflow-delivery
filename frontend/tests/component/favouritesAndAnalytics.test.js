import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { favouriteApi, restaurantApi } from '@/services/api.js';
import { useAuthStore } from '@/stores/auth.store.js';
import { useUiStore } from '@/stores/ui.store.js';
import FavouriteButton from '@/components/customer/FavouriteButton.vue';
import RestaurantCard from '@/components/customer/RestaurantCard.vue';
import FoodItemCard from '@/components/customer/FoodItemCard.vue';
import FavouritesView from '@/views/customer/FavouritesView.vue';
import AnalyticsView from '@/views/restaurant/AnalyticsView.vue';

// A link stub that keeps its target visible, so a test can see where it goes.
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  RouterLink: {
    props: ['to'],
    template: '<a :data-to="JSON.stringify(to)"><slot /></a>',
  },
}));

let auth;
beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  auth = useAuthStore();
  auth.setSession({ user: { id: 'u1', role: 'CUSTOMER', fullName: 'Sara' }, accessToken: 'a', refreshToken: 'r' });
});

const restaurant = (over = {}) => ({
  id: 'r1', name: 'Olive Grill', cuisineType: 'LEVANTINE', coverImageUrl: null,
  deliveryFee: '12.00', minimumOrderAmount: '30.00', avgPreparationMinutes: 25,
  ratingAverage: '4.50', ratingCount: 3, isOrderable: true, unavailableReason: null,
  ...over,
});

describe('FavouriteButton (FR-16.4)', () => {
  const mountButton = (props = {}) =>
    mount(FavouriteButton, { props: { kind: 'restaurant', id: 'r1', name: 'Olive Grill', ...props } });

  it('renders for a customer only', () => {
    expect(mountButton().find('button').exists()).toBe(true);
    for (const role of ['RESTAURANT', 'DRIVER', 'ADMIN']) {
      auth.setSession({ user: { id: 'x', role } });
      expect(mountButton().find('button').exists(), role).toBe(false);
    }
  });

  it('reflects the flag it is given, and names the action', () => {
    const off = mountButton({ favourite: false }).find('button');
    expect(off.attributes('aria-pressed')).toBe('false');
    expect(off.attributes('aria-label')).toBe('Add Olive Grill to favourites');

    const on = mountButton({ favourite: true }).find('button');
    expect(on.attributes('aria-pressed')).toBe('true');
    expect(on.attributes('aria-label')).toBe('Remove Olive Grill from favourites');
  });

  it('fills at once, calls the API once, and reports the change', async () => {
    const add = vi.spyOn(favouriteApi, 'addRestaurant').mockResolvedValue({ data: {} });
    const wrapper = mountButton({ favourite: false });

    await wrapper.find('button').trigger('click');
    expect(wrapper.find('button').attributes('aria-pressed')).toBe('true');
    await flushPromises();

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith('r1');
    expect(wrapper.emitted('change')).toEqual([[true]]);
  });

  it('removes through the matching call for an item', async () => {
    const remove = vi.spyOn(favouriteApi, 'removeItem').mockResolvedValue({});
    const wrapper = mountButton({ kind: 'item', id: 'i9', name: 'Mixed Grill', favourite: true });

    await wrapper.find('button').trigger('click');
    await flushPromises();

    expect(remove).toHaveBeenCalledWith('i9');
    expect(wrapper.emitted('change')).toEqual([[false]]);
  });

  it('puts the heart back and says so when the server refuses', async () => {
    vi.spyOn(favouriteApi, 'addRestaurant').mockRejectedValue(new Error('Not found'));
    const wrapper = mountButton({ favourite: false });

    await wrapper.find('button').trigger('click');
    await flushPromises();

    expect(wrapper.find('button').attributes('aria-pressed')).toBe('false');
    expect(wrapper.emitted('change')).toBeUndefined();
    expect(useUiStore().toasts.map((x) => x.message)).toContain('Not found');
  });
});

describe('hearts on the cards', () => {
  it('shows a heart on a restaurant card only when the API marked it', () => {
    const marked = mount(RestaurantCard, { props: { restaurant: restaurant({ isFavourite: true }) } });
    expect(marked.find('button[aria-pressed="true"]').exists()).toBe(true);

    const anonymous = mount(RestaurantCard, { props: { restaurant: restaurant() } });
    expect(anonymous.find('button').exists()).toBe(false);
  });

  it('keeps the heart out of the link', () => {
    const wrapper = mount(RestaurantCard, { props: { restaurant: restaurant({ isFavourite: false }) } });
    expect(wrapper.find('a button').exists()).toBe(false);
    expect(wrapper.find('a').exists()).toBe(true);
  });

  it('does not link a restaurant that is off the platform', () => {
    const wrapper = mount(RestaurantCard, {
      props: { restaurant: restaurant({ isBrowsable: false, isOrderable: false, unavailableReason: 'NOT_ACTIVE', isFavourite: true }) },
    });
    expect(wrapper.find('a').exists()).toBe(false);
    expect(wrapper.text()).toMatch(/Not currently on FoodFlow/);
  });

  it('shows a heart on a menu item only when the API marked it', () => {
    const item = { id: 'i1', name: 'Mixed Grill', price: '58.00', isAvailable: true };
    expect(mount(FoodItemCard, { props: { item: { ...item, isFavourite: true } } })
      .find('button[aria-pressed="true"]').exists()).toBe(true);
    expect(mount(FoodItemCard, { props: { item } }).find('button[aria-pressed]').exists()).toBe(false);
  });
});

describe('FavouritesView (FR-16.7, BR-FV5)', () => {
  const payload = {
    restaurants: [
      restaurant({ id: 'r1', name: 'Open Place', isFavourite: true, isBrowsable: true }),
      restaurant({
        id: 'r2', name: 'Closed Place', isFavourite: true, isBrowsable: true,
        isOrderable: false, unavailableReason: 'CLOSED_NOW',
      }),
    ],
    items: [
      { id: 'i1', name: 'Mixed Grill', price: '58.00', isAvailable: true, restaurant: { id: 'r1', name: 'Open Place', isBrowsable: true } },
      { id: 'i2', name: 'Retired Dish', price: '20.00', isAvailable: false, restaurant: { id: 'r1', name: 'Open Place', isBrowsable: true } },
    ],
  };

  async function mountView(data = payload) {
    vi.spyOn(favouriteApi, 'list').mockResolvedValue({ data });
    const wrapper = mount(FavouritesView);
    await flushPromises();
    return wrapper;
  }

  it('lists both kinds and keeps what cannot be ordered, marked as such', async () => {
    const wrapper = await mountView();
    const text = wrapper.text();

    expect(text).toContain('Open Place');
    expect(text).toContain('Closed Place');
    expect(text).toMatch(/Closed right now/);
    expect(text).toContain('Mixed Grill');
    expect(text).toContain('Retired Dish');
    expect(text).toMatch(/Unavailable/);
  });

  it('links an available item to its restaurant\'s menu, and not an unavailable one', async () => {
    const wrapper = await mountView();
    const row = (name) => wrapper.findAll('li').find((li) => li.text().includes(name));

    const link = row('Mixed Grill').findAll('a').find((a) => /View menu/.test(a.text()));
    expect(JSON.parse(link.attributes('data-to'))).toEqual({ name: 'restaurant-detail', params: { id: 'r1' } });
    expect(row('Retired Dish').text()).not.toMatch(/View menu/);
  });

  it('drops an entry when its heart is turned off', async () => {
    vi.spyOn(favouriteApi, 'removeItem').mockResolvedValue({});
    const wrapper = await mountView();

    const heart = wrapper.findAll('li').find((li) => li.text().includes('Retired Dish')).find('button');
    await heart.trigger('click');
    await flushPromises();

    expect(wrapper.text()).not.toContain('Retired Dish');
    expect(wrapper.text()).toContain('Mixed Grill');
  });

  it('says so when there are no favourites', async () => {
    const wrapper = await mountView({ restaurants: [], items: [] });
    expect(wrapper.text()).toMatch(/No favourites yet/);
  });
});

describe('AnalyticsView (FR-17.7)', () => {
  const analytics = (over = {}) => ({
    periodDays: 30, timezone: 'Africa/Cairo', deliveredOrders: 12, revenue: '1450.50',
    averageOrderValue: '120.88', cancelledOrders: 3, cancellationRate: 20,
    averagePreparationMinutes: 18.5,
    topItems: [
      { name: 'Mixed Grill', quantity: 20, revenue: '1160.00' },
      { name: 'Lentil Soup', quantity: 10, revenue: '180.00' },
    ],
    ordersByHour: Array.from({ length: 24 }, (_, hour) => ({ hour, orders: hour === 13 ? 8 : 0 })),
    ...over,
  });

  beforeEach(() => {
    auth.setSession({ user: { id: 'o1', role: 'RESTAURANT', fullName: 'Layla' } });
  });

  it('asks for 30 days first and shows every figure', async () => {
    const api = vi.spyOn(restaurantApi, 'analytics').mockResolvedValue({ data: analytics() });
    const wrapper = mount(AnalyticsView);
    await flushPromises();

    expect(api).toHaveBeenCalledWith(30);
    const text = wrapper.text();
    expect(text).toContain('12');
    expect(text).toContain('EGP 1450.50');
    expect(text).toContain('EGP 120.88');
    expect(text).toContain('20%');
    expect(text).toContain('18.5 min');
    expect(text).toContain('Mixed Grill');
    expect(text).toMatch(/Africa\/Cairo/);
    expect(wrapper.findAll('[title$=": 8"]')).toHaveLength(1);
  });

  it('reloads for the chosen period and marks it pressed', async () => {
    const api = vi.spyOn(restaurantApi, 'analytics').mockResolvedValue({ data: analytics() });
    const wrapper = mount(AnalyticsView);
    await flushPromises();

    const seven = wrapper.findAll('button').find((b) => b.text() === 'Last 7 days');
    await seven.trigger('click');
    await flushPromises();

    expect(api).toHaveBeenLastCalledWith(7);
    expect(seven.attributes('aria-pressed')).toBe('true');
    expect(wrapper.findAll('button').find((b) => b.text() === 'Last 30 days').attributes('aria-pressed')).toBe('false');
  });

  it('shows dashes and an empty message when nothing was delivered', async () => {
    vi.spyOn(restaurantApi, 'analytics').mockResolvedValue({
      data: analytics({
        deliveredOrders: 0, revenue: '0.00', averageOrderValue: null, cancellationRate: null,
        averagePreparationMinutes: null, topItems: [],
        ordersByHour: Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0 })),
      }),
    });
    const wrapper = mount(AnalyticsView);
    await flushPromises();

    expect(wrapper.text()).toMatch(/No delivered orders in this period/);
    expect(wrapper.text()).not.toContain('NaN');
    expect(wrapper.text()).toContain('–');
  });

  it('offers a retry when the call fails', async () => {
    vi.spyOn(restaurantApi, 'analytics').mockRejectedValue(new Error('offline'));
    const wrapper = mount(AnalyticsView);
    await flushPromises();
    expect(wrapper.text()).toContain('offline');
    expect(wrapper.text()).toMatch(/Try again/);
  });
});
