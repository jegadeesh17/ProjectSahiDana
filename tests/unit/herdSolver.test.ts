import { describe, expect, it } from 'vitest';
import testAnimals from '../../eval/test_animals.json';
import { solveHerd, solveHerdStep, verifyHerdSolution } from '../../src/domain/herdSolver';
import { solveRation, SolverError, TOL } from '../../src/domain/solver';
import type {
  BenchmarkAnimalEntry,
  HerdAnimal,
  HerdSolution,
  HomeFeed,
  SelectedFeedInput,
} from '../../src/domain/types';

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
    const buySetWithoutBerseem = baseEntry.selectedFeeds.filter((f) => f.feedId !== 'berseem');
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

