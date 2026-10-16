import { describe, expect, it } from 'vitest';
import feedsV1 from '../../src/data/feeds.v1.json';
import { BREEDS } from '../../src/domain/breeds';
import { floorMilk1, roundUpInrWhole } from '../../src/domain/format';
import { EMPTY_COUNTERS, formatLocalDateIso, MAX_ANIMALS, nextAnimalLabel, planHerd } from '../../src/domain/herdPlan';
import {
  HERD_EXAMPLE_COW_BUFFALO,
  HERD_EXAMPLE_STRAW_ONLY,
  HERD_EXAMPLE_TIGHT_BUDGET,
  HERD_EXAMPLES,
} from '../../src/domain/presets';
import { planRation } from '../../src/domain/rationPlan';
import { solveRation } from '../../src/domain/solver';
import type {
  BenchmarkAnimalEntry,
  FeedItem,
  HerdAnimal,
  HomeFeed,
} from '../../src/domain/types';
import { currentMonth } from '../../src/i18n/months';
import { rationService, setRationAdapterMode } from '../../src/services/rationService';
import testAnimals from '../../eval/test_animals.json';

const benchmarkEntries = testAnimals as unknown as BenchmarkAnimalEntry[];
const LIVE_FEEDS = feedsV1 as unknown as FeedItem[];

function toHerdAnimal(entry: BenchmarkAnimalEntry, key = 'a1'): HerdAnimal {
  return {
    key,
    label: { species: entry.animal.species, n: 1 },
    profile: {
      species: entry.animal.species,
      breedId: entry.animal.breedId,
      bodyWeightKg: entry.animal.bodyWeightKg,
      milkYieldLitersPerDay: entry.animal.milkYieldLitersPerDay,
      milkFatPct: entry.animal.milkFatPct,
    },
    weightSource: 'typed',
    fatSource: 'typed',
    isConfirmed: true,
  };
}

