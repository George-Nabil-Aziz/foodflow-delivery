<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

/**
 * The list filter: a button that opens a styled list of choices, each with how
 * many rows it would show. A native <select> cannot style its open list or put
 * a count beside an option, so this is a listbox built to the ARIA pattern:
 * arrows move, Enter/Space choose, Escape and Tab close, a click outside closes.
 *
 * options: [{ value, label, count? }] in order; { heading } starts a group.
 */
const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, required: true },
});
const emit = defineEmits(['update:modelValue']);

const open = ref(false);
const active = ref(-1);
const root = ref(null);
const list = ref(null);

const choices = computed(() => props.options.filter((o) => !('heading' in o)));
const same = (a, b) => String(a) === String(b);
const selected = computed(() => choices.value.find((o) => same(o.value, props.modelValue)) ?? choices.value[0]);
const optionId = (o) => `${props.id}-opt-${String(o.value) || 'all'}`;

function scrollActiveIntoView() {
  nextTick(() => {
    list.value?.querySelector(`[data-index="${active.value}"]`)?.scrollIntoView({ block: 'nearest' });
  });
}

async function show() {
  open.value = true;
  active.value = Math.max(0, choices.value.indexOf(selected.value));
  await nextTick();
  list.value?.focus();
  scrollActiveIntoView();
}

function hide(refocus = true) {
  open.value = false;
  if (refocus) root.value?.querySelector('button')?.focus();
}

function choose(option) {
  if (!same(option.value, props.modelValue)) emit('update:modelValue', option.value);
  hide();
}

function move(delta) {
  const n = choices.value.length;
  active.value = (active.value + delta + n) % n;
  scrollActiveIntoView();
}

function onListKey(event) {
  const keys = {
    ArrowDown: () => move(1),
    ArrowUp: () => move(-1),
    Home: () => { active.value = 0; scrollActiveIntoView(); },
    End: () => { active.value = choices.value.length - 1; scrollActiveIntoView(); },
    Enter: () => choose(choices.value[active.value]),
    ' ': () => choose(choices.value[active.value]),
    Escape: () => hide(),
    Tab: () => hide(false),
  };
  if (!keys[event.key]) return;
  if (event.key !== 'Tab') event.preventDefault();
  keys[event.key]();
}

function onButtonKey(event) {
  if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
    event.preventDefault();
    show();
  }
}

function onOutside(event) {
  if (open.value && root.value && !root.value.contains(event.target)) hide(false);
}
watch(open, (isOpen) => {
  if (isOpen) document.addEventListener('pointerdown', onOutside);
  else document.removeEventListener('pointerdown', onOutside);
});
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside));
</script>

<template>
  <div ref="root" class="relative min-w-0 shrink-0">
    <!-- Named for assistive tech; the button reads "Status, Active (12)". -->
    <span :id="`${id}-label`" class="sr-only">{{ label }}</span>
    <button :id="id" type="button"
            class="ui-control field-input flex w-full items-center gap-2 text-start md:w-auto md:min-w-40"
            aria-haspopup="listbox" :aria-expanded="open" :aria-labelledby="`${id}-label ${id}`"
            @click="open ? hide() : show()" @keydown="onButtonKey">
      <span class="min-w-0 flex-1 truncate">{{ selected?.label }}</span>
      <span v-if="selected?.count != null" class="shrink-0 text-slate-500">({{ selected.count }})</span>
      <svg class="h-4 w-4 shrink-0 text-slate-500 transition-transform" :class="{ 'rotate-180': open }"
           viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
           stroke-linejoin="round" aria-hidden="true">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>

    <Transition enter-active-class="transition duration-100 ease-out" enter-from-class="opacity-0 -translate-y-1"
                leave-active-class="transition duration-75 ease-in" leave-to-class="opacity-0 -translate-y-1">
      <ul v-if="open" ref="list" role="listbox" tabindex="-1" :aria-labelledby="`${id}-label`"
          :aria-activedescendant="choices[active] ? optionId(choices[active]) : undefined"
          class="absolute start-0 z-30 mt-1 max-h-72 w-max min-w-full max-w-[min(20rem,90vw)] overflow-y-auto rounded-xl
                 border border-slate-200 bg-surface p-1 text-sm shadow-lg focus:outline-none"
          @keydown="onListKey">
        <template v-for="o in options" :key="'heading' in o ? `h-${o.heading}` : optionId(o)">
          <li v-if="'heading' in o" role="presentation"
              class="mt-1 border-t border-slate-200 px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {{ o.heading }}
          </li>
          <li v-else :id="optionId(o)" role="option" :data-index="choices.indexOf(o)"
              :aria-selected="same(o.value, modelValue)"
              class="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2"
              :class="[
                choices.indexOf(o) === active ? 'bg-slate-100' : '',
                same(o.value, modelValue) ? 'font-medium text-brand-700' : 'text-slate-700',
              ]"
              @click="choose(o)" @mousemove="active = choices.indexOf(o)">
            <svg class="h-4 w-4 shrink-0" :class="same(o.value, modelValue) ? '' : 'invisible'"
                 viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
                 stroke-linejoin="round" aria-hidden="true">
              <path d="M5 12l5 5L20 7" />
            </svg>
            <span class="flex-1 whitespace-nowrap">{{ o.label }}</span>
            <span v-if="o.count != null" class="ms-3 tabular-nums text-slate-500">({{ o.count }})</span>
          </li>
        </template>
      </ul>
    </Transition>
  </div>
</template>
