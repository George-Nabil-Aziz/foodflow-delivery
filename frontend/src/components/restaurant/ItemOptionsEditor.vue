<script setup>
import { onMounted, reactive, ref, watch } from 'vue';
import { restaurantApi } from '../../services/api.js';
import { useUiStore } from '../../stores/ui.store.js';
import { formatMoney } from '../../utils/money.js';
import { t } from '../../i18n/index.js';
import AppButton from '../shared/AppButton.vue';

/**
 * The owner's editor for one item's option groups (spec-15): create, edit,
 * reorder, delete, and switch single options on and off. Every change goes to
 * the server and the group it returns replaces the local copy, so what is shown
 * is always what the server holds.
 */
const props = defineProps({ item: { type: Object, required: true } });
const emit = defineEmits(['changed']);

const ui = useUiStore();
const groups = ref([]);
const loading = ref(true);
const busy = ref(false);

const blankGroup = () => ({ name: '', minSelect: 0, maxSelect: 1, optionsText: '' });
const newGroup = ref(blankGroup());
const showNewGroup = ref(false);
// groupId -> draft for a new option in that group, created as groups arrive.
const drafts = reactive({});
watch(groups, (list) => {
  for (const g of list) drafts[g.id] ??= { name: '', priceDelta: '' };
}, { immediate: true });

async function load() {
  loading.value = true;
  try {
    groups.value = (await restaurantApi.optionGroups(props.item.id)).data;
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    loading.value = false;
  }
}
onMounted(load);

/** Runs one change; `apply` receives the response data. Failures name the server's reason. */
async function run(fn, apply) {
  busy.value = true;
  try {
    const res = await fn();
    apply?.(res?.data);
    emit('changed');
  } catch (err) {
    ui.toastError(err.details?.[0]?.issue ?? err.message);
  } finally {
    busy.value = false;
  }
}

const replaceGroup = (group) => {
  groups.value = groups.value.map((g) => (g.id === group.id ? group : g));
};

/** "Cheese 5.00" per line; the price is optional and defaults to 0.00. */
function parseOptions(text) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const m = line.match(/^(.*?)(?:\s+(\d+(?:\.\d{1,2})?))?$/);
    return { name: m[1].trim(), priceDelta: m[2] ?? '0.00' };
  });
}

async function createGroup() {
  const g = newGroup.value;
  await run(
    () => restaurantApi.createOptionGroup(props.item.id, {
      name: g.name, minSelect: Number(g.minSelect), maxSelect: Number(g.maxSelect),
      displayOrder: groups.value.length, options: parseOptions(g.optionsText),
    }),
    (group) => {
      groups.value = [...groups.value, group];
      newGroup.value = blankGroup();
      showNewGroup.value = false;
    },
  );
}

const saveGroup = (g) => run(
  () => restaurantApi.updateOptionGroup(g.id, {
    name: g.name, minSelect: Number(g.minSelect), maxSelect: Number(g.maxSelect),
  }),
  replaceGroup,
).then(load);

const removeGroup = (g) => run(
  () => restaurantApi.deleteOptionGroup(g.id),
  () => { groups.value = groups.value.filter((x) => x.id !== g.id); },
);

function moveGroup(index, delta) {
  const next = [...groups.value];
  const [moved] = next.splice(index, 1);
  next.splice(index + delta, 0, moved);
  return run(
    () => restaurantApi.reorderOptionGroups(props.item.id, next.map((g, i) => ({ id: g.id, displayOrder: i }))),
    (data) => { groups.value = data; },
  );
}

function moveOption(g, index, delta) {
  const next = [...g.options];
  const [moved] = next.splice(index, 1);
  next.splice(index + delta, 0, moved);
  return run(
    () => restaurantApi.reorderOptions(g.id, next.map((o, i) => ({ id: o.id, displayOrder: i }))),
    replaceGroup,
  );
}

const addOption = (g) => {
  const draft = drafts[g.id];
  return run(
    () => restaurantApi.createOption(g.id, { name: draft.name, priceDelta: draft.priceDelta || '0.00' }),
    (group) => { replaceGroup(group); drafts[g.id] = { name: '', priceDelta: '' }; },
  );
};

const saveOption = (o) => run(
  () => restaurantApi.updateOption(o.id, { name: o.name, priceDelta: String(o.priceDelta) }),
  replaceGroup,
);

// Not optimistic: a refusal would otherwise flip the box back under the user's cursor.
const toggleOption = (o) => run(
  () => restaurantApi.setOptionAvailability(o.id, !o.isAvailable),
  replaceGroup,
);

const removeOption = (o) => run(() => restaurantApi.deleteOption(o.id), replaceGroup);
</script>

