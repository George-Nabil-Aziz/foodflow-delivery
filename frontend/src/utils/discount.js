import { formatMoney } from './money.js';
import { t } from '../i18n/index.js';

/**
 * The sentence for a discount-code failure, chosen by the server's stable code
 * (never by its message text). Codes carrying figures name them; the rest use
 * the server's own sentence, which the Arabic catalogue knows.
 *
 * `err` is an ApiError, or a cart's `discountIssue` ({ code, message }).
 */
export function discountErrorText(err) {
  const detail = err.details?.[0];
  switch (err.code) {
    case 'DISCOUNT_CODE_INVALID':
      return t('This discount code is not valid.');
    case 'DISCOUNT_CODE_EXPIRED':
      return detail?.startsAt
        ? t('This discount code is not active yet.')
        : t('This discount code has expired.');
    case 'DISCOUNT_CODE_NOT_APPLICABLE':
      return detail?.shortfall
        ? t('Add {amount} more to use this code (minimum {required}).', {
          amount: formatMoney(detail.shortfall), required: formatMoney(detail.required),
        })
        : t('This discount code is for a different restaurant.');
    case 'DISCOUNT_CODE_LIMIT_REACHED':
      return t(detail?.issue ?? err.message);
    default:
      return t(detail?.issue ?? err.message);
  }
}

/** True for a non-zero amount string such as "13.40". */
export const isPositiveAmount = (amount) => Number(amount ?? 0) > 0;
