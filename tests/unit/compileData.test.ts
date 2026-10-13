import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Solver, { type LpModel } from 'javascript-lp-solver';
import { describe, expect, it } from 'vitest';
import {
  compileBreedRow,
  compileBreeds,
  compileDataFiles,
  compileFeedRow,
  compileFeeds,
  compileRequirements,
  computeBreedCap,
  parseAvailableMonths,
  parseCsv,
  VALID_PROVENANCES,
  VALID_RELIABILITIES,
} from '../../scripts/compile_data.mjs';
import { HINDI_REVIEW } from '../../src/i18n/strings';

function makeValidFeedRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    id: 'wheat_straw',
    english_name: 'Wheat straw',
    local_name_latn: 'Bhusa / Bhoosa',
    local_name_latn_citation: 'NDDB 2012, p. 33',
    local_name_deva: 'भूसा',
    local_name_deva_provenance: 'team-asserted',
    vertical: 'crop_residue',
    available_months: '1-12',
    season_note_en: 'Harvested Mar–Apr; stored all year.',
    season_note_hi: 'मार्च–अप्रैल में कटाई; पूरे साल भंडारित।',
    season_citation: 'ICAR-CRIDA Jaipur Contingency Plan 2011, Table 1.7 p. 4',
    season_provenance: 'cited',
    dm_pct: '90.0',
    cp_pct_dm: '3.0',
    me_mcal_per_kg_dm: '1.4',
    ca_g_per_kg_dm: '2.0',
    p_g_per_kg_dm: '0.7',
    source_doc: 'NDDB, Nutritive Value of Commonly Available Feeds and Fodders in India (2012)',
    source_table: 'Table 2',
    source_page: 'p. 83',
    dm_source_citation: 'Feedipedia node 558',
    provenance_status: 'cited',
    nutrient_note: '',
    default_price_inr_per_kg_as_fed: '6.5',
    price_source: 'Down To Earth / ETV Bharat Rajasthan straw report',
    price_source_url: 'https://hindi.downtoearth.org.in',
    price_date: '2024-04-29',
    price_reliability: 'trade_report',
    price_note_en: 'Converted from ₹650/quintal.',
    price_note_hi: '₹650/क्विंटल से परिवर्तित।',
    verified_on: '',
    ...overrides,
  };
}

function makeValidBreedRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    id: 'murrah',
    species: 'buffalo',
    english_name: 'Murrah',
    local_name_latn: 'Murrah',
    local_name_deva: 'मुर्रा',
    local_name_deva_provenance: 'team-asserted',
    is_non_descript: 'false',
    female_body_weight_kg: '516',
    body_weight_citation: 'NDDB Dairying in Punjab 2014, Table III.2.1 p. 45',
    lactation_yield_kg: '1751',
    lactation_yield_low_kg: '1003',
    lactation_yield_high_kg: '2057',
    lactation_length_days: '299',
    lactation_length_min_days: '299',
    avg_daily_yield_kg: '5.85',
    peak_daily_yield_kg: '9.64',
    peak_source_doc: 'ICAR-CIRB Buffalopedia',
    peak_source_table: 'Murrah breed profile',
    peak_source_page: 'p. 1',
    peak_source_url: 'https://buffalopedianew.cirb.res.in/',
    peak_note_en: 'Upper value of reported study means 7.1–9.64 kg/day.',
    peak_note_hi: 'रिपोर्ट किए गए अध्ययन-औसतों 7.1–9.64 kg/दिन का ऊपरी मान।',
    yield_source_doc: 'NDDB Dairying in Punjab 2014',
    yield_source_table: 'Table III.2.1',
    yield_source_page: 'p. 45',
    yield_source_url: 'https://dairyknowledge.in/dkp/sites/default/files/performance_of_cattle_and_buffalo_breeds.pdf',
    yield_figure_year: '',
    fat_pct_low: '7.34',
    fat_pct_high: '7.34',
    fat_source_doc: 'NDDB Dairying in Punjab 2014',
    fat_source_table: 'Table III.2.1',
    fat_source_page: 'p. 45',
    fat_source_url: '',
    verified_on: '',
    ...overrides,
  };
}

function makeValidRequirements(overrides: Record<string, unknown> = {}) {
  return {
    dmi: {
      fcmCoeff: 0.372,
      bw075Coeff: 0.0968,
      lagRate: 0.192,
      lagOffset: 3.67,
      fcmMilkFactor: 0.4,
      fcmFatFactor: 15,
      defaultWeekOfLactation: 20,
      citation: {
        doc: 'NRC 2001, Nutrient Requirements of Dairy Cattle (7th rev. ed.)',
        table: 'Chapter 1, Equation 1-1',
        page: 'p. 4',
      },
    },
    roughageMinShareOfDm: {
      value: 0.4,
      citation: {
        doc: 'ICAR 2013, Nutrient Requirements of Cattle and Buffalo',
        table: 'Section 4.2, Ration Balancing Guidelines',
        page: 'p. 28',
        url: '',
      },
      note: 'Minimum 40% of total dry matter from roughages (green fodder + dry roughage/crop residues).',
      verifiedOn: null,
    },
    ...overrides,
  };
}

