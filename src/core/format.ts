import { D, type DecimalSource } from './bignum.ts';

/** Short-scale suffixes: 10^3, 10^6, … 10^99. */
const SUFFIXES = [
  '', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No',
  'Dc', 'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc', 'SxDc', 'SpDc', 'OcDc', 'NoDc',
  'Vg', 'UVg', 'DVg', 'TVg', 'QaVg', 'QiVg', 'SxVg', 'SpVg', 'OcVg', 'NoVg',
  'Tg', 'UTg', 'DTg',
];

function trimDigits(x: number): string {
  // Three significant digits: 1.23, 12.3, 123.
  if (x >= 100) return Math.floor(x).toString();
  if (x >= 10) return (Math.floor(x * 10) / 10).toFixed(1).replace(/\.0$/, '');
  return (Math.floor(x * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
}

/**
 * 1234 → "1.23K", 4.5e15 → "4.5Qa", beyond the suffix table → "1.23e105".
 * Values below 1000 keep up to one decimal when not integral.
 */
export function formatNumber(value: DecimalSource): string {
  const d = D(value);
  if (d.lt(0)) return '-' + formatNumber(d.neg());
  if (d.eq(0)) return '0';
  if (d.lt(1000)) {
    const n = d.toNumber();
    if (n < 10 && !Number.isInteger(n)) return (Math.floor(n * 10) / 10).toFixed(1).replace(/\.0$/, '');
    return Math.floor(n).toString();
  }
  const exp = Math.floor(d.log10() + 1e-9);
  const group = Math.floor(exp / 3);
  if (group < SUFFIXES.length) {
    const mantissa = d.div(D(10).pow(group * 3)).toNumber();
    return trimDigits(mantissa) + SUFFIXES[group];
  }
  const m = d.div(D(10).pow(exp)).toNumber();
  return `${trimDigits(m)}e${exp}`;
}

export function formatMoney(value: DecimalSource): string {
  return '$' + formatNumber(value);
}

/** Integer counts: 1,234 below a million, short scale above. */
export function formatCount(n: number): string {
  if (n < 1e6) return Math.floor(n).toLocaleString('en-US');
  return formatNumber(n);
}

/** Seconds → "1:05:09" / "5:09" / "9 秒". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  if (m > 0) return `${m}:${String(sec).padStart(2, '0')}`;
  return `${sec} 秒`;
}
