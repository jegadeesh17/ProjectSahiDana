import { describe, expect, it } from 'vitest';
import feedsV1 from '../../src/data/feeds.v1.json';
import requirementsV1 from '../../src/data/requirements.v1.json';
import { breedById } from '../../src/domain/breeds';
import { isRoughage } from '../../src/domain/nutrition';
import {
  computeRequirements,
  solveRation,
  SolverError,
  verifyRationSolution,
} from '../../src/domain/solver';
import {
  BINDING_ORDER,
  NUTRIENT_KEYS,
  type AnimalProfile,
  type FeedItem,
  type RationSolution,
  type SelectedFeedInput,
} from '../../src/domain/types';

const allFeeds = feedsV1 as unknown as FeedItem[];
const ROUGHAGE_MIN_SHARE = requirementsV1.roughageMinShareOfDm.value;

const baseAnimal: AnimalProfile = {
  species: 'buffalo',
  breedId: 'murrah',
  bodyWeightKg: 450,
  milkYieldLitersPerDay: 8,
  milkFatPct: 6.5,
  budgetInrPerDay: 140,
  isConfirmed: true,
};

const murrahCap = breedById('murrah')!.milkCapLPerDay; // 8.6 L/day

const richFeeds: SelectedFeedInput[] = [
  { feedId: 'berseem', priceInrPerKgAsFed: 4, maxKgAsFedPerDay: null, currentKgAsFedPerDay: 20 },
  { feedId: 'wheat_straw', priceInrPerKgAsFed: 6, maxKgAsFedPerDay: null, currentKgAsFedPerDay: 4 },
  { feedId: 'mustard_cake', priceInrPerKgAsFed: 32, maxKgAsFedPerDay: null, currentKgAsFedPerDay: 2 },
  { feedId: 'wheat_bran', priceInrPerKgAsFed: 22, maxKgAsFedPerDay: null, currentKgAsFedPerDay: 1.5 },
  { feedId: 'mineral_mix', priceInrPerKgAsFed: 90, maxKgAsFedPerDay: 0.1, currentKgAsFedPerDay: 0.05 },
];

