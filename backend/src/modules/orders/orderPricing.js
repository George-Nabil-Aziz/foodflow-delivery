import { money } from '../../shared/money.js';

/**
 * Order pricing (BR-O3). Pure, so the arithmetic is checkable by hand:
 *
 *   line_total = unit_price x quantity
 *   subtotal   = sum(line_total)
 *   discount   = see discountAmountFor, never above the subtotal
 *   tax        = round((subtotal - discount) x rate, 2)   half-up, applied once
 *   total      = subtotal - discount + delivery_fee + tax
 *
 * Tax applies to the discounted subtotal only, not the delivery fee
 * (assumption A-03): the customer is taxed on what they actually pay for the
 * food. A discount never reduces the delivery fee.
 */
export function priceLines(lines) {
  return lines.map((line) => ({
    ...line,
    lineTotal: money.multiply(line.unitPrice, line.quantity),
  }));
}

/**
 * The discount a code gives on a subtotal (BR-DC4). PERCENT is rounded half-up
 * and capped by `maxDiscount` when set; FIXED is its value. Either way it is
 * clamped to the subtotal, so an order never goes below zero.
 *
 * @param {string} subtotal
 * @param {{ type: 'PERCENT'|'FIXED', value: string, maxDiscount?: string|null }|null} discount
 */
export function discountAmountFor(subtotal, discount) {
  if (!discount) return money.ZERO;
  let amount = discount.type === 'PERCENT'
    ? money.percentOf(subtotal, discount.value)
    : money.format(discount.value);
  if (discount.type === 'PERCENT' && discount.maxDiscount != null) {
    amount = money.min(amount, discount.maxDiscount);
  }
  return money.min(amount, subtotal);
}

export function computeTotals({ lines, deliveryFee, taxRate, discount = null }) {
  const priced = priceLines(lines);
  const subtotal = priced.length ? money.sum(priced.map((l) => l.lineTotal)) : money.ZERO;
  const fee = money.format(deliveryFee ?? money.ZERO);
  const discountAmount = discountAmountFor(subtotal, discount);
  const taxable = money.subtract(subtotal, discountAmount);
  const taxAmount = money.roundTax(taxable, taxRate);
  const totalAmount = money.add(money.add(taxable, fee), taxAmount);
  return { lines: priced, subtotal, discountAmount, deliveryFee: fee, taxAmount, totalAmount };
}

/** The restaurant minimum is checked on the PRE-discount subtotal (BR-DC5). */
export function meetsMinimum(subtotal, minimumOrderAmount) {
  return money.compare(subtotal, money.format(minimumOrderAmount ?? money.ZERO)) >= 0;
}

export function shortfall(subtotal, minimumOrderAmount) {
  const min = money.format(minimumOrderAmount ?? money.ZERO);
  return money.compare(subtotal, min) >= 0 ? money.ZERO : money.subtract(min, subtotal);
}
