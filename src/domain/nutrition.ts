// Shared nutrient arithmetic and display formatting (no LP here).
import { formatNumber } from '../i18n/format';
import type { FeedItem, LimitingKey, NutrientKey, NutrientVector } from './types';

export interface PerKg {
  dm: number;
  cp: number;
  me: number;
  ca: number;
  p: number;
}

/** Roughage feeds are those in the indigenous_forage and crop_residue verticals (SPEC AC-5.12). */
export function isRoughage(feed: Pick<FeedItem, 'vertical'>): boolean {
  return feed.vertical === 'indigenous_forage' || feed.vertical === 'crop_residue';
}

/** Nutrient content per kg AS FED (DM-basis values times the dry matter fraction). */
export function perKgFed(feed: FeedItem): PerKg {
  const dm = feed.dmPct / 100;
  return {
    dm,
    cp: 10 * feed.cpPctDm * dm,
    me: feed.meMcalPerKgDm * dm,
    ca: feed.caGramsPerKgDm * dm,
    p: feed.pGramsPerKgDm * dm,
  };
}

export function suppliedFor(lines: { feed: FeedItem; kg: number }[]): NutrientVector {
  const out: NutrientVector = { dmKgPerDay: 0, cpGramsPerDay: 0, meMcalPerDay: 0, caGramsPerDay: 0, pGramsPerDay: 0 };
  for (const { feed, kg } of lines) {
    const n = perKgFed(feed);
    out.dmKgPerDay += n.dm * kg;
    out.cpGramsPerDay += n.cp * kg;
    out.meMcalPerDay += n.me * kg;
    out.caGramsPerDay += n.ca * kg;
    out.pGramsPerDay += n.p * kg;
  }
  return out;
}

export const REQ_FIELD: Record<NutrientKey, keyof NutrientVector> = {
  DM: 'dmKgPerDay',
  CP: 'cpGramsPerDay',
  ME: 'meMcalPerDay',
  Ca: 'caGramsPerDay',
  P: 'pGramsPerDay',
};

export const PER_KG_FIELD: Record<NutrientKey, keyof PerKg> = { DM: 'dm', CP: 'cp', ME: 'me', Ca: 'ca', P: 'p' };

export const MIN_NUTRIENTS = ['CP', 'ME', 'Ca', 'P'] as const;

const UNIT: Record<NutrientKey, { unit: string; decimals: 0 | 1 | 2 }> = {
  DM: { unit: 'kg', decimals: 2 },
  CP: { unit: 'g', decimals: 0 },
  ME: { unit: 'Mcal', decimals: 1 },
  Ca: { unit: 'g', decimals: 1 },
  P: { unit: 'g', decimals: 1 },
};

export function nutrientUnit(key: NutrientKey): string {
  return UNIT[key].unit;
}

/** "1,345 g", "30.1 Mcal", "13.10 kg" with a non-breaking space before the unit. */
/** A limiting amount: a nutrient in its own unit, or the roughage share as a percent of dry matter. */
export function formatLimit(key: LimitingKey, value: number): string {
  return key === 'roughage' ? `${formatNumber(value, 0)}%` : formatNutrient(key, value);
}

export function formatNutrient(key: NutrientKey, value: number): string {
  return `${formatNumber(value, UNIT[key].decimals)}\u00A0${UNIT[key].unit}`;
}
