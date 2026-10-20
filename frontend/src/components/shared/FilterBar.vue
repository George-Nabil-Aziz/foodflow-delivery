<script setup>
import { RouterLink } from 'vue-router';

defineProps({
  // The page's "Add …" action, when it has one, closes the same row.
  addTo: { type: Object, default: null },
  addLabel: { type: String, default: null },
});
</script>

<template>
  <!--
    The one way a list is searched and filtered: a single compact row under the
    page title, no card and no visible labels (each control names itself to
    assistive tech). Search, filters and the Add button share one line, the
    search growing to fill it; they wrap only when they do not fit.
  -->
  <div class="mt-4 flex flex-wrap items-center gap-2">
    <slot />
    <RouterLink v-if="addTo" :to="addTo"
                class="ui-control btn-primary ms-auto inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-primary-hover">
      {{ addLabel }}
    </RouterLink>
  </div>
</template>
