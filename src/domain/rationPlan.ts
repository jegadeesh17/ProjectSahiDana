// Pure ration plan engine for Change 3 (docs/ARCHITECTURE.md, "C3 data models" and "C3 interfaces").
// Synchronous, client-side, zero network dependencies, no React/i18n/adapter imports.
import { inSeason } from './feedGroups';
import type { AnimalProfile, FeedItem, RationSolveOutcome, SelectedFeedInput } from './types';

/** The active adapter's solveRation, injected so the module stays pure and testable. */
export type SolveFn = (profile: AnimalProfile, feeds: SelectedFeedInput[]) => RationSolveOutcome;

export interface RationRung {
  /** Feeds bought at this rung; rung 1 may group several ("buy these together to balance"). */
  addedFeedIds: string[];
  /** Addition: every feed in this rung's step (own feeds + bought so far), for the rung audit (AC-C3-2.10). */
  prefixFeedIds: string[];
  /** The step's solve. Status 'optimal' for every rung by construction (ADR-0012). */
  outcome: RationSolveOutcome;
}

export interface BudgetIncrease {
  /** X = roundUpInr(costAtCapInrPerDay − budgetInrPerDay); > 0 whenever this object exists. */
  extraInrPerDay: number;
  /** Y = final.effectiveCapLPerDay (displayed rounded down to 0.1 like S). */
  targetMilkLPerDay: number;
  /** The final solve's costAtCapInrPerDay, kept for the audit of X. */
  costAtCapInrPerDay: number;
}

export interface RationPlan {
  /** The existing two-stage solve over the candidate set, with unbuyable suggestions removed (ADR-0010 decision 4). */
  final: RationSolveOutcome;
  /** Rung 0: the own feeds alone; null when no own feeds or when final is not 'optimal'. */
  ownedOnly: RationSolveOutcome | null;
  /** Rungs 1..n; empty when final is not 'optimal' or nothing is bought. */
  rungs: RationRung[];
  /** The buy list in ladder order (supplements first, then ₹/day ascending, ties by feed id). */
  buyFeedIds: string[];
  /** Own feeds with no line above 0 kg/day in final, in the order entered. */
  notNeededFeedIds: string[];
  budgetIncrease: BudgetIncrease | null;
  /** Addition: exactly the feeds passed to the final solve (AC-C3-2.3). */
  candidates: SelectedFeedInput[];
  /** Addition: the month used for the in-season filter (ADR-0016). */
  month: number;
}

/** Feeds the solver always includes at a minimum kg/day when offered (mineral-supplement rows in solver.ts). */
export const MANDATORY_SUPPLEMENT_IDS: readonly string[] = ['mineral_mix', 'common_salt'];

/** Round a rupee amount up to the 2 decimals formatInr shows: Math.ceil(value * 100 - 1e-7) / 100. */
export function roundUpInr(value: number): number {
  const rounded = Math.ceil(value * 100 - 1e-7) / 100;
  return rounded === 0 ? 0 : rounded;
}

/**
 * Builds the candidate feed inputs for the farmer-first solve:
 * 1. Returns every entry of `owned` unchanged, in order (including own feeds out of season).
 * 2. Adds, in library order, every non-owned FeedItem where `inSeason(feed, month)` holds
 *    and `defaultPriceInrPerKgAsFed !== null`, with maxKg and currentKg set to null.
 */
export function buildCandidates(
  owned: SelectedFeedInput[],
  library: readonly FeedItem[],
  month: number,
): SelectedFeedInput[] {
  const candidates: SelectedFeedInput[] = [...owned];
  const ownedIds = new Set(owned.map((f) => f.feedId));

  for (const feed of library) {
    if (!ownedIds.has(feed.id) && inSeason(feed, month) && feed.defaultPriceInrPerKgAsFed !== null) {
      candidates.push({
        feedId: feed.id,
        priceInrPerKgAsFed: feed.defaultPriceInrPerKgAsFed,
        maxKgAsFedPerDay: null,
        currentKgAsFedPerDay: null,
      });
    }
  }

  return candidates;
}

/**
 * Executes the farmer-first plan:
 * 1. Builds candidates from owned feeds + in-season priced library feeds.
 * 2. Runs final solve over candidates, removing unbuyable fix-feed or infeasibility suggestions.
 * 3. Returns empty plan if final solve is not optimal.
 * 4. Runs rung 0 (owned feeds alone) if owned feeds exist.
 * 5. Builds buyFeedIds from positive final feed lines not owned, sorted supplements first, then costInr asc, then feedId code units.
 * 6. Constructs ladder rungs from prefix solves, skipping until the first optimal step (rung 1).
 * 7. Gathers notNeededFeedIds from owned feeds with 0 kg in final solve.
 * 8. Derives budgetIncrease when budget is tight, milk < cap, and costAtCap is not null.
 */
