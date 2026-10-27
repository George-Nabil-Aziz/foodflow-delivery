<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { adminApi } from '../../services/api.js';
import { useUiStore } from '../../stores/ui.store.js';
import { rules, validate } from '../../composables/useValidation.js';
import { t } from '../../i18n/index.js';
import AppButton from '../../components/shared/AppButton.vue';
import AppInput from '../../components/shared/AppInput.vue';
import AppSpinner from '../../components/shared/AppSpinner.vue';

/**
 * "Add a discount code" and "Edit a discount code": one page for both. The code
 * itself is fixed once created, because customers and past orders know it by
 * name; everything else can change, and changes never touch orders already
 * placed (they keep their own snapshot).
 */
const props = defineProps({ id: { type: String, default: null } });

const router = useRouter();
const ui = useUiStore();
const isEdit = computed(() => Boolean(props.id));
const loading = ref(isEdit.value);
const saving = ref(false);
const errors = ref({});
const restaurants = ref([]);

const blank = () => ({
  code: '', description: '', type: 'PERCENT', value: '', maxDiscountAmount: '', minSubtotal: '',
  restaurantId: '', startsAt: '', endsAt: '', usageLimit: '', perCustomerLimit: '',
});
const form = ref(blank());
const isPercent = computed(() => form.value.type === 'PERCENT');

/** The datetime-local control wants local time without a zone. */
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const toIso = (local) => (local ? new Date(local).toISOString() : null);

onMounted(async () => {
  try {
    const [restaurantRes, codeRes] = await Promise.all([
      adminApi.restaurants({ status: 'ACTIVE', limit: 100 }),
      isEdit.value ? adminApi.discountCode(props.id) : Promise.resolve(null),
    ]);
    restaurants.value = restaurantRes.data;
    if (codeRes) {
      const c = codeRes.data;
      form.value = {
        code: c.code, description: c.description ?? '', type: c.type, value: c.value,
        maxDiscountAmount: c.maxDiscountAmount ?? '', minSubtotal: c.minSubtotal,
        restaurantId: c.restaurant?.id ?? '', startsAt: toLocalInput(c.startsAt), endsAt: toLocalInput(c.endsAt),
        usageLimit: c.usageLimit ?? '', perCustomerLimit: c.perCustomerLimit ?? '',
      };
      // A code scoped to a restaurant that is no longer active stays selectable.
      if (c.restaurant && !restaurants.value.some((r) => r.id === c.restaurant.id)) {
        restaurants.value = [...restaurants.value, { id: c.restaurant.id, name: c.restaurant.name }];
      }
    }
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    loading.value = false;
  }
});

const optional = (rule) => (v) => (String(v ?? '').trim() === '' ? null : rule(v));
const wholeNumber = (v) => (/^\d+$/.test(String(v).trim()) && Number(v) >= 1 ? null : 'Enter a whole number of at least 1');

function payload() {
  const f = form.value;
  const num = (v) => (String(v).trim() === '' ? null : Number(v));
  return {
    description: f.description.trim() || null,
    type: f.type,
    value: Number(f.value),
    maxDiscountAmount: isPercent.value ? num(f.maxDiscountAmount) : null,
    minSubtotal: num(f.minSubtotal) ?? 0,
    restaurantId: f.restaurantId || null,
    startsAt: toIso(f.startsAt),
    endsAt: toIso(f.endsAt),
    usageLimit: num(f.usageLimit),
    perCustomerLimit: num(f.perCustomerLimit),
  };
}

