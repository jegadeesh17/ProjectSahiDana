// Two-stage linear programming ration solver (docs/ARCHITECTURE.md section 5).
// Uses javascript-lp-solver with double-precision tableau extraction and 1e-6 numerical verification.
import Solver, { type LpModel, type LpSolution } from 'javascript-lp-solver';
import feedsV1 from '../data/feeds.v1.json';
import { BREEDS, breedById } from './breeds';
import { isRoughage, MIN_NUTRIENTS, perKgFed, PER_KG_FIELD, REQ_FIELD } from './nutrition';
import { buildRequirementModel, computeRequirements, evaluateRequirementsAtMilk } from './requirements';
import {
  BINDING_ORDER,
  NUTRIENT_KEYS,
  type AnimalProfile,
  type BindingConstraint,
  type BreedStandard,
  type BudgetShortfallReport,
  type FeedItem,
  type FeedSuggestion,
  type InfeasibilityReport,
  type LimitingKey,
  type LimitingNutrient,
  type NutrientKey,
  type NutrientVector,
  type RationFeedLine,
  type RationSolution,
  type RationSolveOutcome,
  type RequirementModel,
  type SelectedFeedInput,
} from './types';
import { buildFatComparison, roundSupportedMilkDown, selectVerdict } from './verdict';

export { computeRequirements };

const DEFAULT_FEED_LIBRARY: readonly FeedItem[] = feedsV1 as unknown as FeedItem[];
const SOLVER_SOURCE_KEY = 'SOLVER-LP-V1';
const TOL = 1e-6;

export class SolverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SolverError';
  }
}

interface ActiveFeed {
  input: SelectedFeedInput;
  feed: FeedItem;
}

interface RawLpResult {
  feasible: boolean;
  bounded: boolean;
  evaluation: number;
  values: Record<string, number>;
}

interface InternalTableau {
  height: number;
  rhsColumn: number;
  matrix: number[][];
  varIndexByRow: number[];
  variablesPerIndex: Array<{ id?: string; isSlack?: boolean } | undefined>;
}

interface FixedMilkSolveResult {
  lines: RationFeedLine[];
  totalKgAsFed: number;
  totalCost: number;
  supplied: NutrientVector;
  roughageDmKg: number;
  roughageShare: number;
  roughageSharePct: number;
}

function relTol(rhs: number): number {
  return TOL * Math.max(1, Math.abs(rhs));
}

/**
 * Run javascript-lp-solver and extract unrounded IEEE-754 double values from the simplex tableau
 * so Solver's display rounding never introduces drift > 1e-6.
 */
function runLp(model: LpModel): RawLpResult {
  const raw = Solver.Solve(model, 1e-9, true) as LpSolution & {
    _tableau?: InternalTableau;
    solutionSet?: Record<string, number>;
  };

  const feasible = raw.feasible !== false;
  const bounded = raw.bounded !== false;
  const values: Record<string, number> = {};

  if (raw._tableau && Array.isArray(raw._tableau.matrix)) {
    const tab = raw._tableau;
    for (let r = 1; r <= tab.height - 1; r += 1) {
      const varIdx = tab.varIndexByRow[r];
      const variable = tab.variablesPerIndex[varIdx];
      if (variable && !variable.isSlack && typeof variable.id === 'string') {
        const v = tab.matrix[r][tab.rhsColumn];
        values[variable.id] = v < 0 && v > -1e-12 ? 0 : v;
      }
    }
  } else if (raw.solutionSet && typeof raw.solutionSet === 'object') {
    for (const [k, v] of Object.entries(raw.solutionSet)) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        values[k] = v < 0 && v > -1e-12 ? 0 : v;
      }
    }
  } else {
    for (const [k, v] of Object.entries(raw)) {
      if (k !== 'feasible' && k !== 'result' && k !== 'bounded' && k !== 'isIntegral' && typeof v === 'number') {
        values[k] = v < 0 && v > -1e-12 ? 0 : v;
      }
    }
  }

  const evaluation =
    typeof raw.evaluation === 'number'
      ? raw.evaluation
      : typeof raw.result === 'number'
        ? raw.result
        : 0;

  return {
    feasible,
    bounded,
    evaluation,
    values,
  };
}

function buildFeedLinesAndTotals(inputs: readonly ActiveFeed[], values: Record<string, number>): FixedMilkSolveResult {
  const lines: RationFeedLine[] = [];
  let totalKgAsFed = 0;
  let totalCost = 0;
  let roughageDmKg = 0;
  const supplied: NutrientVector = {
    dmKgPerDay: 0,
    cpGramsPerDay: 0,
    meMcalPerDay: 0,
    caGramsPerDay: 0,
    pGramsPerDay: 0,
  };

  for (const { input, feed } of inputs) {
    const rawKg = values[feed.id] ?? 0;
    const kg = rawKg > 1e-9 ? rawKg : 0;
    const contrib = perKgFed(feed);
    const dmKg = kg * contrib.dm;
    const costInr = kg * input.priceInrPerKgAsFed;
    const atCap =
      input.maxKgAsFedPerDay !== null &&
      kg >= input.maxKgAsFedPerDay - relTol(input.maxKgAsFedPerDay);

    if (kg > 0) {
      lines.push({
        feedId: feed.id,
        kgAsFed: kg,
        dmKg,
        costInr,
        priceInrPerKg: input.priceInrPerKgAsFed,
        atCap,
      });
    }

    totalKgAsFed += kg;
    totalCost += costInr;
    supplied.dmKgPerDay += dmKg;
    supplied.cpGramsPerDay += kg * contrib.cp;
    supplied.meMcalPerDay += kg * contrib.me;
    supplied.caGramsPerDay += kg * contrib.ca;
    supplied.pGramsPerDay += kg * contrib.p;
    if (isRoughage(feed)) {
      roughageDmKg += dmKg;
    }
  }

  const roughageShare = supplied.dmKgPerDay > 0 ? roughageDmKg / supplied.dmKgPerDay : 0;
  const roughageSharePct = roughageShare * 100;

  return {
    lines,
    totalKgAsFed,
    totalCost,
    supplied,
    roughageDmKg,
    roughageShare,
    roughageSharePct,
  };
}

