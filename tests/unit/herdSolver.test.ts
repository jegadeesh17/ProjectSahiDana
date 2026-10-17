import { describe, expect, it } from 'vitest';
import testAnimals from '../../eval/test_animals.json';
import { solveHerd, solveHerdStep, verifyHerdSolution } from '../../src/domain/herdSolver';
import { DEFAULT_FEED_LIBRARY, solveRation, SolverError, TOL } from '../../src/domain/solver';
import type {
  BenchmarkAnimalEntry,
  FeedItem,
  HerdAnimal,
  HerdInfeasible,
  HerdSolution,
  HomeFeed,
  SelectedFeedInput,
} from '../../src/domain/types';
import { roundSupportedMilkDown } from '../../src/domain/verdict';

const benchmarkEntries = testAnimals as unknown as BenchmarkAnimalEntry[];

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
    isConfirmed: entry.animal.isConfirmed ?? true,
  };
}

describe('herdSolver single-animal equivalence (AC-C4-1.12, AC-C4-R1)', () => {
  it(`has all 18 benchmark cases from eval/test_animals.json`, () => {
    expect(benchmarkEntries.length).toBe(18);
  });

  for (const entry of benchmarkEntries) {
    it(`agrees with solveRation on ${entry.id}`, () => {
      const animal = toHerdAnimal(entry);
      const budget = entry.animal.budgetInrPerDay;
      const buySet = entry.selectedFeeds;
      const homeFeeds: HomeFeed[] = [];

      const rationOutcome = solveRation(entry.animal, buySet);
      const herdOutcome = solveHerd([animal], buySet, homeFeeds, budget);


      if (rationOutcome.status === 'optimal') {
        expect(herdOutcome.status).toBe('optimal');
        const herdSol = herdOutcome as HerdSolution;
        expect(herdSol.animals.length).toBe(1);
        const aSol = herdSol.animals[0];

        // Supported milk S and exact Y*
        expect(aSol.milkLPerDay).toBeCloseTo(rationOutcome.supportedMilkLPerDay, 5);
        expect(aSol.solution.supportedMilkLPerDay).toBeCloseTo(rationOutcome.supportedMilkLPerDay, 5);
        const rYStar = rationOutcome.supportedMilkExactLPerDay ?? rationOutcome.supportedMilkLPerDay;
        expect(aSol.milkExactLPerDay).toBeCloseTo(rYStar, 5);
        expect(aSol.solution.supportedMilkExactLPerDay).toBeCloseTo(rYStar, 5);

        // Total purchase cost
        expect(herdSol.purchaseCostInrPerDay).toBeCloseTo(rationOutcome.totalCostInr, 5);
        expect(aSol.solution.totalCostInr).toBeCloseTo(rationOutcome.totalCostInr, 5);

        // Binding constraint & verdict kind
        expect(aSol.solution.bindingConstraint).toBe(rationOutcome.bindingConstraint);
        expect(aSol.solution.verdict.kind).toBe(rationOutcome.verdict.kind);

        // Maintenance cost
        expect(herdSol.maintenanceCostInrPerDay).toBeCloseTo(rationOutcome.maintenanceCostInrPerDay, 5);
        expect(aSol.solution.maintenanceCostInrPerDay).toBeCloseTo(rationOutcome.maintenanceCostInrPerDay, 5);

        // Cost at cap
        if (rationOutcome.costAtCapInrPerDay === null) {
          expect(herdSol.costAtTargetInrPerDay).toBeNull();
          expect(aSol.solution.costAtCapInrPerDay).toBeNull();
        } else {
          expect(herdSol.costAtTargetInrPerDay!).toBeCloseTo(rationOutcome.costAtCapInrPerDay, 5);
          expect(aSol.solution.costAtCapInrPerDay!).toBeCloseTo(rationOutcome.costAtCapInrPerDay, 5);
        }

        // Ration lines: same feedId and kg within 1e-6 relative
        const rFeeds = rationOutcome.feeds;
        const hFeeds = aSol.solution.feeds;
        expect(hFeeds.length).toBe(rFeeds.length);

        for (const rf of rFeeds) {
          const hf = hFeeds.find((f) => f.feedId === rf.feedId);
          expect(hf).toBeDefined();
          expect(hf!.kgAsFed).toBeCloseTo(rf.kgAsFed, 5);
          expect(hf!.source).toBe('buy');
        }

        // Stage properties
        expect(herdSol.stage2Path).toBe('direct');
        expect(herdSol.stage3Applied).toBeNull();
      } else if (rationOutcome.status === 'budget_below_maintenance') {
        expect(herdOutcome.status).toBe('below_maintenance');
        const herdShortfall = herdOutcome as { status: 'below_maintenance'; maintenanceCostInrPerDay: number; budgetInrPerDay: number };
        expect(herdShortfall.maintenanceCostInrPerDay).toBeCloseTo(
          rationOutcome.verdict.maintenanceCostInrPerDay,
          5,
        );
        expect(herdShortfall.budgetInrPerDay).toBe(budget);
      } else if (rationOutcome.status === 'infeasible') {
        expect(herdOutcome.status).toBe('infeasible');
        const herdInfeasible = herdOutcome as {
          status: 'infeasible';
          animals: { key: string; limitingNutrients: { nutrient: string }[]; dmConflict: boolean }[];
          jointConflict: boolean;
        };
        expect(herdInfeasible.jointConflict).toBe(false);
        expect(herdInfeasible.animals.length).toBe(1);
        const failing = herdInfeasible.animals[0];
        expect(failing.dmConflict).toBe(rationOutcome.dmConflict);
        const rLims = rationOutcome.limitingNutrients.map((l) => l.nutrient).sort();
        const hLims = failing.limitingNutrients.map((l) => l.nutrient).sort();
        expect(hLims).toEqual(rLims);
      }
    });
  }
});