export function planRation(
  profile: AnimalProfile,
  owned: SelectedFeedInput[],
  library: readonly FeedItem[],
  month: number,
  solve: SolveFn,
): RationPlan {
  // 1. Candidates
  const candidates = buildCandidates(owned, library, month);

  // 2. Final solve
  let final = solve(profile, candidates);

  // Remove unbuyable suggestions
  const libraryById = new Map(library.map((f) => [f.id, f]));
  const isBuyable = (feedId: string): boolean => {
    const feed = libraryById.get(feedId);
    return Boolean(feed && inSeason(feed, month) && feed.defaultPriceInrPerKgAsFed !== null);
  };

  if (final.status === 'budget_below_maintenance') {
    if (final.fixFeedId && !isBuyable(final.fixFeedId)) {
      final = {
        ...final,
        fixFeedId: null,
        fixFeed: null,
        maintenanceWithFixInrPerDay: null,
      };
    }
  } else if (final.status === 'infeasible') {
    final = {
      ...final,
      suggestedFeeds: final.suggestedFeeds.filter((s) => isBuyable(s.feedId)),
    };
  }

  // 3. Final not balanced
  if (final.status !== 'optimal') {
    return {
      final,
      ownedOnly: null,
      rungs: [],
      buyFeedIds: [],
      notNeededFeedIds: [],
      budgetIncrease: null,
      candidates,
      month,
    };
  }

  // 4. Rung 0
  const ownedOnly = owned.length > 0 ? solve(profile, owned) : null;

  // 5. Buy list
  const ownedIds = new Set(owned.map((f) => f.feedId));
  const buyLines = final.feeds.filter((line) => line.kgAsFed > 0 && !ownedIds.has(line.feedId));

  buyLines.sort((a, b) => {
    const aSup = MANDATORY_SUPPLEMENT_IDS.includes(a.feedId);
    const bSup = MANDATORY_SUPPLEMENT_IDS.includes(b.feedId);
    if (aSup && !bSup) return -1;
    if (!aSup && bSup) return 1;

    if (Math.abs(a.costInr - b.costInr) > 1e-9) {
      return a.costInr - b.costInr;
    }

    if (a.feedId < b.feedId) return -1;
    if (a.feedId > b.feedId) return 1;
    return 0;
  });

  const buyFeedIds = buyLines.map((line) => line.feedId);

  // 6. Ladder
  const rungs: RationRung[] = [];
  if (buyFeedIds.length > 0) {
    const nSup = buyFeedIds.filter((id) => MANDATORY_SUPPLEMENT_IDS.includes(id)).length;
    const candidatesById = new Map(candidates.map((c) => [c.feedId, c]));
    const ownedPrefixIds = owned.map((f) => f.feedId);

    for (let k = Math.max(1, nSup); k <= buyFeedIds.length; k++) {
      const sliceIds = buyFeedIds.slice(0, k);
      const stepFeeds: SelectedFeedInput[] = [
        ...owned,
        ...sliceIds.map((id) => candidatesById.get(id)!),
      ];
      const outcome = solve(profile, stepFeeds);
      if (outcome.status === 'optimal') {
        const prefixFeedIds = [...ownedPrefixIds, ...sliceIds];
        if (rungs.length === 0) {
          rungs.push({
            addedFeedIds: sliceIds,
            prefixFeedIds,
            outcome,
          });
        } else {
          rungs.push({
            addedFeedIds: [buyFeedIds[k - 1]],
            prefixFeedIds,
            outcome,
          });
        }
      }
    }
  }

  // 7. Not needed
  const usedFeedIds = new Set(
    final.feeds.filter((line) => line.kgAsFed > 0).map((line) => line.feedId),
  );
  const notNeededFeedIds: string[] = [];
  for (const feed of owned) {
    if (!usedFeedIds.has(feed.feedId) && !notNeededFeedIds.includes(feed.feedId)) {
      notNeededFeedIds.push(feed.feedId);
    }
  }

  // 8. Budget prompt
  let budgetIncrease: BudgetIncrease | null = null;
  const milk = final.supportedMilkExactLPerDay ?? final.supportedMilkLPerDay;
  if (
    final.tightConstraints.includes('budget') &&
    milk < final.effectiveCapLPerDay - 1e-6 &&
    final.costAtCapInrPerDay !== null
  ) {
    budgetIncrease = {
      extraInrPerDay: roundUpInr(final.costAtCapInrPerDay - final.budgetInrPerDay),
      targetMilkLPerDay: final.effectiveCapLPerDay,
      costAtCapInrPerDay: final.costAtCapInrPerDay,
    };
  }

  return {
    final,
    ownedOnly,
    rungs,
    buyFeedIds,
    notNeededFeedIds,
    budgetIncrease,
    candidates,
    month,
  };
}
