// Herd rules and pure herd plan engine for Change 4 (docs/ARCHITECTURE.md, "C4 data models" and "C4 LP formulation").
// Pure domain module: zero UI dependencies, zero network requests, fully deterministic.
import { BREEDS } from './breeds';
import { floorMilk1, roundUpInrWhole } from './format';
import { solveHerd, solveHerdStep } from './herdSolver';
import { buildCandidates, MANDATORY_SUPPLEMENT_IDS } from './rationPlan';
import { DEFAULT_FEED_LIBRARY, SolverError } from './solver';
import type {
  AnimalLabel,
  BreedStandard,
  FeedItem,
  HerdAnimal,
  HerdBudgetPrompt,
  HerdPlan,
  HerdPlanBase,
  HerdStep,
  HomeFeed,
  ShoppingList,
  Species,
} from './types';
import { currentMonth } from '../i18n/months';

/** The most animals a herd can hold (SPEC AC-C4-1.6, AC-C4-E5). 1 for C4-M1, 10 for C4-M2. */
export const MAX_ANIMALS = 1;

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

  // 4. Shopping list & ladder steps
  let shopping: ShoppingList;
  let lastStepMatchesBest = true;

  if (buyOrder.length === 0) {
    shopping = {
      buyFirst: [],
      later: [],
      totalInr: 0,
      firstStep: null,
    };
  } else {
    const s = buyOrder.filter((id) => MANDATORY_SUPPLEMENT_IDS.includes(id)).length;
    const cMap = new Map(C.map((item) => [item.feedId, item]));

    let firstStep: HerdStep | null = null;
    let previousStep: HerdStep | null = null;
    let lastStep: HerdStep | null = null;
    const later: ShoppingList['later'] = [];

    for (let k = Math.max(1, s); k <= buyOrder.length; k++) {
      const sliceIds = buyOrder.slice(0, k);
      const prefixBuySet = sliceIds.map((id) => cMap.get(id)!);
      const stepOutcome = solveHerdStep(animals, prefixBuySet, homeFeeds, budgetInrPerDay, feedLibrary, breedLibrary);

      if (firstStep === null) {
        if (stepOutcome.status === 'optimal') {
          firstStep = {
            k,
            prefixFeedIds: sliceIds,
            addedFeedIds: sliceIds,
            shareT: stepOutcome.shareT,
            totalMilkL: stepOutcome.totalMilkL,
            purchaseCostInrPerDay: stepOutcome.purchaseCostInrPerDay,
          };
          previousStep = firstStep;
          lastStep = firstStep;
        }
      } else {
        if (stepOutcome.status !== 'optimal') {
          throw new SolverError(`Herd step prefix ${k} after P1 was not optimal`);
        }
        const currentStep: HerdStep = {
          k,
          prefixFeedIds: sliceIds,
          addedFeedIds: [buyOrder[k - 1]],
          shareT: stepOutcome.shareT,
          totalMilkL: stepOutcome.totalMilkL,
          purchaseCostInrPerDay: stepOutcome.purchaseCostInrPerDay,
        };
        const deltaMilkExactL = Math.max(0, currentStep.totalMilkL - previousStep!.totalMilkL);
        const deltaMilkL = floorMilk1(deltaMilkExactL);
        later.push({
          line: sortedBuyTotals[k - 1],
          deltaMilkExactL,
          deltaMilkL,
          step: currentStep,
          previous: previousStep!,
        });
        previousStep = currentStep;
        lastStep = currentStep;
      }
    }

    if (firstStep === null || lastStep === null) {
      throw new SolverError('No optimal prefix found for herd buy list');
    }

    const buyFirst = sortedBuyTotals.slice(0, firstStep.k);
    shopping = {
      buyFirst,
      later,
      totalInr: best.purchaseCostInrPerDay,
      firstStep,
    };

    const fTotalMilk = best.animals.reduce((sum, a) => sum + a.milkLPerDay, 0);
    const milkMatches = Math.abs(lastStep.totalMilkL - fTotalMilk) <= 1e-6 * Math.max(1, fTotalMilk);
    const purchaseMatches =
      Math.abs(lastStep.purchaseCostInrPerDay - best.purchaseCostInrPerDay) <=
      1e-6 * Math.max(1, best.purchaseCostInrPerDay);
    lastStepMatchesBest = milkMatches && purchaseMatches;
  }

  // 7. Not needed home feeds
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

  // 8. Budget prompt
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

  return {
    ...base,
    status: 'optimal',
    best,
    perAnimal: best.animals,
    buyOrder,
    shopping,
    notNeeded,
    budgetPrompt,
    shortfall: null,
    infeasible: null,
    lastStepMatchesBest,
  };
}