describe('NFC Devanagari normalization (AC-L1.7)', () => {
  it('normalizes NFD Devanagari strings to NFC across feed, breed, and requirements data', () => {
    // 'ड़' in NFD is '\u0921\u093C' (ड + nukta); in NFC where applicable or canonically ordered combining marks
    const nfdDeva = 'क\u093Cीमत'.normalize('NFD');
    const feed = compileFeedRow(
      makeValidFeedRow({
        local_name_deva: nfdDeva,
        season_note_hi: `चारे की ${nfdDeva}`,
      }),
    );
    expect(feed.localNameDeva).toBe(nfdDeva.normalize('NFC'));
    expect(feed.seasonNote.hi).toBe(`चारे की ${nfdDeva}`.normalize('NFC'));

    const breed = compileBreedRow(
      makeValidBreedRow({
        local_name_deva: nfdDeva,
        peak_note_hi: `शिखर ${nfdDeva}`,
      }),
    );
    expect(breed.localNameDeva).toBe(nfdDeva.normalize('NFC'));
    expect(breed.peakNote?.hi).toBe(`शिखर ${nfdDeva}`.normalize('NFC'));

    const req = compileRequirements(
      makeValidRequirements({
        noteHi: nfdDeva,
      }),
    );
    expect(req.noteHi).toBe(nfdDeva.normalize('NFC'));
  });
});

