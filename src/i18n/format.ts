// Latin-digit number and unit formatters. The ONLY file allowed to build an Intl.NumberFormat.
// Every displayed number goes through here, so Devanagari digits can never appear (AC-L1.2).

const NBSP = '\u00A0';

const formatters = new Map<number, Intl.NumberFormat>();

function formatterFor(decimals: 0 | 1 | 2 | 3): Intl.NumberFormat {
  let f = formatters.get(decimals);
  if (!f) {
    f = new Intl.NumberFormat('en-IN', {
      numberingSystem: 'latn',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    formatters.set(decimals, f);
  }
  return f;
}

export function formatNumber(value: number, decimals: 0 | 1 | 2 | 3 = 0): string {
  if (!Number.isFinite(value)) return '—';
  return formatterFor(decimals).format(value);
}

export function formatKg(value: number, decimals: 0 | 1 | 2 | 3 = 2): string {
  return `${formatNumber(value, decimals)}${NBSP}kg`;
}

export function formatLitres(value: number, decimals: 0 | 1 | 2 = 0): string {
  return `${formatNumber(value, decimals)}${NBSP}L`;
}

export function formatInr(value: number, decimals: 0 | 1 | 2 = 2): string {
  return `₹${formatNumber(value, decimals)}`;
}

export function formatInrPerKg(value: number): string {
  return `₹${formatNumber(value, 2)}/kg`;
}

export function formatPct(value: number, decimals: 0 | 1 | 2 = 0): string {
  return `${formatNumber(value, decimals)}%`;
}

export function formatQty(value: number, unit: string, decimals: 0 | 1 | 2 = 0): string {
  return `${formatNumber(value, decimals)}${NBSP}${unit}`;
}

/** Digits needed to show a value without trailing noise: 8 -> 0, 6.5 -> 1, 6.25 -> 2. */
export function naturalDecimals(value: number): 0 | 1 | 2 {
  if (Number.isInteger(value)) return 0;
  return Math.abs(value * 10 - Math.round(value * 10)) < 1e-9 ? 1 : 2;
}

/** ISO date `2026-10-13` -> `13-10-26` for the dot-matrix status line. */
export function formatDateShort(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}-${m[2]}-${m[1].slice(2)}`;
}

/** Maps Devanagari digits (U+0966–U+096F) to Latin digits so a Hindi keyboard still enters valid numbers. */
export function toLatinDigits(text: string): string {
  return text.replace(/[\u0966-\u096F]/g, (ch) => String(ch.charCodeAt(0) - 0x0966));
}

/** Parses a user-typed decimal ("6.5", "6,5", Devanagari digits). Returns NaN when empty or invalid. */
export function parseDecimal(text: string): number {
  const cleaned = toLatinDigits(text).trim().replace(',', '.');
  if (cleaned === '' || !/^\d*\.?\d*$/.test(cleaned) || cleaned === '.') return Number.NaN;
  return Number(cleaned);
}