async function save() {
  const f = form.value;
  errors.value = validate(f, {
    ...(isEdit.value ? {} : { code: [rules.required('Code'), (v) => (/^[A-Za-z0-9_-]{3,30}$/.test(String(v).trim()) ? null : 'Use 3-30 letters, digits, dashes or underscores')] }),
    value: [rules.required('Value'), (v) => (Number(v) > 0 ? null : 'Must be greater than 0'),
      (v) => (!isPercent.value || Number(v) <= 100 ? null : 'A percentage cannot be more than 100')],
    maxDiscountAmount: [optional((v) => (Number(v) > 0 ? null : 'Must be greater than 0'))],
    minSubtotal: [optional((v) => (Number(v) >= 0 ? null : 'Cannot be negative'))],
    usageLimit: [optional(wholeNumber)],
    perCustomerLimit: [optional(wholeNumber)],
  });
  if (f.startsAt && f.endsAt && new Date(f.startsAt) >= new Date(f.endsAt)) {
    errors.value = { ...errors.value, endsAt: 'The end must be after the start' };
  }
  if (Object.keys(errors.value).length) return;

  saving.value = true;
  try {
    if (isEdit.value) {
      await adminApi.updateDiscountCode(props.id, payload());
      ui.toastSuccess(t('{code} updated', { code: f.code }));
    } else {
      await adminApi.createDiscountCode({ code: f.code.trim(), ...payload() });
      ui.toastSuccess(t('{code} created', { code: f.code.trim().toUpperCase() }));
    }
    router.push({ name: 'admin-discount-codes' });
  } catch (err) {
    if (err.code === 'CONFLICT') {
      errors.value = { code: 'A discount code with this name already exists.' };
    } else {
      // A server-side field error lands beside its field when it names one.
      const detail = err.details?.[0];
      if (detail?.field && detail.field in form.value) errors.value = { [detail.field]: detail.issue };
      else ui.toastError(detail?.issue ?? err.message);
    }
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="max-w-2xl">
    <h1 class="text-xl font-semibold text-slate-900">
      {{ isEdit ? t('Edit discount code') : t('Add a discount code') }}
    </h1>
    <p class="mt-1 text-sm text-slate-600">
      {{ t('Orders already placed keep the discount they were given, whatever you change here.') }}
    </p>

    <AppSpinner v-if="loading" label="Loading discount code" />

    <form v-else class="card mt-4 space-y-4 p-4" novalidate @submit.prevent="save">
      <AppInput id="dc-code" v-model="form.code" label="Code" required :disabled="isEdit" :error="errors.code"
                :hint="isEdit ? 'A code cannot be renamed.' : 'Customers type this at checkout. Letters, digits, dashes and underscores; not case-sensitive.'" />
      <AppInput id="dc-description" v-model="form.description" label="Description (optional)" :error="errors.description" />

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label for="dc-type" class="field-label">{{ t('Type') }}</label>
          <select id="dc-type" v-model="form.type" class="field-input">
            <option value="PERCENT">{{ t('Percentage of the subtotal') }}</option>
            <option value="FIXED">{{ t('Fixed amount') }}</option>
          </select>
        </div>
        <AppInput id="dc-value" v-model="form.value" :label="isPercent ? 'Percentage' : 'Amount'" required
                  :error="errors.value" />
      </div>

      <AppInput v-if="isPercent" id="dc-max" v-model="form.maxDiscountAmount" label="Maximum discount (optional)"
                :error="errors.maxDiscountAmount" hint="Caps what a percentage can take off one order." />
      <AppInput id="dc-min" v-model="form.minSubtotal" label="Minimum subtotal (optional)" :error="errors.minSubtotal"
                hint="Judged on the items total, before the discount." />

      <div>
        <label for="dc-restaurant" class="field-label">{{ t('Applies to') }}</label>
        <select id="dc-restaurant" v-model="form.restaurantId" class="field-input">
          <option value="">{{ t('All restaurants') }}</option>
          <option v-for="r in restaurants" :key="r.id" :value="r.id">{{ r.name }}</option>
        </select>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label for="dc-starts" class="field-label">{{ t('Starts (optional)') }}</label>
          <input id="dc-starts" v-model="form.startsAt" type="datetime-local" class="field-input">
        </div>
        <div>
          <label for="dc-ends" class="field-label">{{ t('Ends (optional)') }}</label>
          <input id="dc-ends" v-model="form.endsAt" type="datetime-local" class="field-input"
                 :aria-invalid="Boolean(errors.endsAt)">
          <p v-if="errors.endsAt" class="field-error" role="alert">{{ t(errors.endsAt) }}</p>
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <AppInput id="dc-usage" v-model="form.usageLimit" label="Total uses (optional)" :error="errors.usageLimit"
                  hint="Leave empty for no limit." />
        <AppInput id="dc-per-customer" v-model="form.perCustomerLimit" label="Uses per customer (optional)"
                  :error="errors.perCustomerLimit" hint="Leave empty for no limit." />
      </div>

      <AppButton type="submit" :loading="saving">{{ isEdit ? t('Save changes') : t('Create discount code') }}</AppButton>
    </form>

    <RouterLink :to="{ name: 'admin-discount-codes' }" class="action-link mt-6 inline-block text-sm text-brand-700 hover:underline">
      {{ t('Back to discount codes') }}
    </RouterLink>
  </div>
</template>
