import Decimal from 'break_infinity.js';

export { Decimal };
export type DecimalSource = Decimal | number | string;

export const ZERO = new Decimal(0);
export const ONE = new Decimal(1);

export function D(value: DecimalSource): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

export function dmax(a: Decimal, b: Decimal): Decimal {
  return a.gte(b) ? a : b;
}

export function dmin(a: Decimal, b: Decimal): Decimal {
  return a.lte(b) ? a : b;
}

/** log10 that is safe for zero and negative values (returns -Infinity for <= 0). */
export function log10(value: Decimal): number {
  if (value.lte(0)) return Number.NEGATIVE_INFINITY;
  return value.log10();
}
