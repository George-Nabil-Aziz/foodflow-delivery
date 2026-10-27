<script setup>
import { ref, watch } from 'vue';
import { favouriteApi } from '../../services/api.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { useUiStore } from '../../stores/ui.store.js';
import { t } from '../../i18n/index.js';

/**
 * The heart toggle (spec-16). Shown to signed-in customers only: it renders
 * nothing for a visitor, a restaurant, a driver or an admin, and the server
 * refuses them regardless.
 *
 * Optimistic with rollback, like the other switches in the app: the heart
 * fills at once, and goes back with a message if the server refuses. The
 * server calls are idempotent, so a double click cannot create two rows.
 */
const props = defineProps({
  kind: { type: String, required: true, validator: (v) => ['restaurant', 'item'].includes(v) },
  id: { type: String, required: true },
  name: { type: String, required: true },
  // The `isFavourite` flag the API put on the entry; absent means "not marked".
  favourite: { type: Boolean, default: false },
});
const emit = defineEmits(['change']);

const auth = useAuthStore();
const ui = useUiStore();

const on = ref(props.favourite);
const busy = ref(false);
watch(() => props.favourite, (value) => { on.value = value; });

async function toggle() {
  if (busy.value) return;
  const next = !on.value;
  on.value = next;
  busy.value = true;
  try {
    const call = props.kind === 'restaurant'
      ? (next ? favouriteApi.addRestaurant : favouriteApi.removeRestaurant)
      : (next ? favouriteApi.addItem : favouriteApi.removeItem);
    await call(props.id);
    emit('change', next);
  } catch (err) {
    on.value = !next;
    ui.toastError(err.message);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <button v-if="auth.role === 'CUSTOMER'" type="button"
          class="ui-control inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface/90 shadow-card ring-1 ring-slate-200 backdrop-blur transition hover:bg-slate-100 disabled:cursor-wait"
          :class="on ? 'text-rose-600' : 'text-slate-500'"
          :aria-pressed="on"
          :aria-label="on ? t('Remove {name} from favourites', { name }) : t('Add {name} to favourites', { name })"
          :disabled="busy"
          @click.stop.prevent="toggle">
    <svg viewBox="0 0 24 24" class="h-5 w-5" aria-hidden="true"
         :fill="on ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  </button>
</template>
