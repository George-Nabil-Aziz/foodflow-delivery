import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { cartApi } from '../services/api.js';

/**
 * Mirrors the server's cart. It computes NOTHING: totals, issues and
 * `canCheckout` are taken verbatim from the response, because duplicating the
 * arithmetic client-side guarantees the two eventually disagree about money.
 */
export const useCartStore = defineStore('cart', () => {
  const cart = ref(null);
  const loading = ref(false);
  const loaded = ref(false);

  const items = computed(() => cart.value?.items ?? []);
  const itemCount = computed(() => cart.value?.itemCount ?? 0);
  const restaurant = computed(() => cart.value?.restaurant ?? null);
  const totals = computed(
    () => cart.value?.totals
      ?? { subtotal: '0.00', deliveryFee: '0.00', discountAmount: '0.00', taxAmount: '0.00', total: '0.00' },
  );
  // The applied code as the server priced it, or why a stored one no longer applies.
  const discount = computed(() => cart.value?.discount ?? null);
  const discountIssue = computed(() => cart.value?.discountIssue ?? null);
  const issues = computed(() => cart.value?.issues ?? []);
  const canCheckout = computed(() => cart.value?.canCheckout === true);
  const meetsMinimum = computed(() => cart.value?.meetsMinimum === true);
  const minimumShortfall = computed(() => cart.value?.minimumShortfall ?? '0.00');
  const isEmpty = computed(() => items.value.length === 0);

  /*
   * Responses are applied in request order, not arrival order.
   *
   * Two quick taps on different "Add" buttons produce two concurrent requests.
   * The second response carries both items, the first only one - so if the
   * first lands last, the badge silently loses an item the server already has.
   * Stamping each request and dropping late arrivals keeps the mirror honest.
   */
  let issued = 0;
  let applied = 0;

  const apply = (envelope, stamp) => {
    if (stamp !== undefined && stamp < applied) return cart.value;
    if (stamp !== undefined) applied = stamp;
    cart.value = envelope.data;
    loaded.value = true;
    return cart.value;
  };

  const nextStamp = () => (issued += 1);

  async function load() {
    const stamp = nextStamp();
    loading.value = true;
    try {
      return apply(await cartApi.get(), stamp);
    } finally {
      loading.value = false;
    }
  }

  /** Throws ApiError with code CART_RESTAURANT_MISMATCH so the caller can show
   *  the switch dialog. The store never resolves the conflict on its own. */
  async function addItem(body, options) {
    const stamp = nextStamp();
    return apply(await cartApi.addItem(body, options), stamp);
  }

  async function updateQuantity(itemId, quantity) {
    const stamp = nextStamp();
    return apply(await cartApi.updateQuantity(itemId, quantity), stamp);
  }

  async function removeItem(itemId) {
    const stamp = nextStamp();
    return apply(await cartApi.removeItem(itemId), stamp);
  }

  /** Throws ApiError with the specific DISCOUNT_CODE_* code; the cart is unchanged then. */
  async function applyDiscount(code) {
    const stamp = nextStamp();
    return apply(await cartApi.applyDiscount(code), stamp);
  }

  async function removeDiscount() {
    const stamp = nextStamp();
    return apply(await cartApi.removeDiscount(), stamp);
  }

  async function clear() {
    await cartApi.clear();
    return load();
  }

  function reset() {
    cart.value = null;
    loaded.value = false;
    // A response still in flight belongs to the signed-out session; bumping
    // the watermark past every issued request discards it on arrival.
    applied = issued;
  }

  return {
    cart, loading, loaded, items, itemCount, restaurant, totals, discount, discountIssue, issues,
    canCheckout, meetsMinimum, minimumShortfall, isEmpty,
    load, addItem, updateQuantity, removeItem, applyDiscount, removeDiscount, clear, reset,
  };
});
