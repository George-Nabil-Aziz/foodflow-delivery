import { money } from '../../shared/money.js';

/**
 * Order pricing (BR-O3). Pure, so the arithmetic is checkable by hand:
 *
 *   line_total = unit_price x quantity
 *   subtotal   = sum(line_total)
 *   tax        = round(subtotal x rate, 2)   half-up, applied once
 *   total      = subtotal + delivery_fee + tax
 *
 * Tax applies to the subtotal only, not the delivery fee (assumption A-03).
 */
export function priceLines(lines) {
  return lines.map((line) => ({
    ...line,
    lineTotal: money.multiply(line.unitPrice, line.quantity),
  }));
}

export function computeTotals({ lines, deliveryFee, taxRate }) {
  const priced = priceLines(lines);
  const subtotal = priced.length ? money.sum(priced.map((l) => l.lineTotal)) : money.ZERO;
  const fee = money.format(deliveryFee ?? money.ZERO);
  const taxAmount = money.roundTax(subtotal, taxRate);
  const totalAmount = money.add(money.add(subtotal, fee), taxAmount);
  return { lines: priced, subtotal, deliveryFee: fee, taxAmount, totalAmount };
}

export function meetsMinimum(subtotal, minimumOrderAmount) {
  return money.compare(subtotal, money.format(minimumOrderAmount ?? money.ZERO)) >= 0;
}

export function shortfall(subtotal, minimumOrderAmount) {
  const min = money.format(minimumOrderAmount ?? money.ZERO);
  return money.compare(subtotal, min) >= 0 ? money.ZERO : money.subtract(min, subtotal);
}