describe('herdPlan (Change 4 pure herd plan engine)', () => {
  const month = 1; // January (Rabi winter)

  it('sorts Bu_H with supplements first, then ₹/day ascending, then feedId code units (AC-C4-1.13)', () => {
    const entry = benchmarkEntries[0]; // Murrah buffalo
    const animal = toHerdAnimal(entry);
    const budget = 145;
    const plan = planHerd([animal], [], budget, LIVE_FEEDS, BREEDS, month);

    expect(plan.status).toBe('optimal');
    if (plan.status !== 'optimal') return;

    expect(plan.buyOrder.length).toBeGreaterThan(0);

    // Supplements must appear before non-supplements
    let seenNonSupplement = false;
    for (const feedId of plan.buyOrder) {
      const isSup = feedId === 'mineral_mix' || feedId === 'common_salt';
      if (isSup) {
        expect(seenNonSupplement).toBe(false);
      } else {
        seenNonSupplement = true;
      }
    }

    // After supplements, cost is ascending
    const nonSuppLines = plan.shopping.buyFirst
      .concat(plan.shopping.later.map((l) => l.line))
      .filter((l) => l.feedId !== 'mineral_mix' && l.feedId !== 'common_salt');

    for (let i = 1; i < nonSuppLines.length; i++) {
      expect(nonSuppLines[i].costInrPerDay).toBeGreaterThanOrEqual(nonSuppLines[i - 1].costInrPerDay - 1e-9);
    }
  });

  it('single animal equals C3 planRation oracle (AC-C4-1.12)', () => {
    const entry = benchmarkEntries[0];
    const animal = toHerdAnimal(entry);
    const budget = 145;

    const c3Plan = planRation(entry.animal, [], LIVE_FEEDS, month, (p, f) => solveRation(p, f));
    const hPlan = planHerd([animal], [], budget, LIVE_FEEDS, BREEDS, month);

    expect(c3Plan.final.status).toBe('optimal');
    expect(hPlan.status).toBe('optimal');
    if (hPlan.status !== 'optimal' || c3Plan.final.status !== 'optimal') return;

    // F's ration, S_1, cost equal solveRation
    expect(hPlan.perAnimal[0].milkLPerDay).toBeCloseTo(c3Plan.final.supportedMilkLPerDay, 5);
    expect(hPlan.best.purchaseCostInrPerDay).toBeCloseTo(c3Plan.final.totalCostInr, 4);

    // Buy order matches
    expect(hPlan.buyOrder).toEqual(c3Plan.buyFeedIds);

    // Buy first group matches C3 rung 1
    const buyFirstIds = hPlan.shopping.buyFirst.map((l) => l.feedId);
    expect(buyFirstIds).toEqual(c3Plan.rungs[0].addedFeedIds);

    // Later steps match C3 subsequent rungs
    const laterIds = hPlan.shopping.later.map((l) => l.line.feedId);
    const c3LaterIds = c3Plan.rungs.slice(1).map((r) => r.addedFeedIds[0]);
    expect(laterIds).toEqual(c3LaterIds);

    // Delta milk equals consecutive C3 rung milk differences
    for (let i = 0; i < hPlan.shopping.later.length; i++) {
      const prev = c3Plan.rungs[i].outcome;
      const cur = c3Plan.rungs[i + 1].outcome;
      const prevC3Milk = prev.status === 'optimal' ? prev.supportedMilkLPerDay : 0;
      const curC3Milk = cur.status === 'optimal' ? cur.supportedMilkLPerDay : 0;
      const expectedDelta = floorMilk1(curC3Milk - prevC3Milk);
      expect(hPlan.shopping.later[i].deltaMilkL).toBeCloseTo(expectedDelta, 1);
    }
  });

  it('ensures step marginal milk difference is non-decreasing (ΔL_k >= 0)', () => {
    const entry = benchmarkEntries[0];
    const animal = toHerdAnimal(entry);
    const plan = planHerd([animal], [], 180, LIVE_FEEDS, BREEDS, month);

    expect(plan.status).toBe('optimal');
    if (plan.status !== 'optimal') return;

    for (const step of plan.shopping.later) {
      expect(step.deltaMilkExactL).toBeGreaterThanOrEqual(0);
      expect(step.deltaMilkL).toBeGreaterThanOrEqual(0);
    }
  });

  it('ensures multi-animal shopping steps have non-decreasing milk gains (ΔL_k >= 0) and valid prefixes (AC-C4-2.6)', () => {
    const cow: HerdAnimal = {
      key: 'a1',
      label: { species: 'cow', n: 1 },
      profile: {
        species: 'cow',
        breedId: 'sahiwal',
        bodyWeightKg: 350,
        milkYieldLitersPerDay: 9,
        milkFatPct: 4.5,
      },
      weightSource: 'breed',
      fatSource: 'breed',
      isConfirmed: true,
    };
    const buffalo: HerdAnimal = {
      key: 'a2',
      label: { species: 'buffalo', n: 1 },
      profile: {
        species: 'buffalo',
        breedId: 'murrah',
        bodyWeightKg: 500,
        milkYieldLitersPerDay: 8,
        milkFatPct: 7.0,
      },
      weightSource: 'breed',
      fatSource: 'breed',
      isConfirmed: true,
    };

    const homeFeeds: HomeFeed[] = [{ feedId: 'wheat_straw', kgPerDay: 10 }];
    const budget = 350;
    const plan = planHerd([cow, buffalo], homeFeeds, budget, LIVE_FEEDS, BREEDS, month);

    expect(plan.status).toBe('optimal');
    if (plan.status !== 'optimal') return;

    expect(plan.buyOrder.length).toBeGreaterThan(0);
    expect(plan.shopping.buyFirst.length).toBeGreaterThan(0);

    // Each later step satisfies deltaMilkExactL >= 0 and deltaMilkL >= 0
    let lastMilk = plan.shopping.firstStep?.totalMilkL ?? 0;
    for (const step of plan.shopping.later) {
      expect(step.deltaMilkExactL).toBeGreaterThanOrEqual(0);
      expect(step.deltaMilkL).toBeGreaterThanOrEqual(0);
      expect(step.step.totalMilkL).toBeGreaterThanOrEqual(lastMilk - 1e-6);
      lastMilk = step.step.totalMilkL;
    }

    // Last step matches best
    expect(plan.lastStepMatchesBest).toBe(true);
  });

  it('asserts lastStepMatchesBest holds on optimal plans', () => {
    const entry = benchmarkEntries[0];
    const animal = toHerdAnimal(entry);
    const plan = planHerd([animal], [], 150, LIVE_FEEDS, BREEDS, month);

    expect(plan.status).toBe('optimal');
    if (plan.status !== 'optimal') return;

    expect(plan.lastStepMatchesBest).toBe(true);
  });

  it('handles "Nothing to buy" when home feeds fully cover requirements (AC-C4-1.14a)', () => {
    const entry = benchmarkEntries[0];
    const animal = toHerdAnimal(entry);
    // Give generous home feeds that meet all nutritional requirements at zero cost
    const homeFeeds: HomeFeed[] = [
      { feedId: 'berseem', kgPerDay: 40 },
      { feedId: 'mustard_cake', kgPerDay: 5 },
      { feedId: 'wheat_bran', kgPerDay: 4 },
      { feedId: 'mineral_mix', kgPerDay: 0.1 },
      { feedId: 'common_salt', kgPerDay: 0.05 },
    ];

    const plan = planHerd([animal], homeFeeds, 100, LIVE_FEEDS, BREEDS, month);

    expect(plan.status).toBe('optimal');
    if (plan.status !== 'optimal') return;

    expect(plan.buyOrder).toEqual([]);
    expect(plan.shopping.buyFirst).toEqual([]);
    expect(plan.shopping.later).toEqual([]);
    expect(plan.shopping.firstStep).toBeNull();
    expect(plan.shopping.totalInr).toBe(0);
    expect(plan.lastStepMatchesBest).toBe(true);
  });

  it('identifies notNeeded home feeds in row order (AC-C4-1.17)', () => {
    const entry = benchmarkEntries[0];
    const animal = toHerdAnimal(entry);
    // berseem is great; pearl millet grain and barley straw are redundant
    const homeFeeds: HomeFeed[] = [
      { feedId: 'berseem', kgPerDay: 35 },
      { feedId: 'pearl_millet_stover', kgPerDay: 10 },
      { feedId: 'barley_straw', kgPerDay: 10 },
    ];

    const plan = planHerd([animal], homeFeeds, 150, LIVE_FEEDS, BREEDS, month);

    expect(plan.status).toBe('optimal');
    if (plan.status !== 'optimal') return;

    // Redundant dry straws when abundant fresh berseem is present should appear in notNeeded
    expect(plan.notNeeded.length).toBeGreaterThan(0);
    // Home row order preserved
    if (plan.notNeeded.includes('pearl_millet_stover') && plan.notNeeded.includes('barley_straw')) {
      expect(plan.notNeeded.indexOf('pearl_millet_stover')).toBeLessThan(
        plan.notNeeded.indexOf('barley_straw'),
      );
    }
  });

  it('computes budgetPrompt correctly when budget is tight, and suppresses it when ample (AC-C4-1.18)', () => {
    const entry = benchmarkEntries[0];
    const animal = toHerdAnimal(entry);

    // Tight budget: animal wants 9.64 L (effCap) but ₹70 budget limits milk
    const tightPlan = planHerd([animal], [], 70, LIVE_FEEDS, BREEDS, month);
    expect(tightPlan.status).toBe('optimal');
    if (tightPlan.status !== 'optimal') return;

    expect(tightPlan.budgetPrompt).not.toBeNull();
    const prompt = tightPlan.budgetPrompt!;
    expect(prompt.costAtTargetInrPerDay).toBeGreaterThan(70);
    expect(prompt.extraInrPerDay).toBe(roundUpInrWhole(prompt.costAtTargetInrPerDay - 70));
    expect(prompt.perAnimalTargetL.length).toBe(1);
    expect(prompt.targetMilkL).toBe(prompt.perAnimalTargetL[0].targetL);

    // Ample budget: ₹350 easily reaches cap -> budgetPrompt must be null
    const amplePlan = planHerd([animal], [], 350, LIVE_FEEDS, BREEDS, month);
    expect(amplePlan.status).toBe('optimal');
    if (amplePlan.status !== 'optimal') return;
    expect(amplePlan.budgetPrompt).toBeNull();
  });

  it('computes multi-animal herd budget prompt correctly per AC-C4-2.8', () => {
    const cow: HerdAnimal = {
      key: 'a1',
      label: { species: 'cow', n: 1 },
      profile: {
        species: 'cow',
        breedId: 'sahiwal',
        bodyWeightKg: 298,
        milkYieldLitersPerDay: 10,
        milkFatPct: 4.93,
      },
      weightSource: 'breed',
      fatSource: 'breed',
      isConfirmed: true,
    };
    const buffalo: HerdAnimal = {
      key: 'a2',
      label: { species: 'buffalo', n: 1 },
      profile: {
        species: 'buffalo',
        breedId: 'murrah',
        bodyWeightKg: 516,
        milkYieldLitersPerDay: 8,
        milkFatPct: 7.34,
      },
      weightSource: 'breed',
      fatSource: 'breed',
      isConfirmed: true,
    };
    const dryBuffalo: HerdAnimal = {
      key: 'a3',
      label: { species: 'buffalo', n: 2 },
      profile: {
        species: 'buffalo',
        breedId: 'surti',
        bodyWeightKg: 420,
        milkYieldLitersPerDay: 0, // dry animal
        milkFatPct: 7.5,
      },
      weightSource: 'breed',
      fatSource: 'breed',
      isConfirmed: true,
    };

    // Budget of 240 is enough for maintenance of all 3 animals, but tight for milk targets
    const budget = 240;
    const plan = planHerd([cow, buffalo, dryBuffalo], [], budget, LIVE_FEEDS, BREEDS, month);

    expect(plan.status).toBe('optimal');
    if (plan.status !== 'optimal') return;

    expect(plan.best.budgetTight).toBe(true);
    expect(plan.budgetPrompt).not.toBeNull();
    const prompt = plan.budgetPrompt!;

    // Formula checks per AC-C4-2.8:
    // extraInrPerDay = roundUpInrWhole(costAtTargetInrPerDay - budgetInrPerDay)
    expect(prompt.extraInrPerDay).toBe(roundUpInrWhole(prompt.costAtTargetInrPerDay - budget));
    expect(prompt.costAtTargetInrPerDay).toBe(plan.best.costAtTargetInrPerDay);
    expect(prompt.budgetInrPerDay).toBe(budget);

    // Dry animal must be excluded from targetMilkL and perAnimalTargetL
    expect(prompt.perAnimalTargetL.some((p) => p.key === 'a3')).toBe(false);
    expect(prompt.perAnimalTargetL.length).toBe(2);

    // targetMilkL = sum of floor(10*g_i)/10 over milking animals
    const expectedSum = Math.round(prompt.perAnimalTargetL.reduce((sum, p) => sum + p.targetL, 0) * 10) / 10;
    expect(prompt.targetMilkL).toBe(expectedSum);

    for (const p of prompt.perAnimalTargetL) {
      const aSol = plan.best.animals.find((a) => a.key === p.key)!;
      expect(p.targetL).toBe(floorMilk1(aSol.milkTargetLPerDay));
    }
  });

  it('provides per-animal cards in list order including dry animal with maintenance ration (AC-C4-2.7)', () => {
    const cow: HerdAnimal = {
      key: 'a1',
      label: { species: 'cow', n: 1 },
      profile: {
        species: 'cow',
        breedId: 'sahiwal',
        bodyWeightKg: 300,
        milkYieldLitersPerDay: 9,
        milkFatPct: 4.5,
      },
      weightSource: 'breed',
      fatSource: 'breed',
      isConfirmed: true,
    };
    const dryBuffalo: HerdAnimal = {
      key: 'a2',
      label: { species: 'buffalo', n: 1 },
      profile: {
        species: 'buffalo',
        breedId: 'surti',
        bodyWeightKg: 400,
        milkYieldLitersPerDay: 0,
        milkFatPct: 7.0,
      },
      weightSource: 'breed',
      fatSource: 'breed',
      isConfirmed: true,
    };
    const buffalo: HerdAnimal = {
      key: 'a3',
      label: { species: 'buffalo', n: 2 },
      profile: {
        species: 'buffalo',
        breedId: 'murrah',
        bodyWeightKg: 500,
        milkYieldLitersPerDay: 8,
        milkFatPct: 7.0,
      },
      weightSource: 'breed',
      fatSource: 'breed',
      isConfirmed: true,
    };

    const plan = planHerd([cow, dryBuffalo, buffalo], [], 350, LIVE_FEEDS, BREEDS, month);

    expect(plan.status).toBe('optimal');
    if (plan.status !== 'optimal') return;

    expect(plan.perAnimal.length).toBe(3);
    expect(plan.perAnimal.map((a) => a.key)).toEqual(['a1', 'a2', 'a3']);

    // Milking animals show S_i(F) > 0 and positive target
    expect(plan.perAnimal[0].milkLPerDay).toBeGreaterThan(0);
    expect(plan.perAnimal[0].milkTargetLPerDay).toBeGreaterThan(0);
    expect(plan.perAnimal[2].milkLPerDay).toBeGreaterThan(0);
    expect(plan.perAnimal[2].milkTargetLPerDay).toBeGreaterThan(0);

    // Dry animal shows 0 milk and 0 milk target
    expect(plan.perAnimal[1].milkLPerDay).toBe(0);
    expect(plan.perAnimal[1].milkTargetLPerDay).toBe(0);
    expect(plan.perAnimal[1].solution.feeds.length).toBeGreaterThan(0);
  });

  it('returns below_maintenance shortfall when multi-animal herd budget is below M_H (AC-C4-2.3, AC-C4-2.8)', () => {
    const cow: HerdAnimal = {
      key: 'a1',
      label: { species: 'cow', n: 1 },
      profile: {
        species: 'cow',
        breedId: 'sahiwal',
        bodyWeightKg: 350,
        milkYieldLitersPerDay: 8,
        milkFatPct: 4.5,
      },
      weightSource: 'breed',
      fatSource: 'breed',
      isConfirmed: true,
    };
    const buffalo: HerdAnimal = {
      key: 'a2',
      label: { species: 'buffalo', n: 1 },
      profile: {
        species: 'buffalo',
        breedId: 'murrah',
        bodyWeightKg: 500,
        milkYieldLitersPerDay: 9,
        milkFatPct: 7.0,
      },
      weightSource: 'breed',
      fatSource: 'breed',
      isConfirmed: true,
    };

    // Budget of ₹10 is far below maintenance for two large animals
    const plan = planHerd([cow, buffalo], [], 10, LIVE_FEEDS, BREEDS, month);

    expect(plan.status).toBe('below_maintenance');
    if (plan.status !== 'below_maintenance') return;

    expect(plan.best).toBeNull();
    expect(plan.shortfall).not.toBeNull();
    expect(plan.shortfall.maintenanceCostInrPerDay).toBeGreaterThan(10);
    expect(plan.shortfall.extraInrPerDay).toBe(
      roundUpInrWhole(plan.shortfall.maintenanceCostInrPerDay - 10),
    );
    expect(plan.shortfall.budgetInrPerDay).toBe(10);
  });

  it('returns below_maintenance shortfall when budget is below M_H (AC-C4-1.18)', () => {
    const entry = benchmarkEntries[0];
    const animal = toHerdAnimal(entry);
    const lowBudget = 5; // ₹5 cannot even support maintenance

    const plan = planHerd([animal], [], lowBudget, LIVE_FEEDS, BREEDS, month);

    expect(plan.status).toBe('below_maintenance');
    if (plan.status !== 'below_maintenance') return;

    expect(plan.best).toBeNull();
    expect(plan.shopping).toBeNull();
    expect(plan.shortfall).not.toBeNull();
    expect(plan.shortfall.maintenanceCostInrPerDay).toBeGreaterThan(lowBudget);
    expect(plan.shortfall.extraInrPerDay).toBe(
      roundUpInrWhole(plan.shortfall.maintenanceCostInrPerDay - lowBudget),
    );
    expect(plan.shortfall.budgetInrPerDay).toBe(lowBudget);
  });

  it('names buyable suggestions only on infeasible input (AC-C3-E7)', () => {
    const animal = toHerdAnimal(benchmarkEntries[0]);
    const straw = LIVE_FEEDS.find((f) => f.id === 'wheat_straw')!;
    const mineralMix = LIVE_FEEDS.find((f) => f.id === 'mineral_mix')!;
    const commonSalt = LIVE_FEEDS.find((f) => f.id === 'common_salt')!;
    const outOfSeasonCake: FeedItem = {
      ...LIVE_FEEDS.find((f) => f.id === 'mustard_cake')!,
      id: 'summer_mustard_cake',
      availableMonths: [7, 8], // out of season in month 1
      defaultPriceInrPerKgAsFed: 30,
    };
    const unpricedCake: FeedItem = {
      ...LIVE_FEEDS.find((f) => f.id === 'groundnut_cake')!,
      id: 'unpriced_cake',
      availableMonths: [1, 2, 3],
      defaultPriceInrPerKgAsFed: null, // no default price
    };

    const restrictedLibrary = [straw, mineralMix, commonSalt, outOfSeasonCake, unpricedCake];
    const plan = planHerd([animal], [], 200, restrictedLibrary, BREEDS, month);

    expect(plan.status).toBe('infeasible');
    if (plan.status !== 'infeasible') return;

    expect(plan.best).toBeNull();
    expect(plan.infeasible).not.toBeNull();
    expect(plan.infeasible.animals.length).toBe(1);
    expect(plan.infeasible.animals[0].limitingNutrients.some((l) => l.nutrient === 'CP')).toBe(true);

    // Any suggested feed must be buyable (in season, priced); unbuyable feeds removed
    for (const a of plan.infeasible.animals) {
      for (const s of a.suggestedFeeds) {
        const feed = restrictedLibrary.find((f) => f.id === s.feedId);
        expect(feed).toBeDefined();
        expect(feed?.availableMonths).toContain(month);
        expect(feed?.defaultPriceInrPerKgAsFed).not.toBeNull();
      }
    }
  });

  describe('three herd examples for C4-M2 (AC-C4-2.11)', () => {
    it('Example 1: "Cow + Buffalo" (cow_buffalo) has a feasible plan for both animals', () => {
      const ex = HERD_EXAMPLE_COW_BUFFALO;
      expect(ex.id).toBe('cow_buffalo');
      expect(ex.animals.length).toBe(2);

      const plan = planHerd(ex.animals, ex.homeFeeds, ex.budget, LIVE_FEEDS, BREEDS, month);
      expect(plan.status).toBe('optimal');
      if (plan.status !== 'optimal') return;

      expect(plan.perAnimal.length).toBe(2);
      expect(plan.best.animals[0].milkLPerDay).toBeGreaterThan(0);
      expect(plan.best.animals[1].milkLPerDay).toBeGreaterThan(0);
      expect(plan.lastStepMatchesBest).toBe(true);
    });

    it('Example 2: "Straw only" (straw_only) with home wheat straw has a "What to buy" list of at least one line', () => {
      const ex = HERD_EXAMPLE_STRAW_ONLY;
      expect(ex.id).toBe('straw_only');
      expect(ex.homeFeeds.some((h) => h.feedId === 'wheat_straw')).toBe(true);

      const plan = planHerd(ex.animals, ex.homeFeeds, ex.budget, LIVE_FEEDS, BREEDS, month);
      expect(plan.status).toBe('optimal');
      if (plan.status !== 'optimal') return;

      // "What to buy" list has at least one line (buyFirst + later)
      const whatToBuyCount = plan.shopping.buyFirst.length + plan.shopping.later.length;
      expect(whatToBuyCount).toBeGreaterThanOrEqual(1);
      expect(plan.buyOrder.length).toBeGreaterThanOrEqual(1);
      expect(plan.lastStepMatchesBest).toBe(true);
    });

    it('Example 3: "Tight budget" (tight_budget) shows "Add ₹X/day to reach Y L" budget prompt', () => {
      const ex = HERD_EXAMPLE_TIGHT_BUDGET;
      expect(ex.id).toBe('tight_budget');

      const plan = planHerd(ex.animals, ex.homeFeeds, ex.budget, LIVE_FEEDS, BREEDS, month);
      expect(plan.status).toBe('optimal');
      if (plan.status !== 'optimal') return;

      expect(plan.best.budgetTight).toBe(true);
      expect(plan.budgetPrompt).not.toBeNull();
      const prompt = plan.budgetPrompt!;
      expect(prompt.extraInrPerDay).toBeGreaterThan(0);
      expect(prompt.targetMilkL).toBeGreaterThan(0);

      // Exact prompt arithmetic per AC-C4-2.8
      expect(prompt.extraInrPerDay).toBe(roundUpInrWhole(prompt.costAtTargetInrPerDay - ex.budget));
      const expectedTargetMilkL = Math.round(prompt.perAnimalTargetL.reduce((sum, a) => sum + a.targetL, 0) * 10) / 10;
      expect(prompt.targetMilkL).toBe(expectedTargetMilkL);
      expect(plan.lastStepMatchesBest).toBe(true);
    });

    it('exports all 3 herd examples via HERD_EXAMPLES record', () => {
      expect(Object.keys(HERD_EXAMPLES)).toEqual(['cow_buffalo', 'straw_only', 'tight_budget']);
      expect(HERD_EXAMPLES.cow_buffalo).toBe(HERD_EXAMPLE_COW_BUFFALO);
      expect(HERD_EXAMPLES.straw_only).toBe(HERD_EXAMPLE_STRAW_ONLY);
      expect(HERD_EXAMPLES.tight_budget).toBe(HERD_EXAMPLE_TIGHT_BUDGET);
    });
  });

  it('handles dry animal (T=0) returning maintenance ration and null budgetPrompt (AC-5.13, AC-C4-1.15, AC-C4-1.18)', () => {
    const entry = benchmarkEntries[7]; // A08_surti_dry_buffalo_maintenance
    const animal = toHerdAnimal(entry);
    const plan = planHerd([animal], [], 120, LIVE_FEEDS, BREEDS, month);

    expect(plan.status).toBe('optimal');
    if (plan.status !== 'optimal') return;

    expect(plan.perAnimal[0].milkLPerDay).toBe(0);
    expect(plan.perAnimal[0].milkTargetLPerDay).toBe(0);
    expect(plan.budgetPrompt).toBeNull();
    for (const step of plan.shopping.later) {
      expect(step.deltaMilkL).toBe(0);
    }
  });

  it('supports both (animals, homeFeeds, budget) and (animals, budget, homeFeeds) signatures', () => {
    const entry = benchmarkEntries[0];
    const animal = toHerdAnimal(entry);
    const homeFeeds: HomeFeed[] = [{ feedId: 'wheat_straw', kgPerDay: 4 }];

    const plan1 = planHerd([animal], homeFeeds, 150, LIVE_FEEDS, BREEDS, month);
    const plan2 = planHerd([animal], 150, homeFeeds, LIVE_FEEDS, BREEDS, month);

    expect(plan1.status).toBe('optimal');
    expect(plan2.status).toBe('optimal');
    if (plan1.status !== 'optimal' || plan2.status !== 'optimal') return;

    expect(plan1.best.purchaseCostInrPerDay).toBeCloseTo(plan2.best.purchaseCostInrPerDay, 5);
    expect(plan1.buyOrder).toEqual(plan2.buyOrder);
  });

  it('nextAnimalLabel increments counters per species monotonically and never reuses removed numbers (SPEC AC-C4-2.1)', () => {
    expect(MAX_ANIMALS).toBe(10);
    let counters = EMPTY_COUNTERS;
    const { label: cow1, counters: c1 } = nextAnimalLabel(counters, 'cow');
    expect(cow1).toEqual({ species: 'cow', n: 1 });
    expect(c1).toEqual({ cow: 1, buffalo: 0 });

    const { label: cow2, counters: c2 } = nextAnimalLabel(c1, 'cow');
    expect(cow2).toEqual({ species: 'cow', n: 2 });
    expect(c2).toEqual({ cow: 2, buffalo: 0 });

    const { label: buff1, counters: c3 } = nextAnimalLabel(c2, 'buffalo');
    expect(buff1).toEqual({ species: 'buffalo', n: 1 });
    expect(c3).toEqual({ cow: 2, buffalo: 1 });

    // Simulating removing cow 1: counters c3 are preserved, next cow gets n: 3
    const { label: cow3, counters: c4 } = nextAnimalLabel(c3, 'cow');
    expect(cow3).toEqual({ species: 'cow', n: 3 });
    expect(c4).toEqual({ cow: 3, buffalo: 1 });
  });

  describe('rationService.planHerd integration', () => {
    it('executes through rationService reading device month and local date', () => {
      const entry = benchmarkEntries[0];
      const animal = toHerdAnimal(entry);
      const plan = rationService.planHerd([animal], [], 160);

      expect(plan.status).toBe('optimal');
      expect(plan.month).toBe(currentMonth());
      expect(plan.planDate).toBe(formatLocalDateIso());
      expect(plan.budgetInrPerDay).toBe(160);
    });

    it('works under both live and mock adapter modes', () => {
      const entry = benchmarkEntries[0];
      const animal = toHerdAnimal(entry);

      setRationAdapterMode('live');
      const livePlan = rationService.planHerd([animal], [], 160);
      expect(livePlan.status).toBe('optimal');

      setRationAdapterMode('mock');
      const mockPlan = rationService.planHerd([animal], [], 160);
      expect(mockPlan.status).toBe('optimal');

      setRationAdapterMode('env');
    });
  });
});