/**
 * Solve a fixed-milk LP (Maintenance at y=0, Stage 2 at y=Y* or y=S, Stage 2' at y=T).
 * Enforces nutrient minimums, NRC 2001 DM upper ceiling, homogeneous roughage row rho(x) >= 0 (unless includeRoughage=false),
 * optional budget cap, and per-feed max caps. No 85% DM floor.
 */
function solveFixedMilk(
  inputs: readonly ActiveFeed[],
  reqModel: RequirementModel,
  milkYieldLPerDay: number,
  budgetCap: number | null,
  includeRoughage = true,
): FixedMilkSolveResult | null {
  if (inputs.length === 0) return null;

  const reqAtY = evaluateRequirementsAtMilk(reqModel, milkYieldLPerDay);
  const r = reqModel.roughage.minShareOfDm;

  const caMaxRatio = reqModel.calciumMax?.value ?? 2.5;
  const caMaxDm = reqModel.calciumMax?.maxGramsPerKgDm ?? 15;

  const constraints: LpModel['constraints'] = {
    DM: { max: reqAtY.dmKgPerDay },
    CP: { min: reqAtY.cpGramsPerDay },
    ME: { min: reqAtY.meMcalPerDay },
    Ca: { min: reqAtY.caGramsPerDay, max: Math.max(reqAtY.caGramsPerDay * caMaxRatio, reqAtY.dmKgPerDay * caMaxDm) },
    P: { min: reqAtY.pGramsPerDay },
  };

  if (includeRoughage) {
    constraints.roughage = { min: 0 };
  }
  if (budgetCap !== null) {
    constraints.budget = { max: budgetCap };
  }

  const variables: LpModel['variables'] = {};
  for (const { input, feed } of inputs) {
    const c = perKgFed(feed);
    const v: Record<string, number> = {
      cost: input.priceInrPerKgAsFed,
      budget: input.priceInrPerKgAsFed,
      DM: c.dm,
      CP: c.cp,
      ME: c.me,
      Ca: c.ca,
      P: c.p,
    };
    if (includeRoughage) {
      v.roughage = isRoughage(feed) ? (1 - r) * c.dm : -r * c.dm;
    }
    if (feed.id === 'mineral_mix') {
      const minMm = milkYieldLPerDay > 0
        ? (reqModel.mineralSupplement?.mineralMixMinKgPerDay?.lactating ?? 0.1)
        : (reqModel.mineralSupplement?.mineralMixMinKgPerDay?.dry ?? 0.05);
      const targetMin = input.maxKgAsFedPerDay !== null ? Math.min(minMm, input.maxKgAsFedPerDay) : minMm;
      constraints.min_mineral_mix = { min: targetMin };
      v.min_mineral_mix = 1;
    }
    if (feed.id === 'common_salt') {
      const minSalt = milkYieldLPerDay > 0
        ? (reqModel.mineralSupplement?.saltMinKgPerDay?.lactating ?? 0.05)
        : (reqModel.mineralSupplement?.saltMinKgPerDay?.dry ?? 0.03);
      const targetMin = input.maxKgAsFedPerDay !== null ? Math.min(minSalt, input.maxKgAsFedPerDay) : minSalt;
      constraints.min_common_salt = { min: targetMin };
      v.min_common_salt = 1;
    }
    if (input.maxKgAsFedPerDay !== null) {
      const capKey = `cap_${feed.id}`;
      constraints[capKey] = { max: input.maxKgAsFedPerDay };
      v[capKey] = 1;
    }
    variables[feed.id] = v;
  }

  const sol = runLp({
    optimize: 'cost',
    opType: 'min',
    constraints,
    variables,
  });

  if (!sol.feasible) return null;

  const built = buildFeedLinesAndTotals(inputs, sol.values);

  // Verify double-precision feasibility of the fixed-milk solution within 1e-6.
  if (built.supplied.dmKgPerDay > reqAtY.dmKgPerDay + relTol(reqAtY.dmKgPerDay)) return null;
  for (const n of MIN_NUTRIENTS) {
    const reqVal = reqAtY[REQ_FIELD[n]];
    const supVal = built.supplied[REQ_FIELD[n]];
    if (supVal + relTol(reqVal) < reqVal) return null;
  }
  if (includeRoughage) {
    const rho = built.roughageDmKg - r * built.supplied.dmKgPerDay;
    if (rho < -relTol(built.supplied.dmKgPerDay)) return null;
  }
  if (budgetCap !== null && built.totalCost > budgetCap + relTol(budgetCap)) {
    return null;
  }

  return built;
}

/**
 * Compute the maximum achievable supply of a single nutrient under the DM ceiling and feed caps (without roughage row).
 */
function maxSingleNutrientSupply(
  inputs: readonly ActiveFeed[],
  dmMax: number,
  nutrient: Exclude<NutrientKey, 'DM'>,
): number {
  if (inputs.length === 0) return 0;

  const constraints: LpModel['constraints'] = {
    DM: { max: dmMax },
  };
  const variables: LpModel['variables'] = {};
  const field = PER_KG_FIELD[nutrient];

  for (const { input, feed } of inputs) {
    const c = perKgFed(feed);
    const v: Record<string, number> = {
      DM: c.dm,
      target: c[field],
    };
    if (input.maxKgAsFedPerDay !== null) {
      const capKey = `cap_${feed.id}`;
      constraints[capKey] = { max: input.maxKgAsFedPerDay };
      v[capKey] = 1;
    }
    variables[feed.id] = v;
  }

  const sol = runLp({
    optimize: 'target',
    opType: 'max',
    constraints,
    variables,
  });
  if (!sol.feasible) return 0;

  let total = 0;
  for (const { feed } of inputs) {
    const kg = Math.max(0, sol.values[feed.id] ?? 0);
    total += kg * perKgFed(feed)[field];
  }
  return total;
}

/**
 * Compute the maximum roughage share (%) achievable when meeting nutrient requirements without the roughage constraint,
 * or from capped roughage feeds relative to the minimum DM needed.
 */