describe('herdSolver home feeds (AC-C4-1.11, AC-C4-1.11a)', () => {
  const baseEntry = benchmarkEntries.find((e) => e.id === 'A01_murrah_gain_budget_binding')!;

  it('bounds home feed use by q_f + 1e-6', () => {
    const animal = toHerdAnimal(baseEntry);
    const homeFeeds: HomeFeed[] = [{ feedId: 'berseem', kgPerDay: 10 }];
    const outcome = solveHerd([animal], baseEntry.selectedFeeds, homeFeeds, baseEntry.animal.budgetInrPerDay);

    expect(outcome.status).toBe('optimal');
    const sol = outcome as HerdSolution;
    const berseemHome = sol.homeUse.find((h) => h.feedId === 'berseem');
    expect(berseemHome).toBeDefined();
    expect(berseemHome!.usedKgPerDay).toBeLessThanOrEqual(10 + TOL);
  });

  it('can show both home and buy lines for a feed in C ∩ Hm', () => {
    const animal = toHerdAnimal(baseEntry);
    // Berseem is in buySet and also in homeFeeds with a small quantity (5 kg)
    const homeFeeds: HomeFeed[] = [{ feedId: 'berseem', kgPerDay: 5 }];
    const outcome = solveHerd([animal], baseEntry.selectedFeeds, homeFeeds, baseEntry.animal.budgetInrPerDay);

    expect(outcome.status).toBe('optimal');
    const sol = outcome as HerdSolution;
    const feeds = sol.animals[0].solution.feeds;

    const berseemLines = feeds.filter((f) => f.feedId === 'berseem');
    const homeBerseem = berseemLines.find((f) => f.source === 'home');
    const buyBerseem = berseemLines.find((f) => f.source === 'buy');

    expect(homeBerseem).toBeDefined();
    expect(homeBerseem!.costInr).toBe(0);
    expect(homeBerseem!.priceInrPerKg).toBe(0);
    expect(buyBerseem).toBeDefined();
    expect(buyBerseem!.priceInrPerKg).toBe(2.5);
  });

  it('never buys a home feed that is not in C', () => {
    const animal = toHerdAnimal(baseEntry);
    // Remove berseem from buy set, pass it only as home feed
    const buySetWithoutBerseem = baseEntry.selectedFeeds.filter((f: SelectedFeedInput) => f.feedId !== 'berseem');
    const homeFeeds: HomeFeed[] = [{ feedId: 'berseem', kgPerDay: 15 }];
    const outcome = solveHerd([animal], buySetWithoutBerseem, homeFeeds, baseEntry.animal.budgetInrPerDay);

    expect(outcome.status).toBe('optimal');
    const sol = outcome as HerdSolution;
    const buyLines = sol.animals[0].solution.feeds.filter((f) => f.source === 'buy');
    expect(buyLines.some((f) => f.feedId === 'berseem')).toBe(false);
  });

  it('removing a home row never lowers P(F)', () => {
    const animal = toHerdAnimal(baseEntry);
    const homeFeeds: HomeFeed[] = [{ feedId: 'wheat_straw', kgPerDay: 4 }];

    const withHome = solveHerd([animal], baseEntry.selectedFeeds, homeFeeds, baseEntry.animal.budgetInrPerDay);
    const withoutHome = solveHerd([animal], baseEntry.selectedFeeds, [], baseEntry.animal.budgetInrPerDay);

    expect(withHome.status).toBe('optimal');
    expect(withoutHome.status).toBe('optimal');

    const costWith = (withHome as HerdSolution).purchaseCostInrPerDay;
    const costWithout = (withoutHome as HerdSolution).purchaseCostInrPerDay;
    expect(costWithout).toBeGreaterThanOrEqual(costWith - TOL);
  });

  it('does not force useless home feed', () => {
    const animal = toHerdAnimal(baseEntry);
    // Add extra barley_straw at home (wheat_straw is already in buySet)
    const homeFeeds: HomeFeed[] = [{ feedId: 'barley_straw', kgPerDay: 20 }];
    const outcome = solveHerd([animal], baseEntry.selectedFeeds, homeFeeds, baseEntry.animal.budgetInrPerDay);

    expect(outcome.status).toBe('optimal');
    const sol = outcome as HerdSolution;
    const bsUse = sol.homeUse.find((h) => h.feedId === 'barley_straw');
    expect(bsUse).toBeDefined();
    // It is not forced to 20 kg
    expect(bsUse!.usedKgPerDay).toBeLessThan(20);
  });
});

describe('herdSolver Stage 3 tie-break (ADR-0020)', () => {
  const baseEntry = benchmarkEntries.find((e) => e.id === 'A01_murrah_gain_budget_binding')!;

  it('minimizes total home kg with large home stock (AC-C4-1.11a)', () => {
    const animal = toHerdAnimal(baseEntry);
    // Provide 50 kg/day of wheat straw at home
    const homeFeeds: HomeFeed[] = [{ feedId: 'wheat_straw', kgPerDay: 50 }];
    const outcome = solveHerd([animal], baseEntry.selectedFeeds, homeFeeds, baseEntry.animal.budgetInrPerDay);

    expect(outcome.status).toBe('optimal');
    const sol = outcome as HerdSolution;

    expect(sol.stage3Applied).toBe(true);
    const strawHome = sol.homeUse.find((h) => h.feedId === 'wheat_straw')!;
    // Straw used must be well below 50 kg (intake ceiling for this 450 kg buffalo is ~13-14 kg DM total)
    expect(strawHome.usedKgPerDay).toBeLessThan(15);
    expect(strawHome.usedKgPerDay).toBeGreaterThan(0);

    // Purchase cost must be <= stage2PurchaseInrPerDay + relTol(stage2PurchaseInrPerDay)
    const allowedPurchase = sol.stage2PurchaseInrPerDay + (TOL * Math.max(1, sol.stage2PurchaseInrPerDay));
    expect(sol.purchaseCostInrPerDay).toBeLessThanOrEqual(allowedPurchase + 1e-9);
  });

  it('sets stage3Applied to null when no home feed is entered', () => {
    const animal = toHerdAnimal(baseEntry);
    const outcome = solveHerd([animal], baseEntry.selectedFeeds, [], baseEntry.animal.budgetInrPerDay);

    expect(outcome.status).toBe('optimal');
    const sol = outcome as HerdSolution;
    expect(sol.stage3Applied).toBeNull();
  });
});

