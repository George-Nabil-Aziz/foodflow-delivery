<script setup>
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { adminApi, discoveryApi } from '../../services/api.js';
import { useUiStore } from '../../stores/ui.store.js';
import { formatMoney } from '../../utils/money.js';
import { discountErrorText } from '../../utils/discount.js';
import { t } from '../../i18n/index.js';
import AppButton from '../../components/shared/AppButton.vue';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import FilterSearch from '../../components/shared/FilterSearch.vue';

/**
 * "Make an order": an admin places an order on an existing customer's behalf,
 * paid cash on delivery. Customer, then one of their saved addresses, then a
 * restaurant and its dishes. The customer's own cart is never touched, and
 * every total is computed by the server when the order is placed.
 */
const ui = useUiStore();

/* ---------------------------------------------------------------- customer */

const customerQuery = ref('');
const customerResults = ref([]);
const searchingCustomers = ref(false);
const customer = ref(null);
const addresses = ref([]);
const addressId = ref(null);
const loadingAddresses = ref(false);

// Each keystroke searches; only the latest search may fill the list.
let searchSeq = 0;
async function searchCustomers(q) {
  const seq = ++searchSeq;
  if (!q.trim()) { customerResults.value = []; searchingCustomers.value = false; return; }
  searchingCustomers.value = true;
  try {
    const res = await adminApi.users({ role: 'CUSTOMER', status: 'ACTIVE', q: q.trim(), limit: 8 });
    if (seq === searchSeq) customerResults.value = res.data;
  } catch (err) {
    if (seq === searchSeq) ui.toastError(err.message);
  } finally {
    if (seq === searchSeq) searchingCustomers.value = false;
  }
}

async function chooseCustomer(c) {
  customer.value = c;
  customerResults.value = [];
  customerQuery.value = '';
  addresses.value = [];
  addressId.value = null;
  loadingAddresses.value = true;
  try {
    addresses.value = (await adminApi.customerAddresses(c.id)).data;
    addressId.value = addresses.value.find((a) => a.isDefault)?.id ?? addresses.value[0]?.id ?? null;
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    loadingAddresses.value = false;
  }
}

/* -------------------------------------------------------------- restaurant */

const restaurantQuery = ref('');
const restaurantResults = ref([]);
const searchingRestaurants = ref(false);
const restaurant = ref(null);
const menu = ref([]);
const loadingMenu = ref(false);
/** foodItemId -> quantity; an item at 0 is not in the order. */
const quantities = ref({});

let restaurantSeq = 0;
async function searchRestaurants(q) {
  const seq = ++restaurantSeq;
  if (!q.trim()) { restaurantResults.value = []; searchingRestaurants.value = false; return; }
  searchingRestaurants.value = true;
  try {
    const res = await discoveryApi.listRestaurants({ q: q.trim(), sort: 'name', order: 'asc', limit: 8 });
    // Only restaurants that can take an order right now are offered.
    if (seq === restaurantSeq) restaurantResults.value = res.data.filter((r) => r.isOrderable);
  } catch (err) {
    if (seq === restaurantSeq) ui.toastError(err.message);
  } finally {
    if (seq === restaurantSeq) searchingRestaurants.value = false;
  }
}

function clearRestaurant() {
  restaurant.value = null;
  quantities.value = {};
  menu.value = [];
}

async function chooseRestaurant(r) {
  restaurant.value = r;
  restaurantResults.value = [];
  restaurantQuery.value = '';
  quantities.value = {};
  menu.value = [];
  loadingMenu.value = true;
  try {
    menu.value = (await discoveryApi.getMenu(r.id)).data;
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    loadingMenu.value = false;
  }
}

/** An item with a required option group cannot be picked here: the server refuses it without a choice. */
const needsChoices = (item) => (item.optionGroups ?? []).some((g) => g.minSelect >= 1);

const setQuantity = (itemId, n) => {
  quantities.value = { ...quantities.value, [itemId]: Math.min(20, Math.max(0, n)) };
};

const chosen = computed(() => menu.value.flatMap((c) => c.items)
  .filter((i) => quantities.value[i.id] > 0)
  .map((i) => ({ ...i, quantity: quantities.value[i.id] })));
const itemCount = computed(() => chosen.value.reduce((n, i) => n + i.quantity, 0));

/* ------------------------------------------------------------------ submit */

const customerNote = ref('');
const discountCode = ref('');
const placing = ref(false);
const placed = ref(null);

const missing = computed(() => {
  if (!customer.value) return t('Choose a customer.');
  if (!addressId.value) return t('Choose a delivery address.');
  if (!restaurant.value) return t('Choose a restaurant.');
  if (chosen.value.length === 0) return t('Add at least one dish.');
  return null;
});

