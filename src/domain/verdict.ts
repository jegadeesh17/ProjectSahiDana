// The room-for-improvement verdict as sentences (AC-5.6, 5.7, 5.11, OQ14, OQ15, AC-E7.1).
// One string id per case; the UI fills the {tokens} with tappable figures, the copy summary and the template with plain text.
import { formatInr, formatLitres, naturalDecimals } from '../i18n/format';
import type { Lang } from '../i18n/lang';
import type { BiText, StringId } from '../i18n/strings';
import { t } from '../i18n/strings';
import type { BreedStandard, FatComparison, LimitingKey, SolvedVerdict, Verdict } from './types';

/** Round Stage 1 optimum Y* down to 0.1 L with 1e-7 float-noise cushion (ARCHITECTURE.md section 5). */
export function roundSupportedMilkDown(yStar: number): number {
  if (!Number.isFinite(yStar) || yStar <= 0) return 0;
  return Math.floor(yStar * 10 + 1e-7) / 10;
}

export interface SelectVerdictInput {
  todayMilkLPerDay: number;
  breedCapLPerDay: number;
  yStar: number;
  supportedMilkLPerDay?: number;
  referenceCostInrPerDay: number;
  costAtTodayMilkInrPerDay: number | null;
  limitingAtToday?: LimitingKey[];
}

/**
 * Pure verdict selector (ARCHITECTURE.md section 7, SPEC AC-5.6, AC-5.7, AC-5.11, AC-5.13, OQ14, OQ15).
 * Shortfall and breed-level comparisons use the unrounded Y* against T with 1e-6 tolerance, never S.
 */
export function selectVerdict(input: SelectVerdictInput): SolvedVerdict {
  const {
    todayMilkLPerDay,
    breedCapLPerDay,
    yStar,
    referenceCostInrPerDay,
    costAtTodayMilkInrPerDay,
    limitingAtToday = [],
  } = input;
  const s =
    input.supportedMilkLPerDay !== undefined
      ? input.supportedMilkLPerDay
      : roundSupportedMilkDown(yStar);

  // 1. Dry animal (T = 0) -> dry_animal (AC-5.13)
  if (todayMilkLPerDay <= 0) {
    return { kind: 'dry_animal' };
  }

  // 2. Shortfall: unrounded Y* < T - 1e-6 -> below_today (AC-5.11)
  if (yStar < todayMilkLPerDay - 1e-6) {
    const limits = costAtTodayMilkInrPerDay === null ? [...limitingAtToday] : [];
    return {
      kind: 'below_today',
      todayMilkLPerDay,
      keepCostInrPerDay: costAtTodayMilkInrPerDay,
      costToKeepTodayInrPerDay: costAtTodayMilkInrPerDay,
      limitingNutrients: limits,
      limitingAtToday: limits,
    };
  }

  const savingInrPerDay =
    costAtTodayMilkInrPerDay !== null && referenceCostInrPerDay - costAtTodayMilkInrPerDay > 1e-6
      ? referenceCostInrPerDay - costAtTodayMilkInrPerDay
      : null;

  // 3. Above breed level: T > breedCap + 1e-6 and Y* >= T - 1e-6 (AC-5.7, OQ15)
  if (todayMilkLPerDay > breedCapLPerDay + 1e-6) {
    return {
      kind: 'above_breed_level',
      savingInrPerDay,
    };
  }

  // 4. At breed level: T = breedCap within 1e-6 and Y* >= T - 1e-6 (AC-5.7)
  if (Math.abs(todayMilkLPerDay - breedCapLPerDay) <= 1e-6) {
    return {
      kind: 'at_breed_level',
      savingInrPerDay,
    };
  }

  // 5. Room for improvement: S - T >= 0.1 L/day, with X = S - T rounded down to 0.1 (AC-5.6)
  const gainLPerDay = Math.floor((s - todayMilkLPerDay) * 10 + 1e-7) / 10;
  if (gainLPerDay >= 0.1 - 1e-9) {
    return {
      kind: 'gain',
      gainLPerDay: Math.round(gainLPerDay * 10) / 10,
    };
  }

  // 6. Otherwise: T < breedCap, Y* >= T - 1e-6, and S - T < 0.1 -> same_as_today (SPEC OQ14)
  return { kind: 'same_as_today' };
}

/** Build the factual fat % comparison against the breed standard (null when today's milk is 0; AC-5.9, AC-5.10). */
export function buildFatComparison(
  todayMilkLPerDay: number,
  todayFatPct: number,
  breed: Pick<BreedStandard, 'fatPct' | 'fatPctLow' | 'fatPctHigh'>,
): FatComparison | null {
  if (todayMilkLPerDay <= 0) return null;
  const low = breed.fatPctLow !== undefined ? breed.fatPctLow : breed.fatPct;
  return {
    todayFatPct,
    breedFatPct: low ?? null,
    breedFatPctLow: low ?? null,
    breedFatPctHigh: breed.fatPctHigh ?? null,
  };
}

/** Supported milk and gains: one decimal ("6.2 L"). */
export const litres1 = (v: number) => formatLitres(v, 1);
/** Milk the user typed: as typed, up to two decimals ("8 L", "6.5 L"). */
export const litresNatural = (v: number) => formatLitres(v, naturalDecimals(v));

export function verdictId(v: Verdict): StringId {
  switch (v.kind) {
    case 'gain':
      return 'verdict_gain';
    case 'at_breed_level':
      return v.savingInrPerDay !== null ? 'verdict_at_level_saving' : 'verdict_at_level';
    case 'above_breed_level':
      return v.savingInrPerDay !== null ? 'verdict_above_saving' : 'verdict_above';
    case 'below_today':
      return v.keepCostInrPerDay !== null ? 'verdict_below' : 'verdict_below_no';
    case 'same_as_today':
      return 'verdict_same';
    case 'dry_animal':
      return 'verdict_dry';
    case 'budget_below_maintenance':
      return 'verdict_shortfall';
  }
}

/** "CP, ME" for nutrients (abbreviations), the translated name for the roughage minimum. */
export function limitingListText(keys: LimitingKey[], lang: Lang): string {
  return keys.map((k) => (k === 'roughage' ? t('bind_roughage')[lang] : k)).join(', ');
}

/** The text that goes into each {token} of the verdict string, in one language. */
export function verdictTokens(v: Verdict, todayMilk: number, supportedMilk: number | null, lang: Lang): Record<string, string> {
  const s = supportedMilk === null ? '' : litres1(supportedMilk);
  switch (v.kind) {
    case 'gain':
      return { x: litres1(v.gainLPerDay) };
    case 'at_breed_level':
    case 'above_breed_level':
      return v.savingInrPerDay !== null ? { z: formatInr(v.savingInrPerDay) } : {};
    case 'below_today':
      return {
        s,
        t: litresNatural(todayMilk),
        t2: litresNatural(todayMilk),
        b: v.keepCostInrPerDay !== null ? formatInr(v.keepCostInrPerDay) : '',
        nutrients: limitingListText(v.limitingNutrients, lang),
      };
    case 'same_as_today':
      return { s };
    case 'dry_animal':
      return {};
    case 'budget_below_maintenance':
      return { m: formatInr(v.maintenanceCostInrPerDay) };
  }
}

/** The verdict as plain text in both languages (copy summary, template, explanation). */
export function verdictText(v: Verdict, todayMilk: number, supportedMilk: number | null): BiText {
  const id = verdictId(v);
  return {
    hi: t(id, verdictTokens(v, todayMilk, supportedMilk, 'hi')).hi,
    en: t(id, verdictTokens(v, todayMilk, supportedMilk, 'en')).en,
  };
}
