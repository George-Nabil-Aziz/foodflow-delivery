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
 *
 * An item with option groups first opens the options dialog (spec-15); the
 * choice it returns travels with the add, including through a restaurant
 * switch. An item without groups is added at once, as before.
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
  const optionsOpen = ref(false);
  const optionsItem = ref(null);

  const bodyFor = (item, { quantity, optionIds, notes }) => ({
    foodItemId: item.id,
    quantity,
    ...(optionIds?.length ? { optionIds } : {}),
    ...(notes ? { notes } : {}),
  });

  async function add(item, quantity = 1, choice = null) {
    if (!auth.isAuthenticated) {
      router?.push({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } });
      return;
    }

    // Choices come first: the dialog calls back into add() with them.
    if (item.optionGroups?.length && !choice) {
      optionsItem.value = item;
      optionsOpen.value = true;
      return;
    }

    const line = { quantity: choice?.quantity ?? quantity, optionIds: choice?.optionIds, notes: choice?.notes };
    adding.value = item.id;
    try {
      await cart.addItem(bodyFor(item, line));
      optionsOpen.value = false;
      ui.toastSuccess(`${item.name} added to your cart`);
    } catch (err) {
      if (err.code === 'CART_RESTAURANT_MISMATCH') {
        // The server refuses and hands back both restaurants; the customer decides.
        conflict.value = err.details?.[0] ?? {};
        pendingItem.value = { item, line };
        optionsOpen.value = false;
        conflictOpen.value = true;
        return;
      }
      if (err.code === 'ITEM_UNAVAILABLE' || err.code === 'RESTAURANT_UNAVAILABLE'
        || err.code === 'OUTSIDE_DELIVERY_ZONE' || err.code === 'ITEM_OPTIONS_INVALID') {
        // A choice made stale by a menu change: the dialog stays open to fix it.
        ui.toastError(err.details?.[0]?.issue ?? err.message);
        return;
      }
      ui.toastError(err.message);
    } finally {
      adding.value = null;
    }
  }

  const confirmOptions = (choice) => add(optionsItem.value, choice.quantity, choice);
  const cancelOptions = () => {
    optionsOpen.value = false;
    optionsItem.value = null;
  };

  /** Dismissal changes nothing and issues no request. */
  function keepCart() {
    conflictOpen.value = false;
    pendingItem.value = null;
  }

  async function replaceCart() {
    if (!pendingItem.value) return;
    replacing.value = true;
    try {
      const { item, line } = pendingItem.value;
      await cart.addItem(bodyFor(item, line), { replace: true });
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
    optionsOpen, optionsItem, confirmOptions, cancelOptions,
    add, keepCart, replaceCart, CART_ISSUE_LABEL,
  };
}