async function placeOrder() {
  if (missing.value) return;
  placing.value = true;
  try {
    const { data } = await adminApi.placeOrder({
      customerUserId: customer.value.id,
      restaurantId: restaurant.value.id,
      addressId: addressId.value,
      items: chosen.value.map((i) => ({ foodItemId: i.id, quantity: i.quantity })),
      customerNote: customerNote.value.trim() || null,
      discountCode: discountCode.value.trim() || null,
    });
    placed.value = data;
    ui.toastSuccess(t('Order {orderNumber} placed', { orderNumber: data.orderNumber }));
    // Ready for the next one; the customer and restaurant often repeat.
    quantities.value = {};
    customerNote.value = '';
    discountCode.value = '';
  } catch (err) {
    ui.toastError(err.code?.startsWith('DISCOUNT_CODE_') ? discountErrorText(err) : (err.details?.[0]?.issue ?? err.message));
  } finally {
    placing.value = false;
  }
}
</script>

<template>
  <div class="max-w-3xl">
    <h1 class="text-xl font-semibold text-slate-900">{{ t('Make an order') }}</h1>
    <p class="mt-1 text-sm text-slate-600">
      {{ t('Place an order on a customer\'s behalf. It is paid cash on delivery and their cart is left as it is.') }}
    </p>

    <div v-if="placed" class="card mt-4 border-emerald-300 bg-emerald-50 p-4 text-sm" role="status">
      <p class="font-medium text-emerald-900">
        {{ t('Order {orderNumber} placed', { orderNumber: placed.orderNumber }) }}
      </p>
      <p class="mt-1 text-emerald-900">{{ t('Total') }}: {{ formatMoney(placed.totalAmount) }}</p>
      <button type="button" class="mt-2 text-xs underline" @click="placed = null">{{ t('Dismiss') }}</button>
    </div>

    <!-- 1. Customer -->
    <section class="card mt-4 p-4">
      <h2 class="font-semibold text-slate-900">{{ t('Customer') }}</h2>
      <div v-if="customer" class="mt-3 flex items-center justify-between gap-3 rounded-lg border border-brand-500 bg-brand-50 p-3 text-sm">
        <span class="min-w-0">
          <span class="block font-medium text-slate-900">{{ customer.fullName }}</span>
          <span class="block break-words text-slate-600">{{ customer.email }}</span>
        </span>
        <button type="button" class="action-link shrink-0 text-brand-700 hover:underline" @click="customer = null">
          {{ t('Change') }}
        </button>
      </div>
      <template v-else>
        <div class="mt-3 flex">
          <FilterSearch id="mo-customer" v-model="customerQuery" :placeholder="t('Search by name or email')"
                        @update:model-value="searchCustomers" />
        </div>
        <p v-if="searchingCustomers" class="mt-2 text-sm text-slate-500">{{ t('Searching…') }}</p>
        <ul v-else-if="customerResults.length" class="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
          <li v-for="c in customerResults" :key="c.id">
            <button type="button" class="w-full px-3 py-2 text-start text-sm hover:bg-slate-50" @click="chooseCustomer(c)">
              <span class="font-medium text-slate-900">{{ c.fullName }}</span>
              <span class="ms-2 text-slate-600">{{ c.email }}</span>
            </button>
          </li>
        </ul>
        <p v-else-if="customerQuery.trim().length >= 1" class="mt-2 text-sm text-slate-500">
          {{ t('No active customer matches.') }}
        </p>
      </template>
    </section>

    <!-- 2. Address -->
    <section v-if="customer" class="card mt-4 p-4">
      <h2 class="font-semibold text-slate-900">{{ t('Delivery address') }}</h2>
      <AppSpinner v-if="loadingAddresses" label="Loading addresses" />
      <p v-else-if="addresses.length === 0" class="mt-3 text-sm text-slate-600">
        {{ t('This customer has no saved addresses, so an order cannot be placed for them yet.') }}
      </p>
      <ul v-else class="mt-3 space-y-2">
        <li v-for="address in addresses" :key="address.id">
          <label class="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
                 :class="addressId === address.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200'">
            <input v-model="addressId" type="radio" :value="address.id" class="mt-1">
            <span class="text-sm">
              <span class="font-medium text-slate-900">{{ address.label || t('Address') }}</span>
              <span v-if="address.isDefault" class="ms-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs">{{ t('Default') }}</span>
              <span class="block text-slate-600">
                {{ address.line1 }}<template v-if="address.district">, {{ address.district }}</template>, {{ address.city }}
              </span>
            </span>
          </label>
        </li>
      </ul>
    </section>

    <!-- 3. Restaurant and dishes -->
    <section class="card mt-4 p-4">
      <h2 class="font-semibold text-slate-900">{{ t('Restaurant') }}</h2>
      <div v-if="restaurant" class="mt-3 flex items-center justify-between gap-3 rounded-lg border border-brand-500 bg-brand-50 p-3 text-sm">
        <span class="min-w-0">
          <span class="block font-medium text-slate-900">{{ restaurant.name }}</span>
          <span class="block text-slate-600">
            {{ t('Delivery fee') }}: {{ formatMoney(restaurant.deliveryFee) }}
            &middot; {{ t('Minimum order') }}: {{ formatMoney(restaurant.minimumOrderAmount) }}
          </span>
        </span>
        <button type="button" class="action-link shrink-0 text-brand-700 hover:underline" @click="clearRestaurant">
          {{ t('Change') }}
        </button>
      </div>
      <template v-else>
        <div class="mt-3 flex">
          <FilterSearch id="mo-restaurant" v-model="restaurantQuery" :placeholder="t('Search by restaurant name')"
                        @update:model-value="searchRestaurants" />
        </div>
        <p v-if="searchingRestaurants" class="mt-2 text-sm text-slate-500">{{ t('Searching…') }}</p>
        <ul v-else-if="restaurantResults.length" class="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
          <li v-for="r in restaurantResults" :key="r.id">
            <button type="button" class="w-full px-3 py-2 text-start text-sm hover:bg-slate-50" @click="chooseRestaurant(r)">
              <span class="font-medium text-slate-900">{{ r.name }}</span>
              <span v-if="r.district || r.city" class="ms-2 text-slate-600">{{ r.district || r.city }}</span>
            </button>
          </li>
        </ul>
        <p v-else-if="restaurantQuery.trim()" class="mt-2 text-sm text-slate-500">
          {{ t('No restaurant taking orders matches.') }}
        </p>
      </template>

      <AppSpinner v-if="loadingMenu" label="Loading menu" />
      <div v-else-if="menu.length" class="mt-4 space-y-5">
        <div v-for="category in menu" :key="category.id">
          <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-500">{{ category.name }}</h3>
          <ul class="mt-2 divide-y divide-slate-100">
            <li v-for="item in category.items" :key="item.id" class="flex items-center justify-between gap-3 py-2">
              <span class="min-w-0 text-sm">
                <span class="block font-medium" :class="item.isAvailable ? 'text-slate-900' : 'text-slate-400'">
                  {{ item.name }}
                </span>
                <span class="text-slate-600">{{ formatMoney(item.price) }}</span>
                <span v-if="!item.isAvailable" class="ms-2 text-xs text-slate-500">{{ t('Unavailable') }}</span>
                <span v-else-if="needsChoices(item)" class="block text-xs text-slate-500">
                  {{ t('Requires option choices: the customer must order this item themselves.') }}
                </span>
              </span>
              <span v-if="item.isAvailable && !needsChoices(item)" class="flex shrink-0 items-center gap-1">
                <button type="button" class="ui-control h-8 w-8 rounded-lg border border-slate-300 text-slate-700 disabled:opacity-40"
                        :disabled="!quantities[item.id]" :aria-label="t('Remove one {name}', { name: item.name })"
                        @click="setQuantity(item.id, (quantities[item.id] ?? 0) - 1)">&minus;</button>
                <span class="w-6 text-center text-sm tabular-nums" aria-live="polite">{{ quantities[item.id] ?? 0 }}</span>
                <button type="button" class="ui-control h-8 w-8 rounded-lg border border-slate-300 text-slate-700 disabled:opacity-40"
                        :disabled="quantities[item.id] >= 20" :aria-label="t('Add one {name}', { name: item.name })"
                        @click="setQuantity(item.id, (quantities[item.id] ?? 0) + 1)">+</button>
              </span>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <!-- 4. Review and place -->
    <section class="card mt-4 p-4">
      <h2 class="font-semibold text-slate-900">{{ t('Order') }}</h2>
      <ul v-if="chosen.length" class="mt-3 space-y-1 text-sm">
        <li v-for="i in chosen" :key="i.id" class="flex justify-between gap-3">
          <span>{{ i.quantity }} &times; {{ i.name }}</span>
          <span class="text-slate-600">{{ formatMoney(i.price) }} {{ t('each') }}</span>
        </li>
      </ul>
      <p v-else class="mt-3 text-sm text-slate-500">{{ t('No dishes yet.') }}</p>
      <p v-if="chosen.length" class="mt-2 text-xs text-slate-500">
        {{ t('{count} items. Tax, delivery and the total are calculated when the order is placed.', { count: itemCount }) }}
      </p>

      <label for="mo-note" class="field-label mt-4">{{ t('Note for the restaurant (optional)') }}</label>
      <textarea id="mo-note" v-model="customerNote" rows="2" maxlength="500" class="field-input" />

      <label for="mo-discount" class="field-label mt-4">{{ t('Discount code (optional)') }}</label>
      <input id="mo-discount" v-model="discountCode" type="text" maxlength="40" autocomplete="off"
             class="field-input uppercase">

      <div class="mt-4 flex flex-wrap items-center gap-3">
        <AppButton :loading="placing" :disabled="Boolean(missing)" @click="placeOrder">{{ t('Place order') }}</AppButton>
        <span v-if="missing" class="text-sm text-slate-500">{{ missing }}</span>
      </div>
    </section>

    <RouterLink :to="{ name: 'admin-orders' }" class="action-link mt-6 inline-block text-sm text-brand-700 hover:underline">
      {{ t('Back to orders') }}
    </RouterLink>
  </div>
</template>
