// Herd rules and pure herd plan engine for Change 4 (docs/ARCHITECTURE.md, "C4 data models" and "C4 LP formulation").
// Pure domain module: zero UI dependencies, zero network requests, fully deterministic.
import { BREEDS } from './breeds';
import { floorMilk1, roundUpInrWhole } from './format';
import { solveHerd } from './herdSolver';
import { buildCandidates, MANDATORY_SUPPLEMENT_IDS } from './rationPlan';
import { DEFAULT_FEED_LIBRARY } from './solver';
import type {
  AnimalLabel,
  BreedStandard,
  FeedItem,
  HerdAnimal,
  HerdBudgetPrompt,
  HerdExpansionItem,
  HerdPlan,
  HerdPlanBase,
  HerdStep,
  HomeFeed,
  ShoppingList,
  Species,
} from './types';
import { currentMonth } from '../i18n/months';

/** The most animals a herd can hold (SPEC AC-C4-1.6, AC-C4-E5). 1 for C4-M1, 10 for C4-M2. */
export const MAX_ANIMALS = 10;

export type LabelCounters = Record<Species, number>;

export const EMPTY_COUNTERS: LabelCounters = { cow: 0, buffalo: 0 };

/**
 * The next label for a species: the highest number used so far plus 1. Counters only ever go up, so a removed
 * animal's number is never reused and a label on screen 3 always means the same animal as on screen 1 (OQ-C4-3).
 */
export function nextAnimalLabel(
  counters: LabelCounters,
  species: Species,
): { label: AnimalLabel; counters: LabelCounters } {
  const n = counters[species] + 1;
  return { label: { species, n }, counters: { ...counters, [species]: n } };
}

/** Formats local date as ISO YYYY-MM-DD for HerdPlan.planDate. */
export function formatLocalDateIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Computes the pure herd plan:
 * 1. Builds buy set C(m) using candidate library feeds in season in `month` with cited default prices.
 * 2. Solves the joint herd LP (`best = solveHerd`).
 * 3. Returns shortfall or infeasible plan if not optimal.
 * 4. Sorts buyTotals to Bu_H (supplements first, then purchase cost ascending, then feedId code units).
 * 5. Generates shopping ladder prefixes with ΔL_k differences.
 * 6. Determines notNeeded home feeds.
 * 7. Derives budgetPrompt if budget is tight, milk < cap, and costAtCap is not null.
 */