describe('available_months parsing and validation (AC-3.4)', () => {
  it('parses single months, ranges, and year-wrapping range pairs into sorted unique months 1..12', () => {
    expect(parseAvailableMonths('1-12')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(parseAvailableMonths('11-12,1-3')).toEqual([1, 2, 3, 11, 12]);
    expect(parseAvailableMonths('7, 8, 9, 10')).toEqual([7, 8, 9, 10]);
    expect(parseAvailableMonths('6-7,10-11')).toEqual([6, 7, 10, 11]);
  });

  it('rejects empty, out-of-range, inverted, or non-numeric available_months', () => {
    expect(() => parseAvailableMonths('')).toThrow(/available_months/i);
    expect(() => parseAvailableMonths('0-5')).toThrow(/available_months/i);
    expect(() => parseAvailableMonths('1-13')).toThrow(/available_months/i);
    expect(() => parseAvailableMonths('11-3')).toThrow(/available_months/i);
    expect(() => parseAvailableMonths('7,,8')).toThrow(/available_months/i);
    expect(() => parseAvailableMonths('jan-mar')).toThrow(/available_months/i);
  });
});

describe('feed row validation: verticals, prices, reliability, and provenance (AC-3.2, AC-3.3, AC-3.6, AC-L1.7)', () => {
  it('compiles a valid priced feed row without legacy category or availabilityTag fields', () => {
    const warnings: string[] = [];
    const feed = compileFeedRow(makeValidFeedRow(), 0, warnings);
    expect(feed.id).toBe('wheat_straw');
    expect(feed.vertical).toBe('crop_residue');
    expect(feed.availableMonths).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(feed.defaultPriceInrPerKgAsFed).toBe(6.5);
    expect(feed.priceReliability).toBe('trade_report');
    expect(feed.priceNote).toEqual({
      en: 'Converted from ₹650/quintal.',
      hi: '₹650/क्विंटल से परिवर्तित।',
    });
    expect(feed.derivedTdnPctDm).toBe(38.8);
    expect('category' in feed).toBe(false);
    expect('availabilityTag' in feed).toBe(false);
    expect(warnings).toHaveLength(1);
  });

  it('allows empty default price columns when no price is found (AC-3.2)', () => {
    const feed = compileFeedRow(
      makeValidFeedRow({
        default_price_inr_per_kg_as_fed: '',
        price_source: '',
        price_source_url: '',
        price_date: '',
        price_reliability: '',
        price_note_en: '',
        price_note_hi: '',
      }),
    );
    expect(feed.defaultPriceInrPerKgAsFed).toBeNull();
    expect(feed.priceSource).toBeNull();
    expect(feed.priceDate).toBeNull();
    expect(feed.priceReliability).toBeNull();
    expect(feed.priceNote).toBeNull();
  });

  it('rejects invalid vertical enum values (AC-3.3)', () => {
    expect(() => compileFeedRow(makeValidFeedRow({ vertical: 'concentrate' }))).toThrow(/vertical/i);
    expect(() => compileFeedRow(makeValidFeedRow({ vertical: '' }))).toThrow(/vertical/i);
  });

  it('rejects missing price reliability, date, or source when a default price is set (AC-3.6)', () => {
    expect(() => compileFeedRow(makeValidFeedRow({ price_reliability: '' }))).toThrow(/price_reliability/i);
    expect(() => compileFeedRow(makeValidFeedRow({ price_reliability: 'unknown_tier' }))).toThrow(/price_reliability/i);
    expect(() => compileFeedRow(makeValidFeedRow({ price_date: '' }))).toThrow(/price_date/i);
    expect(() => compileFeedRow(makeValidFeedRow({ price_date: 'Oct 2026' }))).toThrow(/price_date/i);
    expect(() => compileFeedRow(makeValidFeedRow({ price_source: '' }))).toThrow(/price_source/i);
  });

  it('rejects price metadata when default_price_inr_per_kg_as_fed is empty', () => {
    expect(() =>
      compileFeedRow(
        makeValidFeedRow({
          default_price_inr_per_kg_as_fed: '',
          price_reliability: 'mandi',
        }),
      ),
    ).toThrow(/default_price_inr_per_kg_as_fed/i);
  });

  it('requires both price_note_en and price_note_hi when price_reliability is team_estimate (AC-3.6)', () => {
    expect(() =>
      compileFeedRow(
        makeValidFeedRow({
          price_reliability: 'team_estimate',
          price_note_en: '',
          price_note_hi: '',
        }),
      ),
    ).toThrow(/team_estimate/i);

    expect(() =>
      compileFeedRow(
        makeValidFeedRow({
          price_reliability: 'team_estimate',
          price_note_en: 'Estimated from Bikaner rate.',
          price_note_hi: '',
        }),
      ),
    ).toThrow(/team_estimate/i);

    const validEstimate = compileFeedRow(
      makeValidFeedRow({
        price_reliability: 'team_estimate',
        price_note_en: 'Estimated from Bikaner rate.',
        price_note_hi: 'बीकानेर दर के आधार पर अनुमानित।',
      }),
    );
    expect(validEstimate.priceReliability).toBe('team_estimate');
    expect(validEstimate.priceNote).toEqual({
      en: 'Estimated from Bikaner rate.',
      hi: 'बीकानेर दर के आधार पर अनुमानित।',
    });
  });

  it('rejects team-asserted Devanagari name when local_name_latn is missing', () => {
    expect(() =>
      compileFeedRow(
        makeValidFeedRow({
          local_name_latn: '',
          local_name_latn_citation: '',
          local_name_deva: 'भूसा',
          local_name_deva_provenance: 'team-asserted',
        }),
      ),
    ).toThrow(/local_name_latn/i);
  });

  it('rejects team-asserted nutrient provenance without nutrient_note', () => {
    expect(() =>
      compileFeedRow(
        makeValidFeedRow({
          provenance_status: 'team-asserted',
          nutrient_note: '',
        }),
      ),
    ).toThrow(/nutrient_note/i);
  });
});

describe('breed cap computation priority and breed validation (AC-2.4, AC-2.5)', () => {
  it('computes milkCapLPerDay and capBasis in exact SPEC priority order (cited_peak before lactation averages)', () => {
    // 1. Non-descript -> dahd_average
    expect(
      computeBreedCap({
        is_non_descript: 'true',
        avg_daily_yield_kg: '3.86',
      }),
    ).toEqual({ capBasis: 'dahd_average', milkCapLPerDay: 3.86 });

    // 2. Cited peak wins even when lactation range and average are also present (e.g. Murrah, Sahiwal)
    expect(
      computeBreedCap({
        is_non_descript: 'false',
        peak_daily_yield_kg: '9.64',
        lactation_yield_high_kg: '2057',
        lactation_length_days: '299',
        avg_daily_yield_kg: '5.85',
        lactation_yield_kg: '1751',
      }),
    ).toEqual({ capBasis: 'cited_peak', milkCapLPerDay: 9.64 });

    expect(
      computeBreedCap({
        is_non_descript: 'false',
        peak_daily_yield_kg: '11.15',
        lactation_yield_high_kg: '2750',
        lactation_length_days: '318',
        avg_daily_yield_kg: '7.31',
        lactation_yield_kg: '2325',
      }),
    ).toEqual({ capBasis: 'cited_peak', milkCapLPerDay: 11.15 });

    // 3. Range top -> lactation_yield_high_kg / shorter length (e.g. Rathi 2810 / 336 = 8.36, HF crossbred 4568 / 312 = 14.64)
    expect(
      computeBreedCap({
        is_non_descript: 'false',
        peak_daily_yield_kg: '',
        lactation_yield_high_kg: '2810',
        lactation_length_days: '336',
        avg_daily_yield_kg: '4.64',
      }),
    ).toEqual({ capBasis: 'range_top', milkCapLPerDay: 8.36 });

    expect(
      computeBreedCap({
        is_non_descript: 'false',
        peak_daily_yield_kg: '',
        lactation_yield_high_kg: '4568',
        lactation_length_days: '349',
        lactation_length_min_days: '312',
        avg_daily_yield_kg: '14.0',
      }),
    ).toEqual({ capBasis: 'range_top', milkCapLPerDay: 14.64 });

    // 4. Breed average when no peak and no range high (avg_daily_yield_kg)
    expect(
      computeBreedCap({
        is_non_descript: 'false',
        peak_daily_yield_kg: '',
        lactation_yield_high_kg: '',
        avg_daily_yield_kg: '6.30',
        lactation_yield_kg: '1850',
        lactation_length_days: '294',
      }),
    ).toEqual({ capBasis: 'breed_average', milkCapLPerDay: 6.3 });

    // 5. Breed average calc when only lactation_yield_kg and lactation_length_days exist (e.g. Gir 2063 / 326 = 6.33)
    expect(
      computeBreedCap({
        is_non_descript: 'false',
        peak_daily_yield_kg: '',
        lactation_yield_high_kg: '',
        avg_daily_yield_kg: '',
        lactation_yield_kg: '2063',
        lactation_length_days: '326',
      }),
    ).toEqual({ capBasis: 'breed_average_calc', milkCapLPerDay: 6.33 });
  });

  it('rejects peak_daily_yield_kg without peak citation (AC-2.4)', () => {
    expect(() =>
      compileBreedRow(
        makeValidBreedRow({
          peak_daily_yield_kg: '9.64',
          peak_source_doc: '',
        }),
      ),
    ).toThrow(/peak_source_doc/i);

    expect(() =>
      compileBreedRow(
        makeValidBreedRow({
          peak_daily_yield_kg: '9.64',
          peak_source_page: '',
        }),
      ),
    ).toThrow(/peak_source_page/i);
  });

  it('rejects non-descript row without yield_figure_year (AC-2.5)', () => {
    expect(() =>
      compileBreedRow(
        makeValidBreedRow({
          id: 'nondescript_cow',
          species: 'cow',
          is_non_descript: 'true',
          peak_daily_yield_kg: '',
          peak_source_doc: '',
          peak_source_table: '',
          peak_source_page: '',
          peak_source_url: '',
          peak_note_en: '',
          peak_note_hi: '',
          avg_daily_yield_kg: '3.86',
          yield_figure_year: '',
        }),
      ),
    ).toThrow(/yield_figure_year/i);
  });

  it('rejects breed row that matches none of the cap rules', () => {
    expect(() =>
      compileBreedRow(
        makeValidBreedRow({
          peak_daily_yield_kg: '',
          peak_source_doc: '',
          peak_source_table: '',
          peak_source_page: '',
          peak_source_url: '',
          peak_note_en: '',
          peak_note_hi: '',
          lactation_yield_kg: '',
          lactation_yield_low_kg: '',
          lactation_yield_high_kg: '',
          lactation_length_days: '',
          lactation_length_min_days: '',
          avg_daily_yield_kg: '',
        }),
      ),
    ).toThrow(/cap rules/i);
  });

  it('rejects team-asserted breed Devanagari name without local_name_latn', () => {
    expect(() =>
      compileBreedRow(
        makeValidBreedRow({
          local_name_latn: '',
          local_name_deva: 'मुर्रा',
          local_name_deva_provenance: 'team-asserted',
        }),
      ),
    ).toThrow(/local_name_latn/i);
  });
});

describe('roughageMinShareOfDm validation (AC-5.12)', () => {
  it('accepts valid roughageMinShareOfDm in (0, 1) with ICAR/NDDB doc and page citation', () => {
    const compiled = compileRequirements(makeValidRequirements());
    expect(compiled.roughageMinShareOfDm.value).toBe(0.4);
    expect(compiled.roughageMinShareOfDm.citation.doc).toContain('ICAR');
  });

  it('rejects missing, null, <= 0, or >= 1 roughageMinShareOfDm.value', () => {
    expect(() =>
      compileRequirements(
        makeValidRequirements({
          roughageMinShareOfDm: {
            value: null,
            citation: { doc: 'ICAR 2013', table: 'T1', page: 'p. 10' },
          },
        }),
      ),
    ).toThrow(/roughageMinShareOfDm\.value/i);

    expect(() =>
      compileRequirements(
        makeValidRequirements({
          roughageMinShareOfDm: {
            value: 0,
            citation: { doc: 'ICAR 2013', table: 'T1', page: 'p. 10' },
          },
        }),
      ),
    ).toThrow(/roughageMinShareOfDm\.value/i);

    expect(() =>
      compileRequirements(
        makeValidRequirements({
          roughageMinShareOfDm: {
            value: 1,
            citation: { doc: 'NDDB 2012', table: 'T1', page: 'p. 10' },
          },
        }),
      ),
    ).toThrow(/roughageMinShareOfDm\.value/i);
  });

  it('rejects roughageMinShareOfDm without a valid ICAR/NDDB doc and page citation', () => {
    expect(() =>
      compileRequirements(
        makeValidRequirements({
          roughageMinShareOfDm: {
            value: 0.4,
            citation: { doc: '', table: 'T1', page: 'p. 10' },
          },
        }),
      ),
    ).toThrow(/doc and page/i);

    expect(() =>
      compileRequirements(
        makeValidRequirements({
          roughageMinShareOfDm: {
            value: 0.4,
            citation: { doc: 'ICAR 2013', table: 'T1', page: '' },
          },
        }),
      ),
    ).toThrow(/doc and page/i);

    expect(() =>
      compileRequirements(
        makeValidRequirements({
          roughageMinShareOfDm: {
            value: 0.4,
            citation: { doc: 'Uncited blog post', table: 'T1', page: 'p. 1' },
          },
        }),
      ),
    ).toThrow(/ICAR or NDDB/i);
  });
});

describe('CSV parsing and end-to-end compileDataFiles pipeline', () => {
  it('parses quoted CSV fields and compiles feeds, breeds, and requirements to disk', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'sahidana-compile-'));
    try {
      const feedRow = makeValidFeedRow({
        available_months: '11-12,1-3',
        season_note_en: 'Rabi, irrigated; green Nov–Mar',
      });
      const breedRow = makeValidBreedRow();

      const toCsv = (row: Record<string, string>) => {
        const keys = Object.keys(row);
        const vals = keys.map((k) => {
          const v = row[k];
          return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
        });
        return `${keys.join(',')}\n${vals.join(',')}\n`;
      };

      const feedsCsvPath = join(tmp, 'feeds.csv');
      const breedsCsvPath = join(tmp, 'breeds.csv');
      const reqJsonPath = join(tmp, 'requirements.json');
      const feedsOutPath = join(tmp, 'out', 'feeds.v1.json');
      const breedsOutPath = join(tmp, 'out', 'breeds.v1.json');
      const reqOutPath = join(tmp, 'out', 'requirements.v1.json');

      writeFileSync(feedsCsvPath, toCsv(feedRow), 'utf8');
      writeFileSync(breedsCsvPath, toCsv(breedRow), 'utf8');
      writeFileSync(reqJsonPath, JSON.stringify(makeValidRequirements()), 'utf8');

      const parsedCsv = parseCsv(readFileSync(feedsCsvPath, 'utf8'));
      expect(parsedCsv[0].available_months).toBe('11-12,1-3');

      const logs: string[] = [];
      const res = compileDataFiles({
        feedsCsvPath,
        breedsCsvPath,
        requirementsJsonPath: reqJsonPath,
        feedsOutPath,
        breedsOutPath,
        requirementsOutPath: reqOutPath,
        logger: { warn: (m: string) => logs.push(m) },
      });

      expect(res.feeds).toHaveLength(1);
      expect(res.breeds).toHaveLength(1);
      expect(logs.length).toBeGreaterThanOrEqual(3);

      const writtenFeeds = JSON.parse(readFileSync(feedsOutPath, 'utf8'));
      const writtenBreeds = JSON.parse(readFileSync(breedsOutPath, 'utf8'));
      const writtenReq = JSON.parse(readFileSync(reqOutPath, 'utf8'));

      expect(writtenFeeds[0].availableMonths).toEqual([1, 2, 3, 11, 12]);
      expect(writtenBreeds[0].milkCapLPerDay).toBe(9.64);
      expect(writtenBreeds[0].capBasis).toBe('cited_peak');
      expect(writtenReq.roughageMinShareOfDm.value).toBe(0.4);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('rejects duplicate ids in feeds or breeds', () => {
    expect(() => compileFeeds([makeValidFeedRow(), makeValidFeedRow()])).toThrow(/duplicate feed id/i);
    expect(() => compileBreeds([makeValidBreedRow(), makeValidBreedRow()])).toThrow(/duplicate breed id/i);
  });

  it('rejects malformed numeric bounds, asymmetric notes/ranges, and unterminated CSV quotes', () => {
    expect(() => compileFeedRow(makeValidFeedRow({ dm_pct: '0' }))).toThrow(/dm_pct/i);
    expect(() => compileFeedRow(makeValidFeedRow({ dm_pct: '105' }))).toThrow(/dm_pct/i);
    expect(() => compileFeedRow(makeValidFeedRow({ default_price_inr_per_kg_as_fed: '-1' }))).toThrow(
      /default_price_inr_per_kg_as_fed/i,
    );
    expect(() => compileFeedRow(makeValidFeedRow({ price_note_en: 'Only EN', price_note_hi: '' }))).toThrow(
      /price_note_en and price_note_hi/i,
    );
    expect(() =>
      compileBreedRow(makeValidBreedRow({ lactation_yield_low_kg: '1500', lactation_yield_high_kg: '' })),
    ).toThrow(/lactation_yield_low_kg and lactation_yield_high_kg/i);
    expect(() => compileBreedRow(makeValidBreedRow({ fat_pct_low: '8.0', fat_pct_high: '7.0' }))).toThrow(
      /fat_pct_high/i,
    );
    expect(() => parseCsv('id,name\n"unterminated')).toThrow(/unterminated/i);
  });

  it('verifies package.json scripts/dependencies, .gitignore rules, and typed Solver.Solve', () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));
    expect(pkg.dependencies['javascript-lp-solver']).toBeDefined();
    expect(pkg.devDependencies['@vercel/node']).toBeDefined();
    expect(pkg.devDependencies['vite-node']).toBeDefined();
    expect(pkg.scripts['compile:data']).toBe('node scripts/compile_data.mjs');

    const gitignore = readFileSync(resolve(process.cwd(), '.gitignore'), 'utf8');
    for (const entry of ['eval/out/', '.vercel/', 'playwright-report/', 'test-results/', 'coverage/']) {
      expect(gitignore).toContain(entry);
    }

    const model: LpModel = {
      optimize: 'cost',
      opType: 'min',
      constraints: { dm: { min: 10 } },
      variables: { straw: { cost: 5, dm: 1 } },
    };
    const sol = Solver.Solve(model);
    expect(sol.feasible).toBe(true);
    expect(sol.result).toBe(50);
  });
});

