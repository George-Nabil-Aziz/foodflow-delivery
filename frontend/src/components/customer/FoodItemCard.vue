<script setup>
import { formatMoney } from '../../utils/money.js';
import { tileClass } from '../../utils/cuisine.js';
import { t } from '../../i18n/index.js';
import AppButton from '../shared/AppButton.vue';
import FavouriteButton from './FavouriteButton.vue';

defineProps({
  item: { type: Object, required: true },
  restaurantOrderable: { type: Boolean, default: true },
  // False when the restaurant does not deliver to the customer's address.
  deliverable: { type: Boolean, default: true },
  adding: { type: Boolean, default: false },
});
defineEmits(['add']);
</script>

<template>
  <!--
    An unavailable item is marked by a muted background, never by fading the
    card. `opacity-70` dimmed the very sentence explaining why the item cannot
    be ordered to below the AA contrast floor, so the people most reliant on
    that sentence were the least able to read it.
  -->
  <div class="card flex items-start gap-4 p-4 transition-shadow hover:shadow-raised"
       :class="!item.isAvailable ? 'bg-slate-50' : ''">
    <!-- A photo when there is one; otherwise a tinted tile with the initial. -->
    <img v-if="item.imageUrl" :src="item.imageUrl" alt=""
         class="h-20 w-20 shrink-0 rounded-xl object-cover">
    <div v-else :class="`${tileClass(item.name)} flex h-20 w-20 shrink-0 items-center justify-center rounded-xl text-2xl font-bold`"
         aria-hidden="true">
      {{ item.name.charAt(0) }}
    </div>

    <div class="min-w-0 flex-1">
      <div class="flex items-start justify-between gap-2">
        <h4 class="font-semibold text-slate-900">{{ item.name }}</h4>
        <!-- Only a signed-in customer's menu carries the flag (spec-16). -->
        <FavouriteButton v-if="item.isFavourite !== undefined" kind="item" :id="item.id"
                         :name="item.name" :favourite="item.isFavourite" />
      </div>
      <p v-if="item.description" class="mt-1 text-sm text-slate-600">{{ item.description }}</p>

      <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p class="rounded-full bg-brand-50 px-2.5 py-0.5 text-sm font-bold text-brand-800">
          {{ formatMoney(item.price) }}
        </p>
        <AppButton size="sm" :loading="adding"
                   :disabled="!item.isAvailable || !restaurantOrderable || !deliverable"
                   :aria-label="!item.isAvailable
                     ? t('{name} is unavailable', { name: item.name })
                     : t('Add {name} to cart', { name: item.name })"
                   @click="$emit('add', item)">
          <span aria-hidden="true">+</span> {{ item.optionGroups?.length ? t('Choose options') : t('Add') }}
        </AppButton>
      </div>
      <p v-if="item.optionGroups?.length && item.isAvailable" class="mt-1 text-xs text-slate-600">
        {{ t('Sizes, extras or notes available') }}
      </p>

      <!--
        Unavailability is stated as text, not implied by styling. The disabled
        control carries an accessible explanation.
      -->
      <p v-if="!item.isAvailable" class="mt-2 text-sm font-medium text-slate-700">
        {{ t('Unavailable') }}
      </p>
      <p v-else-if="!restaurantOrderable" class="mt-2 text-sm text-slate-600">
        {{ t('This restaurant is not taking orders right now') }}
      </p>
      <p v-else-if="!deliverable" class="mt-2 text-sm font-medium text-rose-800">
        {{ t("Doesn't deliver to your address") }}
      </p>
    </div>
  </div>
</template>