export function planHerd(
  animals: readonly HerdAnimal[],
  homeFeedsOrBudget: readonly HomeFeed[] | number,
  budgetOrHomeFeeds: number | readonly HomeFeed[],
  feedLibrary: readonly FeedItem[] = DEFAULT_FEED_LIBRARY,
  breedLibrary: readonly BreedStandard[] = BREEDS,
  month: number = currentMonth(),
  planDate?: string,
): HerdPlan {
  const [homeFeeds, budgetInrPerDay] =
    typeof homeFeedsOrBudget === 'number'
      ? [(budgetOrHomeFeeds as readonly HomeFeed[]) ?? [], homeFeedsOrBudget]
      : [homeFeedsOrBudget ?? [], budgetOrHomeFeeds as number];

  const effectivePlanDate = planDate ?? formatLocalDateIso();

  // 1. Candidate buy set C
  const C = buildCandidates([], feedLibrary, month);

  // 2. Joint solve
  const outcome = solveHerd(animals, C, homeFeeds, budgetInrPerDay, feedLibrary, breedLibrary);

  const base: HerdPlanBase = {
    animals: [...animals],
    homeFeeds: [...homeFeeds],
    budgetInrPerDay,
    buySet: C,
    month,
    planDate: effectivePlanDate,
  };

  if (outcome.status === 'below_maintenance') {
    return {
      ...base,
      status: 'below_maintenance',
      best: null,
      perAnimal: [],
      buyOrder: [],
      shopping: null,
      expansionItems: [],
      notNeeded: [],
      budgetPrompt: null,
      shortfall: {
        extraInrPerDay: roundUpInrWhole(outcome.maintenanceCostInrPerDay - budgetInrPerDay),
        maintenanceCostInrPerDay: outcome.maintenanceCostInrPerDay,
        budgetInrPerDay,
      },
      infeasible: null,
    };
  }

  if (outcome.status === 'infeasible') {
    const buyableFeedIds = new Set(C.map((c) => c.feedId));
    const filteredAnimals = outcome.animals.map((a) => ({
      ...a,
      suggestedFeeds: a.suggestedFeeds.filter((s) => buyableFeedIds.has(s.feedId)),
    }));
    return {
      ...base,
      status: 'infeasible',
      best: null,
      perAnimal: [],
      buyOrder: [],
      shopping: null,
      expansionItems: [],
      notNeeded: [],
      budgetPrompt: null,
      shortfall: null,
      infeasible: {
        status: 'infeasible',
        animals: filteredAnimals,
        jointConflict: outcome.jointConflict,
      },
    };
  }

  const best = outcome;

  // 3. Bu_H: sorted buy totals (supplements first, cost ascending, feedId code units)
  const sortedBuyTotals = [...best.buyTotals].sort((a, b) => {
    const aSup = MANDATORY_SUPPLEMENT_IDS.includes(a.feedId);
    const bSup = MANDATORY_SUPPLEMENT_IDS.includes(b.feedId);
    if (aSup && !bSup) return -1;
    if (!aSup && bSup) return 1;

    if (Math.abs(a.costInrPerDay - b.costInrPerDay) > 1e-9) {
      return a.costInrPerDay - b.costInrPerDay;
    }

    if (a.feedId < b.feedId) return -1;
    if (a.feedId > b.feedId) return 1;
    return 0;
  });
  const buyOrder = sortedBuyTotals.map((line) => line.feedId);

  // 4. Shopping list: consolidate all within-budget feeds into What to buy (AC-C4-3.1)
  let shopping: ShoppingList;
  if (buyOrder.length === 0) {
    shopping = {
      buyFirst: [],
      later: [],
      totalInr: 0,
      firstStep: null,
    };
  } else {
    const totalMilkL = best.animals.reduce((sum, a) => sum + a.milkLPerDay, 0);
    const firstStep: HerdStep = {
      k: sortedBuyTotals.length,
      prefixFeedIds: buyOrder,
      addedFeedIds: buyOrder,
      shareT: best.shareT,
      totalMilkL,
      purchaseCostInrPerDay: best.purchaseCostInrPerDay,
    };
    shopping = {
      buyFirst: sortedBuyTotals,
      later: [],
      totalInr: best.purchaseCostInrPerDay,
      firstStep,
    };
  }
  const lastStepMatchesBest = true;

  // 5. Not needed home feeds
  const notNeeded: string[] = [];
  for (const h of homeFeeds) {
    let used = 0;
    for (const a of best.animals) {
      for (const line of a.solution.feeds) {
        if (line.feedId === h.feedId && line.source === 'home') {
          used += line.kgAsFed;
        }
      }
    }
    if (used <= 1e-6 && !notNeeded.includes(h.feedId)) {
      notNeeded.push(h.feedId);
    }
  }

  // 6. Budget prompt
  let budgetPrompt: HerdBudgetPrompt | null = null;
  const milkingAnimals = best.animals.filter((a) => a.milkTargetLPerDay > 0);
  if (
    best.budgetTight &&
    best.shareT < 1 - 1e-6 &&
    best.costAtTargetInrPerDay !== null &&
    milkingAnimals.length > 0
  ) {
    const perAnimalTargetL = milkingAnimals.map((a) => ({
      key: a.key,
      targetL: floorMilk1(a.milkTargetLPerDay),
    }));
    const targetMilkL = Math.round(perAnimalTargetL.reduce((sum, p) => sum + p.targetL, 0) * 10) / 10;
    budgetPrompt = {
      extraInrPerDay: roundUpInrWhole(best.costAtTargetInrPerDay - budgetInrPerDay),
      targetMilkL,
      perAnimalTargetL,
      costAtTargetInrPerDay: best.costAtTargetInrPerDay,
      budgetInrPerDay,
    };
  }

  // 7. Beyond-budget expansion steps ("Then, if you can", C4-M3, ADR-0022)
  const expansionItems = computeHerdExpansions(
    animals,
    C,
    homeFeeds,
    budgetInrPerDay,
    best,
    feedLibrary,
    breedLibrary,
  );

  return {
    ...base,
    status: 'optimal',
    best,
    perAnimal: best.animals,
    buyOrder,
    shopping,
    expansionItems,
    notNeeded,
    budgetPrompt,
    shortfall: null,
    infeasible: null,
    lastStepMatchesBest,
  };
}