function computeMaxRoughageSharePct(
  inputs: readonly ActiveFeed[],
  reqModel: RequirementModel,
  milkYieldLPerDay: number,
): number {
  const roughageInputs = inputs.filter((a) => isRoughage(a.feed));
  if (roughageInputs.length === 0) return 0;

  const reqAtY = evaluateRequirementsAtMilk(reqModel, milkYieldLPerDay);
  const r = reqModel.roughage.minShareOfDm;

  // Try maximizing rho(x) = sum_{i in R} (1 - r) d_i x_i - sum_{i not in R} r d_i x_i subject to nutrient mins and DM ceiling.
  const constraints: LpModel['constraints'] = {
    DM: { max: reqAtY.dmKgPerDay },
    CP: { min: reqAtY.cpGramsPerDay },
    ME: { min: reqAtY.meMcalPerDay },
    Ca: { min: reqAtY.caGramsPerDay },
    P: { min: reqAtY.pGramsPerDay },
  };
  const variables: LpModel['variables'] = {};
  for (const { input, feed } of inputs) {
    const c = perKgFed(feed);
    const v: Record<string, number> = {
      DM: c.dm,
      CP: c.cp,
      ME: c.me,
      Ca: c.ca,
      P: c.p,
      rho: isRoughage(feed) ? (1 - r) * c.dm : -r * c.dm,
    };
    if (input.maxKgAsFedPerDay !== null) {
      const capKey = `cap_${feed.id}`;
      constraints[capKey] = { max: input.maxKgAsFedPerDay };
      v[capKey] = 1;
    }
    variables[feed.id] = v;
  }

  const sol = runLp({
    optimize: 'rho',
    opType: 'max',
    constraints,
    variables,
  });

  if (sol.feasible) {
    const built = buildFeedLinesAndTotals(inputs, sol.values);
    if (built.supplied.dmKgPerDay > 0) {
      return Math.min(r * 100 - 0.1, built.roughageSharePct);
    }
  }

  // Fallback when nutrient requirements themselves are also infeasible:
  // compare max roughage DM against the minimum DM needed for ME/CP.
  const maxRoughageDm = roughageInputs.reduce((acc, { input, feed }) => {
    const capKg = input.maxKgAsFedPerDay !== null ? input.maxKgAsFedPerDay : reqAtY.dmKgPerDay / (feed.dmPct / 100);
    return acc + capKg * (feed.dmPct / 100);
  }, 0);
  const clampedRoughageDm = Math.min(reqAtY.dmKgPerDay, maxRoughageDm);
  const maxMeDensity = Math.max(...inputs.map(({ feed }) => feed.meMcalPerKgDm), 1.5);
  const minDmNeeded = Math.min(reqAtY.dmKgPerDay, Math.max(reqAtY.meMcalPerDay / maxMeDensity, 1));
  return Math.min(100, (clampedRoughageDm / minDmNeeded) * 100);
}

/**
 * Diagnose why a fixed milk level y (0 for maintenance, T for Stage 2') is infeasible (AC-E2.1, AC-E2.2).
 */
function diagnoseAtMilk(
  inputs: readonly ActiveFeed[],
  reqModel: RequirementModel,
  milkYieldLPerDay: number,
  feedLibrary: readonly FeedItem[],
): { limitingNutrients: LimitingNutrient[]; dmConflict: boolean; suggestedFeeds: FeedSuggestion[] } {
  const reqAtY = evaluateRequirementsAtMilk(reqModel, milkYieldLPerDay);
  const r = reqModel.roughage.minShareOfDm;
  const limitingNutrients: LimitingNutrient[] = [];

  for (const n of MIN_NUTRIENTS) {
    const required = reqAtY[REQ_FIELD[n]];
    const maxSupply = maxSingleNutrientSupply(inputs, reqAtY.dmKgPerDay, n);
    if (maxSupply + relTol(required) < required) {
      limitingNutrients.push({ nutrient: n, required, maxSupply });
    }
  }

  const roughageInputs = inputs.filter((a) => isRoughage(a.feed));
  const feasibleWithoutRoughage =
    roughageInputs.length > 0 ? solveFixedMilk(inputs, reqModel, milkYieldLPerDay, null, false) !== null : false;

  if (roughageInputs.length === 0 || feasibleWithoutRoughage) {
    const maxSupply = computeMaxRoughageSharePct(inputs, reqModel, milkYieldLPerDay);
    limitingNutrients.push({
      nutrient: 'roughage',
      required: r * 100,
      maxSupply,
    });
  } else {
    // Also check if roughage feeds are capped so low that even the minimum DM needed cannot reach r
    const maxSharePct = computeMaxRoughageSharePct(inputs, reqModel, milkYieldLPerDay);
    if (maxSharePct + TOL < r * 100) {
      limitingNutrients.push({
        nutrient: 'roughage',
        required: r * 100,
        maxSupply: maxSharePct,
      });
    }
  }

  const dmConflict = limitingNutrients.length === 0;

  // Build feed suggestions from unselected library feeds (AC-E2.1, AC-E2.2).
  const selectedIds = new Set(inputs.map((a) => a.feed.id));
  const unselected = feedLibrary.filter((f) => !selectedIds.has(f.id));
  const unselectedPriced = unselected.filter((f) => f.defaultPriceInrPerKgAsFed !== null);
  const poolForNutrients = unselectedPriced.length > 0 ? unselectedPriced : unselected;

  const densityScore = (f: FeedItem, k: Exclude<LimitingKey, 'roughage'>): number => {
    switch (k) {
      case 'CP':
        return f.cpPctDm;
      case 'ME':
        return f.meMcalPerKgDm;
      case 'Ca':
        return f.caGramsPerKgDm;
      case 'P':
        return f.pGramsPerKgDm;
      case 'DM':
        return f.dmPct;
    }
  };

  const suggestionMap = new Map<string, LimitingKey[]>();
  const addSuggestion = (feedId: string, key: LimitingKey) => {
    const prev = suggestionMap.get(feedId) ?? [];
    if (!prev.includes(key)) {
      suggestionMap.set(feedId, [...prev, key]);
    }
  };

  if (dmConflict) {
    const bestMe = [...poolForNutrients].sort((a, b) => b.meMcalPerKgDm - a.meMcalPerKgDm)[0];
    const bestCp = [...poolForNutrients].sort((a, b) => b.cpPctDm - a.cpPctDm)[0];
    if (bestMe) addSuggestion(bestMe.id, 'ME');
    if (bestCp) addSuggestion(bestCp.id, 'CP');
  } else {
    for (const lim of limitingNutrients) {
      if (lim.nutrient === 'roughage') {
        // AC-E2.2 & ARCHITECTURE.md section 5: unselected roughage feed with a default price and lowest price per kg DM.
        const pricedRoughage = unselected.filter(
          (f) => isRoughage(f) && f.defaultPriceInrPerKgAsFed !== null,
        );
        const bestRoughage = [...pricedRoughage].sort((a, b) => {
          const pricePerDmA = a.defaultPriceInrPerKgAsFed! / (a.dmPct / 100);
          const pricePerDmB = b.defaultPriceInrPerKgAsFed! / (b.dmPct / 100);
          return pricePerDmA - pricePerDmB;
        })[0];
        if (bestRoughage) {
          addSuggestion(bestRoughage.id, 'roughage');
        }
      } else {
        const key = lim.nutrient;
        const best = [...poolForNutrients].sort((a, b) => densityScore(b, key) - densityScore(a, key))[0];
        if (best) {
          addSuggestion(best.id, key);
        }
      }
    }
  }

  const suggestedFeeds: FeedSuggestion[] = Array.from(suggestionMap.entries()).map(([feedId, nutrients]) => ({
    feedId,
    nutrients,
  }));

  return {
    limitingNutrients,
    dmConflict,
    suggestedFeeds,
  };
}

