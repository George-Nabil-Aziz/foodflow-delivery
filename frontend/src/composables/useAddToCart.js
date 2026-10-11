import { ref } from 'vue';
import { useCartStore } from '../stores/cart.store.js';
import { useUiStore } from '../stores/ui.store.js';
import { useAuthStore } from '../stores/auth.store.js';
import { CART_ISSUE_LABEL } from '../utils/orderStatus.js';

/**
 * Add-to-cart, including the cross-restaurant conflict.
 *
 * Every entry point (menu card, item modal, re-order) routes through here, so
 * the conflict is handled identically wherever it happens rather than three
 * slightly different ways.
 */
export function useAddToCart(router) {
  const cart = useCartStore();
  const ui = useUiStore();
  const auth = useAuthStore();

  const adding = ref(null);
  const replacing = ref(false);
  const conflictOpen = ref(false);
  const conflict = ref({});
  const pendingItem = ref(null);

  async function add(item, quantity = 1) {
    if (!auth.isAuthenticated) {
      router?.push({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } });
      return;
    }

    adding.value = item.id;
    try {
      await cart.addItem({ foodItemId: item.id, quantity });
      ui.toastSuccess(`${item.name} added to your cart`);
    } catch (err) {
      if (err.code === 'CART_RESTAURANT_MISMATCH') {
        // The server refuses and hands back both restaurants; the customer decides.
        conflict.value = err.details?.[0] ?? {};
        pendingItem.value = { item, quantity };
        conflictOpen.value = true;
        return;
      }
      if (err.code === 'ITEM_UNAVAILABLE' || err.code === 'RESTAURANT_UNAVAILABLE') {
        ui.toastError(err.details?.[0]?.issue ?? err.message);
        return;
      }
      ui.toastError(err.message);
    } finally {
      adding.value = null;
    }
  }

  /** Dismissal changes nothing and issues no request. */
  function keepCart() {
    conflictOpen.value = false;
    pendingItem.value = null;
  }

  async function replaceCart() {
    if (!pendingItem.value) return;
    replacing.value = true;
    try {
      const { item, quantity } = pendingItem.value;
      await cart.addItem({ foodItemId: item.id, quantity }, { replace: true });
      ui.toastSuccess(`Started a new cart with ${item.name}`);
      conflictOpen.value = false;
      pendingItem.value = null;
    } catch (err) {
      ui.toastError(err.message);
    } finally {
      replacing.value = false;
    }
  }

  return {
    adding, replacing, conflictOpen, conflict,
    add, keepCart, replaceCart, CART_ISSUE_LABEL,
  };
}