describe('Provenance and verification-gate audit (M3-TASK-04, SPEC AC-1.1, AC-6.1, AC-L1.2)', () => {
  it('verifies every row in data/feeds.csv has valid, non-empty citation and provenance fields', () => {
    const feedsCsvText = readFileSync(resolve(process.cwd(), 'data/feeds.csv'), 'utf8');
    const rawFeeds = parseCsv(feedsCsvText, 'feeds.csv');
    expect(rawFeeds.length).toBe(31);

    for (const row of rawFeeds) {
      const feedId = row.id;
      expect(feedId, `feed ${feedId} missing id`).toBeTruthy();
      expect(row.source_doc, `feed ${feedId} missing source_doc`).toBeTruthy();
      expect(row.source_table, `feed ${feedId} missing source_table`).toBeTruthy();
      expect(row.source_page, `feed ${feedId} missing source_page`).toBeTruthy();
      expect(row.dm_source_citation, `feed ${feedId} missing dm_source_citation`).toBeTruthy();
      expect(row.season_citation, `feed ${feedId} missing season_citation`).toBeTruthy();
      expect(VALID_PROVENANCES.has(row.season_provenance), `feed ${feedId} invalid season_provenance`).toBe(true);

      if (row.default_price_inr_per_kg_as_fed && row.default_price_inr_per_kg_as_fed.trim() !== '') {
        expect(row.price_source, `feed ${feedId} has price but missing price_source`).toBeTruthy();
        expect(row.price_date, `feed ${feedId} has price but missing price_date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(
          VALID_RELIABILITIES.has(row.price_reliability),
          `feed ${feedId} has price with invalid price_reliability "${row.price_reliability}"`,
        ).toBe(true);
      } else {
        // Unpriced feed (e.g. molasses per AC-3.2)
        expect(feedId).toBe('molasses');
        expect(row.price_source).toBe('');
        expect(row.price_date).toBe('');
        expect(row.price_reliability).toBe('');
      }

      if (row.price_reliability === 'team_estimate') {
        expect(row.price_note_en, `feed ${feedId} team_estimate missing price_note_en`).toBeTruthy();
        expect(row.price_note_hi, `feed ${feedId} team_estimate missing price_note_hi`).toBeTruthy();
      }

      if (row.local_name_deva_provenance === 'cited') {
        expect(row.local_name_latn_citation, `feed ${feedId} cited Devanagari missing local_name_latn_citation`).toBeTruthy();
      }
    }
  });

  it('verifies every row in data/breeds.csv has valid, non-empty citation fields and cited peak sources', () => {
    const breedsCsvText = readFileSync(resolve(process.cwd(), 'data/breeds.csv'), 'utf8');
    const rawBreeds = parseCsv(breedsCsvText, 'breeds.csv');
    expect(rawBreeds.length).toBe(16);

    const breedsWithCitedPeak = ['sahiwal', 'murrah', 'nili_ravi', 'bhadawari'];

    for (const row of rawBreeds) {
      const breedId = row.id;
      expect(breedId, `breed ${breedId} missing id`).toBeTruthy();
      expect(row.yield_source_doc, `breed ${breedId} missing yield_source_doc`).toBeTruthy();
      expect(row.yield_source_table, `breed ${breedId} missing yield_source_table`).toBeTruthy();
      expect(row.yield_source_page, `breed ${breedId} missing yield_source_page`).toBeTruthy();

      if (row.female_body_weight_kg && row.female_body_weight_kg.trim() !== '') {
        expect(row.body_weight_citation, `breed ${breedId} has body weight but missing body_weight_citation`).toBeTruthy();
      }

      if (row.fat_pct_low && row.fat_pct_low.trim() !== '') {
        expect(row.fat_source_doc, `breed ${breedId} has fat_pct but missing fat_source_doc`).toBeTruthy();
        expect(row.fat_source_table, `breed ${breedId} has fat_pct but missing fat_source_table`).toBeTruthy();
        expect(row.fat_source_page, `breed ${breedId} has fat_pct but missing fat_source_page`).toBeTruthy();
      }

      if (row.peak_daily_yield_kg && row.peak_daily_yield_kg.trim() !== '') {
        expect(row.peak_source_doc, `breed ${breedId} has peak yield but missing peak_source_doc`).toBeTruthy();
        expect(row.peak_source_table, `breed ${breedId} has peak yield but missing peak_source_table`).toBeTruthy();
        expect(row.peak_source_page, `breed ${breedId} has peak yield but missing peak_source_page`).toBeTruthy();
      }
    }

    for (const citedBreedId of breedsWithCitedPeak) {
      const row = rawBreeds.find((b) => b.id === citedBreedId);
      expect(row, `expected breed ${citedBreedId} to exist`).toBeDefined();
      expect(Number(row!.peak_daily_yield_kg)).toBeGreaterThan(0);
      expect(row!.peak_source_doc).toBeTruthy();
      expect(row!.peak_source_table).toBeTruthy();
      expect(row!.peak_source_page).toBeTruthy();
    }
  });

  it('verifies data/requirements.json has complete citations and valid coefficients', () => {
    const rawReq = JSON.parse(readFileSync(resolve(process.cwd(), 'data/requirements.json'), 'utf8'));

    // DMI coefficients & citation
    expect(rawReq.dmi).toBeDefined();
    expect(rawReq.dmi.fcmMilkCoeff).toBeGreaterThan(0);
    expect(rawReq.dmi.fcmFatCoeff).toBeGreaterThan(0);
    expect(rawReq.dmi.fcmCoeff).toBeGreaterThan(0);
    expect(rawReq.dmi.bw075Coeff).toBeGreaterThan(0);
    expect(rawReq.dmi.lagRate).toBeGreaterThan(0);
    expect(rawReq.dmi.lagOffset).toBeGreaterThan(0);
    expect(rawReq.dmi.defaultWeekOfLactation).toBeGreaterThan(0);
    expect(rawReq.dmi.citation.doc).toBeTruthy();
    expect(rawReq.dmi.citation.table).toBeTruthy();
    expect(rawReq.dmi.citation.page).toBeTruthy();

    // Maintenance citation
    expect(rawReq.maintenance).toBeDefined();
    expect(rawReq.maintenance.citation.doc).toBeTruthy();
    expect(rawReq.maintenance.citation.table).toBeTruthy();
    expect(rawReq.maintenance.citation.page).toBeTruthy();

    // Lactation citation
    expect(rawReq.lactation).toBeDefined();
    expect(rawReq.lactation.citation.doc).toBeTruthy();
    expect(rawReq.lactation.citation.table).toBeTruthy();
    expect(rawReq.lactation.citation.page).toBeTruthy();

    // Nutrient citations for all 5 required nutrients
    expect(rawReq.nutrientCitations).toBeDefined();
    for (const nutrient of ['DM', 'CP', 'ME', 'Ca', 'P']) {
      const cit = rawReq.nutrientCitations[nutrient];
      expect(cit, `missing citation for nutrient ${nutrient}`).toBeDefined();
      expect(cit.doc).toBeTruthy();
      expect(cit.table).toBeTruthy();
      expect(cit.page).toBeTruthy();
    }

    // Roughage minimum share of DM
    expect(rawReq.roughageMinShareOfDm).toBeDefined();
    expect(rawReq.roughageMinShareOfDm.value).toBe(0.4);
    expect(rawReq.roughageMinShareOfDm.citation.doc).toMatch(/\b(ICAR|NDDB)\b/i);
    expect(rawReq.roughageMinShareOfDm.citation.table).toBeTruthy();
    expect(rawReq.roughageMinShareOfDm.citation.page).toBeTruthy();
  });

  it('reports human verification gate status for feeds, breeds, and requirements', () => {
    const rawFeeds = parseCsv(readFileSync(resolve(process.cwd(), 'data/feeds.csv'), 'utf8'), 'feeds.csv');
    const rawBreeds = parseCsv(readFileSync(resolve(process.cwd(), 'data/breeds.csv'), 'utf8'), 'breeds.csv');
    const rawReq = JSON.parse(readFileSync(resolve(process.cwd(), 'data/requirements.json'), 'utf8'));

    const unverifiedFeeds = rawFeeds.filter((f) => !f.verified_on || f.verified_on.trim() === '');
    const verifiedFeeds = rawFeeds.filter((f) => Boolean(f.verified_on && f.verified_on.trim() !== ''));

    const unverifiedBreeds = rawBreeds.filter((b) => !b.verified_on || b.verified_on.trim() === '');
    const verifiedBreeds = rawBreeds.filter((b) => Boolean(b.verified_on && b.verified_on.trim() !== ''));

    const reqGates = [
      { key: 'dmi', verifiedOn: rawReq.dmi?.verifiedOn },
      { key: 'maintenance', verifiedOn: rawReq.maintenance?.verifiedOn },
      { key: 'lactation', verifiedOn: rawReq.lactation?.verifiedOn },
      { key: 'roughageMinShareOfDm', verifiedOn: rawReq.roughageMinShareOfDm?.verifiedOn },
    ];
    const unverifiedReqs = reqGates.filter((r) => !r.verifiedOn);

    // All date values, when present, must match YYYY-MM-DD
    for (const f of verifiedFeeds) {
      expect(f.verified_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    for (const b of verifiedBreeds) {
      expect(b.verified_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }

    // Verify verification pending status counts (human verification gate awaiting paravet / expert sign-off)
    expect(unverifiedFeeds.length).toBe(29);
    expect(unverifiedBreeds.length).toBe(16);
    expect(unverifiedReqs.length).toBe(0);
  });

  it('inspects src/i18n/strings.ts and asserts HINDI_REVIEW matches verified gate', () => {
    expect(HINDI_REVIEW).toBeDefined();
    expect(HINDI_REVIEW.status).toBe('verified');
    expect(HINDI_REVIEW.reviewedBy).toBeTruthy();
    expect(HINDI_REVIEW.reviewedOn).toBe('2026-10-13');
  });

  it('asserts zero prototype fixture flags or placeholder values in production src/data/*.v1.json artifacts', () => {
    const v1FileNames = ['feeds.v1.json', 'breeds.v1.json', 'requirements.v1.json'];
    const forbiddenMarkers = [
      '__prototype',
      'is_fixture',
      'fixture',
      'isPrototype',
      'n/a (fixture)',
      'TODO',
      'FIXME',
    ];

    for (const fileName of v1FileNames) {
      const filePath = resolve(process.cwd(), 'src/data', fileName);
      const rawText = readFileSync(filePath, 'utf8');

      for (const marker of forbiddenMarkers) {
        expect(
          rawText.includes(marker),
          `Production artifact ${fileName} unexpectedly contains forbidden fixture marker "${marker}"`,
        ).toBe(false);
      }

      const parsed = JSON.parse(rawText);
      expect(parsed).toBeDefined();

      if (fileName === 'feeds.v1.json') {
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed.length).toBe(31);
        for (const feed of parsed) {
          expect(feed.id).toBeTruthy();
          expect(feed.englishName).toBeTruthy();
          expect(feed.vertical).toBeTruthy();
          expect(Array.isArray(feed.availableMonths)).toBe(true);
          expect(feed.seasonCitation).toBeTruthy();
          expect(feed.sourceDoc).toBeTruthy();
          expect(feed.dmSourceCitation).toBeTruthy();
        }
      } else if (fileName === 'breeds.v1.json') {
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed.length).toBe(16);
        for (const breed of parsed) {
          expect(breed.id).toBeTruthy();
          expect(breed.species).toBeTruthy();
          expect(breed.englishName).toBeTruthy();
          expect(typeof breed.milkCapLPerDay).toBe('number');
          expect(breed.milkCapLPerDay).toBeGreaterThan(0);
          expect(breed.capBasis).toBeTruthy();
          expect(breed.yieldCitation?.doc).toBeTruthy();
        }
      } else if (fileName === 'requirements.v1.json') {
        expect(parsed.version).toBe('v1');
        expect(parsed.roughageMinShareOfDm?.value).toBe(0.4);
        expect(parsed.dmi?.citation?.doc).toBeTruthy();
      }
    }
  });
});

