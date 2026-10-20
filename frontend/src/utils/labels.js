import { t } from '../i18n/index.js';

/** "cancelled" -> "Cancelled". Arabic has no case, so it passes through unchanged. */
export const capitalize = (text) => (text ? text.charAt(0).toLocaleUpperCase() + text.slice(1) : text);

/**
 * An enum as a label: "READY_FOR_PICKUP" -> "Ready for pickup", translated in
 * Arabic. The catalogue is keyed by the lower-case phrase ("ready for pickup").
 */
export const enumText = (value) => capitalize(t(value.replaceAll('_', ' ').toLowerCase()));

/**
 * An enum whose catalogue key is the raw value ("CUSTOMER", "ACTIVE"):
 * "Customer" in English, the catalogue's word in Arabic.
 */
export const rawEnumText = (value) => capitalize(t(value).toLowerCase());