/**
 * Determine whether a nutrient n is genuinely a physical bottleneck at Y* (cannot be increased above req_n(Y*)
 * under the active feed caps and non-tight upper bounds), rather than merely at its cost-minimizing lower bound in Stage 2.
 */
function isNutrientBottleneckAtYStar(
  inputs: readonly ActiveFeed[],
  reqModel: RequirementModel,
  yStar: number,
  targetNutrient: Exclude<NutrientKey, 'DM'>,
  enforceDmAndRoughage: boolean,
): boolean {
  const reqAtY = evaluateRequirementsAtMilk(reqModel, yStar);
  const r = reqModel.roughage.minShareOfDm;
  const targetField = PER_KG_FIELD[targetNutrient];
  const reqVal = reqAtY[REQ_FIELD[targetNutrient]];

  // If any uncapped feed supplies this nutrient and we are not enforcing DM/roughage, it is unbounded.
  if (!enforceDmAndRoughage) {
    const hasUncappedSupplier = inputs.some(
      ({ input, feed }) => input.maxKgAsFedPerDay === null && perKgFed(feed)[targetField] > 1e-9,
    );
    if (hasUncappedSupplier) return false;
  }

  const constraints: LpModel['constraints'] = {};
  for (const n of MIN_NUTRIENTS) {
    if (n !== targetNutrient) {
      constraints[n] = { min: reqAtY[REQ_FIELD[n]] };
    }
  }
  if (enforceDmAndRoughage) {
    constraints.DM = { max: reqAtY.dmKgPerDay };
    constraints.roughage = { min: 0 };
  }

  const variables: LpModel['variables'] = {};
  for (const { input, feed } of inputs) {
    const c = perKgFed(feed);
    const v: Record<string, number> = {
      target: c[targetField],
    };
    for (const n of MIN_NUTRIENTS) {
      if (n !== targetNutrient) {
        v[n] = c[PER_KG_FIELD[n]];
      }
    }
    if (enforceDmAndRoughage) {
      v.DM = c.dm;
      v.roughage = isRoughage(feed) ? (1 - r) * c.dm : -r * c.dm;
    }
    if (input.maxKgAsFedPerDay !== null) {
      const capKey = `cap_${feed.id}`;
      constraints[capKey] = { max: input.maxKgAsFedPerDay };
      v[capKey] = 1;
    }
    variables[feed.id] = v;
  }

  const sol = runLp({
    optimize: 'target',
    opType: 'max',
    constraints,
    variables,
  });

  if (!sol.feasible || !sol.bounded) return false;

  let maxTarget = 0;
  for (const { feed } of inputs) {
    const kg = Math.max(0, sol.values[feed.id] ?? 0);
    maxTarget += kg * perKgFed(feed)[targetField];
  }
  return maxTarget <= reqVal + relTol(reqVal);
}

/**
 * Detect tight constraints on the Stage 2 solution at Y* in the frozen BINDING_ORDER:
 * ['budget', 'breed_cap', 'intake', 'roughage', 'CP', 'ME', 'Ca', 'P'] (ARCHITECTURE.md section 5, SPEC OQ6).
 */
function detectTightConstraintsAtYStar(
  inputs: readonly ActiveFeed[],
  reqModel: RequirementModel,
  yStar: number,
  effectiveCap: number,
  budget: number,
  stage2AtYStar: FixedMilkSolveResult,
): BindingConstraint[] {
  const reqAtYStar = evaluateRequirementsAtMilk(reqModel, yStar);
  const r = reqModel.roughage.minShareOfDm;
  const tightSet = new Set<BindingConstraint>();

  const budgetTight = stage2AtYStar.totalCost >= budget - relTol(budget);
  if (budgetTight) {
    tightSet.add('budget');
  }

  const breedCapTight = yStar >= effectiveCap - relTol(effectiveCap);
  if (breedCapTight) {
    tightSet.add('breed_cap');
  }

  const intakeTight =
    stage2AtYStar.supplied.dmKgPerDay >= reqAtYStar.dmKgPerDay - relTol(reqAtYStar.dmKgPerDay);
  if (intakeTight) {
    tightSet.add('intake');
  }

  const rho = stage2AtYStar.roughageDmKg - r * stage2AtYStar.supplied.dmKgPerDay;
  const roughageTight =
    stage2AtYStar.supplied.dmKgPerDay > TOL &&
    Math.abs(rho) <= relTol(stage2AtYStar.supplied.dmKgPerDay);
  if (roughageTight) {
    tightSet.add('roughage');
  }

  const topLevelTight = budgetTight || breedCapTight || intakeTight || roughageTight;
  const enforceDmAndRoughage = !intakeTight && !roughageTight;

  for (const n of MIN_NUTRIENTS) {
    const reqVal = reqAtYStar[REQ_FIELD[n]];
    const supVal = stage2AtYStar.supplied[REQ_FIELD[n]];
    if (supVal <= reqVal + relTol(reqVal)) {
      if (isNutrientBottleneckAtYStar(inputs, reqModel, yStar, n, enforceDmAndRoughage)) {
        tightSet.add(n);
      }
    }
  }

  // Fallback if no constraint was marked tight (e.g. numerical edge case):
  if (tightSet.size === 0 && !topLevelTight) {
    for (const n of MIN_NUTRIENTS) {
      const reqVal = reqAtYStar[REQ_FIELD[n]];
      const supVal = stage2AtYStar.supplied[REQ_FIELD[n]];
      if (supVal <= reqVal + relTol(reqVal)) {
        tightSet.add(n);
      }
    }
  }
  if (tightSet.size === 0) {
    tightSet.add('budget');
  }

  return BINDING_ORDER.filter((c) => tightSet.has(c));
}