/**
 * Computes beyond-budget expansion steps ("Then, if you can", ADR-0022, SPEC AC-C4-3.1..3.6, AC-C4-E12..E13).
 *
 * Gating conditions:
 * - best.status === 'optimal'
 * - best.shareT < 1.0 - 1e-6 (AC-C4-3.6: peak genetic yield omits expansion)
 * - Milking animals exist: best.animals.some(a => a.milkTargetLPerDay > 0) (AC-C4-E12: dry herd omits expansion)
 * - Budget is limiting factor: best.budgetTight === true
 * - costAtTargetInrPerDay !== null and costAtTargetInrPerDay > budgetInrPerDay
 *
 * Probing extra budget:
 * - G = costAtCap_H - B_d
 * - Delta B = max(15, min(50, roundUpInrWhole(G / 3)))
 * - probeOutcome = solveHerd(animals, C, homeFeeds, B_d + Delta B, feedLibrary, breedLibrary)
 *
 * Intake ceiling guard (AC-C4-E13):
 * - If probeOutcome.status !== 'optimal' or sum S_i(probe) <= sum S_i(base) + 1e-6, returns []
 *
 * Feeds isolation & sorting:
 * - Feeds with probe kg > base kg + 0.05
 * - deltaCost = roundUpInrWhole(deltaKg * price), deltaMilkL = floorMilk1(deltaMilkExactL)
 * - Filter deltaMilkL > 0, sort descending by returnPerRupee = deltaMilkExactL / deltaCost, tie-break by feedId
 */
export function computeHerdExpansions(
  animals: readonly HerdAnimal[],
  C: readonly SelectedFeedInput[],
  homeFeeds: readonly HomeFeed[],
  budgetInrPerDay: number,
  best: HerdSolution,
  feedLibrary: readonly FeedItem[] = DEFAULT_FEED_LIBRARY,
  breedLibrary: readonly BreedStandard[] = BREEDS,
): HerdExpansionItem[] {
  // 1. Gating conditions
  if (best.status !== 'optimal') return [];
  if (best.shareT >= 1.0 - 1e-6) return [];
  if (!best.animals.some((a) => a.milkTargetLPerDay > 0)) return [];
  if (!best.budgetTight) return [];
  if (best.costAtTargetInrPerDay === null) return [];

  const gap = best.costAtTargetInrPerDay - budgetInrPerDay;
  if (gap <= 0) return [];

  // 2. Probing extra budget: Delta B = max(15, min(50, roundUpInrWhole(gap / 3)))
  const deltaBProbe = Math.max(15, Math.min(50, roundUpInrWhole(gap / 3)));
  const probeBudget = budgetInrPerDay + deltaBProbe;
  const probeOutcome = solveHerd(animals, C, homeFeeds, probeBudget, feedLibrary, breedLibrary);

  // Physical intake ceiling guard (AC-C4-E13)
  if (probeOutcome.status !== 'optimal') return [];

  const baseTotalMilkL = best.animals.reduce((sum, a) => sum + a.milkLPerDay, 0);
  const probeTotalMilkL = probeOutcome.animals.reduce((sum, a) => sum + a.milkLPerDay, 0);
  const deltaMilkExactL = Math.max(0, probeTotalMilkL - baseTotalMilkL);
  const deltaMilkL = floorMilk1(deltaMilkExactL);

  if (deltaMilkExactL <= 1e-6 || deltaMilkL <= 0) return [];

  // 3. Isolating feed additions
  const baseBuyMap = new Map<string, number>();
  for (const line of best.buyTotals) {
    baseBuyMap.set(line.feedId, line.kgPerDay);
  }

  const priceMap = new Map<string, number>();
  for (const c of C) {
    priceMap.set(c.feedId, c.priceInrPerKgAsFed);
  }

  const items: HerdExpansionItem[] = [];

  for (const probeLine of probeOutcome.buyTotals) {
    const baseKg = baseBuyMap.get(probeLine.feedId) ?? 0;
    const deltaKg = probeLine.kgPerDay - baseKg;
    if (deltaKg > 0.05) {
      const price = priceMap.get(probeLine.feedId) ?? probeLine.priceInrPerKg;
      const deltaCostInrPerDay = roundUpInrWhole(deltaKg * price);
      const returnPerRupee = deltaCostInrPerDay > 0 ? deltaMilkExactL / deltaCostInrPerDay : 0;
      items.push({
        feedId: probeLine.feedId,
        deltaKgPerDay: deltaKg,
        deltaCostInrPerDay,
        priceInrPerKg: price,
        deltaMilkExactL,
        deltaMilkL,
        returnPerRupee,
        auditProbe: {
          probeBudgetInrPerDay: probeBudget,
          newTotalMilkL: probeTotalMilkL,
          baseTotalMilkL,
        },
      });
    }
  }

  // 4. Sorting by return efficiency descending, tie-breaking by feedId code units
  items.sort((a, b) => {
    if (Math.abs(a.returnPerRupee - b.returnPerRupee) > 1e-9) {
      return b.returnPerRupee - a.returnPerRupee;
    }
    if (a.feedId < b.feedId) return -1;
    if (a.feedId > b.feedId) return 1;
    return 0;
  });

  return items;
}
