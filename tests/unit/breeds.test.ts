import { describe, expect, it } from 'vitest';
import breedsV1 from '../../src/data/breeds.v1.json';
import { BREEDS, breedById, breedLabel, breedsFor, capFromCitedFigures, isNonDescript } from '../../src/domain/breeds';
import type { BreedStandard } from '../../src/domain/types';

const v1List = breedsV1 as unknown as BreedStandard[];

describe('breeds.v1.json and src/domain/breeds.ts', () => {
  it('contains all 14 cited breeds from DATA_SOURCES §5 plus nondescript_cow (3.86) and nondescript_buffalo (4.73)', () => {
    const expectedIds = [
      'rathi',
      'tharparkar',
      'nagori',
      'gir',
      'kankrej',
      'sahiwal',
      'hariana',
      'hf_crossbred',
      'jersey_crossbred',
      'nondescript_cow',
      'murrah',
      'nili_ravi',
      'bhadawari',
      'surti',
      'mehsana',
      'nondescript_buffalo',
    ];
    expect(v1List.map((b) => b.id)).toEqual(expectedIds);
    expect(BREEDS.map((b) => b.id)).toEqual(expectedIds);

    const ndCow = breedById('nondescript_cow', v1List)!;
    const ndBuf = breedById('nondescript_buffalo', v1List)!;
    expect(ndCow.milkCapLPerDay).toBe(3.86);
    expect(ndCow.yieldFigureYear).toBe('2024-25');
    expect(ndBuf.milkCapLPerDay).toBe(4.73);
    expect(ndBuf.yieldFigureYear).toBe('2023-24');
  });

  it('uses cited_peak for Murrah (9.64), Nili-Ravi (9.40), Bhadawari (6.93), and Sahiwal (11.15)', () => {
    const expectedPeaks: Record<string, number> = {
      murrah: 9.64,
      nili_ravi: 9.4,
      bhadawari: 6.93,
      sahiwal: 11.15,
    };
    for (const [id, peak] of Object.entries(expectedPeaks)) {
      const breed = breedById(id, v1List)!;
      expect(breed).toBeDefined();
      expect(breed.capBasis).toBe('cited_peak');
      expect(breed.milkCapLPerDay).toBe(peak);
      const derived = capFromCitedFigures(breed);
      expect(derived.basis).toBe('cited_peak');
      expect(derived.value).toBe(peak);
    }
  });

  it('re-derives every stored cap and matches the exact Cap Table in ARCHITECTURE.md and DATA_SOURCES §5', () => {
    const expectedCaps: Record<string, { cap: number; basis: BreedStandard['capBasis'] }> = {
      murrah: { cap: 9.64, basis: 'cited_peak' },
      nili_ravi: { cap: 9.4, basis: 'cited_peak' },
      bhadawari: { cap: 6.93, basis: 'cited_peak' },
      sahiwal: { cap: 11.15, basis: 'cited_peak' },
      rathi: { cap: 8.36, basis: 'range_top' },
      tharparkar: { cap: 7.53, basis: 'range_top' },
      nagori: { cap: 3.39, basis: 'range_top' },
      hariana: { cap: 6.45, basis: 'range_top' },
      hf_crossbred: { cap: 14.64, basis: 'range_top' },
      jersey_crossbred: { cap: 10.7, basis: 'range_top' },
      gir: { cap: 6.33, basis: 'breed_average_calc' },
      kankrej: { cap: 6.22, basis: 'breed_average_calc' },
      surti: { cap: 5.48, basis: 'breed_average_calc' },
      mehsana: { cap: 5.84, basis: 'breed_average_calc' },
      nondescript_cow: { cap: 3.86, basis: 'dahd_average' },
      nondescript_buffalo: { cap: 4.73, basis: 'dahd_average' },
    };

    for (const breed of v1List) {
      const expected = expectedCaps[breed.id];
      expect(expected, `missing expected entry for ${breed.id}`).toBeDefined();
      expect(breed.capBasis, breed.id).toBe(expected.basis);
      expect(breed.milkCapLPerDay, breed.id).toBe(expected.cap);

      const derived = capFromCitedFigures(breed);
      expect(derived.basis, breed.id).toBe(breed.capBasis);
      expect(Math.round(derived.value * 100) / 100, breed.id).toBe(breed.milkCapLPerDay);
      expect(breed.sourceNote, breed.id).toContain('1 kg of milk ≈ 1 L');
    }
  });

  it('records null fat% for breeds without cited fat (AC-5.10) and cited fat% (single or range) otherwise', () => {
    const uncitedFatIds = new Set(['kankrej', 'hf_crossbred', 'jersey_crossbred', 'nondescript_cow', 'nondescript_buffalo']);
    for (const breed of v1List) {
      if (uncitedFatIds.has(breed.id)) {
        expect(breed.fatPct, breed.id).toBeNull();
        expect(breed.fatPctLow, breed.id).toBeNull();
        expect(breed.fatPctHigh, breed.id).toBeNull();
        expect(breed.fatCitation, breed.id).toBeNull();
      } else {
        expect(breed.fatPct, breed.id).toBeGreaterThan(0);
        expect(breed.fatCitation?.doc, breed.id).toBeTruthy();
      }
    }

    expect(breedById('bhadawari', v1List)?.fatPct).toBe(8.09);
    expect(breedById('rathi', v1List)?.fatPctLow).toBe(3.7);
    expect(breedById('rathi', v1List)?.fatPctHigh).toBe(4);
  });

  it('lists species breeds in table order with Non-descript last and identifies non-descript rows', () => {
    for (const species of ['cow', 'buffalo'] as const) {
      const list = breedsFor(species, v1List);
      expect(list.length).toBeGreaterThan(1);
      const nonDescripts = list.filter(isNonDescript);
      expect(nonDescripts).toHaveLength(1);
      expect(isNonDescript(list[list.length - 1])).toBe(true);
    }
  });

  it('carries NFC-normalized Devanagari names for every breed and returns language-appropriate labels (AC-L1.7)', () => {
    for (const breed of v1List) {
      expect(breed.localNameDeva, breed.id).toBeTruthy();
      expect(breed.localNameDeva, breed.id).toBe(breed.localNameDeva!.normalize('NFC'));
      expect(breedLabel(breed, 'en')).toBe(breed.englishName);
      expect(breedLabel(breed, 'hi')).toBe(breed.localNameDeva);
    }
  });

  it('handles unknown breed IDs and breed_average fallback rules gracefully', () => {
    expect(breedById('non_existent_breed', v1List)).toBeUndefined();
    expect(breedById('', v1List)).toBeUndefined();

    const syntheticAverageBreed: BreedStandard = {
      ...v1List[0],
      id: 'synthetic_avg',
      isNonDescript: false,
      peakDailyYieldKg: null,
      lactationYieldKg: null,
      lactationYieldLowKg: null,
      lactationYieldHighKg: null,
      avgDailyYieldKg: 5.5,
      capBasis: 'breed_average',
      milkCapLPerDay: 5.5,
    };
    expect(capFromCitedFigures(syntheticAverageBreed)).toEqual({
      basis: 'breed_average',
      yieldKg: null,
      lengthDays: null,
      value: 5.5,
    });
  });
});


