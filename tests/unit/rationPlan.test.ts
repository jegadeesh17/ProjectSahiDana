import { describe, expect, it, vi } from 'vitest';
import feedsV1 from '../../src/data/feeds.v1.json';
import {
  buildCandidates,
  MANDATORY_SUPPLEMENT_IDS,
  planRation,
  roundUpInr,
} from '../../src/domain/rationPlan';
import { solveRation as solveV1Ration } from '../../src/domain/solver';
import type {
  AnimalProfile,
  FeedItem,
  InfeasibilityReport,
  RationFeedLine,
  RationSolution,
  RationSolveOutcome,
  SelectedFeedInput,
  BudgetShortfallReport,
} from '../../src/domain/types';

const LIVE_FEEDS: FeedItem[] = feedsV1 as unknown as FeedItem[];

const TEST_ANIMAL: AnimalProfile = {
  species: 'buffalo',
  breedId: 'murrah',
  bodyWeightKg: 450,
  milkYieldLitersPerDay: 8,
  milkFatPct: 6.5,
  budgetInrPerDay: 220,
  isConfirmed: true,
};

function makeMockFeedItem(partial: Partial<FeedItem> & { id: string }): FeedItem {
  return {
    englishName: partial.id,
    localNameLatn: null,
    localNameLatnCitation: null,
    localNameDeva: null,
    localNameDevaProvenance: null,
    vertical: 'crop_residue',
    dmPct: 90,
    cpPctDm: 4,
    meMcalPerKgDm: 1.5,
    caGramsPerKgDm: 3,
    pGramsPerKgDm: 1,
    derivedTdnPctDm: 45,
    sourceDoc: 'NDDB',
    sourceTable: 'Table 1',
    sourcePage: '1',
    dmSourceCitation: 'Feedipedia',
    provenanceStatus: 'cited',
    defaultPriceInrPerKgAsFed: 6,
    priceSource: 'mandi',
    priceDate: '2026-01-01',
    priceReliability: 'mandi',
    priceNote: null,
    availableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    seasonNote: { en: 'All year', hi: 'पूरे साल' },
    verifiedOn: '2026-01-01',
    ...partial,
  };
}

function makeMockSolution(partial: Partial<RationSolution> = {}): RationSolution {
  return {
    status: 'optimal',
    supportedMilkLPerDay: 8,
    supportedMilkExactLPerDay: 8.04,
    milkCapLPerDay: 9.64,
    effectiveCapLPerDay: 9.64,
    bindingConstraint: 'budget',
    tightConstraints: ['budget'],
    feedLimitIds: [],
    verdict: { kind: 'gain', gainLPerDay: 0.04 },
    costAtTodayMilkInrPerDay: 215,
    costAtCapInrPerDay: 260.45,
    fatComparison: null,
    maintenanceCostInrPerDay: 110,
    budgetInrPerDay: 220,
    feeds: [],
    totalKgAsFed: 12,
    totalCostInr: 219.5,
    supplied: {
      dmKgPerDay: 11,
      cpGramsPerDay: 1200,
      meMcalPerDay: 25,
      caGramsPerDay: 50,
      pGramsPerDay: 35,
    },
    coveragePct: { DM: 80, CP: 105, ME: 102, Ca: 110, P: 108 },
    bindingConstraints: [],
    roughageSharePct: 45,
    roughageMinSharePct: 40,
    currentCostInr: null,
    savingsInr: null,
    savingsPct: null,
    solvedOn: '2026-10-15',
    sourceKey: 'TEST',
    ...partial,
  };
}