describe('verifyHerdSolution numerical guard', () => {
  const baseEntry = benchmarkEntries.find((e) => e.id === 'A01_murrah_gain_budget_binding')!;

  it('accepts valid solution', () => {
    const animal = toHerdAnimal(baseEntry);
    const outcome = solveHerd([animal], baseEntry.selectedFeeds, [], baseEntry.animal.budgetInrPerDay);
    expect(outcome.status).toBe('optimal');
    // solveHerd already verified, calling directly should not throw
    expect(() =>
      verifyHerdSolution(
        outcome as HerdSolution,
        [animal],
        baseEntry.selectedFeeds,
        [],
      ),
    ).not.toThrow();
  });

  it('rejects tampered feed amount violating intake ceiling', () => {
    const animal = toHerdAnimal(baseEntry);
    const outcome = solveHerd([animal], baseEntry.selectedFeeds, [], baseEntry.animal.budgetInrPerDay) as HerdSolution;

    // Tamper by adding 50 kg of wheat straw
    const tamperedSol: HerdSolution = {
      ...outcome,
      animals: [
        {
          ...outcome.animals[0],
          solution: {
            ...outcome.animals[0].solution,
            feeds: [
              ...outcome.animals[0].solution.feeds,
              {
                feedId: 'wheat_straw',
                kgAsFed: 50,
                dmKg: 45,
                costInr: 300,
                priceInrPerKg: 6,
                atCap: false,
                source: 'buy',
              },
            ],
          },
        },
      ],
    };

    expect(() =>
      verifyHerdSolution(tamperedSol, [animal], baseEntry.selectedFeeds, []),
    ).toThrow(SolverError);
  });

  it('rejects tampered purchase cost violating budget', () => {
    const animal = toHerdAnimal(baseEntry);
    const outcome = solveHerd([animal], baseEntry.selectedFeeds, [], baseEntry.animal.budgetInrPerDay) as HerdSolution;

    const tamperedSol: HerdSolution = {
      ...outcome,
      budgetInrPerDay: 50, // lower budget than purchase cost
    };

    expect(() =>
      verifyHerdSolution(tamperedSol, [animal], baseEntry.selectedFeeds, []),
    ).toThrow(SolverError);
  });

  it('rejects home feed exceeding stock', () => {
    const animal = toHerdAnimal(baseEntry);
    const homeFeeds: HomeFeed[] = [{ feedId: 'berseem', kgPerDay: 5 }];
    const outcome = solveHerd([animal], baseEntry.selectedFeeds, homeFeeds, baseEntry.animal.budgetInrPerDay) as HerdSolution;

    const tamperedSol: HerdSolution = {
      ...outcome,
      animals: [
        {
          ...outcome.animals[0],
          solution: {
            ...outcome.animals[0].solution,
            feeds: outcome.animals[0].solution.feeds.map((f) =>
              f.source === 'home' ? { ...f, kgAsFed: 10 } : f,
            ),
          },
        },
      ],
    };

    expect(() =>
      verifyHerdSolution(tamperedSol, [animal], baseEntry.selectedFeeds, homeFeeds),
    ).toThrow(SolverError);
  });

  it('rejects non-optimal solution status', () => {
    const animal = toHerdAnimal(baseEntry);
    const fakeSol = { status: 'infeasible' } as unknown as HerdSolution;
    expect(() =>
      verifyHerdSolution(fakeSol, [animal], baseEntry.selectedFeeds, []),
    ).toThrow(SolverError);
  });

  it('rejects negative feed amount', () => {
    const animal = toHerdAnimal(baseEntry);
    const outcome = solveHerd([animal], baseEntry.selectedFeeds, [], baseEntry.animal.budgetInrPerDay) as HerdSolution;
    const tamperedSol: HerdSolution = {
      ...outcome,
      animals: [
        {
          ...outcome.animals[0],
          solution: {
            ...outcome.animals[0].solution,
            feeds: outcome.animals[0].solution.feeds.map((f, i) =>
              i === 0 ? { ...f, kgAsFed: -1 } : f,
            ),
          },
        },
      ],
    };
    expect(() =>
      verifyHerdSolution(tamperedSol, [animal], baseEntry.selectedFeeds, []),
    ).toThrow(SolverError);
  });
});

