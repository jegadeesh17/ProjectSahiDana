// Pure display-rounding rules for the herd plan (SPEC C4.1 "Display units"): numbers in, numbers out.
// Strings are still built only by src/i18n/format.ts. The audit drawer always gets the exact value.

/** Mineral mix and common salt are shown in grams, never in kg. */
export const GRAM_FEED_IDS: readonly string[] = ['mineral_mix', 'common_salt'];

/** A line is shown when its exact amount is above this many kg. */
export const SHOW_AMOUNT_MIN_KG = 1e-6;

export function isShownAmount(kg: number): boolean {
  return kg > SHOW_AMOUNT_MIN_KG;
}

/** Whole rupees, nearest; -0 becomes 0. */
export function roundInrWhole(v: number): number {
  const r = Math.round(v);
  return r === 0 ? 0 : r;
}

/** Rounded up to a whole rupee. Only for the X in the two budget prompts. */
export function roundUpInrWhole(v: number): number {
  return Math.max(0, Math.ceil(v - 1e-7));
}

/** kg to 1 decimal place, half up. */
export function roundKg1(kg: number): number {
  return Math.round(kg * 10 + 1e-9) / 10;
}

/** kg to whole grams. */
export function toGrams(kg: number): number {
  return Math.round(kg * 1000);
}

/** Milk is rounded down to 0.1 L, like S in the solver. */
export function floorMilk1(l: number): number {
  return Math.floor(l * 10 + 1e-7) / 10;
}

export interface DisplayAmount {
  value: number;
  unit: 'kg' | 'g';
  decimals: 0 | 1;
}

/** Grams (0 dp) for mineral mix and salt, otherwise kg (1 dp). */
export function displayAmount(feedId: string, kg: number): DisplayAmount {
  if (GRAM_FEED_IDS.includes(feedId)) return { value: toGrams(kg), unit: 'g', decimals: 0 };
  return { value: roundKg1(kg), unit: 'kg', decimals: 1 };
}