describe('roundUpInr', () => {
  it('handles exact whole rupees and paise without floating point error', () => {
    expect(roundUpInr(10)).toBe(10);
    expect(roundUpInr(10.25)).toBe(10.25);
    expect(roundUpInr(0)).toBe(0);
    expect(Object.is(roundUpInr(0), 0)).toBe(true);
  });

  it('keeps amounts within 1e-7 of an exact paisa from bumping up', () => {
    expect(roundUpInr(10.250000001)).toBe(10.25);
    expect(roundUpInr(50 + 1e-10)).toBe(50);
  });

  it('rounds up amounts with fractional paise strictly above 1e-7', () => {
    expect(roundUpInr(10.25001)).toBe(10.26);
    expect(roundUpInr(10.251)).toBe(10.26);
    expect(roundUpInr(0.001)).toBe(0.01);
    expect(roundUpInr(0.0001)).toBe(0.01);
  });

  it('handles negative numbers correctly', () => {
    expect(roundUpInr(-5.12)).toBe(-5.12);
  });
});

describe('buildCandidates', () => {
  const library: FeedItem[] = [
    makeMockFeedItem({ id: 'in_season_priced', availableMonths: [10], defaultPriceInrPerKgAsFed: 12 }),
    makeMockFeedItem({ id: 'out_of_season_priced', availableMonths: [5], defaultPriceInrPerKgAsFed: 15 }),
    makeMockFeedItem({ id: 'in_season_unpriced', availableMonths: [10], defaultPriceInrPerKgAsFed: null }),
    makeMockFeedItem({ id: 'owned_and_library', availableMonths: [10], defaultPriceInrPerKgAsFed: 20 }),
  ];

  it('excludes out-of-season and unpriced library feeds, keeps owned out-of-season feeds and lists an owned library feed once at farmer price and cap', () => {
    const owned: SelectedFeedInput[] = [
      {
        feedId: 'owned_and_library',
        priceInrPerKgAsFed: 18,
        maxKgAsFedPerDay: 5,
        currentKgAsFedPerDay: 3,
      },
      {
        feedId: 'farmer_own_out_of_season',
        priceInrPerKgAsFed: 7,
        maxKgAsFedPerDay: 10,
        currentKgAsFedPerDay: null,
      },
    ];

    const candidates = buildCandidates(owned, library, 10);

    // Owned feeds appear first, unchanged
    expect(candidates[0]).toEqual(owned[0]);
    expect(candidates[1]).toEqual(owned[1]);

    // Owned library feed is not duplicated
    const ownedLibMatches = candidates.filter((c) => c.feedId === 'owned_and_library');
    expect(ownedLibMatches).toHaveLength(1);
    expect(ownedLibMatches[0].priceInrPerKgAsFed).toBe(18);
    expect(ownedLibMatches[0].maxKgAsFedPerDay).toBe(5);

    // Out-of-season feed from library is excluded
    expect(candidates.some((c) => c.feedId === 'out_of_season_priced')).toBe(false);

    // Unpriced feed from library is excluded
    expect(candidates.some((c) => c.feedId === 'in_season_unpriced')).toBe(false);

    // In-season priced library feed is included with null caps
    const inSeasonCandidate = candidates.find((c) => c.feedId === 'in_season_priced');
    expect(inSeasonCandidate).toEqual({
      feedId: 'in_season_priced',
      priceInrPerKgAsFed: 12,
      maxKgAsFedPerDay: null,
      currentKgAsFedPerDay: null,
    });

    expect(candidates).toHaveLength(3);
  });

  it('works with empty owned feeds, returning all in-season priced library feeds in library order', () => {
    const candidates = buildCandidates([], library, 10);
    expect(candidates).toHaveLength(2);
    expect(candidates[0].feedId).toBe('in_season_priced');
    expect(candidates[1].feedId).toBe('owned_and_library');
    expect(candidates[0].maxKgAsFedPerDay).toBeNull();
    expect(candidates[0].currentKgAsFedPerDay).toBeNull();
  });
});