describe('two-stage ration solver (src/domain/solver.ts)', () => {
  it('computes daily nutrient requirements with linear model and citations for all 5 NUTRIENT_KEYS (AC-2.1)', () => {
    const res = computeRequirements(baseAnimal);
    expect(res.requirements.dmKgPerDay).toBeGreaterThan(10);
    expect(res.requirements.cpGramsPerDay).toBeGreaterThan(1000);
    expect(res.requirements.meMcalPerDay).toBeGreaterThan(20);
    expect(res.requirements.caGramsPerDay).toBeGreaterThan(30);
    expect(res.requirements.pGramsPerDay).toBeGreaterThan(15);
    expect(res.model).toBeDefined();
    expect(res.atMilkLPerDay).toBe(8);
    for (const k of NUTRIENT_KEYS) {
      expect(res.citations[k].sourceDoc).toBeTruthy();
      expect(res.citations[k].formulaDisplay).toBeTruthy();
    }
  });

  it('Stage 1 + Stage 2 returns an optimal ration within the budget that meets requirements at S (AC-5.1, AC-5.2)', () => {
    const out = solveRation(baseAnimal, richFeeds);
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;

    expect(out.supportedMilkLPerDay).toBeGreaterThan(0);
    expect(out.supportedMilkLPerDay).toBeLessThanOrEqual(out.effectiveCapLPerDay + 1e-6);
    expect(out.totalCostInr).toBeLessThanOrEqual(baseAnimal.budgetInrPerDay + 1e-6);

    const reqAtS = computeRequirements({ ...baseAnimal, milkYieldLitersPerDay: out.supportedMilkLPerDay }).requirements;
    expect(out.supplied.dmKgPerDay).toBeLessThanOrEqual(reqAtS.dmKgPerDay + 1e-6);
    expect(out.supplied.cpGramsPerDay + 1e-6).toBeGreaterThanOrEqual(reqAtS.cpGramsPerDay);
    expect(out.supplied.meMcalPerDay + 1e-6).toBeGreaterThanOrEqual(reqAtS.meMcalPerDay);
    expect(out.supplied.caGramsPerDay + 1e-6).toBeGreaterThanOrEqual(reqAtS.caGramsPerDay);
    expect(out.supplied.pGramsPerDay + 1e-6).toBeGreaterThanOrEqual(reqAtS.pGramsPerDay);

    expect(out.currentCostInr).toBeCloseTo(20 * 4 + 4 * 6 + 2 * 32 + 1.5 * 22 + 0.05 * 90, 5);
    expect(out.savingsInr).toBeCloseTo((out.currentCostInr ?? 0) - out.totalCostInr, 5);
  });

  it('caps S at the breed milkCapLPerDay when budget is high and reports breed_cap as binding (AC-5.3, AC-5.4, AC-5.5)', () => {
    const out = solveRation({ ...baseAnimal, milkYieldLitersPerDay: 6, budgetInrPerDay: 500 }, richFeeds);
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;

    expect(out.milkCapLPerDay).toBe(murrahCap);
    expect(out.effectiveCapLPerDay).toBe(murrahCap);
    expect(out.supportedMilkLPerDay).toBeCloseTo(Math.floor(murrahCap * 10 + 1e-7) / 10, 5);
    expect(out.bindingConstraint).toBe('breed_cap');
    expect(out.tightConstraints).toContain('breed_cap');
    expect(out.totalCostInr).toBeLessThan(300);
  });

  it('uses today milk as the effective cap when today milk exceeds the breed cap (OQ15, AC-5.3, AC-5.7)', () => {
    const out = solveRation({ ...baseAnimal, milkYieldLitersPerDay: 11, budgetInrPerDay: 500 }, richFeeds);
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;

    expect(out.milkCapLPerDay).toBe(murrahCap);
    expect(out.effectiveCapLPerDay).toBe(11);
    expect(out.effectiveCapSource).toBe('today_milk');
    expect(out.supportedMilkLPerDay).toBe(11);
    expect(out.bindingConstraint).toBe('breed_cap');
    expect(out.verdict.kind).toBe('above_breed_level');
  });

  it('names a binding constraint from the fixed priority order and records feedLimitIds when a feed cap binds (AC-5.5, OQ6)', () => {
    const capped: SelectedFeedInput[] = [
      { feedId: 'wheat_straw', priceInrPerKgAsFed: 6, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'mustard_cake', priceInrPerKgAsFed: 32, maxKgAsFedPerDay: 1.8, currentKgAsFedPerDay: null },
      { feedId: 'bajra_grain', priceInrPerKgAsFed: 23, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'mineral_mix', priceInrPerKgAsFed: 90, maxKgAsFedPerDay: 0.1, currentKgAsFedPerDay: null },
    ];
    const out = solveRation({ ...baseAnimal, budgetInrPerDay: 400 }, capped);
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;

    expect(BINDING_ORDER).toContain(out.bindingConstraint);
    expect(out.feedLimitIds).toContain('mustard_cake');
  });

  it('verdict is gain when S - T >= 0.1 L/day (AC-5.6)', () => {
    const out = solveRation({ ...baseAnimal, milkYieldLitersPerDay: 5, budgetInrPerDay: 200 }, richFeeds);
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;
    expect(out.verdict.kind).toBe('gain');
    if (out.verdict.kind === 'gain') {
      expect(out.verdict.gainLPerDay).toBeCloseTo(out.supportedMilkLPerDay - 5, 5);
    }
  });

  it('verdict is at_breed_level when S hits the cap with less than 0.1 L above T (AC-5.7)', () => {
    const atLevelFeeds: SelectedFeedInput[] = [
      { feedId: 'berseem', priceInrPerKgAsFed: 4, maxKgAsFedPerDay: null, currentKgAsFedPerDay: 25 },
      { feedId: 'wheat_straw', priceInrPerKgAsFed: 6, maxKgAsFedPerDay: null, currentKgAsFedPerDay: 5 },
      { feedId: 'mustard_cake', priceInrPerKgAsFed: 32, maxKgAsFedPerDay: null, currentKgAsFedPerDay: 3 },
      { feedId: 'wheat_bran', priceInrPerKgAsFed: 22, maxKgAsFedPerDay: null, currentKgAsFedPerDay: 2 },
      { feedId: 'mineral_mix', priceInrPerKgAsFed: 90, maxKgAsFedPerDay: 0.1, currentKgAsFedPerDay: 0.1 },
    ];
    const out = solveRation({ ...baseAnimal, milkYieldLitersPerDay: murrahCap, budgetInrPerDay: 300 }, atLevelFeeds);
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;
    expect(out.verdict.kind).toBe('at_breed_level');
    if (out.verdict.kind === 'at_breed_level') {
      expect(out.verdict.savingInrPerDay).not.toBeNull();
      expect(out.verdict.savingInrPerDay!).toBeGreaterThan(0);
    }
  });

  it('verdict is below_today with keepCostInrPerDay B when budget cannot keep today milk (AC-5.11)', () => {
    const out = solveRation({ ...baseAnimal, milkYieldLitersPerDay: 8, budgetInrPerDay: 95 }, richFeeds);
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;
    expect(out.supportedMilkLPerDay).toBeLessThan(8);
    expect(out.verdict.kind).toBe('below_today');
    if (out.verdict.kind === 'below_today') {
      expect(out.verdict.keepCostInrPerDay).not.toBeNull();
      expect(out.verdict.keepCostInrPerDay!).toBeGreaterThan(95);
      expect(out.verdict.limitingNutrients).toEqual([]);
    }
  });

  it('verdict is below_today with limitingNutrients when selected feeds cannot reach today milk at any budget (AC-5.11)', () => {
    const cappedLow: SelectedFeedInput[] = [
      { feedId: 'berseem', priceInrPerKgAsFed: 4, maxKgAsFedPerDay: 18, currentKgAsFedPerDay: null },
      { feedId: 'wheat_straw', priceInrPerKgAsFed: 6, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'wheat_bran', priceInrPerKgAsFed: 22, maxKgAsFedPerDay: 2, currentKgAsFedPerDay: null },
      { feedId: 'mineral_mix', priceInrPerKgAsFed: 90, maxKgAsFedPerDay: 0.1, currentKgAsFedPerDay: null },
    ];
    const out = solveRation({ ...baseAnimal, milkYieldLitersPerDay: 10, budgetInrPerDay: 400 }, cappedLow);
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;
    expect(out.verdict.kind).toBe('below_today');
    if (out.verdict.kind === 'below_today') {
      expect(out.verdict.keepCostInrPerDay).toBeNull();
      expect(out.verdict.limitingNutrients.length).toBeGreaterThan(0);
    }
  });

  it('verdict is same_as_today when S equals T below the cap (OQ14)', () => {
    const probe = solveRation({ ...baseAnimal, milkYieldLitersPerDay: 5, budgetInrPerDay: 200 }, richFeeds);
    expect(probe.status).toBe('optimal');
    if (probe.status !== 'optimal') return;

    const exact5 = solveRation({ ...baseAnimal, milkYieldLitersPerDay: 5, budgetInrPerDay: 500 }, [
      ...richFeeds.map((f) => ({ ...f, currentKgAsFedPerDay: null })),
    ]);
    expect(exact5.status).toBe('optimal');
    if (exact5.status !== 'optimal') return;
    const costAt5 = exact5.costAtTodayMilkInrPerDay!;

    const out = solveRation(
      { ...baseAnimal, milkYieldLitersPerDay: 5, budgetInrPerDay: costAt5 + 0.2 },
      richFeeds.map((f) => ({ ...f, currentKgAsFedPerDay: null })),
    );
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;
    expect(out.supportedMilkLPerDay).toBe(5);
    expect(out.verdict.kind).toBe('same_as_today');
  });

  it('dry animal (T = 0) skips Stage 1, returns maintenance ration and dry_animal verdict (AC-5.13)', () => {
    const out = solveRation({ ...baseAnimal, milkYieldLitersPerDay: 0, budgetInrPerDay: 140 }, richFeeds);
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;
    expect(out.supportedMilkLPerDay).toBe(0);
    expect(out.verdict.kind).toBe('dry_animal');
    expect(out.fatComparison).toBeNull();
    expect(out.totalCostInr).toBeCloseTo(out.maintenanceCostInrPerDay, 5);
    expect(out.costAtTodayMilkInrPerDay).toBeCloseTo(out.maintenanceCostInrPerDay, 5);
  });

  it('returns fatComparison with breed fat when today milk > 0, and null breedFatPct when breed has none (AC-5.9, AC-5.10)', () => {
    const withFat = solveRation(baseAnimal, richFeeds);
    expect(withFat.status).toBe('optimal');
    if (withFat.status === 'optimal') {
      expect(withFat.fatComparison).toEqual({
        todayFatPct: 6.5,
        breedFatPct: 7.34,
        breedFatPctLow: 7.34,
        breedFatPctHigh: null,
      });
    }

    const kankrej: AnimalProfile = {
      ...baseAnimal,
      species: 'cow',
      breedId: 'kankrej',
      milkFatPct: 4.0,
    };
    const noFat = solveRation(kankrej, richFeeds);
    expect(noFat.status).toBe('optimal');
    if (noFat.status === 'optimal') {
      expect(noFat.fatComparison).toEqual({
        todayFatPct: 4.0,
        breedFatPct: null,
        breedFatPctLow: null,
        breedFatPctHigh: null,
      });
    }
  });

  it('returns budget_below_maintenance with M and a cheaper library feed when budget < M (AC-E7.1)', () => {
    const priceyFeeds: SelectedFeedInput[] = [
      { feedId: 'lucerne', priceInrPerKgAsFed: 8, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'groundnut_cake', priceInrPerKgAsFed: 42, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'maize_grain', priceInrPerKgAsFed: 24, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'mineral_mix', priceInrPerKgAsFed: 90, maxKgAsFedPerDay: 0.1, currentKgAsFedPerDay: null },
    ];
    const probe = solveRation({ ...baseAnimal, milkYieldLitersPerDay: 0, budgetInrPerDay: 500 }, priceyFeeds);
    expect(probe.status).toBe('optimal');
    if (probe.status !== 'optimal') return;
    const M = probe.maintenanceCostInrPerDay;

    const out = solveRation({ ...baseAnimal, budgetInrPerDay: M - 5 }, priceyFeeds);
    expect(out.status).toBe('budget_below_maintenance');
    if (out.status !== 'budget_below_maintenance') return;
    expect(out.verdict.maintenanceCostInrPerDay).toBeCloseTo(M, 4);
    expect(out.fixFeedId).not.toBeNull();
    // Must never suggest an unpriced feed (like molasses)
    const suggestedFeed = allFeeds.find((f) => f.id === out.fixFeedId);
    expect(suggestedFeed?.defaultPriceInrPerKgAsFed).not.toBeNull();
    expect(out.maintenanceWithFixInrPerDay!).toBeLessThanOrEqual(M - 5 + 1e-6);
  });

  it('returns fixFeedId = null when no unselected priced library feed can bring maintenance within budget (AC-E7.1)', () => {
    const out = solveRation({ ...baseAnimal, budgetInrPerDay: 1 }, richFeeds);
    expect(out.status).toBe('budget_below_maintenance');
    if (out.status !== 'budget_below_maintenance') return;
    expect(out.fixFeedId).toBeNull();
    expect(out.maintenanceWithFixInrPerDay).toBeNull();
    expect(out.fixFeed).toBeNull();
  });

  it('diagnoses wheat straw alone as infeasible at maintenance and suggests feeds (AC-E2.1)', () => {
    const strawOnly: SelectedFeedInput[] = [
      { feedId: 'wheat_straw', priceInrPerKgAsFed: 6, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
    ];
    const out = solveRation(baseAnimal, strawOnly);
    expect(out.status).toBe('infeasible');
    if (out.status !== 'infeasible') return;

    const limKeys = out.limitingNutrients.map((l) => l.nutrient);
    expect(limKeys).toContain('CP');
    expect(out.suggestedFeeds.length).toBeGreaterThan(0);
  });

  it('respects per-feed maxKgAsFedPerDay caps in Stage 2', () => {
    const capped: SelectedFeedInput[] = [
      { feedId: 'berseem', priceInrPerKgAsFed: 4, maxKgAsFedPerDay: 10, currentKgAsFedPerDay: null },
      { feedId: 'wheat_straw', priceInrPerKgAsFed: 6, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'mustard_cake', priceInrPerKgAsFed: 32, maxKgAsFedPerDay: 2, currentKgAsFedPerDay: null },
      { feedId: 'wheat_bran', priceInrPerKgAsFed: 22, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'mineral_mix', priceInrPerKgAsFed: 90, maxKgAsFedPerDay: 0.1, currentKgAsFedPerDay: null },
    ];
    const out = solveRation(baseAnimal, capped);
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;

    const berseem = out.feeds.find((f) => f.feedId === 'berseem');
    if (berseem) {
      expect(berseem.kgAsFed).toBeLessThanOrEqual(10 + 1e-6);
    }
  });

  it('keeps roughage dry matter at or above 40% of total dry matter (AC-5.12)', () => {
    const cheapConcentrates: SelectedFeedInput[] = [
      { feedId: 'wheat_straw', priceInrPerKgAsFed: 12, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'wheat_bran', priceInrPerKgAsFed: 5, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'mustard_cake', priceInrPerKgAsFed: 6, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'maize_grain', priceInrPerKgAsFed: 5, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'mineral_mix', priceInrPerKgAsFed: 90, maxKgAsFedPerDay: 0.1, currentKgAsFedPerDay: null },
    ];
    const out = solveRation(baseAnimal, cheapConcentrates);
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;

    expect(out.roughageMinSharePct).toBe(ROUGHAGE_MIN_SHARE * 100);
    expect(out.roughageSharePct + 1e-6).toBeGreaterThanOrEqual(out.roughageMinSharePct);
  });

  it('rejects a selection with no roughage feeds, names roughage, and suggests the cheapest-per-kg-DM priced roughage feed (AC-E2.2)', () => {
    const noRoughage: SelectedFeedInput[] = [
      { feedId: 'mustard_cake', priceInrPerKgAsFed: 32, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'wheat_bran', priceInrPerKgAsFed: 22, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'maize_grain', priceInrPerKgAsFed: 24, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'mineral_mix', priceInrPerKgAsFed: 90, maxKgAsFedPerDay: 0.1, currentKgAsFedPerDay: null },
    ];
    const out = solveRation(baseAnimal, noRoughage);
    expect(out.status).toBe('infeasible');
    if (out.status !== 'infeasible') return;

    const rough = out.limitingNutrients.find((l) => l.nutrient === 'roughage');
    expect(rough).toBeDefined();
    expect(rough!.required).toBe(40);
    expect(rough!.maxSupply).toBe(0);

    const roughSug = out.suggestedFeeds.find((s) => s.nutrients.includes('roughage'));
    expect(roughSug).toBeDefined();
    const feed = allFeeds.find((f) => f.id === roughSug!.feedId)!;
    expect(isRoughage(feed)).toBe(true);
    expect(feed.defaultPriceInrPerKgAsFed).not.toBeNull();
  });

  it('rejects a selection where roughage is capped below 40% of minimum DM (AC-E2.2)', () => {
    const cappedRoughage: SelectedFeedInput[] = [
      { feedId: 'wheat_straw', priceInrPerKgAsFed: 6, maxKgAsFedPerDay: 1, currentKgAsFedPerDay: null },
      { feedId: 'mustard_cake', priceInrPerKgAsFed: 32, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'maize_grain', priceInrPerKgAsFed: 24, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'mineral_mix', priceInrPerKgAsFed: 90, maxKgAsFedPerDay: 0.1, currentKgAsFedPerDay: null },
    ];
    const out = solveRation(baseAnimal, cappedRoughage);
    expect(out.status).toBe('infeasible');
    if (out.status !== 'infeasible') return;

    expect(out.limitingNutrients.some((l) => l.nutrient === 'roughage')).toBe(true);
  });

  it('has no 85% DM floor: accepts nutrient-dense rations meeting all requirements and roughage >= 40% below 85% of dmMax', () => {
    const baseTemplate = allFeeds[0];
    const denseRoughage: FeedItem = {
      ...baseTemplate,
      id: 'dense_roughage',
      vertical: 'indigenous_forage',
      dmPct: 100,
      cpPctDm: 25,
      meMcalPerKgDm: 3.4,
      caGramsPerKgDm: 8,
      pGramsPerKgDm: 5,
      defaultPriceInrPerKgAsFed: 10,
    };
    const out = solveRation(
      { ...baseAnimal, milkYieldLitersPerDay: 0, budgetInrPerDay: 200 },
      [{ feedId: 'dense_roughage', priceInrPerKgAsFed: 10, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null }],
      [denseRoughage],
    );
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;
    // Maintenance ME is ~13 Mcal -> ~3.82 kg DM, which is ~41% of dmMax (~9.36 kg DM), well below the old 85% floor!
    expect(out.supplied.dmKgPerDay).toBeLessThan(0.85 * out.requirementsAtS!.dmKgPerDay);
  });

  it('throws SolverError from verifyRationSolution when a constraint is violated by more than 1e-6', () => {
    const out = solveRation(baseAnimal, richFeeds);
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;

    const overBudget: RationSolution = {
      ...out,
      feeds: out.feeds.map((f, idx) => (idx === 0 ? { ...f, kgAsFed: f.kgAsFed + 5 } : f)),
    };
    expect(() => verifyRationSolution(overBudget, baseAnimal, richFeeds)).toThrow(SolverError);

    const underNutrient: RationSolution = {
      ...out,
      feeds: out.feeds.map((f) => ({ ...f, kgAsFed: f.kgAsFed * 0.5 })),
    };
    expect(() => verifyRationSolution(underNutrient, baseAnimal, richFeeds)).toThrow(SolverError);

    const negativeKg: RationSolution = {
      ...out,
      feeds: [{ ...out.feeds[0], kgAsFed: -0.5 }],
    };
    expect(() => verifyRationSolution(negativeKg, baseAnimal, richFeeds)).toThrow(SolverError);

    const unknownFeedSol: RationSolution = {
      ...out,
      feeds: [{ ...out.feeds[0], feedId: 'non_existent_feed' }],
    };
    expect(() => verifyRationSolution(unknownFeedSol, baseAnimal, richFeeds)).toThrow(SolverError);
  });

  it('computes underBudgetInr and negative savingsInr ("more than today") when new ration costs more than today (AC-5.2)', () => {
    const lowTodayRation: SelectedFeedInput[] = [
      { feedId: 'berseem', priceInrPerKgAsFed: 4, maxKgAsFedPerDay: null, currentKgAsFedPerDay: 2 },
      { feedId: 'wheat_straw', priceInrPerKgAsFed: 6, maxKgAsFedPerDay: null, currentKgAsFedPerDay: 2 },
      { feedId: 'mustard_cake', priceInrPerKgAsFed: 32, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'wheat_bran', priceInrPerKgAsFed: 22, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'mineral_mix', priceInrPerKgAsFed: 90, maxKgAsFedPerDay: 0.1, currentKgAsFedPerDay: null },
    ];
    const out = solveRation({ ...baseAnimal, budgetInrPerDay: 200 }, lowTodayRation);
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;

    expect(out.underBudgetInr).toBeCloseTo(200 - out.totalCostInr, 5);
    expect(out.currentCostInr).toBeCloseTo(2 * 4 + 2 * 6, 5); // 20 INR/day
    expect(out.savingsInr).not.toBeNull();
    expect(out.savingsInr!).toBeLessThan(0);
    expect(out.savingsPct!).toBeLessThan(0);
  });

  it('diagnoses a DM intake conflict (dmConflict = true) when each nutrient is reachable alone but not jointly within dmMax (AC-E2.1)', () => {
    const tpl = allFeeds[0];
    // At 0 L for 450 kg buffalo: dmMax = k0 ~ 9.357 kg DM, CP req ~ 371.7 g, ME req ~ 13.01 Mcal.
    // Feed A (roughage) has high CP (100 g/kg DM) but 0 ME; 5 kg DM supplies 500 g CP (> 371.7 g).
    // Feed B (roughage) has high ME (2.4 Mcal/kg DM) but 0 CP; 6 kg DM supplies 14.4 Mcal ME (> 13.01 Mcal).
    // Together, meeting both requires 3.72 kg DM of A + 5.42 kg DM of B + Ca/P > 9.357 kg DM ceiling!
    const feedCpOnly: FeedItem = {
      ...tpl,
      id: 'roughage_cp_only',
      vertical: 'indigenous_forage',
      dmPct: 100,
      cpPctDm: 8.0, // 80 g/kg DM -> 9.357 * 80 = 748 g > 371.7 g (needs 4.65 kg DM)
      meMcalPerKgDm: 0,
      caGramsPerKgDm: 10,
      pGramsPerKgDm: 8,
      defaultPriceInrPerKgAsFed: 5,
    };
    const feedMeOnly: FeedItem = {
      ...tpl,
      id: 'roughage_me_only',
      vertical: 'crop_residue',
      dmPct: 100,
      cpPctDm: 0,
      meMcalPerKgDm: 2.5, // 9.357 * 2.5 = 23.4 Mcal > 13.01 Mcal (needs 5.21 kg DM)
      caGramsPerKgDm: 10,
      pGramsPerKgDm: 8,
      defaultPriceInrPerKgAsFed: 5,
    };
    // 4.65 + 5.21 = 9.86 kg DM > 9.357 kg DM ceiling -> each nutrient is feasible alone, roughage is 100%, but joint LP is infeasible!
    const out = solveRation(
      { ...baseAnimal, milkYieldLitersPerDay: 0, budgetInrPerDay: 200 },
      [
        { feedId: 'roughage_cp_only', priceInrPerKgAsFed: 5, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
        { feedId: 'roughage_me_only', priceInrPerKgAsFed: 5, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      ],
      [feedCpOnly, feedMeOnly, ...allFeeds],
    );
    expect(out.status).toBe('infeasible');
    if (out.status !== 'infeasible') return;
    expect(out.limitingNutrients).toEqual([]);
    expect(out.dmConflict).toBe(true);
    expect(out.suggestedFeeds.length).toBeGreaterThan(0);
  });

  it('never suggests an unpriced library feed in budget_below_maintenance even if it is nutrient-dense (AC-E7.1)', () => {
    const tpl = allFeeds[0];
    const unpricedSuperFeed: FeedItem = {
      ...tpl,
      id: 'unpriced_super_forage',
      vertical: 'indigenous_forage',
      dmPct: 100,
      cpPctDm: 30,
      meMcalPerKgDm: 3.5,
      caGramsPerKgDm: 15,
      pGramsPerKgDm: 10,
      defaultPriceInrPerKgAsFed: null,
      priceSource: null,
      priceDate: null,
      priceReliability: null,
    };
    const costlyRoughage: FeedItem = {
      ...tpl,
      id: 'costly_forage',
      vertical: 'indigenous_forage',
      dmPct: 100,
      cpPctDm: 15,
      meMcalPerKgDm: 2.5,
      caGramsPerKgDm: 8,
      pGramsPerKgDm: 5,
      defaultPriceInrPerKgAsFed: 20,
    };
    const out = solveRation(
      { ...baseAnimal, milkYieldLitersPerDay: 0, budgetInrPerDay: 50 },
      [{ feedId: 'costly_forage', priceInrPerKgAsFed: 20, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null }],
      [costlyRoughage, unpricedSuperFeed],
    );
    expect(out.status).toBe('budget_below_maintenance');
    if (out.status !== 'budget_below_maintenance') return;
    expect(out.fixFeedId).toBeNull();
    expect(out.fixFeed).toBeNull();
  });

  it('handles invalid feed inputs (empty list, unknown feedId, negative price, non-positive cap) safely as infeasible', () => {
    expect(solveRation(baseAnimal, []).status).toBe('infeasible');
    const badInputs: SelectedFeedInput[] = [
      { feedId: 'does_not_exist', priceInrPerKgAsFed: 10, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'berseem', priceInrPerKgAsFed: -5, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'wheat_straw', priceInrPerKgAsFed: 6, maxKgAsFedPerDay: 0, currentKgAsFedPerDay: null },
    ];
    expect(solveRation(baseAnimal, badInputs).status).toBe('infeasible');
  });
});

describe('isolated binding constraint detection for all 8 constraints in BINDING_ORDER (AC-5.5, ARCHITECTURE.md section 5)', () => {
  const tpl = allFeeds[0];
  const makeFeed = (
    id: string,
    vertical: FeedItem['vertical'],
    cpPctDm: number,
    meMcalPerKgDm: number,
    caGramsPerKgDm: number,
    pGramsPerKgDm: number,
    price = 10,
  ): FeedItem => ({
    ...tpl,
    id,
    englishName: id,
    vertical,
    dmPct: 100,
    cpPctDm,
    meMcalPerKgDm,
    caGramsPerKgDm,
    pGramsPerKgDm,
    defaultPriceInrPerKgAsFed: price,
  });

  const cowProfile: AnimalProfile = {
    species: 'cow',
    breedId: 'gir', // milkCapLPerDay = 8.66
    bodyWeightKg: 400,
    milkYieldLitersPerDay: 4,
    milkFatPct: 4.0,
    budgetInrPerDay: 500,
    isConfirmed: true,
  };

  const syntheticLib: FeedItem[] = [
    makeFeed('forage_balanced', 'indigenous_forage', 18, 2.8, 6, 4, 10),
    makeFeed('forage_low_me', 'indigenous_forage', 22, 1.65, 8, 5, 8),
    makeFeed('forage_zero', 'crop_residue', 0, 0, 0, 0, 5),
    makeFeed('forage_no_cp', 'indigenous_forage', 0, 3.0, 8, 5, 8),
    makeFeed('forage_no_me', 'indigenous_forage', 22, 0, 8, 5, 8),
    makeFeed('forage_no_ca', 'indigenous_forage', 22, 3.0, 0, 5, 8),
    makeFeed('forage_no_p', 'indigenous_forage', 22, 3.0, 8, 0, 8),
    makeFeed('conc_cp', 'agro_byproduct', 60, 0, 0, 0, 20),
    makeFeed('conc_me', 'agro_byproduct', 0, 5.0, 0, 0, 20),
    makeFeed('min_ca', 'mineral', 0, 0, 250, 0, 20),
    makeFeed('min_p', 'mineral', 0, 0, 0, 250, 20),
  ];

  const sel = (feedId: string, maxKgAsFedPerDay: number | null = null, price = 10): SelectedFeedInput => ({
    feedId,
    priceInrPerKgAsFed: price,
    maxKgAsFedPerDay,
    currentKgAsFedPerDay: null,
  });

  it('1. budget is the sole tight constraint when budget limits Y* below breed_cap and DM ceiling', () => {
    const out = solveRation(
      { ...cowProfile, budgetInrPerDay: 65 },
      [sel('forage_balanced', null, 10)],
      syntheticLib,
    );
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;
    expect(out.bindingConstraint).toBe('budget');
    expect(out.tightConstraints).toEqual(['budget']);
  });

  it('2. breed_cap is the sole tight constraint when budget and feed capacity have slack at effectiveCap', () => {
    const out = solveRation(
      { ...cowProfile, budgetInrPerDay: 500 },
      [sel('forage_balanced', null, 10)],
      syntheticLib,
    );
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;
    expect(out.bindingConstraint).toBe('breed_cap');
    expect(out.tightConstraints).toEqual(['breed_cap']);
  });

  it('3. intake is the sole tight constraint when NRC 2001 DM ceiling stops Y*', () => {
    const out = solveRation(
      { ...cowProfile, budgetInrPerDay: 500 },
      [sel('forage_low_me', null, 8)],
      syntheticLib,
    );
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;
    expect(out.bindingConstraint).toBe('intake');
    expect(out.tightConstraints).toEqual(['intake']);
  });

  it('4. roughage is the sole tight constraint when capped roughage forces roughageShare == 40% below dmMax', () => {
    const out = solveRation(
      { ...cowProfile, budgetInrPerDay: 500 },
      [
        sel('forage_zero', 3.0, 5),
        sel('conc_cp', null, 20),
        sel('conc_me', null, 20),
        sel('min_ca', null, 20),
        sel('min_p', null, 20),
      ],
      syntheticLib,
    );
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;
    expect(out.bindingConstraint).toBe('roughage');
    expect(out.tightConstraints).toEqual(['roughage']);
  });

  it('5. CP is the sole tight constraint when CP supplier is capped while roughage, DM, and budget have slack', () => {
    const out = solveRation(
      { ...cowProfile, budgetInrPerDay: 500 },
      [
        sel('forage_no_cp', null, 8),
        sel('conc_cp', 1.38, 20), // 1.38 kg * 600 g/kg = 828 g CP -> stops Y* around 4.8 L
      ],
      syntheticLib,
    );
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;
    expect(out.bindingConstraint).toBe('CP');
    expect(out.tightConstraints).toEqual(['CP']);
    expect(out.feedLimitIds).toContain('conc_cp');
  });

  it('6. ME is the sole tight constraint when ME supplier is capped while roughage, DM, and budget have slack', () => {
    const out = solveRation(
      { ...cowProfile, budgetInrPerDay: 500 },
      [
        sel('forage_no_me', null, 8),
        sel('conc_me', 3.4, 20), // 3.4 kg * 5.0 Mcal/kg = 17.0 Mcal ME -> stops Y* around 5.1 L
      ],
      syntheticLib,
    );
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;
    expect(out.bindingConstraint).toBe('ME');
    expect(out.tightConstraints).toEqual(['ME']);
    expect(out.feedLimitIds).toContain('conc_me');
  });

  it('7. Ca is the sole tight constraint when Ca supplier is capped while roughage, DM, and budget have slack', () => {
    const out = solveRation(
      { ...cowProfile, budgetInrPerDay: 500 },
      [
        sel('forage_no_ca', null, 8),
        sel('min_ca', 0.135, 20), // 0.135 kg * 250 g/kg = 33.75 g Ca -> stops Y* around 4.6 L
      ],
      syntheticLib,
    );
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;
    expect(out.bindingConstraint).toBe('Ca');
    expect(out.tightConstraints).toEqual(['Ca']);
    expect(out.feedLimitIds).toContain('min_ca');
  });

  it('8. P is the sole tight constraint when P supplier is capped while roughage, DM, and budget have slack', () => {
    const out = solveRation(
      { ...cowProfile, budgetInrPerDay: 500 },
      [
        sel('forage_no_p', null, 8),
        sel('min_p', 0.114, 20), // 0.114 kg * 250 g/kg = 28.5 g P -> stops Y* around 4.2 L
      ],
      syntheticLib,
    );
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;
    expect(out.bindingConstraint).toBe('P');
    expect(out.tightConstraints).toEqual(['P']);
    expect(out.feedLimitIds).toContain('min_p');
  });
});

describe('preset sanity across all 4 quick-pick animals', () => {
  const presets: Array<{ name: string; animal: AnimalProfile; feeds: SelectedFeedInput[] }> = [
    {
      name: 'milking buffalo (8 L)',
      animal: baseAnimal,
      feeds: richFeeds,
    },
    {
      name: 'high-yielding cow (12 L)',
      animal: {
        species: 'cow',
        breedId: 'hf_crossbred',
        bodyWeightKg: 420,
        milkYieldLitersPerDay: 12,
        milkFatPct: 4.0,
        budgetInrPerDay: 220,
        isConfirmed: true,
      },
      feeds: richFeeds,
    },
    {
      name: 'low-yielding cow (4 L)',
      animal: {
        species: 'cow',
        breedId: 'gir',
        bodyWeightKg: 360,
        milkYieldLitersPerDay: 4,
        milkFatPct: 4.5,
        budgetInrPerDay: 110,
        isConfirmed: true,
      },
      feeds: richFeeds,
    },
    {
      name: 'dry buffalo (0 L)',
      animal: { ...baseAnimal, milkYieldLitersPerDay: 0, budgetInrPerDay: 90 },
      feeds: richFeeds,
    },
  ];

  for (const p of presets) {
    it(`solves ${p.name} within budget and meets all requirements at S`, () => {
      const out = solveRation(p.animal, p.feeds);
      expect(out.status).toBe('optimal');
      if (out.status !== 'optimal') return;
      expect(out.totalCostInr).toBeLessThanOrEqual(p.animal.budgetInrPerDay + 1e-6);
      expect(out.roughageSharePct + 1e-6).toBeGreaterThanOrEqual(out.roughageMinSharePct);
    });
  }
});