/**
 * Recompute supplied nutrients, DM, roughage share, feed caps, and total cost in double precision
 * and verify every constraint at milkYieldLPerDay within 1e-6 (ARCHITECTURE.md section 5 "Numerical guard").
 * Throws SolverError on any violation > 1e-6.
 */
export function verifyRationSolution(
  solution: RationSolution,
  animal: AnimalProfile,
  selectedFeeds: readonly SelectedFeedInput[],
  feedLibrary: readonly FeedItem[] = DEFAULT_FEED_LIBRARY,
): void {
  const reqModel = buildRequirementModel(animal);
  const milkLevel = animal.milkYieldLitersPerDay <= 0 ? 0 : solution.supportedMilkLPerDay;
  const reqAtMilk = evaluateRequirementsAtMilk(reqModel, milkLevel);
  const r = reqModel.roughage.minShareOfDm;

  const feedMap = new Map(feedLibrary.map((f) => [f.id, f]));
  const inputMap = new Map(selectedFeeds.map((s) => [s.feedId, s]));

  let totalCost = 0;
  let totalDm = 0;
  let roughageDm = 0;
  let totalCp = 0;
  let totalMe = 0;
  let totalCa = 0;
  let totalP = 0;

  for (const line of solution.feeds) {
    if (!Number.isFinite(line.kgAsFed) || line.kgAsFed < -TOL) {
      throw new SolverError(`Negative or non-finite feed amount for ${line.feedId}: ${line.kgAsFed}`);
    }
    const feed = feedMap.get(line.feedId);
    if (!feed) {
      throw new SolverError(`Unknown feed in solution: ${line.feedId}`);
    }
    const sel = inputMap.get(line.feedId);
    if (sel && sel.maxKgAsFedPerDay !== null && line.kgAsFed > sel.maxKgAsFedPerDay + relTol(sel.maxKgAsFedPerDay)) {
      throw new SolverError(
        `Feed ${line.feedId} amount ${line.kgAsFed} exceeds cap ${sel.maxKgAsFedPerDay}`,
      );
    }
    const c = perKgFed(feed);
    const price = sel ? sel.priceInrPerKgAsFed : line.priceInrPerKg;
    totalCost += line.kgAsFed * price;
    totalDm += line.kgAsFed * c.dm;
    if (isRoughage(feed)) {
      roughageDm += line.kgAsFed * c.dm;
    }
    totalCp += line.kgAsFed * c.cp;
    totalMe += line.kgAsFed * c.me;
    totalCa += line.kgAsFed * c.ca;
    totalP += line.kgAsFed * c.p;
  }

  if (totalCost > animal.budgetInrPerDay + relTol(animal.budgetInrPerDay)) {
    throw new SolverError(
      `Ration cost ${totalCost} exceeds budget ${animal.budgetInrPerDay} beyond 1e-6 tolerance`,
    );
  }
  if (totalDm > reqAtMilk.dmKgPerDay + relTol(reqAtMilk.dmKgPerDay)) {
    throw new SolverError(
      `Supplied DM ${totalDm} exceeds ceiling ${reqAtMilk.dmKgPerDay} beyond 1e-6 tolerance`,
    );
  }
  if (totalCp + relTol(reqAtMilk.cpGramsPerDay) < reqAtMilk.cpGramsPerDay) {
    throw new SolverError(
      `Supplied CP ${totalCp} is below requirement ${reqAtMilk.cpGramsPerDay} beyond 1e-6 tolerance`,
    );
  }
  if (totalMe + relTol(reqAtMilk.meMcalPerDay) < reqAtMilk.meMcalPerDay) {
    throw new SolverError(
      `Supplied ME ${totalMe} is below requirement ${reqAtMilk.meMcalPerDay} beyond 1e-6 tolerance`,
    );
  }
  if (totalCa + relTol(reqAtMilk.caGramsPerDay) < reqAtMilk.caGramsPerDay) {
    throw new SolverError(
      `Supplied Ca ${totalCa} is below requirement ${reqAtMilk.caGramsPerDay} beyond 1e-6 tolerance`,
    );
  }
  const caMaxRatio = reqModel.calciumMax?.value ?? 2.5;
  const caMaxDm = reqModel.calciumMax?.maxGramsPerKgDm ?? 15;
  const maxCa = Math.max(reqAtMilk.caGramsPerDay * caMaxRatio, reqAtMilk.dmKgPerDay * caMaxDm);
  if (totalCa > maxCa + relTol(maxCa)) {
    throw new SolverError(
      `Supplied Ca ${totalCa} exceeds maximum tolerable ceiling ${maxCa} beyond 1e-6 tolerance`,
    );
  }
  if (totalP + relTol(reqAtMilk.pGramsPerDay) < reqAtMilk.pGramsPerDay) {
    throw new SolverError(
      `Supplied P ${totalP} is below requirement ${reqAtMilk.pGramsPerDay} beyond 1e-6 tolerance`,
    );
  }
  const mmLine = solution.feeds.find((f) => f.feedId === 'mineral_mix');
  const mmInput = inputMap.get('mineral_mix');
  if (mmInput) {
    const minMm = milkLevel > 0
      ? (reqModel.mineralSupplement?.mineralMixMinKgPerDay?.lactating ?? 0.1)
      : (reqModel.mineralSupplement?.mineralMixMinKgPerDay?.dry ?? 0.05);
    const expMin = mmInput.maxKgAsFedPerDay !== null ? Math.min(minMm, mmInput.maxKgAsFedPerDay) : minMm;
    const actualMm = mmLine ? mmLine.kgAsFed : 0;
    if (actualMm + relTol(expMin) < expMin) {
      throw new SolverError(`Supplied mineral_mix ${actualMm} is below minimum ${expMin}`);
    }
  }
  const saltLine = solution.feeds.find((f) => f.feedId === 'common_salt');
  const saltInput = inputMap.get('common_salt');
  if (saltInput) {
    const minSalt = milkLevel > 0
      ? (reqModel.mineralSupplement?.saltMinKgPerDay?.lactating ?? 0.05)
      : (reqModel.mineralSupplement?.saltMinKgPerDay?.dry ?? 0.03);
    const expMin = saltInput.maxKgAsFedPerDay !== null ? Math.min(minSalt, saltInput.maxKgAsFedPerDay) : minSalt;
    const actualSalt = saltLine ? saltLine.kgAsFed : 0;
    if (actualSalt + relTol(expMin) < expMin) {
      throw new SolverError(`Supplied common_salt ${actualSalt} is below minimum ${expMin}`);
    }
  }
  if (roughageDm + relTol(totalDm) < r * totalDm) {
    throw new SolverError(
      `Roughage DM ${roughageDm} is below minimum share ${r} * ${totalDm} beyond 1e-6 tolerance`,
    );
  }
}