describe('planRation pure rules', () => {
  const library: FeedItem[] = [
    makeMockFeedItem({ id: 'mineral_mix', vertical: 'mineral', availableMonths: [10], defaultPriceInrPerKgAsFed: 70 }),
    makeMockFeedItem({ id: 'common_salt', vertical: 'mineral', availableMonths: [10], defaultPriceInrPerKgAsFed: 5 }),
    makeMockFeedItem({ id: 'wheat_straw', vertical: 'crop_residue', availableMonths: [10], defaultPriceInrPerKgAsFed: 6 }),
    makeMockFeedItem({ id: 'mustard_cake', vertical: 'agro_byproduct', availableMonths: [10], defaultPriceInrPerKgAsFed: 33 }),
    makeMockFeedItem({ id: 'bajra_grain', vertical: 'agro_byproduct', availableMonths: [10], defaultPriceInrPerKgAsFed: 24 }),
    makeMockFeedItem({ id: 'barley_grain', vertical: 'agro_byproduct', availableMonths: [10], defaultPriceInrPerKgAsFed: 22 }),
    makeMockFeedItem({ id: 'out_season_fix', vertical: 'agro_byproduct', availableMonths: [2], defaultPriceInrPerKgAsFed: 15 }),
    makeMockFeedItem({ id: 'unpriced_fix', vertical: 'agro_byproduct', availableMonths: [10], defaultPriceInrPerKgAsFed: null }),
  ];

  it('orders buy list: supplements first (cheapest first), then costInr asc, ties broken by code units', () => {
    const feedLines: RationFeedLine[] = [
      { feedId: 'mineral_mix', kgAsFed: 0.1, dmKg: 0.1, costInr: 7.0, priceInrPerKg: 70, atCap: false },
      { feedId: 'common_salt', kgAsFed: 0.05, dmKg: 0.05, costInr: 0.25, priceInrPerKg: 5, atCap: false },
      { feedId: 'wheat_straw', kgAsFed: 6, dmKg: 5.4, costInr: 36, priceInrPerKg: 6, atCap: false }, // owned!
      { feedId: 'mustard_cake', kgAsFed: 1.5, dmKg: 1.35, costInr: 49.5, priceInrPerKg: 33, atCap: false },
      { feedId: 'bajra_grain', kgAsFed: 2.0, dmKg: 1.8, costInr: 49.5, priceInrPerKg: 24.75, atCap: false },
      { feedId: 'barley_grain', kgAsFed: 1.0, dmKg: 0.9, costInr: 22, priceInrPerKg: 22, atCap: false },
    ];

    const fakeSolve = (): RationSolveOutcome => {
      return makeMockSolution({
        feeds: feedLines,
        tightConstraints: ['budget'],
        costAtCapInrPerDay: 250,
      });
    };

    const owned: SelectedFeedInput[] = [
      { feedId: 'wheat_straw', priceInrPerKgAsFed: 6, maxKgAsFedPerDay: null, currentKgAsFedPerDay: 6 },
    ];

    const plan = planRation(TEST_ANIMAL, owned, library, 10, fakeSolve);

    // wheat_straw is owned -> not in buyFeedIds
    // mineral_mix and common_salt are MANDATORY_SUPPLEMENT_IDS -> come first, sorted by costInr:
    // common_salt (0.25) < mineral_mix (7.0)
    // Non-supplements: barley_grain (22) < bajra_grain (49.5) & mustard_cake (49.5)
    // Between bajra_grain and mustard_cake (tied at 49.5): 'bajra_grain' < 'mustard_cake' code unit
    expect(plan.buyFeedIds).toEqual([
      'common_salt',
      'mineral_mix',
      'barley_grain',
      'bajra_grain',
      'mustard_cake',
    ]);
  });

  it('constructs ladder: skips unbalanced steps until rung 1, groups supplements into rung 1, one rung per later step', () => {
    const feedLines: RationFeedLine[] = [
      { feedId: 'common_salt', kgAsFed: 0.05, dmKg: 0.05, costInr: 0.25, priceInrPerKg: 5, atCap: false },
      { feedId: 'mineral_mix', kgAsFed: 0.1, dmKg: 0.1, costInr: 7.0, priceInrPerKg: 70, atCap: false },
      { feedId: 'barley_grain', kgAsFed: 1, dmKg: 0.9, costInr: 22, priceInrPerKg: 22, atCap: false },
      { feedId: 'mustard_cake', kgAsFed: 1, dmKg: 0.9, costInr: 33, priceInrPerKg: 33, atCap: false },
    ];

    const fakeSolve = (_profile: AnimalProfile, feeds: SelectedFeedInput[]): RationSolveOutcome => {
      const feedIds = feeds.map((f) => f.feedId);

      // Final solve (all candidates)
      if (feeds.length > 5) {
        return makeMockSolution({
          feeds: feedLines,
          supportedMilkExactLPerDay: 8.5,
          totalCostInr: 120,
        });
      }

      // Rung 0 (own feeds alone)
      if (feedIds.length === 1 && feedIds[0] === 'wheat_straw') {
        return makeMockSolution({
          supportedMilkExactLPerDay: 4.0,
          totalCostInr: 36,
        });
      }

      // Step k=2: owned + [common_salt, mineral_mix] -> infeasible
      if (feedIds.includes('common_salt') && feedIds.includes('mineral_mix') && !feedIds.includes('barley_grain')) {
        const inf: InfeasibilityReport = {
          status: 'infeasible',
          limitingNutrients: [{ nutrient: 'CP', required: 1000, maxSupply: 500 }],
          dmConflict: false,
          suggestedFeeds: [],
          checkedOn: '2026-10-15',
          sourceKey: 'TEST',
        };
        return inf;
      }

      // Step k=3: owned + [common_salt, mineral_mix, barley_grain] -> first optimal step!
      if (feedIds.includes('barley_grain') && !feedIds.includes('mustard_cake')) {
        return makeMockSolution({
          supportedMilkExactLPerDay: 7.0,
          totalCostInr: 87,
        });
      }

      // Step k=4: owned + all 4 buy feeds
      if (feedIds.includes('mustard_cake')) {
        return makeMockSolution({
          supportedMilkExactLPerDay: 8.5,
          totalCostInr: 120,
        });
      }

      return makeMockSolution();
    };

    const owned: SelectedFeedInput[] = [
      { feedId: 'wheat_straw', priceInrPerKgAsFed: 6, maxKgAsFedPerDay: null, currentKgAsFedPerDay: 6 },
    ];

    const plan = planRation(TEST_ANIMAL, owned, library, 10, fakeSolve);

    expect(plan.buyFeedIds).toEqual(['common_salt', 'mineral_mix', 'barley_grain', 'mustard_cake']);
    // Step k=2 was infeasible, so it was skipped.
    // Step k=3 was the first optimal step -> becomes Rung 1, grouping slice(0, 3)
    // Step k=4 becomes Rung 2
    expect(plan.rungs).toHaveLength(2);

    expect(plan.rungs[0].addedFeedIds).toEqual(['common_salt', 'mineral_mix', 'barley_grain']);
    expect(plan.rungs[0].prefixFeedIds).toEqual(['wheat_straw', 'common_salt', 'mineral_mix', 'barley_grain']);
    expect(plan.rungs[0].outcome.status).toBe('optimal');
    if (plan.rungs[0].outcome.status === 'optimal') {
      expect(plan.rungs[0].outcome.supportedMilkExactLPerDay).toBe(7.0);
    }

    expect(plan.rungs[1].addedFeedIds).toEqual(['mustard_cake']);
    expect(plan.rungs[1].prefixFeedIds).toEqual([
      'wheat_straw',
      'common_salt',
      'mineral_mix',
      'barley_grain',
      'mustard_cake',
    ]);
    expect(plan.rungs[1].outcome.status).toBe('optimal');
    if (plan.rungs[1].outcome.status === 'optimal') {
      expect(plan.rungs[1].outcome.supportedMilkExactLPerDay).toBe(8.5);
    }

    // Rung 0
    expect(plan.ownedOnly).not.toBeNull();
    if (plan.ownedOnly?.status === 'optimal') {
      expect(plan.ownedOnly.supportedMilkExactLPerDay).toBe(4.0);
    }
  });

  it('handles empty buy list with rungs: [] and rung 0', () => {
    const fakeSolve = (): RationSolveOutcome => {
      return makeMockSolution({
        feeds: [{ feedId: 'wheat_straw', kgAsFed: 8, dmKg: 7.2, costInr: 48, priceInrPerKg: 6, atCap: false }],
      });
    };

    const owned: SelectedFeedInput[] = [
      { feedId: 'wheat_straw', priceInrPerKgAsFed: 6, maxKgAsFedPerDay: null, currentKgAsFedPerDay: 8 },
    ];

    const plan = planRation(TEST_ANIMAL, owned, library, 10, fakeSolve);
    expect(plan.buyFeedIds).toEqual([]);
    expect(plan.rungs).toEqual([]);
    expect(plan.ownedOnly).not.toBeNull();
    expect(plan.notNeededFeedIds).toEqual([]);
  });

  it('identifies notNeededFeedIds for owned feeds with 0 kg in final solve in entry order', () => {
    const fakeSolve = (): RationSolveOutcome => {
      return makeMockSolution({
        feeds: [
          { feedId: 'wheat_straw', kgAsFed: 6, dmKg: 5.4, costInr: 36, priceInrPerKg: 6, atCap: false },
          { feedId: 'unused_b', kgAsFed: 0, dmKg: 0, costInr: 0, priceInrPerKg: 20, atCap: false },
          // unused_a not even in feeds list
        ],
      });
    };

    const owned: SelectedFeedInput[] = [
      { feedId: 'unused_a', priceInrPerKgAsFed: 15, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
      { feedId: 'wheat_straw', priceInrPerKgAsFed: 6, maxKgAsFedPerDay: null, currentKgAsFedPerDay: 6 },
      { feedId: 'unused_b', priceInrPerKgAsFed: 20, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
    ];

    const plan = planRation(TEST_ANIMAL, owned, library, 10, fakeSolve);
    expect(plan.notNeededFeedIds).toEqual(['unused_a', 'unused_b']);
  });

  it('removes unbuyable fix-feed (out of season or unpriced) in budget_below_maintenance report', () => {
    // Case 1: fix feed is out of season
    const fakeSolveOutOfSeason = (): RationSolveOutcome => {
      const report: BudgetShortfallReport = {
        status: 'budget_below_maintenance',
        verdict: {
          kind: 'budget_below_maintenance',
          maintenanceCostInrPerDay: 250,
          budgetInrPerDay: 100,
        },
        fixFeedId: 'out_season_fix',
        maintenanceWithFixInrPerDay: 95,
        fixFeed: { feedId: 'out_season_fix', maintenanceCostInrPerDay: 95 },
        checkedOn: '2026-10-15',
        sourceKey: 'TEST',
      };
      return report;
    };

    const plan1 = planRation(TEST_ANIMAL, [], library, 10, fakeSolveOutOfSeason);
    expect(plan1.final.status).toBe('budget_below_maintenance');
    if (plan1.final.status === 'budget_below_maintenance') {
      expect(plan1.final.fixFeedId).toBeNull();
      expect(plan1.final.fixFeed).toBeNull();
      expect(plan1.final.maintenanceWithFixInrPerDay).toBeNull();
    }
    expect(plan1.rungs).toEqual([]);
    expect(plan1.buyFeedIds).toEqual([]);
    expect(plan1.budgetIncrease).toBeNull();

    // Case 2: fix feed is unpriced
    const fakeSolveUnpriced = (): RationSolveOutcome => {
      const report: BudgetShortfallReport = {
        status: 'budget_below_maintenance',
        verdict: {
          kind: 'budget_below_maintenance',
          maintenanceCostInrPerDay: 250,
          budgetInrPerDay: 100,
        },
        fixFeedId: 'unpriced_fix',
        maintenanceWithFixInrPerDay: 95,
        fixFeed: { feedId: 'unpriced_fix', maintenanceCostInrPerDay: 95 },
        checkedOn: '2026-10-15',
        sourceKey: 'TEST',
      };
      return report;
    };

    const plan2 = planRation(TEST_ANIMAL, [], library, 10, fakeSolveUnpriced);
    if (plan2.final.status === 'budget_below_maintenance') {
      expect(plan2.final.fixFeedId).toBeNull();
      expect(plan2.final.fixFeed).toBeNull();
    }

    // Case 3: fix feed is buyable (in season and priced)
    const fakeSolveBuyable = (): RationSolveOutcome => {
      const report: BudgetShortfallReport = {
        status: 'budget_below_maintenance',
        verdict: {
          kind: 'budget_below_maintenance',
          maintenanceCostInrPerDay: 250,
          budgetInrPerDay: 100,
        },
        fixFeedId: 'wheat_straw',
        maintenanceWithFixInrPerDay: 95,
        fixFeed: { feedId: 'wheat_straw', maintenanceCostInrPerDay: 95 },
        checkedOn: '2026-10-15',
        sourceKey: 'TEST',
      };
      return report;
    };

    const plan3 = planRation(TEST_ANIMAL, [], library, 10, fakeSolveBuyable);
    if (plan3.final.status === 'budget_below_maintenance') {
      expect(plan3.final.fixFeedId).toBe('wheat_straw');
      expect(plan3.final.maintenanceWithFixInrPerDay).toBe(95);
    }
  });

  it('removes unbuyable suggested feeds in infeasible report', () => {
    const fakeSolveInfeasible = (): RationSolveOutcome => {
      const report: InfeasibilityReport = {
        status: 'infeasible',
        limitingNutrients: [{ nutrient: 'CP', required: 1000, maxSupply: 500 }],
        dmConflict: false,
        suggestedFeeds: [
          { feedId: 'out_season_fix', nutrients: ['CP'] },
          { feedId: 'unpriced_fix', nutrients: ['CP'] },
          { feedId: 'mustard_cake', nutrients: ['CP'] },
        ],
        checkedOn: '2026-10-15',
        sourceKey: 'TEST',
      };
      return report;
    };

    const plan = planRation(TEST_ANIMAL, [], library, 10, fakeSolveInfeasible);
    expect(plan.final.status).toBe('infeasible');
    if (plan.final.status === 'infeasible') {
      expect(plan.final.suggestedFeeds).toEqual([{ feedId: 'mustard_cake', nutrients: ['CP'] }]);
    }
  });

  it('evaluates budgetIncrease: requires budget tight, milk < cap - 1e-6, costAtCap non-null', () => {
    // Case 1: budget NOT tight -> null
    const planNoBudgetTight = planRation(
      TEST_ANIMAL,
      [],
      library,
      10,
      () =>
        makeMockSolution({
          tightConstraints: ['breed_cap'],
          supportedMilkExactLPerDay: 8.0,
          effectiveCapLPerDay: 9.64,
          costAtCapInrPerDay: 260.45,
        }),
    );
    expect(planNoBudgetTight.budgetIncrease).toBeNull();

    // Case 2: milk already at cap -> null
    const planAtCap = planRation(
      TEST_ANIMAL,
      [],
      library,
      10,
      () =>
        makeMockSolution({
          tightConstraints: ['budget'],
          supportedMilkExactLPerDay: 9.64,
          effectiveCapLPerDay: 9.64,
          costAtCapInrPerDay: 260.45,
        }),
    );
    expect(planAtCap.budgetIncrease).toBeNull();

    // Case 3: costAtCap is null (e.g. cap infeasible or dry animal) -> null
    const planCostAtCapNull = planRation(
      TEST_ANIMAL,
      [],
      library,
      10,
      () =>
        makeMockSolution({
          tightConstraints: ['budget'],
          supportedMilkExactLPerDay: 8.0,
          effectiveCapLPerDay: 9.64,
          costAtCapInrPerDay: null,
        }),
    );
    expect(planCostAtCapNull.budgetIncrease).toBeNull();

    // Case 4: all conditions hold -> budgetIncrease populated with rounded up rupee amount
    const planEligible = planRation(
      TEST_ANIMAL,
      [],
      library,
      10,
      () =>
        makeMockSolution({
          budgetInrPerDay: 220,
          tightConstraints: ['budget'],
          supportedMilkExactLPerDay: 8.0,
          effectiveCapLPerDay: 9.64,
          costAtCapInrPerDay: 260.451, // diff = 40.451 -> rounds up to 40.46
        }),
    );
    expect(planEligible.budgetIncrease).toEqual({
      extraInrPerDay: 40.46,
      targetMilkLPerDay: 9.64,
      costAtCapInrPerDay: 260.451,
    });
    // Invariant: budget + X >= costAtCap
    expect(220 + planEligible.budgetIncrease!.extraInrPerDay).toBeGreaterThanOrEqual(260.451);
  });
});

describe('planRation with real solver and LIVE_FEEDS', () => {
  it('satisfies all invariants across rungs on benchmark animal (October / Jaipur)', () => {
    const owned: SelectedFeedInput[] = [
      {
        feedId: 'wheat_straw',
        priceInrPerKgAsFed: 6,
        maxKgAsFedPerDay: null,
        currentKgAsFedPerDay: 4,
      },
    ];

    const plan = planRation(TEST_ANIMAL, owned, LIVE_FEEDS, 10, (p, f) => solveV1Ration(p, f));

    expect(plan.final.status).toBe('optimal');
    if (plan.final.status !== 'optimal') return;

    // Rung 0 check
    expect(plan.ownedOnly).not.toBeNull();

    // Buy list check: supplements must come first if present
    const buySupplements = plan.buyFeedIds.filter((id) => MANDATORY_SUPPLEMENT_IDS.includes(id));
    for (let i = 0; i < buySupplements.length; i++) {
      expect(MANDATORY_SUPPLEMENT_IDS.includes(plan.buyFeedIds[i])).toBe(true);
    }

    // Invariants across rungs
    expect(plan.rungs.length).toBeGreaterThan(0);

    let prevMilk = -Infinity;
    for (const rung of plan.rungs) {
      expect(rung.outcome.status).toBe('optimal');
      if (rung.outcome.status === 'optimal') {
        const milk = rung.outcome.supportedMilkExactLPerDay ?? rung.outcome.supportedMilkLPerDay;
        // Supported milk never decreases from rung 1 (within 1e-6)
        expect(milk).toBeGreaterThanOrEqual(prevMilk - 1e-6);
        prevMilk = milk;
      }
    }

    // Last rung equals final within 1e-6 relative
    const lastRung = plan.rungs[plan.rungs.length - 1];
    expect(lastRung.outcome.status).toBe('optimal');
    if (lastRung.outcome.status === 'optimal') {
      const finalMilk = plan.final.supportedMilkExactLPerDay ?? plan.final.supportedMilkLPerDay;
      const lastMilk = lastRung.outcome.supportedMilkExactLPerDay ?? lastRung.outcome.supportedMilkLPerDay;
      expect(Math.abs(lastMilk - finalMilk)).toBeLessThanOrEqual(1e-6 * Math.max(1, Math.abs(finalMilk)));
      expect(Math.abs(lastRung.outcome.totalCostInr - plan.final.totalCostInr)).toBeLessThanOrEqual(
        1e-6 * Math.max(1, Math.abs(plan.final.totalCostInr)),
      );
    }

    // Rung 1 groups supplements
    expect(plan.rungs[0].addedFeedIds).toEqual(
      expect.arrayContaining(plan.buyFeedIds.filter((id) => MANDATORY_SUPPLEMENT_IDS.includes(id))),
    );
  });

  it('AC-C3-E1: handles empty own feeds (O is empty), rung 0 is absent, notNeeded is empty, all used feeds are in buy list', () => {
    const plan = planRation(TEST_ANIMAL, [], LIVE_FEEDS, 10, (p, f) => solveV1Ration(p, f));
    expect(plan.final.status).toBe('optimal');
    if (plan.final.status !== 'optimal') return;

    // Rung 0 is absent when owned is empty
    expect(plan.ownedOnly).toBeNull();
    // notNeeded is empty
    expect(plan.notNeededFeedIds).toEqual([]);
    // All feeds in final solve with kgAsFed > 0 are in buyFeedIds
    const positiveFinalIds = plan.final.feeds.filter((line) => line.kgAsFed > 0).map((l) => l.feedId);
    expect(plan.buyFeedIds).toEqual(expect.arrayContaining(positiveFinalIds));
    expect(plan.rungs.length).toBeGreaterThan(0);
    // Every rung from 1 on is optimal
    for (const rung of plan.rungs) {
      expect(rung.outcome.status).toBe('optimal');
    }
  });

  it('AC-C3-E2: own feeds cover only part of need (wheat straw only) -> rung 0 not balanced, rung 1 balances with supplements + buy feeds', () => {
    const owned: SelectedFeedInput[] = [
      {
        feedId: 'wheat_straw',
        priceInrPerKgAsFed: 6,
        maxKgAsFedPerDay: null,
        currentKgAsFedPerDay: 4,
      },
    ];

    const plan = planRation(TEST_ANIMAL, owned, LIVE_FEEDS, 10, (p, f) => solveV1Ration(p, f));

    // Rung 0 (wheat straw alone) cannot balance CP/minerals -> infeasible
    expect(plan.ownedOnly).not.toBeNull();
    expect(plan.ownedOnly?.status).toBe('infeasible');

    // Final solve with candidates balances
    expect(plan.final.status).toBe('optimal');

    // Rung 1 groups supplements + minimal buy feeds and is optimal
    expect(plan.rungs.length).toBeGreaterThan(0);
    expect(plan.rungs[0].outcome.status).toBe('optimal');
    expect(plan.rungs[0].addedFeedIds).toEqual(
      expect.arrayContaining(['common_salt', 'mineral_mix']),
    );
    // Owned wheat_straw is used in final solve and NOT in buyFeedIds
    expect(plan.buyFeedIds.includes('wheat_straw')).toBe(false);
  });

  it('AC-C3-2.4: uses own feed at farmer price p = 0 and blank cap q (unlimited)', () => {
    const owned: SelectedFeedInput[] = [
      {
        feedId: 'wheat_straw',
        priceInrPerKgAsFed: 0, // p = 0
        maxKgAsFedPerDay: null, // blank q
        currentKgAsFedPerDay: 4,
      },
    ];

    const plan = planRation(TEST_ANIMAL, owned, LIVE_FEEDS, 10, (p, f) => solveV1Ration(p, f));
    expect(plan.final.status).toBe('optimal');
    if (plan.final.status === 'optimal') {
      const strawLine = plan.final.feeds.find((l) => l.feedId === 'wheat_straw');
      expect(strawLine).toBeDefined();
      expect(strawLine?.priceInrPerKg).toBe(0);
      expect(strawLine?.costInr).toBe(0);
      expect(strawLine?.kgAsFed).toBeGreaterThan(0);
    }
  });

  it('AC-C3-E6: handles dry animal (T = 0) with null costAtCap and null budgetIncrease', () => {
    const dryAnimal: AnimalProfile = {
      ...TEST_ANIMAL,
      milkYieldLitersPerDay: 0,
    };

    const plan = planRation(dryAnimal, [], LIVE_FEEDS, 10, (p, f) => solveV1Ration(p, f));
    expect(plan.final.status).toBe('optimal');
    if (plan.final.status === 'optimal') {
      expect(plan.final.verdict.kind).toBe('dry_animal');
      expect(plan.final.costAtCapInrPerDay).toBeNull();
      expect(plan.budgetIncrease).toBeNull();
    }
  });

  it('AC-C3-E8: planRation is strictly client-side and performs zero network requests', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const plan = planRation(TEST_ANIMAL, [], LIVE_FEEDS, 10, (p, f) => solveV1Ration(p, f));
    expect(plan.final.status).toBe('optimal');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

