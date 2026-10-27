<script setup>
import { computed, ref, watch } from 'vue';
import AppButton from '../shared/AppButton.vue';
import { useFocusTrap } from '../../composables/useFocusTrap.js';
import { formatMoney } from '../../utils/money.js';
import { previewUnitPrice, previewLineTotal, groupProblems, isSelectable } from '../../utils/itemOptions.js';
import { t } from '../../i18n/index.js';

/**
 * Choose sizes, extras and a note before adding an item to the cart.
 *
 * Radio buttons when a group allows one choice, checkboxes otherwise; a group
 * at its maximum disables its remaining boxes. The running price is a preview:
 * the server recomputes the real one and re-checks every rule.
 */
const props = defineProps({
  open: { type: Boolean, default: false },
  item: { type: Object, default: null },
  adding: { type: Boolean, default: false },
});
const emit = defineEmits(['cancel', 'confirm']);

const NOTE_MAX = 200;
const dialogRef = ref(null);
const selected = ref(new Set());
const note = ref('');
const quantity = ref(1);

const groups = computed(() => props.item?.optionGroups ?? []);
const problems = computed(() => groupProblems(groups.value, selected.value));
const valid = computed(() => Object.keys(problems.value).length === 0);
const unitPrice = computed(() => previewUnitPrice(props.item?.price, groups.value, selected.value));
const countIn = (g) => g.options.filter((o) => selected.value.has(o.id)).length;
const single = (g) => g.maxSelect === 1;

watch(() => props.open, (open) => {
  if (!open) return;
  selected.value = new Set();
  note.value = '';
  quantity.value = 1;
});

function toggle(g, option) {
  const next = new Set(selected.value);
  if (single(g)) {
    g.options.forEach((o) => next.delete(o.id));
    next.add(option.id);
  } else if (next.has(option.id)) {
    next.delete(option.id);
  } else if (countIn(g) < g.maxSelect) {
    next.add(option.id);
  }
  selected.value = next;
}

const rule = (g) => {
  if (g.minSelect === 1 && g.maxSelect === 1) return t('Choose 1 (required)');
  if (g.minSelect === 0) return t('Choose up to {max} (optional)', { max: g.maxSelect });
  if (g.minSelect === g.maxSelect) return t('Choose {min} (required)', { min: g.minSelect });
  return t('Choose {min} to {max} (required)', { min: g.minSelect, max: g.maxSelect });
};

function confirm() {
  if (!valid.value) return;
  emit('confirm', {
    optionIds: [...selected.value],
    notes: note.value.trim() || null,
    quantity: quantity.value,
  });
}

useFocusTrap(dialogRef, () => props.open, () => emit('cancel'));
</script>

<template>
  <div v-if="open && item" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
       @click.self="emit('cancel')">
    <div ref="dialogRef" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="options-title"
         class="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-surface p-5 shadow-2xl sm:p-6">
      <h2 id="options-title" class="text-lg font-semibold text-slate-900">{{ item.name }}</h2>
      <p v-if="item.description" class="mt-1 text-sm text-slate-600">{{ item.description }}</p>

      <form class="mt-4 space-y-5" novalidate @submit.prevent="confirm">
        <fieldset v-for="g in groups" :key="g.id" :data-group="g.name">
          <legend class="flex w-full items-baseline justify-between gap-2">
            <span class="font-medium text-slate-900">{{ g.name }}</span>
            <span class="text-xs" :class="problems[g.id] ? 'text-red-700' : 'text-slate-500'">{{ rule(g) }}</span>
          </legend>
          <ul class="mt-2 space-y-1">
            <li v-for="o in g.options" :key="o.id">
              <label class="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                     :class="isSelectable(o) ? 'cursor-pointer' : 'bg-slate-50 text-slate-500'">
                <span class="flex items-center gap-2">
                  <input :type="single(g) ? 'radio' : 'checkbox'" :name="`group-${g.id}`"
                         :checked="selected.has(o.id)"
                         :disabled="!isSelectable(o) || (!single(g) && !selected.has(o.id) && countIn(g) >= g.maxSelect)"
                         @change="toggle(g, o)">
                  <span>{{ o.name }}</span>
                  <span v-if="!isSelectable(o)" class="text-xs">({{ t('Unavailable') }})</span>
                </span>
                <span v-if="Number(o.priceDelta) > 0" class="text-slate-700">+{{ formatMoney(o.priceDelta) }}</span>
              </label>
            </li>
          </ul>
        </fieldset>

        <div>
          <label for="line-note" class="field-label">{{ t('Note for the kitchen (optional)') }}</label>
          <textarea id="line-note" v-model="note" rows="2" :maxlength="NOTE_MAX" class="field-input"
                    :placeholder="t('For example: no onions')" />
          <p class="mt-1 text-end text-xs text-slate-500">{{ note.length }}/{{ NOTE_MAX }}</p>
        </div>

        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <button type="button" class="ui-control rounded-lg border border-slate-300 px-3 py-1" :disabled="quantity <= 1"
                    :aria-label="t('Decrease quantity of {name}', { name: item.name })" @click="quantity -= 1">
&minus;
</button>
            <span class="w-6 text-center tabular-nums" aria-live="polite">{{ quantity }}</span>
            <button type="button" class="ui-control rounded-lg border border-slate-300 px-3 py-1" :disabled="quantity >= 20"
                    :aria-label="t('Increase quantity of {name}', { name: item.name })" @click="quantity += 1">
+
</button>
          </div>
          <p class="text-sm text-slate-600">
            {{ t('{price} each', { price: formatMoney(unitPrice) }) }}
          </p>
        </div>

        <p v-if="!valid" class="text-sm text-red-700" role="alert">
          {{ t('Make the required choices to continue.') }}
        </p>

        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AppButton variant="secondary" @click="emit('cancel')">{{ t('Cancel') }}</AppButton>
          <AppButton type="submit" :loading="adding" :disabled="!valid">
            {{ t('Add to cart') }} &middot; {{ formatMoney(previewLineTotal(unitPrice, quantity)) }}
          </AppButton>
        </div>
      </form>
    </div>
  </div>
</template>
