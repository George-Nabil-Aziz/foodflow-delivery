<script setup>
import { ref } from 'vue';
import AppButton from '../shared/AppButton.vue';
import { useFocusTrap } from '../../composables/useFocusTrap.js';
import { t } from '../../i18n/index.js';

/**
 * The restaurant-switch dialog.
 *
 * Both obvious implementations of a cross-restaurant add are wrong: silently
 * mixing produces an order no kitchen can fulfil, and silently wiping destroys
 * work the customer never agreed to lose. So the server refuses with a
 * conflict, and this dialog asks.
 *
 * "Keep my cart" is the default action; replacing is styled as destructive and
 * requires a deliberate choice. Dismissing issues no request at all.
 */
const props = defineProps({
  open: { type: Boolean, default: false },
  conflict: { type: Object, default: () => ({}) },
  replacing: { type: Boolean, default: false },
});
const emit = defineEmits(['keep', 'replace']);

const dialogRef = ref(null);

// Escape keeps the cart, matching the dismissal button: the non-destructive
// choice is what an interrupted customer gets.
useFocusTrap(dialogRef, () => props.open, () => emit('keep'));
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
       @click.self="emit('keep')">
    <div ref="dialogRef" tabindex="-1" role="dialog" aria-modal="true"
         aria-labelledby="switch-title"
         class="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-surface p-5 shadow-2xl sm:p-6">
      <h2 id="switch-title" class="text-lg font-semibold text-slate-900">
        {{ t('Start a new cart?') }}
      </h2>

      <p class="mt-2 text-sm text-slate-700">
        {{ t('Your cart has') }}
        <strong>{{ conflict.currentRestaurant?.itemCount ?? 0 }}</strong>
        {{ t('item(s) from') }} <strong>{{ conflict.currentRestaurant?.name }}</strong>.
        {{ t('You can only order from one restaurant at a time.') }}
      </p>
      <p class="mt-2 text-sm text-slate-700">
        {{ t('Starting a new cart with') }} <strong>{{ conflict.requestedRestaurant?.name }}</strong>
        {{ t('will remove the items you already added.') }}
      </p>

      <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <!-- Default action: keep what the customer already built. -->
        <AppButton variant="secondary" :disabled="replacing" @click="emit('keep')">
          {{ t('Keep my cart') }}
        </AppButton>
        <AppButton variant="danger" :loading="replacing" @click="emit('replace')">
          {{ t('Start new cart') }}
        </AppButton>
      </div>
    </div>
  </div>
</template>
