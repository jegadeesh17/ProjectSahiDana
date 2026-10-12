// The breed table and the milk cap (SPEC shared definitions). Breed sources give milk in kg; 1 kg of milk is about 1 L.
import breedsJson from '../data/breeds.v1.json';
import type { Lang } from '../i18n/lang';
import type { BreedStandard, CapBasis, Species } from './types';

export const BREEDS = breedsJson as unknown as BreedStandard[];

/** Breeds of one species in table order, with "Non-descript" last (AC-2.4). */
export function breedsFor(species: Species, breeds: BreedStandard[] = BREEDS): BreedStandard[] {
  const own = breeds.filter((b) => b.species === species);
  return [...own.filter((b) => !isNonDescript(b)), ...own.filter((b) => isNonDescript(b))];
}

export function breedById(id: string, breeds: BreedStandard[] = BREEDS): BreedStandard | undefined {
  return breeds.find((b) => b.id === id);
}

export function isNonDescript(breed: BreedStandard): boolean {
  return breed.isNonDescript === true || breed.capBasis === 'dahd_average';
}

/** One name in one language: Hindi spelling when the table has one, else the English name. */
export function breedLabel(breed: BreedStandard, lang: Lang): string {
  return lang === 'hi' ? (breed.localNameDeva ?? breed.localNameLatn ?? breed.englishName) : breed.englishName;
}

export const CAP_BASIS_STRING = {
  cited_peak: 'basis_cited_peak',
  range_top: 'basis_range_top',
  breed_average: 'basis_breed_average',
  breed_average_calc: 'basis_breed_average_calc',
  dahd_average: 'basis_dahd_average',
} as const satisfies Record<CapBasis, string>;

export const CAP_BASIS_EXPLAIN = {
  cited_peak: 'basis_cited_peak_explain',
  range_top: 'basis_range_top_explain',
  breed_average: 'basis_breed_average_explain',
  breed_average_calc: 'basis_breed_average_calc_explain',
  dahd_average: 'basis_dahd_average_explain',
} as const satisfies Record<CapBasis, string>;

export interface CapDivision {
  basis: CapBasis;
  /** kg per lactation (null for a peak or an average quoted directly). */
  yieldKg: number | null;
  lengthDays: number | null;
  value: number;
}

/** The cap re-derived from the cited figures: the cited peak first, then the SPEC rules (a) to (d). */
export function capFromCitedFigures(breed: BreedStandard): CapDivision {
  if (breed.peakDailyYieldKg !== null) {
    return { basis: 'cited_peak', yieldKg: null, lengthDays: null, value: breed.peakDailyYieldKg };
  }
  if (isNonDescript(breed)) {
    return { basis: 'dahd_average', yieldKg: null, lengthDays: null, value: breed.avgDailyYieldKg ?? breed.milkCapLPerDay };
  }
  if (breed.lactationYieldHighKg !== null) {
    const days = breed.lactationLengthMinDays ?? breed.lactationLengthDays ?? 1;
    return { basis: 'range_top', yieldKg: breed.lactationYieldHighKg, lengthDays: days, value: breed.lactationYieldHighKg / days };
  }
  if ((breed.capBasis === 'breed_average' || breed.lactationYieldKg === null) && breed.avgDailyYieldKg !== null) {
    return { basis: 'breed_average', yieldKg: null, lengthDays: null, value: breed.avgDailyYieldKg };
  }
  const days = breed.lactationLengthDays ?? 1;
  const yieldKg = breed.lactationYieldKg ?? 0;
  return { basis: 'breed_average_calc', yieldKg, lengthDays: days, value: yieldKg / days };
}