describe('herdSolver invalid and edge inputs', () => {
  const baseEntry = benchmarkEntries.find((e) => e.id === 'A01_murrah_gain_budget_binding')!;

  it('filters out invalid home feeds (non-positive or NaN kg) and invalid buy inputs (negative price)', () => {
    const animal = toHerdAnimal(baseEntry);
    const invalidHomeFeeds: HomeFeed[] = [
      { feedId: 'wheat_straw', kgPerDay: -5 },
      { feedId: 'berseem', kgPerDay: 0 },
      { feedId: 'mustard_oil_cake', kgPerDay: NaN },
    ];
    const invalidBuySet: SelectedFeedInput[] = [
      ...baseEntry.selectedFeeds,
      { feedId: 'cottonseed_cake', priceInrPerKgAsFed: -10, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'barley_grain', priceInrPerKgAsFed: NaN, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
    ];
    const outcome = solveHerd([animal], invalidBuySet, invalidHomeFeeds, baseEntry.animal.budgetInrPerDay);
    expect(outcome.status).toBe('optimal');
    const sol = outcome as HerdSolution;
    expect(sol.homeUse.length).toBe(0);
    expect(sol.animals[0].solution.feeds.some((f) => f.feedId === 'cottonseed_cake')).toBe(false);
  });

  it('deduplicates multiple home feed rows for the same feedId and uses the first entry', () => {
    const animal = toHerdAnimal(baseEntry);
    const dupHomeFeeds: HomeFeed[] = [
      { feedId: 'wheat_straw', kgPerDay: 5 },
      { feedId: 'wheat_straw', kgPerDay: 20 },
    ];
    const outcome = solveHerd([animal], baseEntry.selectedFeeds, dupHomeFeeds, baseEntry.animal.budgetInrPerDay);
    expect(outcome.status).toBe('optimal');
    const sol = outcome as HerdSolution;
    const straw = sol.homeUse.find((h) => h.feedId === 'wheat_straw');
    expect(straw).toBeDefined();
    expect(straw!.stockKgPerDay).toBe(5);
  });

  it('handles unknown breedId by falling back to species breed and non-finite milk yield as dry animal', () => {
    const fallbackAnimal: HerdAnimal = {
      key: 'a1',
      label: { species: 'buffalo', n: 1 },
      profile: {
        species: 'buffalo',
        breedId: 'non_existent_breed',
        bodyWeightKg: 450,
        milkYieldLitersPerDay: -10, // negative milk treated as dry animal
        milkFatPct: null as unknown as number,
      },
      weightSource: 'typed',
      fatSource: 'typed',
      isConfirmed: true,
    };
    const outcome = solveHerd([fallbackAnimal], baseEntry.selectedFeeds, [], baseEntry.animal.budgetInrPerDay);
    expect(outcome.status).toBe('optimal');
    const sol = outcome as HerdSolution;
    expect(sol.animals[0].milkTargetLPerDay).toBe(0);
    expect(sol.animals[0].solution.verdict.kind).toBe('dry_animal');
  });
});

describe('solveHerdStep prefix solves', () => {
  const baseEntry = benchmarkEntries.find((e) => e.id === 'A01_murrah_gain_budget_binding')!;

  it('returns optimal on sufficient feed prefix', () => {
    const animal = toHerdAnimal(baseEntry);
    const stepOutcome = solveHerdStep(
      [animal],
      baseEntry.selectedFeeds,
      [],
      baseEntry.animal.budgetInrPerDay,
    );

    expect(stepOutcome.status).toBe('optimal');
    if (stepOutcome.status === 'optimal') {
      expect(stepOutcome.totalMilkL).toBeGreaterThan(0);
      expect(stepOutcome.shareT).toBeGreaterThan(0);
      expect(stepOutcome.purchaseCostInrPerDay).toBeGreaterThan(0);
      expect(stepOutcome.milkLPerDay['a1']).toBe(stepOutcome.totalMilkL);
    }
  });

  it('returns not_optimal on empty feeds', () => {
    const animal = toHerdAnimal(baseEntry);
    const stepOutcome = solveHerdStep(
      [animal],
      [],
      [],
      baseEntry.animal.budgetInrPerDay,
    );

    expect(stepOutcome.status).toBe('not_optimal');
  });

  it('returns not_optimal when budget is below maintenance', () => {
    const animal = toHerdAnimal(baseEntry);
    const stepOutcome = solveHerdStep(
      [animal],
      baseEntry.selectedFeeds,
      [],
      10, // too low for maintenance
    );

    expect(stepOutcome.status).toBe('not_optimal');
  });
});

describe('herdSolver multi-animal joint LP (AC-C4-2.1 to 2.5)', () => {
  const entryA = benchmarkEntries.find((e) => e.id === 'A01_murrah_gain_budget_binding')!;
  const entryB = benchmarkEntries.find((e) => e.id === 'A02_murrah_at_breed_level_cap_binding')!;
  const dryEntry = benchmarkEntries.find((e) => e.id === 'A08_surti_dry_buffalo_maintenance')!;

  it('solves a 2-animal herd with shared budget and home feeds', () => {
    const a1 = toHerdAnimal(entryA, 'a1');
    const a2 = toHerdAnimal(entryB, 'a2');
    const combinedBuy = entryA.selectedFeeds;
    const homeFeeds: HomeFeed[] = [
      { feedId: 'wheat_straw', kgPerDay: 8 },
      { feedId: 'berseem', kgPerDay: 20 },
    ];
    const herdBudget = 300;

    const outcome = solveHerd([a1, a2], combinedBuy, homeFeeds, herdBudget);
    expect(outcome.status).toBe('optimal');
    const sol = outcome as HerdSolution;

    expect(sol.animals.length).toBe(2);
    expect(sol.purchaseCostInrPerDay).toBeLessThanOrEqual(herdBudget + TOL);

    // Both milking animals achieve the same fair share t* (AC-C4-2.4)
    expect(sol.shareT).toBeGreaterThan(0);
    expect(sol.shareT).toBeLessThanOrEqual(1);

    const a1Sol = sol.animals[0];
    const a2Sol = sol.animals[1];

    expect(a1Sol.milkExactLPerDay).toBeCloseTo(sol.shareT * a1Sol.milkTargetLPerDay, 5);
    expect(a2Sol.milkExactLPerDay).toBeCloseTo(sol.shareT * a2Sol.milkTargetLPerDay, 5);

    // Home feed limits respected across animals
    for (const h of homeFeeds) {
      const used = sol.homeUse.find((u) => u.feedId === h.feedId);
      expect(used).toBeDefined();
      expect(used!.usedKgPerDay).toBeLessThanOrEqual(h.kgPerDay + TOL);
    }

    // Numerical guard
    expect(() =>
      verifyHerdSolution(sol, [a1, a2], combinedBuy, homeFeeds),
    ).not.toThrow();
  });

  it('solves a mixed herd with 1 milking animal and 1 dry animal (AC-C4-2.7)', () => {
    const a1 = toHerdAnimal(entryA, 'a1');
    const aDry = toHerdAnimal(dryEntry, 'a2');
    const combinedBuy = entryA.selectedFeeds;
    const homeFeeds: HomeFeed[] = [{ feedId: 'wheat_straw', kgPerDay: 10 }];
    const herdBudget = 250;

    const outcome = solveHerd([a1, aDry], combinedBuy, homeFeeds, herdBudget);
    expect(outcome.status).toBe('optimal');
    const sol = outcome as HerdSolution;

    expect(sol.animals.length).toBe(2);
    const drySol = sol.animals.find((a) => a.key === 'a2')!;
    expect(drySol.milkTargetLPerDay).toBe(0);
    expect(drySol.milkExactLPerDay).toBe(0);
    expect(drySol.milkLPerDay).toBe(0);
    expect(drySol.solution.verdict.kind).toBe('dry_animal');

    const milkingSol = sol.animals.find((a) => a.key === 'a1')!;
    expect(milkingSol.milkTargetLPerDay).toBeGreaterThan(0);
    expect(milkingSol.milkLPerDay).toBeGreaterThan(0);

    expect(() =>
      verifyHerdSolution(sol, [a1, aDry], combinedBuy, homeFeeds),
    ).not.toThrow();
  });
});

describe('isolated herd limit diagnosis for all limit kinds (AC-C4-2.10, ARCHITECTURE line 1409)', () => {
  const tpl = DEFAULT_FEED_LIBRARY[0];
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

  const syntheticLib: FeedItem[] = [
    makeFeed('forage_balanced', 'indigenous_forage', 18, 2.8, 6, 4, 10),
    makeFeed('forage_super_dense', 'indigenous_forage', 25, 3.5, 15, 12, 10),
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

  const testCow: HerdAnimal = {
    key: 'a1',
    label: { species: 'cow', n: 1 },
    profile: {
      species: 'cow',
      breedId: 'gir',
      bodyWeightKg: 400,
      milkYieldLitersPerDay: 4,
      milkFatPct: 4.0,
    },
    weightSource: 'typed',
    fatSource: 'typed',
    isConfirmed: true,
  };

  it('1. budget is the sole tight limit when budget limits Y* below breed_cap and DM ceiling', () => {
    const out = solveHerd([testCow], [sel('forage_balanced', null, 10)], [], 65, syntheticLib);
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;
    expect(out.budgetTight).toBe(true);
    expect(out.limits).toEqual([{ kind: 'budget' }]);
  });

  it('2. milk_target is the sole tight limit when t* = 1 with slack on budget and feeds', () => {
    const out = solveHerd([testCow], [sel('forage_balanced', null, 10)], [], 500, syntheticLib);
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;
    expect(out.shareT).toBeCloseTo(1, 5);
    expect(out.budgetTight).toBe(false);
    expect(out.limits).toEqual([{ kind: 'milk_target' }]);
  });

  it('3. home_stock is named first when shared home stock bounds t*', () => {
    const cow1: HerdAnimal = {
      ...testCow,
      key: 'a1',
      label: { species: 'cow', n: 1 },
      profile: { ...testCow.profile, milkYieldLitersPerDay: 5 },
    };
    const cow2: HerdAnimal = {
      ...testCow,
      key: 'a2',
      label: { species: 'cow', n: 2 },
      profile: { ...testCow.profile, milkYieldLitersPerDay: 5 },
    };
    const homeFeeds: HomeFeed[] = [{ feedId: 'forage_super_dense', kgPerDay: 10 }];
    const out = solveHerd([cow1, cow2], [], homeFeeds, 500, syntheticLib);
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;
    expect(out.shareT).toBeLessThan(1 - 1e-6);
    expect(out.budgetTight).toBe(false);
    expect(out.limits[0]).toEqual({ kind: 'home_stock', feedId: 'forage_super_dense' });
    expect(out.limits.some((l) => l.kind === 'home_stock')).toBe(true);
  });

  it('4. intake is the sole tight limit when NRC 2001 DM ceiling stops Y*', () => {
    const out = solveHerd([testCow], [sel('forage_low_me', null, 8)], [], 500, syntheticLib);
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;
    expect(out.limits).toEqual([{ kind: 'animal', key: 'a1', constraint: 'intake' }]);
  });

  it('5. roughage is the sole tight limit when capped roughage forces roughage share == 40%', () => {
    const out = solveHerd(
      [testCow],
      [
        sel('forage_zero', 3.0, 5),
        sel('conc_cp', null, 20),
        sel('conc_me', null, 20),
        sel('min_ca', null, 20),
        sel('min_p', null, 20),
      ],
      [],
      500,
      syntheticLib,
    );
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;
    expect(out.limits).toEqual([{ kind: 'animal', key: 'a1', constraint: 'roughage' }]);
  });

  it('6. CP is the sole tight limit when CP supplier is capped', () => {
    const out = solveHerd(
      [testCow],
      [
        sel('forage_no_cp', null, 8),
        sel('conc_cp', 1.38, 20),
      ],
      [],
      500,
      syntheticLib,
    );
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;
    expect(out.limits).toEqual([{ kind: 'animal', key: 'a1', constraint: 'CP' }]);
  });

  it('7. ME is the sole tight limit when ME supplier is capped', () => {
    const out = solveHerd(
      [testCow],
      [
        sel('forage_no_me', null, 8),
        sel('conc_me', 3.4, 20),
      ],
      [],
      500,
      syntheticLib,
    );
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;
    expect(out.limits).toEqual([{ kind: 'animal', key: 'a1', constraint: 'ME' }]);
  });

  it('8. Ca is the sole tight limit when Ca supplier is capped', () => {
    const out = solveHerd(
      [testCow],
      [
        sel('forage_no_ca', null, 8),
        sel('min_ca', 0.135, 20),
      ],
      [],
      500,
      syntheticLib,
    );
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;
    expect(out.limits).toEqual([{ kind: 'animal', key: 'a1', constraint: 'Ca' }]);
  });

  it('9. P is the sole tight limit when P supplier is capped', () => {
    const out = solveHerd(
      [testCow],
      [
        sel('forage_no_p', null, 8),
        sel('min_p', 0.114, 20),
      ],
      [],
      500,
      syntheticLib,
    );
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;
    expect(out.limits).toEqual([{ kind: 'animal', key: 'a1', constraint: 'P' }]);
  });

  it('10. multiple tight limits follow priority order: budget, milk_target, home_stock, animal intake/roughage/nutrients (line 1409)', () => {
    const cow1: HerdAnimal = {
      ...testCow,
      key: 'a1',
      label: { species: 'cow', n: 1 },
      profile: { ...testCow.profile, milkYieldLitersPerDay: 6 },
    };
    const cow2: HerdAnimal = {
      ...testCow,
      key: 'a2',
      label: { species: 'cow', n: 2 },
      profile: { ...testCow.profile, milkYieldLitersPerDay: 6 },
    };
    const homeFeeds: HomeFeed[] = [{ feedId: 'forage_zero', kgPerDay: 2 }];
    const out = solveHerd(
      [cow1, cow2],
      [sel('forage_balanced', null, 10)],
      homeFeeds,
      100,
      syntheticLib,
    );
    expect(out.status).toBe('optimal');
    if (out.status !== 'optimal') return;
    expect(out.limits[0].kind).toBe('budget');
    const homeIdx = out.limits.findIndex((l) => l.kind === 'home_stock');
    const animalIdx = out.limits.findIndex((l) => l.kind === 'animal');
    if (homeIdx !== -1 && animalIdx !== -1) {
      expect(homeIdx).toBeLessThan(animalIdx);
    }
  });
});

describe('herdSolver multi-animal herd up to 10 animals (AC-C4-2.3, AC-C4-2.4, AC-C4-2.5)', () => {
  it('solves 3-animal multi-species herd with fair share t*, home stock, and shopping conservation', () => {
    const a1: HerdAnimal = {
      key: 'a1',
      label: { species: 'cow', n: 1 },
      profile: {
        species: 'cow',
        breedId: 'gir',
        bodyWeightKg: 400,
        milkYieldLitersPerDay: 6,
        milkFatPct: 4.5,
      },
      weightSource: 'typed',
      fatSource: 'typed',
      isConfirmed: true,
    };
    const a2: HerdAnimal = {
      key: 'a2',
      label: { species: 'buffalo', n: 1 },
      profile: {
        species: 'buffalo',
        breedId: 'murrah',
        bodyWeightKg: 500,
        milkYieldLitersPerDay: 8,
        milkFatPct: 7.0,
      },
      weightSource: 'typed',
      fatSource: 'typed',
      isConfirmed: true,
    };
    const a3: HerdAnimal = {
      key: 'a3',
      label: { species: 'cow', n: 2 },
      profile: {
        species: 'cow',
        breedId: 'sahiwal',
        bodyWeightKg: 420,
        milkYieldLitersPerDay: 10,
        milkFatPct: 4.8,
      },
      weightSource: 'typed',
      fatSource: 'typed',
      isConfirmed: true,
    };

    const homeFeeds: HomeFeed[] = [
      { feedId: 'wheat_straw', kgPerDay: 12 },
      { feedId: 'berseem', kgPerDay: 30 },
    ];
    const buySet: SelectedFeedInput[] = [
      { feedId: 'mustard_cake', priceInrPerKgAsFed: 33, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'wheat_bran', priceInrPerKgAsFed: 20, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'mineral_mix', priceInrPerKgAsFed: 70, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'common_salt', priceInrPerKgAsFed: 5, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
    ];
    const budget = 450;

    const outcome = solveHerd([a1, a2, a3], buySet, homeFeeds, budget);
    expect(outcome.status).toBe('optimal');
    const sol = outcome as HerdSolution;

    // AC-C4-2.4: Every milking animal achieves the exact same share t*
    expect(sol.shareT).toBeGreaterThan(0);
    expect(sol.shareT).toBeLessThanOrEqual(1);
    for (const aSol of sol.animals) {
      expect(aSol.milkTargetLPerDay).toBeGreaterThan(0);
      expect(aSol.milkExactLPerDay).toBeCloseTo(sol.shareT * aSol.milkTargetLPerDay, 5);
      expect(aSol.milkLPerDay).toBe(roundSupportedMilkDown(aSol.milkExactLPerDay));
    }

    // AC-C4-2.3: Every animal meets its maintenance and requirements
    expect(sol.purchaseCostInrPerDay).toBeLessThanOrEqual(budget + TOL);
    for (const aSol of sol.animals) {
      expect(aSol.solution.supplied.dmKgPerDay).toBeLessThanOrEqual(
        aSol.solution.requirementsAtS!.dmKgPerDay + TOL,
      );
      expect(aSol.solution.supplied.cpGramsPerDay).toBeGreaterThanOrEqual(
        aSol.solution.requirementsAtS!.cpGramsPerDay - TOL,
      );
      expect(aSol.solution.supplied.meMcalPerDay).toBeGreaterThanOrEqual(
        aSol.solution.requirementsAtS!.meMcalPerDay - TOL,
      );
    }

    // AC-C4-2.5: Shopping line conservation (sum of card buy lines equals buyTotals)
    for (const bTotal of sol.buyTotals) {
      const sumAnimalKg = bTotal.perAnimalKg.reduce((s, p) => s + p.kg, 0);
      expect(sumAnimalKg).toBeCloseTo(bTotal.kgPerDay, 5);

      let cardBuySum = 0;
      for (const aSol of sol.animals) {
        for (const line of aSol.solution.feeds) {
          if (line.feedId === bTotal.feedId && line.source === 'buy') {
            cardBuySum += line.kgAsFed;
          }
        }
      }
      expect(cardBuySum).toBeCloseTo(bTotal.kgPerDay, 5);
    }

    // AC-C4-2.5: Home stock limits respected
    for (const h of homeFeeds) {
      const used = sol.homeUse.find((u) => u.feedId === h.feedId);
      expect(used).toBeDefined();
      expect(used!.usedKgPerDay).toBeLessThanOrEqual(h.kgPerDay + TOL);
    }

    // Verify numerical guard passes
    expect(() => verifyHerdSolution(sol, [a1, a2, a3], buySet, homeFeeds)).not.toThrow();
  });

  it('solves a full 10-animal herd with mixed species, milking and dry animals', () => {
    const animals: HerdAnimal[] = [
      {
        key: 'a1',
        label: { species: 'buffalo', n: 1 },
        profile: { species: 'buffalo', breedId: 'murrah', bodyWeightKg: 500, milkYieldLitersPerDay: 8, milkFatPct: 7.0 },
        weightSource: 'typed',
        fatSource: 'typed',
        isConfirmed: true,
      },
      {
        key: 'a2',
        label: { species: 'buffalo', n: 2 },
        profile: { species: 'buffalo', breedId: 'murrah', bodyWeightKg: 460, milkYieldLitersPerDay: 6, milkFatPct: 6.8 },
        weightSource: 'typed',
        fatSource: 'typed',
        isConfirmed: true,
      },
      {
        key: 'a3',
        label: { species: 'cow', n: 1 },
        profile: { species: 'cow', breedId: 'gir', bodyWeightKg: 400, milkYieldLitersPerDay: 7, milkFatPct: 4.5 },
        weightSource: 'typed',
        fatSource: 'typed',
        isConfirmed: true,
      },
      {
        key: 'a4',
        label: { species: 'cow', n: 2 },
        profile: { species: 'cow', breedId: 'gir', bodyWeightKg: 380, milkYieldLitersPerDay: 5, milkFatPct: 4.2 },
        weightSource: 'typed',
        fatSource: 'typed',
        isConfirmed: true,
      },
      {
        key: 'a5',
        label: { species: 'cow', n: 3 },
        profile: { species: 'cow', breedId: 'sahiwal', bodyWeightKg: 430, milkYieldLitersPerDay: 9, milkFatPct: 4.8 },
        weightSource: 'typed',
        fatSource: 'typed',
        isConfirmed: true,
      },
      {
        key: 'a6',
        label: { species: 'cow', n: 4 },
        profile: { species: 'cow', breedId: 'rathi', bodyWeightKg: 320, milkYieldLitersPerDay: 6, milkFatPct: 4.0 },
        weightSource: 'typed',
        fatSource: 'typed',
        isConfirmed: true,
      },
      {
        key: 'a7',
        label: { species: 'buffalo', n: 3 },
        profile: { species: 'buffalo', breedId: 'surti', bodyWeightKg: 420, milkYieldLitersPerDay: 5, milkFatPct: 6.5 },
        weightSource: 'typed',
        fatSource: 'typed',
        isConfirmed: true,
      },
      {
        key: 'a8',
        label: { species: 'buffalo', n: 4 },
        profile: { species: 'buffalo', breedId: 'nili_ravi', bodyWeightKg: 480, milkYieldLitersPerDay: 7, milkFatPct: 6.5 },
        weightSource: 'typed',
        fatSource: 'typed',
        isConfirmed: true,
      },
      {
        key: 'a9',
        label: { species: 'buffalo', n: 5 },
        profile: { species: 'buffalo', breedId: 'surti', bodyWeightKg: 400, milkYieldLitersPerDay: 0, milkFatPct: 0 },
        weightSource: 'typed',
        fatSource: 'typed',
        isConfirmed: true,
      },
      {
        key: 'a10',
        label: { species: 'cow', n: 5 },
        profile: { species: 'cow', breedId: 'nondescript_cow', bodyWeightKg: 350, milkYieldLitersPerDay: 0, milkFatPct: 0 },
        weightSource: 'typed',
        fatSource: 'typed',
        isConfirmed: true,
      },
    ];

    expect(animals.length).toBe(10);

    const homeFeeds: HomeFeed[] = [
      { feedId: 'wheat_straw', kgPerDay: 40 },
      { feedId: 'berseem', kgPerDay: 80 },
    ];
    const buySet: SelectedFeedInput[] = [
      { feedId: 'mustard_cake', priceInrPerKgAsFed: 33, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'wheat_bran', priceInrPerKgAsFed: 20, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'bajra_grain', priceInrPerKgAsFed: 24, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'mineral_mix', priceInrPerKgAsFed: 70, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'common_salt', priceInrPerKgAsFed: 5, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
    ];
    const budget = 1800;

    const outcome = solveHerd(animals, buySet, homeFeeds, budget);
    expect(outcome.status).toBe('optimal');
    const sol = outcome as HerdSolution;

    expect(sol.animals.length).toBe(10);
    expect(sol.purchaseCostInrPerDay).toBeLessThanOrEqual(budget + TOL);

    // Milking animals all get exactly the same fair share t* (AC-C4-2.4)
    expect(sol.shareT).toBeGreaterThan(0);
    expect(sol.shareT).toBeLessThanOrEqual(1);

    const milkingSolutions = sol.animals.slice(0, 8);
    for (const aSol of milkingSolutions) {
      expect(aSol.milkTargetLPerDay).toBeGreaterThan(0);
      expect(aSol.milkExactLPerDay).toBeCloseTo(sol.shareT * aSol.milkTargetLPerDay, 5);
      expect(aSol.milkLPerDay).toBe(roundSupportedMilkDown(aSol.milkExactLPerDay));
      expect(aSol.solution.verdict.kind).not.toBe('dry_animal');
    }

    // Dry animals (a9, a10) get maintenance rations with 0 milk (AC-C4-2.7)
    const drySolutions = sol.animals.slice(8);
    for (const dSol of drySolutions) {
      expect(dSol.milkTargetLPerDay).toBe(0);
      expect(dSol.milkExactLPerDay).toBe(0);
      expect(dSol.milkLPerDay).toBe(0);
      expect(dSol.solution.verdict.kind).toBe('dry_animal');
    }

    // Conservation of bought feeds (AC-C4-2.5)
    for (const bTotal of sol.buyTotals) {
      const sumAnimalKg = bTotal.perAnimalKg.reduce((s, p) => s + p.kg, 0);
      expect(sumAnimalKg).toBeCloseTo(bTotal.kgPerDay, 5);
    }

    // verifyHerdSolution accepts the full 10-animal solve
    expect(() => verifyHerdSolution(sol, animals, buySet, homeFeeds)).not.toThrow();

    // solveHerdStep works for the 10-animal herd
    const step = solveHerdStep(animals, buySet, homeFeeds, budget);
    expect(step.status).toBe('optimal');
    if (step.status === 'optimal') {
      expect(step.shareT).toBeCloseTo(sol.shareT, 4);
      expect(step.totalMilkL).toBeGreaterThan(0);
      let sumStepMilk = 0;
      for (const a of animals) {
        sumStepMilk += step.milkLPerDay[a.key] ?? 0;
      }
      expect(step.totalMilkL).toBeCloseTo(sumStepMilk, 5);
      expect(step.milkLPerDay['a9']).toBe(0);
      expect(step.milkLPerDay['a10']).toBe(0);
    }
  });
});

describe('herdSolver edge cases: below maintenance, all dry, and infeasible (AC-C4-E3, AC-C4-E9, AC-C4-2.7)', () => {
  const baseEntry = benchmarkEntries.find((e) => e.id === 'A01_murrah_gain_budget_binding')!;
  const dryEntry = benchmarkEntries.find((e) => e.id === 'A08_surti_dry_buffalo_maintenance')!;

  it('detects budget below herd maintenance (AC-C4-E3)', () => {
    const a1 = toHerdAnimal(baseEntry, 'a1');
    const a2 = toHerdAnimal(dryEntry, 'a2');
    const buySet = baseEntry.selectedFeeds;
    const homeFeeds: HomeFeed[] = [{ feedId: 'wheat_straw', kgPerDay: 5 }];

    const outcome = solveHerd([a1, a2], buySet, homeFeeds, 20);
    expect(outcome.status).toBe('below_maintenance');
    if (outcome.status === 'below_maintenance') {
      expect(outcome.budgetInrPerDay).toBe(20);
      expect(outcome.maintenanceCostInrPerDay).toBeGreaterThan(20);
    }
  });

  it('solves all-dry herd at maintenance with t* = 0 and costAtTarget = null (AC-C4-2.7)', () => {
    const d1: HerdAnimal = {
      key: 'a1',
      label: { species: 'buffalo', n: 1 },
      profile: { species: 'buffalo', breedId: 'surti', bodyWeightKg: 400, milkYieldLitersPerDay: 0, milkFatPct: 0 },
      weightSource: 'typed',
      fatSource: 'typed',
      isConfirmed: true,
    };
    const d2: HerdAnimal = {
      key: 'a2',
      label: { species: 'cow', n: 1 },
      profile: { species: 'cow', breedId: 'nondescript_cow', bodyWeightKg: 350, milkYieldLitersPerDay: 0, milkFatPct: 0 },
      weightSource: 'typed',
      fatSource: 'typed',
      isConfirmed: true,
    };
    const d3: HerdAnimal = {
      key: 'a3',
      label: { species: 'buffalo', n: 2 },
      profile: { species: 'buffalo', breedId: 'murrah', bodyWeightKg: 450, milkYieldLitersPerDay: 0, milkFatPct: 0 },
      weightSource: 'typed',
      fatSource: 'typed',
      isConfirmed: true,
    };

    const homeFeeds: HomeFeed[] = [{ feedId: 'wheat_straw', kgPerDay: 15 }];
    const buySet: SelectedFeedInput[] = [
      { feedId: 'mustard_cake', priceInrPerKgAsFed: 33, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'mineral_mix', priceInrPerKgAsFed: 70, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'common_salt', priceInrPerKgAsFed: 5, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
    ];
    const budget = 300;

    const outcome = solveHerd([d1, d2, d3], buySet, homeFeeds, budget);
    expect(outcome.status).toBe('optimal');
    const sol = outcome as HerdSolution;

    expect(sol.shareT).toBe(0);
    expect(sol.costAtTargetInrPerDay).toBeNull();
    expect(sol.budgetTight).toBe(false);
    expect(sol.animals.length).toBe(3);

    for (const aSol of sol.animals) {
      expect(aSol.milkTargetLPerDay).toBe(0);
      expect(aSol.milkExactLPerDay).toBe(0);
      expect(aSol.milkLPerDay).toBe(0);
      expect(aSol.solution.verdict.kind).toBe('dry_animal');
      expect(aSol.solution.bindingConstraint).toBe('breed_cap');
    }

    expect(() => verifyHerdSolution(sol, [d1, d2, d3], buySet, homeFeeds)).not.toThrow();
  });

  it('diagnoses single-animal infeasibility with limiting nutrients (AC-C4-E9)', () => {
    const a1 = toHerdAnimal(baseEntry, 'a1');
    const a2: HerdAnimal = {
      key: 'a2',
      label: { species: 'cow', n: 1 },
      profile: { species: 'cow', breedId: 'gir', bodyWeightKg: 400, milkYieldLitersPerDay: 5, milkFatPct: 4.0 },
      weightSource: 'typed',
      fatSource: 'typed',
      isConfirmed: true,
    };

    const noRoughageBuySet: SelectedFeedInput[] = [
      { feedId: 'mustard_cake', priceInrPerKgAsFed: 33, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'wheat_bran', priceInrPerKgAsFed: 20, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'mineral_mix', priceInrPerKgAsFed: 70, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'common_salt', priceInrPerKgAsFed: 5, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
    ];

    const outcome = solveHerd([a1, a2], noRoughageBuySet, [], 500);
    expect(outcome.status).toBe('infeasible');
    const inf = outcome as HerdInfeasible;
    expect(inf.jointConflict).toBe(false);
    expect(inf.animals.length).toBeGreaterThanOrEqual(1);
  });

  it('diagnoses joint conflict when animals pass alone but cannot share limited stock together (AC-C4-E9)', () => {
    const tpl = DEFAULT_FEED_LIBRARY[0];
    const forageBalanced: FeedItem = {
      ...tpl,
      id: 'forage_balanced',
      englishName: 'forage_balanced',
      vertical: 'indigenous_forage',
      dmPct: 100,
      cpPctDm: 18,
      meMcalPerKgDm: 2.8,
      caGramsPerKgDm: 6,
      pGramsPerKgDm: 4,
      defaultPriceInrPerKgAsFed: 10,
    };
    const lib = [forageBalanced];

    const cow1: HerdAnimal = {
      key: 'a1',
      label: { species: 'cow', n: 1 },
      profile: { species: 'cow', breedId: 'rathi', bodyWeightKg: 280, milkYieldLitersPerDay: 0, milkFatPct: 0 },
      weightSource: 'typed',
      fatSource: 'typed',
      isConfirmed: true,
    };
    const cow2: HerdAnimal = {
      key: 'a2',
      label: { species: 'cow', n: 2 },
      profile: { species: 'cow', breedId: 'rathi', bodyWeightKg: 280, milkYieldLitersPerDay: 0, milkFatPct: 0 },
      weightSource: 'typed',
      fatSource: 'typed',
      isConfirmed: true,
    };

    // 5 kg of forage_balanced is enough for one cow alone (~3.5 kg DM maintenance needed)
    // but not enough for two cows together (~7 kg DM maintenance needed).
    const homeFeeds: HomeFeed[] = [
      { feedId: 'forage_balanced', kgPerDay: 5 },
    ];

    const outcome = solveHerd([cow1, cow2], [], homeFeeds, 500, lib);
    expect(outcome.status).toBe('infeasible');
    const inf = outcome as HerdInfeasible;
    expect(inf.jointConflict).toBe(true);
    expect(inf.animals.length).toBe(0);
  });
});


