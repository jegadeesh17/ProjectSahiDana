// The room-for-improvement verdict as sentences (AC-5.6, 5.7, 5.11, OQ14, OQ15, AC-E7.1).
// One string id per case; the UI fills the {tokens} with tappable figures, the copy summary and the template with plain text.
import { formatInr, formatLitres, naturalDecimals } from '../i18n/format';
import type { Lang } from '../i18n/lang';
import type { BiText, StringId } from '../i18n/strings';
import { t } from '../i18n/strings';
import type { LimitingKey, Verdict } from './types';

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