/**
 * Two-stage linear programming ration solver following the 7-step execution order in ARCHITECTURE.md section 5:
 * 1. Maintenance run at Y = 0 (no budget) -> InfeasibilityReport if infeasible (AC-E2.1, AC-E2.2)
 * 2. Budget < M - 1e-6 -> BudgetShortfallReport with priced fix-feed search (AC-E7.1)
 * 3. Dry animal (T = 0) -> Maintenance ration at S = 0, verdict dry_animal (AC-5.13)
 * 4. Stage 1 -> Maximize Y <= max(breedCap, T) within budget, DM ceiling, roughage min, and nutrient mins
 * 5. Stage 2 at Y* (binding constraint detection) and Stage 2 at S = floor(10*Y* + 1e-7)/10 (displayed ration)
 * 6. Stage 2' at T (no budget, no cap) -> costAtTodayMilkInrPerDay (B and Z)
 * 7. Verdict selection, fat comparison, and 1e-6 double-precision numerical verification.
 */
export function solveRation(
  animal: AnimalProfile,
  selectedFeeds: SelectedFeedInput[],
  feedLibrary: readonly FeedItem[] = DEFAULT_FEED_LIBRARY,
  breedLibrary: readonly BreedStandard[] = BREEDS,
): RationSolveOutcome {
  const checkedOn = new Date().toISOString().slice(0, 10);
  const breed =
    breedLibrary.find((b) => b.id === animal.breedId) ??
    breedById(animal.breedId) ??
    breedLibrary.find((b) => b.species === animal.species)!;

  const feedMap = new Map(feedLibrary.map((f) => [f.id, f]));
  const inputs: ActiveFeed[] = [];
  for (const s of selectedFeeds) {
    const feed = feedMap.get(s.feedId);
    if (!feed) continue;
    if (!Number.isFinite(s.priceInrPerKgAsFed) || s.priceInrPerKgAsFed < 0) continue;
    if (s.maxKgAsFedPerDay !== null && s.maxKgAsFedPerDay <= 0) continue;
    inputs.push({ input: s, feed });
  }

  const enteredCurrent = selectedFeeds.filter(
    (s) => s.currentKgAsFedPerDay !== null && s.currentKgAsFedPerDay > 0,
  );
  const currentCostInr =
    enteredCurrent.length > 0
      ? enteredCurrent.reduce((acc, s) => acc + (s.currentKgAsFedPerDay ?? 0) * s.priceInrPerKgAsFed, 0)
      : null;

  const budget = animal.budgetInrPerDay;
  const referenceCostInrPerDay = currentCostInr !== null ? currentCostInr : budget;
  const reqModel = buildRequirementModel(animal);
  const r = reqModel.roughage.minShareOfDm;

  // Step 1: Maintenance LP at Y = 0 (no budget limit).
  const maint = solveFixedMilk(inputs, reqModel, 0, null);
  if (!maint) {
    const diag = diagnoseAtMilk(inputs, reqModel, 0, feedLibrary);
    const report: InfeasibilityReport = {
      status: 'infeasible',
      limitingNutrients: diag.limitingNutrients,
      dmConflict: diag.dmConflict,
      suggestedFeeds: diag.suggestedFeeds,
      checkedOn,
      sourceKey: SOLVER_SOURCE_KEY,
    };
    return report;
  }

  const maintenanceCost = maint.totalCost;

  // Step 2: Budget below maintenance check (AC-E7.1).
  if (budget < maintenanceCost - TOL) {
    const selectedIds = new Set(inputs.map((a) => a.feed.id));
    let fixFeedId: string | null = null;
    let maintenanceWithFixInrPerDay: number | null = null;

    for (const cand of feedLibrary) {
      if (selectedIds.has(cand.id)) continue;
      if (cand.defaultPriceInrPerKgAsFed === null) continue;
      const trialInputs: ActiveFeed[] = [
        ...inputs,
        {
          input: {
            feedId: cand.id,
            priceInrPerKgAsFed: cand.defaultPriceInrPerKgAsFed,
            maxKgAsFedPerDay: null,
            currentKgAsFedPerDay: null,
          },
          feed: cand,
        },
      ];
      const trial = solveFixedMilk(trialInputs, reqModel, 0, null);
      if (trial && trial.totalCost <= budget + TOL) {
        if (maintenanceWithFixInrPerDay === null || trial.totalCost < maintenanceWithFixInrPerDay - TOL) {
          fixFeedId = cand.id;
          maintenanceWithFixInrPerDay = trial.totalCost;
        }
      }
    }

    const fixFeed =
      fixFeedId !== null && maintenanceWithFixInrPerDay !== null
        ? { feedId: fixFeedId, maintenanceCostInrPerDay: maintenanceWithFixInrPerDay }
        : null;

    const shortfall: BudgetShortfallReport = {
      status: 'budget_below_maintenance',
      verdict: {
        kind: 'budget_below_maintenance',
        maintenanceCostInrPerDay: maintenanceCost,
        budgetInrPerDay: budget,
      },
      budgetInrPerDay: budget,
      fixFeedId,
      maintenanceWithFixInrPerDay,
      fixFeed,
      checkedOn,
      sourceKey: SOLVER_SOURCE_KEY,
    };
    return shortfall;
  }

  const todayMilk = Math.max(
    0,
    Number.isFinite(animal.milkYieldLitersPerDay) ? animal.milkYieldLitersPerDay : 0,
  );

  // Step 3: Dry animal short-circuit (T = 0; AC-5.13).
  if (todayMilk <= 0) {
    const reqAt0 = evaluateRequirementsAtMilk(reqModel, 0);
    const coveragePct = {} as Record<NutrientKey, number>;
    const bindingConstraints: NutrientKey[] = [];
    for (const k of NUTRIENT_KEYS) {
      const req = reqAt0[REQ_FIELD[k]];
      const sup = maint.supplied[REQ_FIELD[k]];
      coveragePct[k] = req > 0 ? (sup / req) * 100 : 100;
      const ratio = req > 0 ? sup / req : 1;
      if (k === 'DM' ? ratio >= 0.99 : ratio <= 1.01) {
        bindingConstraints.push(k);
      }
    }
    const savingsInr = currentCostInr !== null ? currentCostInr - maint.totalCost : null;
    const savingsPct =
      savingsInr !== null && currentCostInr && currentCostInr > 0
        ? (savingsInr / currentCostInr) * 100
        : null;

    const drySolution: RationSolution = {
      status: 'optimal',
      breedId: breed.id,
      supportedMilkLPerDay: 0,
      supportedMilkExactLPerDay: 0,
      milkCapLPerDay: breed.milkCapLPerDay,
      capBasis: breed.capBasis,
      effectiveCapLPerDay: breed.milkCapLPerDay,
      effectiveCapSource: 'breed',
      bindingConstraint: 'breed_cap',
      tightConstraints: [],
      feedLimitIds: maint.lines.filter((l) => l.atCap).map((l) => l.feedId),
      verdict: { kind: 'dry_animal' },
      costAtTodayMilkInrPerDay: maintenanceCost,
      fatComparison: null,
      maintenanceCostInrPerDay: maintenanceCost,
      budgetInrPerDay: budget,
      referenceCostInrPerDay,
      underBudgetInr: Math.max(0, budget - maint.totalCost),
      feeds: maint.lines,
      totalKgAsFed: maint.totalKgAsFed,
      totalCostInr: maint.totalCost,
      requirementsAtS: reqAt0,
      supplied: maint.supplied,
      coveragePct,
      bindingConstraints,
      roughageMinShare: r,
      roughageShareAchieved: maint.roughageShare,
      roughageSharePct: maint.roughageSharePct,
      roughageMinSharePct: r * 100,
      currentCostInr,
      savingsInr,
      savingsPct,
      solvedOn: checkedOn,
      sourceKey: SOLVER_SOURCE_KEY,
    };

    verifyRationSolution(drySolution, animal, selectedFeeds, feedLibrary);
    return drySolution;
  }

  // Step 4: Stage 1 — Maximize milk Y <= effectiveCap = max(breedCap, T).
  const effectiveCap = Math.max(breed.milkCapLPerDay, todayMilk);
  const effectiveCapSource: 'breed' | 'today_milk' =
    todayMilk > breed.milkCapLPerDay + TOL ? 'today_milk' : 'breed';

  const caMaxDm = reqModel.calciumMax?.maxGramsPerKgDm ?? 15;

  const stage1Constraints: LpModel['constraints'] = {
    CP: { min: reqModel.CP.maintenance },
    ME: { min: reqModel.ME.maintenance },
    Ca: { min: reqModel.Ca.maintenance },
    Ca_max: { max: caMaxDm * reqModel.dmMax.maintenance },
    P: { min: reqModel.P.maintenance },
    DM: { max: reqModel.dmMax.maintenance },
    roughage: { min: 0 },
    cost: { max: budget },
    milkCap: { max: effectiveCap },
  };

  const stage1Variables: LpModel['variables'] = {
    milk: {
      milk: 1,
      CP: -reqModel.CP.perLitre,
      ME: -reqModel.ME.perLitre,
      Ca: -reqModel.Ca.perLitre,
      Ca_max: -caMaxDm * reqModel.dmMax.perLitre,
      P: -reqModel.P.perLitre,
      DM: -reqModel.dmMax.perLitre,
      milkCap: 1,
    },
  };

  for (const { input, feed } of inputs) {
    const c = perKgFed(feed);
    const v: Record<string, number> = {
      CP: c.cp,
      ME: c.me,
      Ca: c.ca,
      Ca_max: c.ca,
      P: c.p,
      DM: c.dm,
      roughage: isRoughage(feed) ? (1 - r) * c.dm : -r * c.dm,
      cost: input.priceInrPerKgAsFed,
    };
    if (feed.id === 'mineral_mix') {
      const minMm = todayMilk > 0
        ? (reqModel.mineralSupplement?.mineralMixMinKgPerDay?.lactating ?? 0.1)
        : (reqModel.mineralSupplement?.mineralMixMinKgPerDay?.dry ?? 0.05);
      const targetMin = input.maxKgAsFedPerDay !== null ? Math.min(minMm, input.maxKgAsFedPerDay) : minMm;
      stage1Constraints.min_mineral_mix = { min: targetMin };
      v.min_mineral_mix = 1;
    }
    if (feed.id === 'common_salt') {
      const minSalt = todayMilk > 0
        ? (reqModel.mineralSupplement?.saltMinKgPerDay?.lactating ?? 0.05)
        : (reqModel.mineralSupplement?.saltMinKgPerDay?.dry ?? 0.03);
      const targetMin = input.maxKgAsFedPerDay !== null ? Math.min(minSalt, input.maxKgAsFedPerDay) : minSalt;
      stage1Constraints.min_common_salt = { min: targetMin };
      v.min_common_salt = 1;
    }
    if (input.maxKgAsFedPerDay !== null) {
      const capKey = `cap_${feed.id}`;
      stage1Constraints[capKey] = { max: input.maxKgAsFedPerDay };
      v[capKey] = 1;
    }
    stage1Variables[feed.id] = v;
  }

  const stage1Sol = runLp({
    optimize: 'milk',
    opType: 'max',
    constraints: stage1Constraints,
    variables: stage1Variables,
  });

  const rawYStar = stage1Sol.feasible ? (stage1Sol.values.milk ?? stage1Sol.evaluation ?? 0) : 0;
  const yStar = Math.min(effectiveCap, Math.max(0, rawYStar));

  // Step 5: Stage 2 at Y* (binding constraint detection) and Stage 2 at S (displayed ration).
  const stage2AtYStar =
    solveFixedMilk(inputs, reqModel, yStar, budget) ??
    solveFixedMilk(inputs, reqModel, yStar, null) ??
    buildFeedLinesAndTotals(inputs, stage1Sol.values);

  const tightConstraints = detectTightConstraintsAtYStar(
    inputs,
    reqModel,
    yStar,
    effectiveCap,
    budget,
    stage2AtYStar,
  );
  const bindingConstraint: BindingConstraint = tightConstraints[0] ?? 'budget';
  const feedLimitIds = stage2AtYStar.lines.filter((l) => l.atCap).map((l) => l.feedId);

  let s = roundSupportedMilkDown(yStar);
  let stage2AtS =
    Math.abs(s - yStar) <= TOL && stage2AtYStar.totalCost <= budget + relTol(budget)
      ? stage2AtYStar
      : solveFixedMilk(inputs, reqModel, s, budget);

  // Tolerance retry once at S - 0.1 if float noise made S slightly exceed Y* (ARCHITECTURE.md section 5).
  if (!stage2AtS && s >= 0.1 - 1e-9) {
    s = Math.max(0, Math.round((s - 0.1) * 10) / 10);
    stage2AtS = solveFixedMilk(inputs, reqModel, s, budget);
  }
  if (!stage2AtS) {
    s = 0;
    stage2AtS = maint;
  }

  // Step 6: Stage 2' at today's milk T (no budget limit, no breed cap).
  const stage2AtT = solveFixedMilk(inputs, reqModel, todayMilk, null);
  const costAtTodayMilkInrPerDay = stage2AtT ? stage2AtT.totalCost : null;
  let limitingAtToday: LimitingKey[] = [];
  if (yStar < todayMilk - TOL && costAtTodayMilkInrPerDay === null) {
    const diagT = diagnoseAtMilk(inputs, reqModel, todayMilk, feedLibrary);
    limitingAtToday = diagT.limitingNutrients.map((l) => l.nutrient);
    if (limitingAtToday.length === 0) {
      limitingAtToday = ['DM'];
    }
  }

  // Step 7: Verdict selection, fat comparison, coverage, and 1e-6 double-precision verification.
  const verdict = selectVerdict({
    todayMilkLPerDay: todayMilk,
    breedCapLPerDay: breed.milkCapLPerDay,
    yStar,
    supportedMilkLPerDay: s,
    referenceCostInrPerDay,
    costAtTodayMilkInrPerDay,
    limitingAtToday,
  });

  const fatComparison = buildFatComparison(todayMilk, reqModel.fatPctUsed, breed);
  const reqAtS = evaluateRequirementsAtMilk(reqModel, s);
  const coveragePct = {} as Record<NutrientKey, number>;
  const bindingConstraints: NutrientKey[] = [];
  for (const k of NUTRIENT_KEYS) {
    const req = reqAtS[REQ_FIELD[k]];
    const sup = stage2AtS.supplied[REQ_FIELD[k]];
    coveragePct[k] = req > 0 ? (sup / req) * 100 : 100;
    const ratio = req > 0 ? sup / req : 1;
    if (k === 'DM' ? ratio >= 0.99 : ratio <= 1.01) {
      bindingConstraints.push(k);
    }
  }

  const savingsInr = currentCostInr !== null ? currentCostInr - stage2AtS.totalCost : null;
  const savingsPct =
    savingsInr !== null && currentCostInr && currentCostInr > 0
      ? (savingsInr / currentCostInr) * 100
      : null;

  const solution: RationSolution = {
    status: 'optimal',
    breedId: breed.id,
    supportedMilkLPerDay: s,
    supportedMilkExactLPerDay: yStar,
    milkCapLPerDay: breed.milkCapLPerDay,
    capBasis: breed.capBasis,
    effectiveCapLPerDay: effectiveCap,
    effectiveCapSource,
    bindingConstraint,
    tightConstraints,
    feedLimitIds,
    verdict,
    costAtTodayMilkInrPerDay,
    fatComparison,
    maintenanceCostInrPerDay: maintenanceCost,
    budgetInrPerDay: budget,
    referenceCostInrPerDay,
    underBudgetInr: Math.max(0, budget - stage2AtS.totalCost),
    feeds: stage2AtS.lines,
    totalKgAsFed: stage2AtS.totalKgAsFed,
    totalCostInr: stage2AtS.totalCost,
    requirementsAtS: reqAtS,
    supplied: stage2AtS.supplied,
    coveragePct,
    bindingConstraints,
    roughageMinShare: r,
    roughageShareAchieved: stage2AtS.roughageShare,
    roughageSharePct: stage2AtS.roughageSharePct,
    roughageMinSharePct: r * 100,
    currentCostInr,
    savingsInr,
    savingsPct,
    solvedOn: checkedOn,
    sourceKey: SOLVER_SOURCE_KEY,
  };

  verifyRationSolution(solution, animal, selectedFeeds, feedLibrary);
  return solution;
}