<template>
  <div class="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3" :aria-label="t('Options for {name}', { name: item.name })">
    <p v-if="loading" class="text-sm text-slate-600">{{ t('Loading...') }}</p>

    <template v-else>
      <p v-if="groups.length === 0" class="text-sm text-slate-600">
        {{ t('No options yet. Add a group such as Size or Extras.') }}
      </p>

      <section v-for="(g, gi) in groups" :key="g.id" class="mb-3 rounded-lg border border-slate-200 bg-white p-3" :data-group="g.name">
        <div class="flex flex-wrap items-end gap-2">
          <div>
            <label :for="`g-name-${g.id}`" class="field-label">{{ t('Group name') }}</label>
            <input :id="`g-name-${g.id}`" v-model="g.name" class="field-input" maxlength="60">
          </div>
          <div>
            <label :for="`g-min-${g.id}`" class="field-label">{{ t('Min') }}</label>
            <input :id="`g-min-${g.id}`" v-model="g.minSelect" type="number" min="0" max="20" class="field-input w-20">
          </div>
          <div>
            <label :for="`g-max-${g.id}`" class="field-label">{{ t('Max') }}</label>
            <input :id="`g-max-${g.id}`" v-model="g.maxSelect" type="number" min="1" max="20" class="field-input w-20">
          </div>
          <AppButton size="sm" :disabled="busy" @click="saveGroup(g)">{{ t('Save group') }}</AppButton>
          <button type="button" class="action-link text-sm" :disabled="busy || gi === 0"
                  :aria-label="t('Move group up')" @click="moveGroup(gi, -1)">
&uarr;
</button>
          <button type="button" class="action-link text-sm" :disabled="busy || gi === groups.length - 1"
                  :aria-label="t('Move group down')" @click="moveGroup(gi, 1)">
&darr;
</button>
          <button type="button" class="action-link text-sm text-red-700" :disabled="busy" @click="removeGroup(g)">
            {{ t('Delete group') }}
          </button>
        </div>
        <p class="mt-1 text-xs text-slate-600">
          {{ g.minSelect >= 1 ? t('Required') : t('Optional') }}
        </p>

        <ul class="mt-2 space-y-1">
          <li v-for="(o, oi) in g.options" :key="o.id" class="flex flex-wrap items-center gap-2 text-sm">
            <input v-model="o.name" class="field-input w-40" maxlength="60" :aria-label="t('Option name')">
            <input v-model="o.priceDelta" class="field-input w-24" inputmode="decimal" :aria-label="t('Extra price')">
            <span class="text-xs text-slate-500">{{ formatMoney(o.priceDelta) }}</span>
            <button type="button" class="action-link text-brand-700" :disabled="busy" @click="saveOption(o)">{{ t('Save') }}</button>
            <label class="flex items-center gap-1">
              <input type="checkbox" :checked="o.isAvailable" :disabled="busy"
                     :aria-label="o.isAvailable ? t('{name} is available', { name: o.name }) : t('{name} is unavailable', { name: o.name })"
                     @change="toggleOption(o)">
              {{ o.isAvailable ? t('Available') : t('Unavailable') }}
            </label>
            <button type="button" class="action-link" :disabled="busy || oi === 0" :aria-label="t('Move option up')" @click="moveOption(g, oi, -1)">&uarr;</button>
            <button type="button" class="action-link" :disabled="busy || oi === g.options.length - 1" :aria-label="t('Move option down')" @click="moveOption(g, oi, 1)">&darr;</button>
            <button type="button" class="action-link text-red-700" :disabled="busy" @click="removeOption(o)">{{ t('Delete') }}</button>
          </li>
        </ul>

        <form class="mt-2 flex flex-wrap items-end gap-2" @submit.prevent="addOption(g)">
          <input v-model="drafts[g.id].name" class="field-input w-40" maxlength="60" :placeholder="t('New option')"
                 :aria-label="t('New option')">
          <input v-model="drafts[g.id].priceDelta" class="field-input w-24" inputmode="decimal" placeholder="0.00"
                 :aria-label="t('Extra price')">
          <AppButton type="submit" size="sm" variant="secondary" :disabled="busy">{{ t('Add option') }}</AppButton>
        </form>
      </section>

      <AppButton v-if="!showNewGroup" size="sm" variant="secondary" @click="showNewGroup = true">
        {{ t('Add option group') }}
      </AppButton>

      <form v-else class="rounded-lg border border-slate-200 bg-white p-3" @submit.prevent="createGroup">
        <div class="flex flex-wrap items-end gap-2">
          <div>
            <label for="ng-name" class="field-label">{{ t('Group name') }}</label>
            <input id="ng-name" v-model="newGroup.name" class="field-input" maxlength="60" placeholder="Size">
          </div>
          <div>
            <label for="ng-min" class="field-label">{{ t('Min') }}</label>
            <input id="ng-min" v-model="newGroup.minSelect" type="number" min="0" max="20" class="field-input w-20">
          </div>
          <div>
            <label for="ng-max" class="field-label">{{ t('Max') }}</label>
            <input id="ng-max" v-model="newGroup.maxSelect" type="number" min="1" max="20" class="field-input w-20">
          </div>
        </div>
        <label for="ng-options" class="field-label mt-2">{{ t('Options, one per line, with an optional extra price') }}</label>
        <textarea id="ng-options" v-model="newGroup.optionsText" rows="4" class="field-input"
                  placeholder="Regular&#10;Large 12.50" />
        <p class="mt-1 text-xs text-slate-600">{{ t('Min 1 makes the group required. Max 1 means choose one.') }}</p>
        <div class="mt-2 flex gap-2">
          <AppButton type="submit" size="sm" :loading="busy">{{ t('Add option group') }}</AppButton>
          <AppButton size="sm" variant="secondary" @click="showNewGroup = false">{{ t('Cancel') }}</AppButton>
        </div>
      </form>
    </template>
  </div>
</template>
