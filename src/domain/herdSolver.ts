// Joint herd linear programming solver (docs/ARCHITECTURE.md Change 4).
// Solves multi-animal (and single-animal) rations with shared budget, home feeds at ₹0,
// fair-share milk target t*, Stage 3 home-feed tie-break, and 1e-6 numerical verification.

import type { LpModel } from 'javascript-lp-solver';
import { BREEDS, breedById } from './breeds';
import { isRoughage, MIN_NUTRIENTS, perKgFed, REQ_FIELD } from './nutrition';
import { buildRequirementModel, computeRequirements, evaluateRequirementsAtMilk } from './requirements';
import {
  DEFAULT_FEED_LIBRARY,
  TOL,
  SolverError,
  relTol,
  runLp,
  solveFixedMilk,
  diagnoseAtMilk,
  detectTightConstraintsAtYStar,
  type ActiveFeed,
  type FixedMilkSolveResult,
} from './solver';
import {
  NUTRIENT_KEYS,
  type BindingConstraint,
  type BreedStandard,
  type FeedItem,
  type FeedSuggestion,
  type HerdAnimal,
  type HerdAnimalSolution,
  type HerdInfeasible,
  type HerdLimit,
  type HerdSolution,
  type HomeFeed,
  type LimitingKey,
  type LimitingNutrient,
  type NutrientKey,
  type NutrientVector,
  type RationFeedLine,
  type RationSolution,
  type RequirementModel,
  type SelectedFeedInput,
  type ShoppingLine,
} from './types';
import { buildFatComparison, roundSupportedMilkDown, selectVerdict } from './verdict';

/**
 * Recompute nutrients, DM, roughage share, feed caps, stock limits, and total purchase in double precision.
 * Throws SolverError on any violation > 1e-6.
 */
export function verifyHerdSolution(
  solution: HerdSolution,
  animals: readonly HerdAnimal[],
  buySet: readonly SelectedFeedInput[],
  homeFeeds: readonly HomeFeed[],
  feedLibrary: readonly FeedItem[] = DEFAULT_FEED_LIBRARY,
  _breedLibrary: readonly BreedStandard[] = BREEDS,
): void {
  if (solution.status !== 'optimal') {
    throw new SolverError('Cannot verify non-optimal herd solution');
  }

  const feedMap = new Map(feedLibrary.map((f) => [f.id, f]));
  const buyMap = new Map(buySet.map((b) => [b.feedId, b]));

  // 1. Purchase cost check
  let computedPurchase = 0;
  for (const aSol of solution.animals) {
    for (const line of aSol.solution.feeds) {
      if (line.source === 'buy') {
        computedPurchase += line.kgAsFed * line.priceInrPerKg;
      }
    }
  }

  if (computedPurchase > solution.budgetInrPerDay + relTol(solution.budgetInrPerDay)) {
    throw new SolverError(`Herd purchase cost ${computedPurchase} exceeds budget ${solution.budgetInrPerDay}`);
  }
  if (Math.abs(computedPurchase - solution.purchaseCostInrPerDay) > relTol(solution.purchaseCostInrPerDay)) {
    throw new SolverError(
      `Reported purchase cost ${solution.purchaseCostInrPerDay} does not match computed ${computedPurchase}`,
    );
  }

  // 2. Stock rows check
  for (const h of homeFeeds) {
    let totalHomeUsed = 0;
    for (const aSol of solution.animals) {
      for (const line of aSol.solution.feeds) {
        if (line.feedId === h.feedId && line.source === 'home') {
          totalHomeUsed += line.kgAsFed;
        }
      }
    }
    if (totalHomeUsed > h.kgPerDay + relTol(h.kgPerDay)) {
      throw new SolverError(`Home feed stock exceeded for ${h.feedId}: used ${totalHomeUsed} > stock ${h.kgPerDay}`);
    }
  }

  // 3. Per-animal rows check
  for (const animal of animals) {
    const aSol = solution.animals.find((a) => a.key === animal.key);
    if (!aSol) {
      throw new SolverError(`Missing animal solution for ${animal.key}`);
    }
    const reqModel = buildRequirementModel({
      ...animal.profile,
      budgetInrPerDay: solution.budgetInrPerDay,
      isConfirmed: animal.isConfirmed,
    });
    const milkLevel = animal.profile.milkYieldLitersPerDay <= 0 ? 0 : aSol.milkLPerDay;
    const reqAtMilk = evaluateRequirementsAtMilk(reqModel, milkLevel);
    const r = reqModel.roughage.minShareOfDm;
    const caMaxRatio = reqModel.calciumMax?.value ?? 2.5;
    const caMaxDm = reqModel.calciumMax?.maxGramsPerKgDm ?? 15;

    let totalDm = 0;
    let roughageDm = 0;
    let totalCp = 0;
    let totalMe = 0;
    let totalCa = 0;
    let totalP = 0;

    for (const line of aSol.solution.feeds) {
      if (!Number.isFinite(line.kgAsFed) || line.kgAsFed < -TOL) {
        throw new SolverError(`Negative or non-finite feed amount for ${line.feedId}: ${line.kgAsFed}`);
      }
      const feed = feedMap.get(line.feedId);
      if (!feed) {
        throw new SolverError(`Unknown feed: ${line.feedId}`);
      }

      const contrib = perKgFed(feed);
      const dm = line.kgAsFed * contrib.dm;
      totalDm += dm;
      totalCp += line.kgAsFed * contrib.cp;
      totalMe += line.kgAsFed * contrib.me;
      totalCa += line.kgAsFed * contrib.ca;
      totalP += line.kgAsFed * contrib.p;
      if (isRoughage(feed)) {
        roughageDm += dm;
      }

      if (line.source === 'buy') {
        const buyInput = buyMap.get(line.feedId);
        if (buyInput && buyInput.maxKgAsFedPerDay !== null) {
          if (line.kgAsFed > buyInput.maxKgAsFedPerDay + relTol(buyInput.maxKgAsFedPerDay)) {
            throw new SolverError(`Feed ${line.feedId} exceeds cap ${buyInput.maxKgAsFedPerDay}`);
          }
        }
      }
    }

    if (totalDm > reqAtMilk.dmKgPerDay + relTol(reqAtMilk.dmKgPerDay)) {
      throw new SolverError(
        `Animal ${animal.key}: Supplied DM ${totalDm} exceeds ceiling ${reqAtMilk.dmKgPerDay}`,
      );
    }
    if (totalCp + relTol(reqAtMilk.cpGramsPerDay) < reqAtMilk.cpGramsPerDay) {
      throw new SolverError(
        `Animal ${animal.key}: Supplied CP ${totalCp} is below requirement ${reqAtMilk.cpGramsPerDay}`,
      );
    }
    if (totalMe + relTol(reqAtMilk.meMcalPerDay) < reqAtMilk.meMcalPerDay) {
      throw new SolverError(
        `Animal ${animal.key}: Supplied ME ${totalMe} is below requirement ${reqAtMilk.meMcalPerDay}`,
      );
    }
    if (totalCa + relTol(reqAtMilk.caGramsPerDay) < reqAtMilk.caGramsPerDay) {
      throw new SolverError(
        `Animal ${animal.key}: Supplied Ca ${totalCa} is below requirement ${reqAtMilk.caGramsPerDay}`,
      );
    }
    if (totalP + relTol(reqAtMilk.pGramsPerDay) < reqAtMilk.pGramsPerDay) {
      throw new SolverError(
        `Animal ${animal.key}: Supplied P ${totalP} is below requirement ${reqAtMilk.pGramsPerDay}`,
      );
    }

    const caMax = Math.max(reqAtMilk.caGramsPerDay * caMaxRatio, reqAtMilk.dmKgPerDay * caMaxDm);
    if (totalCa > caMax + relTol(caMax)) {
      throw new SolverError(`Animal ${animal.key}: Supplied Ca ${totalCa} exceeds upper band ${caMax}`);
    }

    if (roughageDm + relTol(totalDm) < r * totalDm) {
      throw new SolverError(
        `Animal ${animal.key}: Roughage DM ${roughageDm} is below minimum share ${r * totalDm}`,
      );
    }

    const mmPresent = buySet.some((b) => b.feedId === 'mineral_mix') || homeFeeds.some((h) => h.feedId === 'mineral_mix');
    if (mmPresent) {
      const minMm =
        milkLevel > 0
          ? (reqModel.mineralSupplement?.mineralMixMinKgPerDay?.lactating ?? 0.1)
          : (reqModel.mineralSupplement?.mineralMixMinKgPerDay?.dry ?? 0.05);
      const buyMm = buyMap.get('mineral_mix');
      const homeMm = homeFeeds.find((h) => h.feedId === 'mineral_mix');
      const cap =
        buyMm?.maxKgAsFedPerDay !== null && buyMm?.maxKgAsFedPerDay !== undefined
          ? buyMm.maxKgAsFedPerDay
          : !buyMm && homeMm
            ? homeMm.kgPerDay
            : null;
      const expMin = cap !== null ? Math.min(minMm, cap) : minMm;
      const actualMm = aSol.solution.feeds
        .filter((f) => f.feedId === 'mineral_mix')
        .reduce((sum, f) => sum + f.kgAsFed, 0);
      if (actualMm + relTol(expMin) < expMin) {
        throw new SolverError(`Animal ${animal.key}: Supplied mineral_mix ${actualMm} is below minimum ${expMin}`);
      }
    }

    const saltPresent = buySet.some((b) => b.feedId === 'common_salt') || homeFeeds.some((h) => h.feedId === 'common_salt');
    if (saltPresent) {
      const minSalt =
        milkLevel > 0
          ? (reqModel.mineralSupplement?.saltMinKgPerDay?.lactating ?? 0.05)
          : (reqModel.mineralSupplement?.saltMinKgPerDay?.dry ?? 0.03);
      const buySalt = buyMap.get('common_salt');
      const homeSalt = homeFeeds.find((h) => h.feedId === 'common_salt');
      const cap =
        buySalt?.maxKgAsFedPerDay !== null && buySalt?.maxKgAsFedPerDay !== undefined
          ? buySalt.maxKgAsFedPerDay
          : !buySalt && homeSalt
            ? homeSalt.kgPerDay
            : null;
      const expMin = cap !== null ? Math.min(minSalt, cap) : minSalt;
      const actualSalt = aSol.solution.feeds
        .filter((f) => f.feedId === 'common_salt')
        .reduce((sum, f) => sum + f.kgAsFed, 0);
      if (actualSalt + relTol(expMin) < expMin) {
        throw new SolverError(`Animal ${animal.key}: Supplied common_salt ${actualSalt} is below minimum ${expMin}`);
      }
    }
  }
}

export interface HerdShortfall {
  status: 'below_maintenance';
  maintenanceCostInrPerDay: number;
  budgetInrPerDay: number;
}

export type HerdSolveOutcome = HerdSolution | HerdShortfall | HerdInfeasible;

export type HerdStepOutcome =
  | {
      status: 'optimal';
      shareT: number;
      milkLPerDay: Record<string, number>;
      totalMilkL: number;
      purchaseCostInrPerDay: number;
    }
  | { status: 'not_optimal' };

interface InternalAnimalContext {
  animal: HerdAnimal;
  breed: BreedStandard;
  todayMilk: number;
  effectiveCap: number;
  effectiveCapSource: 'breed' | 'today_milk';
  g: number;
  reqModel: RequirementModel;
  merged: ActiveFeed[];
}

interface HerdFixedMilkSolveResult {
  totalCost: number;
  values: Record<string, number>;
  animalResults: Map<string, FixedMilkSolveResult>;
}

function buildMergedInputs(
  buyInputs: readonly ActiveFeed[],
  homeInputs: readonly { feed: FeedItem; kgPerDay: number }[],
): ActiveFeed[] {
  const merged: ActiveFeed[] = [...buyInputs];
  const buyIds = new Set(buyInputs.map((b) => b.feed.id));
  for (const h of homeInputs) {
    if (!buyIds.has(h.feed.id)) {
      merged.push({
        input: {
          feedId: h.feed.id,
          priceInrPerKgAsFed: 0,
          maxKgAsFedPerDay: h.kgPerDay,
          currentKgAsFedPerDay: null,
        },
        feed: h.feed,
      });
    }
  }
  return merged;
}

function sliceAnimalResult(
  ctx: InternalAnimalContext,
  buyInputs: readonly ActiveFeed[],
  homeInputs: readonly { feed: FeedItem; kgPerDay: number }[],
  values: Record<string, number>,
): FixedMilkSolveResult {
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

  // Buy lines
  for (const { input, feed } of buyInputs) {
    const rawKg = values[`${ctx.animal.key}__${feed.id}`] ?? 0;
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
        source: 'buy',
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

  // Home lines
  for (const { feed, kgPerDay } of homeInputs) {
    const rawKg = values[`${ctx.animal.key}__home__${feed.id}`] ?? 0;
    const kg = rawKg > 1e-9 ? rawKg : 0;
    const contrib = perKgFed(feed);
    const dmKg = kg * contrib.dm;
    const costInr = 0;
    const atCap = kg >= kgPerDay - relTol(kgPerDay);

    if (kg > 0) {
      lines.push({
        feedId: feed.id,
        kgAsFed: kg,
        dmKg,
        costInr,
        priceInrPerKg: 0,
        atCap,
        source: 'home',
      });
    }

    totalKgAsFed += kg;
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
 * Solve joint fixed milk LP at given milk levels for each animal.
 */
function solveHerdFixedMilk(
  animals: readonly InternalAnimalContext[],
  buyInputs: readonly ActiveFeed[],
  homeInputs: readonly { feed: FeedItem; kgPerDay: number }[],
  milkLevels: Record<string, number>,
  budgetCap: number | null,
  includeRoughage = true,
): HerdFixedMilkSolveResult | null {
  if (animals.length === 0 || (buyInputs.length === 0 && homeInputs.length === 0)) {
    return null;
  }

  const constraints: LpModel['constraints'] = {};
  const variables: LpModel['variables'] = {};

  // 1. Per-animal row blocks in list order
  for (const ctx of animals) {
    const milk = milkLevels[ctx.animal.key] ?? 0;
    const reqAtY = evaluateRequirementsAtMilk(ctx.reqModel, milk);
    const caMaxRatio = ctx.reqModel.calciumMax?.value ?? 2.5;
    const caMaxDm = ctx.reqModel.calciumMax?.maxGramsPerKgDm ?? 15;

    constraints[`${ctx.animal.key}__DM`] = { max: reqAtY.dmKgPerDay };
    constraints[`${ctx.animal.key}__CP`] = { min: reqAtY.cpGramsPerDay };
    constraints[`${ctx.animal.key}__ME`] = { min: reqAtY.meMcalPerDay };
    constraints[`${ctx.animal.key}__Ca`] = {
      min: reqAtY.caGramsPerDay,
      max: Math.max(reqAtY.caGramsPerDay * caMaxRatio, reqAtY.dmKgPerDay * caMaxDm),
    };
    constraints[`${ctx.animal.key}__P`] = { min: reqAtY.pGramsPerDay };
    if (includeRoughage) {
      constraints[`${ctx.animal.key}__roughage`] = { min: 0 };
    }
  }

  // 2. Shared budget constraint
  if (budgetCap !== null) {
    constraints.budget = { max: budgetCap };
  }

  // 3. Animal variables (buy, then home) and supplement/cap rows as added
  for (const ctx of animals) {
    const milk = milkLevels[ctx.animal.key] ?? 0;
    const r = ctx.reqModel.roughage.minShareOfDm;

    // Buy variables
    for (const { input, feed } of buyInputs) {
      const c = perKgFed(feed);
      const varDef: Record<string, number> = {
        cost: input.priceInrPerKgAsFed,
        [`${ctx.animal.key}__DM`]: c.dm,
        [`${ctx.animal.key}__CP`]: c.cp,
        [`${ctx.animal.key}__ME`]: c.me,
        [`${ctx.animal.key}__Ca`]: c.ca,
        [`${ctx.animal.key}__P`]: c.p,
      };
      if (includeRoughage) {
        varDef[`${ctx.animal.key}__roughage`] = isRoughage(feed) ? (1 - r) * c.dm : -r * c.dm;
      }
      if (budgetCap !== null) {
        varDef.budget = input.priceInrPerKgAsFed;
      }
      if (feed.id === 'mineral_mix') {
        const minMm =
          milk > 0
            ? (ctx.reqModel.mineralSupplement?.mineralMixMinKgPerDay?.lactating ?? 0.1)
            : (ctx.reqModel.mineralSupplement?.mineralMixMinKgPerDay?.dry ?? 0.05);
        const targetMin = input.maxKgAsFedPerDay !== null ? Math.min(minMm, input.maxKgAsFedPerDay) : minMm;
        constraints[`${ctx.animal.key}__min_mineral_mix`] = { min: targetMin };
        varDef[`${ctx.animal.key}__min_mineral_mix`] = 1;
      }
      if (feed.id === 'common_salt') {
        const minSalt =
          milk > 0
            ? (ctx.reqModel.mineralSupplement?.saltMinKgPerDay?.lactating ?? 0.05)
            : (ctx.reqModel.mineralSupplement?.saltMinKgPerDay?.dry ?? 0.03);
        const targetMin = input.maxKgAsFedPerDay !== null ? Math.min(minSalt, input.maxKgAsFedPerDay) : minSalt;
        constraints[`${ctx.animal.key}__min_common_salt`] = { min: targetMin };
        varDef[`${ctx.animal.key}__min_common_salt`] = 1;
      }
      if (input.maxKgAsFedPerDay !== null) {
        const capKey = `${ctx.animal.key}__cap_${feed.id}`;
        constraints[capKey] = { max: input.maxKgAsFedPerDay };
        varDef[capKey] = 1;
      }
      variables[`${ctx.animal.key}__${feed.id}`] = varDef;
    }

    // Home variables
    for (const { feed, kgPerDay } of homeInputs) {
      const c = perKgFed(feed);
      const varDef: Record<string, number> = {
        cost: 0,
        [`${ctx.animal.key}__DM`]: c.dm,
        [`${ctx.animal.key}__CP`]: c.cp,
        [`${ctx.animal.key}__ME`]: c.me,
        [`${ctx.animal.key}__Ca`]: c.ca,
        [`${ctx.animal.key}__P`]: c.p,
      };
      if (includeRoughage) {
        varDef[`${ctx.animal.key}__roughage`] = isRoughage(feed) ? (1 - r) * c.dm : -r * c.dm;
      }
      if (feed.id === 'mineral_mix') {
        const minMm =
          milk > 0
            ? (ctx.reqModel.mineralSupplement?.mineralMixMinKgPerDay?.lactating ?? 0.1)
            : (ctx.reqModel.mineralSupplement?.mineralMixMinKgPerDay?.dry ?? 0.05);
        const isHomeOnly = !buyInputs.some((b) => b.feed.id === 'mineral_mix');
        const targetMin = isHomeOnly ? Math.min(minMm, kgPerDay) : minMm;
        if (!constraints[`${ctx.animal.key}__min_mineral_mix`]) {
          constraints[`${ctx.animal.key}__min_mineral_mix`] = { min: targetMin };
        }
        varDef[`${ctx.animal.key}__min_mineral_mix`] = 1;
      }
      if (feed.id === 'common_salt') {
        const minSalt =
          milk > 0
            ? (ctx.reqModel.mineralSupplement?.saltMinKgPerDay?.lactating ?? 0.05)
            : (ctx.reqModel.mineralSupplement?.saltMinKgPerDay?.dry ?? 0.03);
        const isHomeOnly = !buyInputs.some((b) => b.feed.id === 'common_salt');
        const targetMin = isHomeOnly ? Math.min(minSalt, kgPerDay) : minSalt;
        if (!constraints[`${ctx.animal.key}__min_common_salt`]) {
          constraints[`${ctx.animal.key}__min_common_salt`] = { min: targetMin };
        }
        varDef[`${ctx.animal.key}__min_common_salt`] = 1;
      }
      varDef[`stock__${feed.id}`] = 1;
      variables[`${ctx.animal.key}__home__${feed.id}`] = varDef;
    }
  }

  // 4. Shared home stock constraints
  for (const { feed, kgPerDay } of homeInputs) {
    constraints[`stock__${feed.id}`] = { max: kgPerDay };
  }

  const sol = runLp({
    optimize: 'cost',
    opType: 'min',
    constraints,
    variables,
  });

  if (!sol.feasible) return null;

  // Double-precision feasibility check
  const animalResults = new Map<string, FixedMilkSolveResult>();
  let totalCost = 0;

  for (const ctx of animals) {
    const milk = milkLevels[ctx.animal.key] ?? 0;
    const reqAtY = evaluateRequirementsAtMilk(ctx.reqModel, milk);
    const r = ctx.reqModel.roughage.minShareOfDm;
    const sliced = sliceAnimalResult(ctx, buyInputs, homeInputs, sol.values);
    animalResults.set(ctx.animal.key, sliced);
    totalCost += sliced.totalCost;

    if (sliced.supplied.dmKgPerDay > reqAtY.dmKgPerDay + relTol(reqAtY.dmKgPerDay)) {
      return null;
    }
    for (const n of MIN_NUTRIENTS) {
      const reqVal = reqAtY[REQ_FIELD[n]];
      const supVal = sliced.supplied[REQ_FIELD[n]];
      if (supVal + relTol(reqVal) < reqVal) return null;
    }
    if (includeRoughage) {
      const rho = sliced.roughageDmKg - r * sliced.supplied.dmKgPerDay;
      if (rho < -relTol(sliced.supplied.dmKgPerDay)) return null;
    }
  }

  if (budgetCap !== null && totalCost > budgetCap + relTol(budgetCap)) {
    return null;
  }

  for (const { feed, kgPerDay } of homeInputs) {
    let homeUsed = 0;
    for (const ctx of animals) {
      const raw = sol.values[`${ctx.animal.key}__home__${feed.id}`] ?? 0;
      homeUsed += raw > 1e-9 ? raw : 0;
    }
    if (homeUsed > kgPerDay + relTol(kgPerDay)) {
      return null;
    }
  }

  return {
    totalCost,
    values: sol.values,
    animalResults,
  };
}

/**
 * Solve Stage 3 home-feed tie-break: minimize total home kg subject to Stage 2 rows
 * and purchase <= P* + relTol(P*).
 */
function solveHerdStage3(
  animals: readonly InternalAnimalContext[],
  buyInputs: readonly ActiveFeed[],
  homeInputs: readonly { feed: FeedItem; kgPerDay: number }[],
  milkLevels: Record<string, number>,
  budgetCap: number,
  pStar: number,
  includeRoughage = true,
): HerdFixedMilkSolveResult | null {
  if (animals.length === 0 || homeInputs.length === 0) return null;

  const constraints: LpModel['constraints'] = {};
  const variables: LpModel['variables'] = {};

  // Per-animal blocks
  for (const ctx of animals) {
    const milk = milkLevels[ctx.animal.key] ?? 0;
    const reqAtY = evaluateRequirementsAtMilk(ctx.reqModel, milk);
    const caMaxRatio = ctx.reqModel.calciumMax?.value ?? 2.5;
    const caMaxDm = ctx.reqModel.calciumMax?.maxGramsPerKgDm ?? 15;

    constraints[`${ctx.animal.key}__DM`] = { max: reqAtY.dmKgPerDay };
    constraints[`${ctx.animal.key}__CP`] = { min: reqAtY.cpGramsPerDay };
    constraints[`${ctx.animal.key}__ME`] = { min: reqAtY.meMcalPerDay };
    constraints[`${ctx.animal.key}__Ca`] = {
      min: reqAtY.caGramsPerDay,
      max: Math.max(reqAtY.caGramsPerDay * caMaxRatio, reqAtY.dmKgPerDay * caMaxDm),
    };
    constraints[`${ctx.animal.key}__P`] = { min: reqAtY.pGramsPerDay };
    if (includeRoughage) {
      constraints[`${ctx.animal.key}__roughage`] = { min: 0 };
    }
  }

  // Shared budget and purchase cap
  constraints.budget = { max: budgetCap };
  constraints.purchase = { max: pStar + relTol(pStar) };

  // Variables
  for (const ctx of animals) {
    const milk = milkLevels[ctx.animal.key] ?? 0;
    const r = ctx.reqModel.roughage.minShareOfDm;

    for (const { input, feed } of buyInputs) {
      const c = perKgFed(feed);
      const varDef: Record<string, number> = {
        cost: input.priceInrPerKgAsFed,
        budget: input.priceInrPerKgAsFed,
        purchase: input.priceInrPerKgAsFed,
        [`${ctx.animal.key}__DM`]: c.dm,
        [`${ctx.animal.key}__CP`]: c.cp,
        [`${ctx.animal.key}__ME`]: c.me,
        [`${ctx.animal.key}__Ca`]: c.ca,
        [`${ctx.animal.key}__P`]: c.p,
      };
      if (includeRoughage) {
        varDef[`${ctx.animal.key}__roughage`] = isRoughage(feed) ? (1 - r) * c.dm : -r * c.dm;
      }
      if (feed.id === 'mineral_mix') {
        const minMm =
          milk > 0
            ? (ctx.reqModel.mineralSupplement?.mineralMixMinKgPerDay?.lactating ?? 0.1)
            : (ctx.reqModel.mineralSupplement?.mineralMixMinKgPerDay?.dry ?? 0.05);
        const targetMin = input.maxKgAsFedPerDay !== null ? Math.min(minMm, input.maxKgAsFedPerDay) : minMm;
        constraints[`${ctx.animal.key}__min_mineral_mix`] = { min: targetMin };
        varDef[`${ctx.animal.key}__min_mineral_mix`] = 1;
      }
      if (feed.id === 'common_salt') {
        const minSalt =
          milk > 0
            ? (ctx.reqModel.mineralSupplement?.saltMinKgPerDay?.lactating ?? 0.05)
            : (ctx.reqModel.mineralSupplement?.saltMinKgPerDay?.dry ?? 0.03);
        const targetMin = input.maxKgAsFedPerDay !== null ? Math.min(minSalt, input.maxKgAsFedPerDay) : minSalt;
        constraints[`${ctx.animal.key}__min_common_salt`] = { min: targetMin };
        varDef[`${ctx.animal.key}__min_common_salt`] = 1;
      }
      if (input.maxKgAsFedPerDay !== null) {
        const capKey = `${ctx.animal.key}__cap_${feed.id}`;
        constraints[capKey] = { max: input.maxKgAsFedPerDay };
        varDef[capKey] = 1;
      }
      variables[`${ctx.animal.key}__${feed.id}`] = varDef;
    }

    for (const { feed, kgPerDay } of homeInputs) {
      const c = perKgFed(feed);
      const varDef: Record<string, number> = {
        home_kg: 1, // Minimize total home kg
        [`${ctx.animal.key}__DM`]: c.dm,
        [`${ctx.animal.key}__CP`]: c.cp,
        [`${ctx.animal.key}__ME`]: c.me,
        [`${ctx.animal.key}__Ca`]: c.ca,
        [`${ctx.animal.key}__P`]: c.p,
      };
      if (includeRoughage) {
        varDef[`${ctx.animal.key}__roughage`] = isRoughage(feed) ? (1 - r) * c.dm : -r * c.dm;
      }
      if (feed.id === 'mineral_mix') {
        const minMm =
          milk > 0
            ? (ctx.reqModel.mineralSupplement?.mineralMixMinKgPerDay?.lactating ?? 0.1)
            : (ctx.reqModel.mineralSupplement?.mineralMixMinKgPerDay?.dry ?? 0.05);
        const isHomeOnly = !buyInputs.some((b) => b.feed.id === 'mineral_mix');
        const targetMin = isHomeOnly ? Math.min(minMm, kgPerDay) : minMm;
        if (!constraints[`${ctx.animal.key}__min_mineral_mix`]) {
          constraints[`${ctx.animal.key}__min_mineral_mix`] = { min: targetMin };
        }
        varDef[`${ctx.animal.key}__min_mineral_mix`] = 1;
      }
      if (feed.id === 'common_salt') {
        const minSalt =
          milk > 0
            ? (ctx.reqModel.mineralSupplement?.saltMinKgPerDay?.lactating ?? 0.05)
            : (ctx.reqModel.mineralSupplement?.saltMinKgPerDay?.dry ?? 0.03);
        const isHomeOnly = !buyInputs.some((b) => b.feed.id === 'common_salt');
        const targetMin = isHomeOnly ? Math.min(minSalt, kgPerDay) : minSalt;
        if (!constraints[`${ctx.animal.key}__min_common_salt`]) {
          constraints[`${ctx.animal.key}__min_common_salt`] = { min: targetMin };
        }
        varDef[`${ctx.animal.key}__min_common_salt`] = 1;
      }
      varDef[`stock__${feed.id}`] = 1;
      variables[`${ctx.animal.key}__home__${feed.id}`] = varDef;
    }
  }

  for (const { feed, kgPerDay } of homeInputs) {
    constraints[`stock__${feed.id}`] = { max: kgPerDay };
  }

  const sol = runLp({
    optimize: 'home_kg',
    opType: 'min',
    constraints,
    variables,
  });

  if (!sol.feasible) return null;

  const animalResults = new Map<string, FixedMilkSolveResult>();
  let totalCost = 0;

  for (const ctx of animals) {
    const milk = milkLevels[ctx.animal.key] ?? 0;
    const reqAtY = evaluateRequirementsAtMilk(ctx.reqModel, milk);
    const r = ctx.reqModel.roughage.minShareOfDm;
    const sliced = sliceAnimalResult(ctx, buyInputs, homeInputs, sol.values);
    animalResults.set(ctx.animal.key, sliced);
    totalCost += sliced.totalCost;

    if (sliced.supplied.dmKgPerDay > reqAtY.dmKgPerDay + relTol(reqAtY.dmKgPerDay)) {
      return null;
    }
    for (const n of MIN_NUTRIENTS) {
      const reqVal = reqAtY[REQ_FIELD[n]];
      const supVal = sliced.supplied[REQ_FIELD[n]];
      if (supVal + relTol(reqVal) < reqVal) return null;
    }
    if (includeRoughage) {
      const rho = sliced.roughageDmKg - r * sliced.supplied.dmKgPerDay;
      if (rho < -relTol(sliced.supplied.dmKgPerDay)) return null;
    }
  }

  if (totalCost > pStar + relTol(pStar) + 1e-9) return null;
  if (totalCost > budgetCap + relTol(budgetCap)) return null;

  return {
    totalCost,
    values: sol.values,
    animalResults,
  };
}

/**
 * Solve Stage 1 LP: maximize fair share t subject to fair-share constraints and budget.
 */
function solveHerdStage1(
  animals: readonly InternalAnimalContext[],
  buyInputs: readonly ActiveFeed[],
  homeInputs: readonly { feed: FeedItem; kgPerDay: number }[],
  budget: number,
): { feasible: boolean; shareT: number; values: Record<string, number> } {
  const constraints: LpModel['constraints'] = {};
  const variables: LpModel['variables'] = {};

  // For 1 animal with no home feeds, align variable and constraint structure with solveRation Stage 1
  const isSingleAnimalNoHome = animals.length === 1 && homeInputs.length === 0;

  if (isSingleAnimalNoHome) {
    const ctx = animals[0];
    const caMaxDm = ctx.reqModel.calciumMax?.maxGramsPerKgDm ?? 15;
    const r = ctx.reqModel.roughage.minShareOfDm;

    constraints[`${ctx.animal.key}__CP`] = { min: ctx.reqModel.CP.maintenance };
    constraints[`${ctx.animal.key}__ME`] = { min: ctx.reqModel.ME.maintenance };
    constraints[`${ctx.animal.key}__Ca`] = { min: ctx.reqModel.Ca.maintenance };
    constraints[`${ctx.animal.key}__Ca_max`] = { max: caMaxDm * ctx.reqModel.dmMax.maintenance };
    constraints[`${ctx.animal.key}__P`] = { min: ctx.reqModel.P.maintenance };
    constraints[`${ctx.animal.key}__DM`] = { max: ctx.reqModel.dmMax.maintenance };
    constraints[`${ctx.animal.key}__roughage`] = { min: 0 };
    constraints.cost = { max: budget };
    constraints[`${ctx.animal.key}__milkCap`] = { max: ctx.effectiveCap };

    // milk variable first, exactly as solveRation does
    variables[`${ctx.animal.key}__milk`] = {
      [`${ctx.animal.key}__milk`]: 1,
      [`${ctx.animal.key}__CP`]: -ctx.reqModel.CP.perLitre,
      [`${ctx.animal.key}__ME`]: -ctx.reqModel.ME.perLitre,
      [`${ctx.animal.key}__Ca`]: -ctx.reqModel.Ca.perLitre,
      [`${ctx.animal.key}__Ca_max`]: -caMaxDm * ctx.reqModel.dmMax.perLitre,
      [`${ctx.animal.key}__P`]: -ctx.reqModel.P.perLitre,
      [`${ctx.animal.key}__DM`]: -ctx.reqModel.dmMax.perLitre,
      [`${ctx.animal.key}__milkCap`]: 1,
    };

    for (const { input, feed } of buyInputs) {
      const c = perKgFed(feed);
      const varDef: Record<string, number> = {
        [`${ctx.animal.key}__CP`]: c.cp,
        [`${ctx.animal.key}__ME`]: c.me,
        [`${ctx.animal.key}__Ca`]: c.ca,
        [`${ctx.animal.key}__Ca_max`]: c.ca,
        [`${ctx.animal.key}__P`]: c.p,
        [`${ctx.animal.key}__DM`]: c.dm,
        [`${ctx.animal.key}__roughage`]: isRoughage(feed) ? (1 - r) * c.dm : -r * c.dm,
        cost: input.priceInrPerKgAsFed,
      };
      if (feed.id === 'mineral_mix') {
        const minMm =
          ctx.todayMilk > 0
            ? (ctx.reqModel.mineralSupplement?.mineralMixMinKgPerDay?.lactating ?? 0.1)
            : (ctx.reqModel.mineralSupplement?.mineralMixMinKgPerDay?.dry ?? 0.05);
        const targetMin = input.maxKgAsFedPerDay !== null ? Math.min(minMm, input.maxKgAsFedPerDay) : minMm;
        constraints[`${ctx.animal.key}__min_mineral_mix`] = { min: targetMin };
        varDef[`${ctx.animal.key}__min_mineral_mix`] = 1;
      }
      if (feed.id === 'common_salt') {
        const minSalt =
          ctx.todayMilk > 0
            ? (ctx.reqModel.mineralSupplement?.saltMinKgPerDay?.lactating ?? 0.05)
            : (ctx.reqModel.mineralSupplement?.saltMinKgPerDay?.dry ?? 0.03);
        const targetMin = input.maxKgAsFedPerDay !== null ? Math.min(minSalt, input.maxKgAsFedPerDay) : minSalt;
        constraints[`${ctx.animal.key}__min_common_salt`] = { min: targetMin };
        varDef[`${ctx.animal.key}__min_common_salt`] = 1;
      }
      if (input.maxKgAsFedPerDay !== null) {
        const capKey = `${ctx.animal.key}__cap_${feed.id}`;
        constraints[capKey] = { max: input.maxKgAsFedPerDay };
        varDef[capKey] = 1;
      }
      variables[`${ctx.animal.key}__${feed.id}`] = varDef;
    }

    const sol = runLp({
      optimize: `${ctx.animal.key}__milk`,
      opType: 'max',
      constraints,
      variables,
    });

    if (!sol.feasible) {
      return { feasible: false, shareT: 0, values: {} };
    }

    const rawMilk = sol.values[`${ctx.animal.key}__milk`] ?? sol.evaluation ?? 0;
    const yStar = Math.min(ctx.effectiveCap, Math.max(0, rawMilk));
    const shareT = ctx.g > 0 ? Math.min(1, Math.max(0, yStar / ctx.g)) : 0;
    return { feasible: true, shareT, values: sol.values };
  }

  // Multi-animal or home feeds present: solve for fair-share variable t
  for (const ctx of animals) {
    const caMaxDm = ctx.reqModel.calciumMax?.maxGramsPerKgDm ?? 15;
    constraints[`${ctx.animal.key}__CP`] = { min: ctx.reqModel.CP.maintenance };
    constraints[`${ctx.animal.key}__ME`] = { min: ctx.reqModel.ME.maintenance };
    constraints[`${ctx.animal.key}__Ca`] = { min: ctx.reqModel.Ca.maintenance };
    constraints[`${ctx.animal.key}__Ca_max`] = { max: caMaxDm * ctx.reqModel.dmMax.maintenance };
    constraints[`${ctx.animal.key}__P`] = { min: ctx.reqModel.P.maintenance };
    constraints[`${ctx.animal.key}__DM`] = { max: ctx.reqModel.dmMax.maintenance };
    constraints[`${ctx.animal.key}__roughage`] = { min: 0 };
  }

  constraints.budget = { max: budget };

  for (const ctx of animals) {
    if (ctx.todayMilk > 0) {
      constraints[`${ctx.animal.key}__milkCap`] = { max: ctx.g };
      constraints[`${ctx.animal.key}__share`] = { min: 0 };
    }
  }

  constraints.share_max = { max: 1 };

  // Variable t
  const tVar: Record<string, number> = {
    t: 1,
    share_max: 1,
  };
  for (const ctx of animals) {
    if (ctx.todayMilk > 0) {
      tVar[`${ctx.animal.key}__share`] = -ctx.g;
    }
  }
  variables.t = tVar;

  // Variables y_i for milking animals
  for (const ctx of animals) {
    if (ctx.todayMilk > 0) {
      const caMaxDm = ctx.reqModel.calciumMax?.maxGramsPerKgDm ?? 15;
      variables[`${ctx.animal.key}__Y`] = {
        [`${ctx.animal.key}__CP`]: -ctx.reqModel.CP.perLitre,
        [`${ctx.animal.key}__ME`]: -ctx.reqModel.ME.perLitre,
        [`${ctx.animal.key}__Ca`]: -ctx.reqModel.Ca.perLitre,
        [`${ctx.animal.key}__Ca_max`]: -caMaxDm * ctx.reqModel.dmMax.perLitre,
        [`${ctx.animal.key}__P`]: -ctx.reqModel.P.perLitre,
        [`${ctx.animal.key}__DM`]: -ctx.reqModel.dmMax.perLitre,
        [`${ctx.animal.key}__milkCap`]: 1,
        [`${ctx.animal.key}__share`]: 1,
      };
    }
  }

  // Feed variables and supplement/cap constraints
  for (const ctx of animals) {
    const r = ctx.reqModel.roughage.minShareOfDm;

    for (const { input, feed } of buyInputs) {
      const c = perKgFed(feed);
      const varDef: Record<string, number> = {
        budget: input.priceInrPerKgAsFed,
        [`${ctx.animal.key}__CP`]: c.cp,
        [`${ctx.animal.key}__ME`]: c.me,
        [`${ctx.animal.key}__Ca`]: c.ca,
        [`${ctx.animal.key}__Ca_max`]: c.ca,
        [`${ctx.animal.key}__P`]: c.p,
        [`${ctx.animal.key}__DM`]: c.dm,
        [`${ctx.animal.key}__roughage`]: isRoughage(feed) ? (1 - r) * c.dm : -r * c.dm,
      };
      if (feed.id === 'mineral_mix') {
        const minMm =
          ctx.todayMilk > 0
            ? (ctx.reqModel.mineralSupplement?.mineralMixMinKgPerDay?.lactating ?? 0.1)
            : (ctx.reqModel.mineralSupplement?.mineralMixMinKgPerDay?.dry ?? 0.05);
        const targetMin = input.maxKgAsFedPerDay !== null ? Math.min(minMm, input.maxKgAsFedPerDay) : minMm;
        constraints[`${ctx.animal.key}__min_mineral_mix`] = { min: targetMin };
        varDef[`${ctx.animal.key}__min_mineral_mix`] = 1;
      }
      if (feed.id === 'common_salt') {
        const minSalt =
          ctx.todayMilk > 0
            ? (ctx.reqModel.mineralSupplement?.saltMinKgPerDay?.lactating ?? 0.05)
            : (ctx.reqModel.mineralSupplement?.saltMinKgPerDay?.dry ?? 0.03);
        const targetMin = input.maxKgAsFedPerDay !== null ? Math.min(minSalt, input.maxKgAsFedPerDay) : minSalt;
        constraints[`${ctx.animal.key}__min_common_salt`] = { min: targetMin };
        varDef[`${ctx.animal.key}__min_common_salt`] = 1;
      }
      if (input.maxKgAsFedPerDay !== null) {
        const capKey = `${ctx.animal.key}__cap_${feed.id}`;
        constraints[capKey] = { max: input.maxKgAsFedPerDay };
        varDef[capKey] = 1;
      }
      variables[`${ctx.animal.key}__${feed.id}`] = varDef;
    }

    for (const { feed, kgPerDay } of homeInputs) {
      const c = perKgFed(feed);
      const varDef: Record<string, number> = {
        [`${ctx.animal.key}__CP`]: c.cp,
        [`${ctx.animal.key}__ME`]: c.me,
        [`${ctx.animal.key}__Ca`]: c.ca,
        [`${ctx.animal.key}__Ca_max`]: c.ca,
        [`${ctx.animal.key}__P`]: c.p,
        [`${ctx.animal.key}__DM`]: c.dm,
        [`${ctx.animal.key}__roughage`]: isRoughage(feed) ? (1 - r) * c.dm : -r * c.dm,
      };
      if (feed.id === 'mineral_mix') {
        const minMm =
          ctx.todayMilk > 0
            ? (ctx.reqModel.mineralSupplement?.mineralMixMinKgPerDay?.lactating ?? 0.1)
            : (ctx.reqModel.mineralSupplement?.mineralMixMinKgPerDay?.dry ?? 0.05);
        const isHomeOnly = !buyInputs.some((b) => b.feed.id === 'mineral_mix');
        const targetMin = isHomeOnly ? Math.min(minMm, kgPerDay) : minMm;
        if (!constraints[`${ctx.animal.key}__min_mineral_mix`]) {
          constraints[`${ctx.animal.key}__min_mineral_mix`] = { min: targetMin };
        }
        varDef[`${ctx.animal.key}__min_mineral_mix`] = 1;
      }
      if (feed.id === 'common_salt') {
        const minSalt =
          ctx.todayMilk > 0
            ? (ctx.reqModel.mineralSupplement?.saltMinKgPerDay?.lactating ?? 0.05)
            : (ctx.reqModel.mineralSupplement?.saltMinKgPerDay?.dry ?? 0.03);
        const isHomeOnly = !buyInputs.some((b) => b.feed.id === 'common_salt');
        const targetMin = isHomeOnly ? Math.min(minSalt, kgPerDay) : minSalt;
        if (!constraints[`${ctx.animal.key}__min_common_salt`]) {
          constraints[`${ctx.animal.key}__min_common_salt`] = { min: targetMin };
        }
        varDef[`${ctx.animal.key}__min_common_salt`] = 1;
      }
      varDef[`stock__${feed.id}`] = 1;
      variables[`${ctx.animal.key}__home__${feed.id}`] = varDef;
    }
  }

  for (const { feed, kgPerDay } of homeInputs) {
    constraints[`stock__${feed.id}`] = { max: kgPerDay };
  }

  const sol = runLp({
    optimize: 't',
    opType: 'max',
    constraints,
    variables,
  });

  if (!sol.feasible) {
    return { feasible: false, shareT: 0, values: {} };
  }

  const rawT = sol.values.t ?? sol.evaluation ?? 0;
  const shareT = Math.min(1, Math.max(0, rawT));
  return { feasible: true, shareT, values: sol.values };
}

/**
 * Solve a herd ration according to Change 4 joint linear programming specification.
 */
export function solveHerd(
  animals: readonly HerdAnimal[],
  buySet: readonly SelectedFeedInput[],
  homeFeeds: readonly HomeFeed[],
  budget: number,
  feedLibrary: readonly FeedItem[] = DEFAULT_FEED_LIBRARY,
  breedLibrary: readonly BreedStandard[] = BREEDS,
): HerdSolveOutcome {
  const checkedOn = new Date().toISOString().slice(0, 10);
  const feedMap = new Map(feedLibrary.map((f) => [f.id, f]));

  // Filter buySet
  const activeBuyFeeds: ActiveFeed[] = [];
  for (const s of buySet) {
    const feed = feedMap.get(s.feedId);
    if (!feed) continue;
    if (!Number.isFinite(s.priceInrPerKgAsFed) || s.priceInrPerKgAsFed < 0) continue;
    if (s.maxKgAsFedPerDay !== null && s.maxKgAsFedPerDay <= 0) continue;
    activeBuyFeeds.push({ input: s, feed });
  }

  // Filter homeFeeds (at most one row per feedId, kgPerDay > 0)
  const activeHomeFeeds: { feed: FeedItem; kgPerDay: number }[] = [];
  const homeFeedMap = new Map<string, number>();
  for (const h of homeFeeds) {
    const feed = feedMap.get(h.feedId);
    if (!feed) continue;
    if (!Number.isFinite(h.kgPerDay) || h.kgPerDay <= 0) continue;
    if (!homeFeedMap.has(h.feedId)) {
      homeFeedMap.set(h.feedId, h.kgPerDay);
      activeHomeFeeds.push({ feed, kgPerDay: h.kgPerDay });
    }
  }

  // Build animal contexts
  const animalContexts: InternalAnimalContext[] = animals.map((animal) => {
    const breed =
      breedLibrary.find((b) => b.id === animal.profile.breedId) ??
      breedById(animal.profile.breedId) ??
      breedLibrary.find((b) => b.species === animal.profile.species)!;
    const todayMilk = Math.max(
      0,
      Number.isFinite(animal.profile.milkYieldLitersPerDay) ? animal.profile.milkYieldLitersPerDay : 0,
    );
    const effectiveCap = Math.max(breed.milkCapLPerDay, todayMilk);
    const effectiveCapSource: 'breed' | 'today_milk' =
      todayMilk > breed.milkCapLPerDay + TOL ? 'today_milk' : 'breed';
    const g = todayMilk > 0 ? effectiveCap : 0;
    const reqModel = buildRequirementModel({
      ...animal.profile,
      budgetInrPerDay: budget,
      isConfirmed: animal.isConfirmed,
    });
    const merged = buildMergedInputs(activeBuyFeeds, activeHomeFeeds);
    return {
      animal,
      breed,
      todayMilk,
      effectiveCap,
      effectiveCapSource,
      g,
      reqModel,
      merged,
    };
  });

  // Step 1: Herd maintenance M_H (ŷ_i = 0 for all, no budget limit)
  const zeroMilkMap: Record<string, number> = {};
  for (const ctx of animalContexts) {
    zeroMilkMap[ctx.animal.key] = 0;
  }
  const maintSol = solveHerdFixedMilk(animalContexts, activeBuyFeeds, activeHomeFeeds, zeroMilkMap, null);

  if (!maintSol) {
    const failingAnimals: {
      key: string;
      limitingNutrients: LimitingNutrient[];
      dmConflict: boolean;
      suggestedFeeds: FeedSuggestion[];
    }[] = [];

    for (const ctx of animalContexts) {
      const solo = solveFixedMilk(ctx.merged, ctx.reqModel, 0, null);
      if (!solo) {
        const diag = diagnoseAtMilk(ctx.merged, ctx.reqModel, 0, feedLibrary);
        failingAnimals.push({
          key: ctx.animal.key,
          limitingNutrients: diag.limitingNutrients,
          dmConflict: diag.dmConflict,
          suggestedFeeds: diag.suggestedFeeds,
        });
      }
    }

    return {
      status: 'infeasible',
      animals: failingAnimals,
      jointConflict: failingAnimals.length === 0,
    };
  }

  const maintCost = maintSol.totalCost;

  // Step 2: Below maintenance
  if (budget < maintCost - TOL) {
    return {
      status: 'below_maintenance',
      maintenanceCostInrPerDay: maintCost,
      budgetInrPerDay: budget,
    };
  }

  const allDry = animalContexts.every((ctx) => ctx.todayMilk <= 0);

  // Step 3: Every animal dry
  if (allDry) {
    const shareT = 0;
    const stage1Feasible = true;
    let bestSol: HerdFixedMilkSolveResult = maintSol;
    let stage3Applied: boolean | null = null;

    if (activeHomeFeeds.length > 0) {
      const stage3 = solveHerdStage3(
        animalContexts,
        activeBuyFeeds,
        activeHomeFeeds,
        zeroMilkMap,
        budget,
        maintSol.totalCost,
      );
      if (stage3) {
        bestSol = stage3;
        stage3Applied = true;
      } else {
        stage3Applied = false;
      }
    }

    return buildOptimalOutcome({
      animalContexts,
      activeBuyFeeds,
      activeHomeFeeds,
      budget,
      feedLibrary,
      checkedOn,
      shareT,
      stage1Feasible,
      budgetTight: false,
      maintCost,
      costAtTarget: null,
      stage2AtY: maintSol,
      stage2AtS: maintSol,
      stage2Path: 'direct',
      F: bestSol,
      stage3Applied,
      YMap: zeroMilkMap,
      SMap: zeroMilkMap,
    });
  }

  // Step 4: Stage 1 (Maximize fair share t)
  const stage1Result = solveHerdStage1(animalContexts, activeBuyFeeds, activeHomeFeeds, budget);
  const shareT = stage1Result.shareT;
  const stage1Feasible = stage1Result.feasible;

  const YMap: Record<string, number> = {};
  for (const ctx of animalContexts) {
    if (ctx.todayMilk > 0) {
      if (animals.length === 1 && activeHomeFeeds.length === 0) {
        // For single animal without home feed, use exact yStar from Stage 1 milk variable
        const rawMilk = stage1Result.values[`${ctx.animal.key}__milk`] ?? stage1Result.values[`${ctx.animal.key}__Y`] ?? (shareT * ctx.g);
        YMap[ctx.animal.key] = Math.min(ctx.effectiveCap, Math.max(0, rawMilk));
      } else {
        YMap[ctx.animal.key] = Math.min(ctx.g, shareT * ctx.g);
      }
    } else {
      YMap[ctx.animal.key] = 0;
    }
  }

  // Step 5: Stage 2 at Y (detection only)
  let stage2AtY =
    solveHerdFixedMilk(animalContexts, activeBuyFeeds, activeHomeFeeds, YMap, budget) ??
    solveHerdFixedMilk(animalContexts, activeBuyFeeds, activeHomeFeeds, YMap, null);

  if (!stage2AtY) {
    const animalResults = new Map<string, FixedMilkSolveResult>();
    let totalCost = 0;
    for (const ctx of animalContexts) {
      const sliced = sliceAnimalResult(ctx, activeBuyFeeds, activeHomeFeeds, stage1Result.values);
      animalResults.set(ctx.animal.key, sliced);
      totalCost += sliced.totalCost;
    }
    stage2AtY = {
      totalCost,
      values: stage1Result.values,
      animalResults,
    };
  }

  const budgetTight = stage2AtY.totalCost >= budget - relTol(budget);

  // Stage 3 at Y when Hm is non-empty (for detection checks)
  let detectionSol = stage2AtY;
  let stage3AtY: HerdFixedMilkSolveResult | null = null;
  if (activeHomeFeeds.length > 0) {
    stage3AtY = solveHerdStage3(
      animalContexts,
      activeBuyFeeds,
      activeHomeFeeds,
      YMap,
      budget,
      stage2AtY.totalCost,
    );
    if (stage3AtY) {
      detectionSol = stage3AtY;
    }
  }

  // Step 6: Stage 2 at S (the displayed plan F)
  const SMap: Record<string, number> = {};
  let allSEqualY = true;
  for (const ctx of animalContexts) {
    const yVal = YMap[ctx.animal.key] ?? 0;
    const sVal = roundSupportedMilkDown(yVal);
    SMap[ctx.animal.key] = sVal;
    if (Math.abs(sVal - yVal) > TOL) {
      allSEqualY = false;
    }
  }

  let stage2AtS: HerdFixedMilkSolveResult | null = null;
  let stage2Path: 'direct' | 'retry_minus_0_1' | 'maintenance' = 'direct';

  if (allSEqualY && stage2AtY.totalCost <= budget + relTol(budget)) {
    stage2AtS = stage2AtY;
    stage2Path = 'direct';
  } else {
    stage2AtS = solveHerdFixedMilk(animalContexts, activeBuyFeeds, activeHomeFeeds, SMap, budget);
    if (stage2AtS) {
      stage2Path = 'direct';
    } else {
      // Retry once with every S_i >= 0.1 lowered by 0.1
      const SRetryMap: Record<string, number> = {};
      let canRetry = false;
      for (const ctx of animalContexts) {
        const s = SMap[ctx.animal.key] ?? 0;
        if (s >= 0.1 - 1e-9) {
          SRetryMap[ctx.animal.key] = Math.max(0, Math.round((s - 0.1) * 10) / 10);
          canRetry = true;
        } else {
          SRetryMap[ctx.animal.key] = s;
        }
      }

      if (canRetry) {
        stage2AtS = solveHerdFixedMilk(animalContexts, activeBuyFeeds, activeHomeFeeds, SRetryMap, budget);
        if (stage2AtS) {
          stage2Path = 'retry_minus_0_1';
          for (const k of Object.keys(SRetryMap)) {
            SMap[k] = SRetryMap[k];
          }
        }
      }

      if (!stage2AtS) {
        stage2AtS = maintSol;
        stage2Path = 'maintenance';
        for (const ctx of animalContexts) {
          SMap[ctx.animal.key] = 0;
        }
      }
    }
  }

  // Stage 3 for F
  let F: HerdFixedMilkSolveResult = stage2AtS;
  let stage3Applied: boolean | null = null;

  if (activeHomeFeeds.length > 0) {
    if (stage2AtS === stage2AtY && stage3AtY !== null) {
      F = stage3AtY;
      stage3Applied = true;
    } else {
      const stage3 = solveHerdStage3(
        animalContexts,
        activeBuyFeeds,
        activeHomeFeeds,
        SMap,
        budget,
        stage2AtS.totalCost,
      );
      if (stage3) {
        F = stage3;
        stage3Applied = true;
      } else {
        F = stage2AtS;
        stage3Applied = false;
      }
    }
  }

  // Step 7: costAtCap_H (no budget, milk fixed at g_i)
  const gMap: Record<string, number> = {};
  for (const ctx of animalContexts) {
    gMap[ctx.animal.key] = ctx.g;
  }
  const capSol = solveHerdFixedMilk(animalContexts, activeBuyFeeds, activeHomeFeeds, gMap, null);
  const costAtTarget: number | null = capSol ? capSol.totalCost : null;

  return buildOptimalOutcome({
    animalContexts,
    activeBuyFeeds,
    activeHomeFeeds,
    budget,
    feedLibrary,
    checkedOn,
    shareT,
    stage1Feasible,
    budgetTight,
    maintCost,
    costAtTarget,
    stage2AtY: detectionSol,
    stage2AtS,
    stage2Path,
    F,
    stage3Applied,
    YMap,
    SMap,
  });
}

function buildOptimalOutcome(params: {
  animalContexts: InternalAnimalContext[];
  activeBuyFeeds: ActiveFeed[];
  activeHomeFeeds: { feed: FeedItem; kgPerDay: number }[];
  budget: number;
  feedLibrary: readonly FeedItem[];
  checkedOn: string;
  shareT: number;
  stage1Feasible: boolean;
  budgetTight: boolean;
  maintCost: number;
  costAtTarget: number | null;
  stage2AtY: HerdFixedMilkSolveResult;
  stage2AtS: HerdFixedMilkSolveResult;
  stage2Path: 'direct' | 'retry_minus_0_1' | 'maintenance';
  F: HerdFixedMilkSolveResult;
  stage3Applied: boolean | null;
  YMap: Record<string, number>;
  SMap: Record<string, number>;
}): HerdSolution {
  const {
    animalContexts,
    activeBuyFeeds,
    activeHomeFeeds,
    budget,
    feedLibrary,
    checkedOn,
    shareT,
    stage1Feasible,
    budgetTight,
    maintCost,
    costAtTarget,
    stage2AtY,
    stage2AtS,
    stage2Path,
    F,
    stage3Applied,
    YMap,
    SMap,
  } = params;

  const totalPurchaseCost = F.totalCost;
  const stage2PurchaseInrPerDay = stage2AtS.totalCost;

  // Step 8 & 9: Per-animal solutions and limits
  const animalSolutions: HerdAnimalSolution[] = [];
  const limits: HerdLimit[] = [];

  if (budgetTight) {
    limits.push({ kind: 'budget' });
  }
  if (shareT >= 1 - 1e-6) {
    limits.push({ kind: 'milk_target' });
  }
  for (const h of activeHomeFeeds) {
    let homeUsedAtY = 0;
    for (const ctx of animalContexts) {
      const raw = stage2AtY.values[`${ctx.animal.key}__home__${h.feed.id}`] ?? 0;
      homeUsedAtY += raw > 1e-9 ? raw : 0;
    }
    if (homeUsedAtY >= h.kgPerDay - relTol(h.kgPerDay)) {
      limits.push({ kind: 'home_stock', feedId: h.feed.id });
    }
  }

  for (const ctx of animalContexts) {
    const Y_i = YMap[ctx.animal.key] ?? 0;
    const S_i = SMap[ctx.animal.key] ?? 0;

    // Solo calculations
    const costAtTodayMilk_i =
      solveFixedMilk(ctx.merged, ctx.reqModel, ctx.todayMilk, null)?.totalCost ?? null;
    const costAtCap_i =
      ctx.todayMilk > 0
        ? solveFixedMilk(ctx.merged, ctx.reqModel, ctx.g, null)?.totalCost ?? null
        : null;
    const maintCost_i =
      solveFixedMilk(ctx.merged, ctx.reqModel, 0, null)?.totalCost ?? 0;

    let limitingAtToday: LimitingKey[] = [];
    if (Y_i < ctx.todayMilk - TOL && costAtTodayMilk_i === null) {
      const diagT = diagnoseAtMilk(ctx.merged, ctx.reqModel, ctx.todayMilk, feedLibrary);
      limitingAtToday = diagT.limitingNutrients.map((l) => l.nutrient);
      if (limitingAtToday.length === 0) {
        limitingAtToday = ['DM'];
      }
    }

    // Slice F lines
    const animalSlicedF = sliceAnimalResult(ctx, activeBuyFeeds, activeHomeFeeds, F.values);

    // Tight constraints on Stage 2 at Y
    let animalTightConstraints: BindingConstraint[] = [];
    let animalBindingConstraint: BindingConstraint = 'budget';

    if (ctx.todayMilk <= 0) {
      animalBindingConstraint = 'breed_cap';
      animalTightConstraints = [];
    } else {
      const sliceAtY = sliceAnimalResult(ctx, activeBuyFeeds, activeHomeFeeds, stage2AtY.values);
      let residualBudget = budget;
      for (const other of animalContexts) {
        if (other.animal.key !== ctx.animal.key) {
          const otherSlice = sliceAnimalResult(other, activeBuyFeeds, activeHomeFeeds, stage2AtY.values);
          residualBudget -= otherSlice.totalCost;
        }
      }

      animalTightConstraints = detectTightConstraintsAtYStar(
        ctx.merged,
        ctx.reqModel,
        Y_i,
        ctx.effectiveCap,
        residualBudget,
        sliceAtY,
      );
      animalBindingConstraint = animalTightConstraints[0] ?? 'budget';

      // Limits for herd Details
      for (const c of ['intake', 'roughage', 'CP', 'ME', 'Ca', 'P'] as const) {
        if (animalTightConstraints.includes(c)) {
          limits.push({
            kind: 'animal',
            key: ctx.animal.key,
            constraint: c,
          });
        }
      }
    }

    const feedLimitIds = animalSlicedF.lines.filter((l) => l.atCap).map((l) => l.feedId);

    const verdict = selectVerdict({
      todayMilkLPerDay: ctx.todayMilk,
      breedCapLPerDay: ctx.breed.milkCapLPerDay,
      yStar: Y_i,
      supportedMilkLPerDay: S_i,
      referenceCostInrPerDay: budget,
      costAtTodayMilkInrPerDay: costAtTodayMilk_i,
      limitingAtToday,
    });

    const fatComparison =
      ctx.todayMilk > 0
        ? buildFatComparison(ctx.todayMilk, ctx.reqModel.fatPctUsed, ctx.breed)
        : null;

    const reqAtS = evaluateRequirementsAtMilk(ctx.reqModel, S_i);
    const coveragePct = {} as Record<NutrientKey, number>;
    const nutrientBindingConstraints: NutrientKey[] = [];
    for (const k of NUTRIENT_KEYS) {
      const req = reqAtS[REQ_FIELD[k]];
      const sup = animalSlicedF.supplied[REQ_FIELD[k]];
      coveragePct[k] = req > 0 ? (sup / req) * 100 : 100;
      const ratio = req > 0 ? sup / req : 1;
      if (k === 'DM' ? ratio >= 0.99 : ratio <= 1.01) {
        nutrientBindingConstraints.push(k);
      }
    }

    const r = ctx.reqModel.roughage.minShareOfDm;

    const sol: RationSolution = {
      status: 'optimal',
      breedId: ctx.breed.id,
      supportedMilkLPerDay: S_i,
      supportedMilkExactLPerDay: Y_i,
      milkCapLPerDay: ctx.breed.milkCapLPerDay,
      capBasis: ctx.breed.capBasis,
      effectiveCapLPerDay: ctx.effectiveCap,
      effectiveCapSource: ctx.effectiveCapSource,
      bindingConstraint: animalBindingConstraint,
      tightConstraints: animalTightConstraints,
      feedLimitIds,
      verdict,
      costAtTodayMilkInrPerDay: costAtTodayMilk_i,
      costAtCapInrPerDay: ctx.todayMilk > 0 ? costAtCap_i : null,
      fatComparison,
      maintenanceCostInrPerDay: maintCost_i,
      budgetInrPerDay: budget,
      referenceCostInrPerDay: budget,
      underBudgetInr: Math.max(0, budget - totalPurchaseCost),
      feeds: animalSlicedF.lines,
      totalKgAsFed: animalSlicedF.totalKgAsFed,
      totalCostInr: animalSlicedF.totalCost,
      requirementsAtS: reqAtS,
      supplied: animalSlicedF.supplied,
      coveragePct,
      bindingConstraints: nutrientBindingConstraints,
      roughageMinShare: r,
      roughageShareAchieved: animalSlicedF.roughageShare,
      roughageSharePct: animalSlicedF.roughageSharePct,
      roughageMinSharePct: r * 100,
      currentCostInr: null,
      savingsInr: null,
      savingsPct: null,
      solvedOn: checkedOn,
      sourceKey: 'SOLVER-HERD-LP-V1',
    };

    const requirementAtS = computeRequirements({
      ...ctx.animal.profile,
      milkYieldLitersPerDay: S_i,
      budgetInrPerDay: budget,
      isConfirmed: ctx.animal.isConfirmed,
    });

    animalSolutions.push({
      key: ctx.animal.key,
      milkTargetLPerDay: ctx.g,
      milkExactLPerDay: Y_i,
      milkLPerDay: S_i,
      solution: sol,
      requirementAtS,
    });
  }

  // Buy totals
  const buyTotals: ShoppingLine[] = [];
  for (const { input, feed } of activeBuyFeeds) {
    let totalKg = 0;
    const perAnimalKg: { key: string; kg: number }[] = [];
    for (const ctx of animalContexts) {
      const raw = F.values[`${ctx.animal.key}__${feed.id}`] ?? 0;
      const kg = raw > 1e-9 ? raw : 0;
      totalKg += kg;
      perAnimalKg.push({ key: ctx.animal.key, kg });
    }
    if (totalKg > 1e-6) {
      buyTotals.push({
        feedId: feed.id,
        kgPerDay: totalKg,
        costInrPerDay: totalKg * input.priceInrPerKgAsFed,
        priceInrPerKg: input.priceInrPerKgAsFed,
        perAnimalKg,
      });
    }
  }

  // Home use
  const homeUse = activeHomeFeeds.map(({ feed, kgPerDay }) => {
    let usedKgPerDay = 0;
    for (const ctx of animalContexts) {
      const raw = F.values[`${ctx.animal.key}__home__${feed.id}`] ?? 0;
      usedKgPerDay += raw > 1e-9 ? raw : 0;
    }
    return {
      feedId: feed.id,
      usedKgPerDay,
      stockKgPerDay: kgPerDay,
      tight: usedKgPerDay >= kgPerDay - relTol(kgPerDay),
    };
  });

  const solution: HerdSolution = {
    status: 'optimal',
    shareT,
    stage1Feasible,
    budgetTight,
    limits,
    maintenanceCostInrPerDay: maintCost,
    costAtTargetInrPerDay: costAtTarget,
    purchaseCostInrPerDay: totalPurchaseCost,
    budgetInrPerDay: budget,
    animals: animalSolutions,
    buyTotals,
    homeUse,
    stage2Path,
    stage3Applied,
    stage2PurchaseInrPerDay,
    solvedOn: checkedOn,
    sourceKey: 'SOLVER-HERD-LP-V1',
  };

  // Step 10: Numerical guard
  verifyHerdSolution(
    solution,
    animalContexts.map((c) => c.animal),
    activeBuyFeeds.map((b) => b.input),
    activeHomeFeeds.map((h) => ({ feedId: h.feed.id, kgPerDay: h.kgPerDay })),
    feedLibrary,
  );

  return solution;
}

/**
 * Solve prefix step for buy ladder: cheap solve (M_H(k), Stage 1, Stage 2 at S only).
 */
export function solveHerdStep(
  animals: readonly HerdAnimal[],
  prefixBuySet: readonly SelectedFeedInput[],
  homeFeeds: readonly HomeFeed[],
  budget: number,
  feedLibrary: readonly FeedItem[] = DEFAULT_FEED_LIBRARY,
  breedLibrary: readonly BreedStandard[] = BREEDS,
): HerdStepOutcome {
  const feedMap = new Map(feedLibrary.map((f) => [f.id, f]));

  const activeBuyFeeds: ActiveFeed[] = [];
  for (const s of prefixBuySet) {
    const feed = feedMap.get(s.feedId);
    if (!feed) continue;
    if (!Number.isFinite(s.priceInrPerKgAsFed) || s.priceInrPerKgAsFed < 0) continue;
    if (s.maxKgAsFedPerDay !== null && s.maxKgAsFedPerDay <= 0) continue;
    activeBuyFeeds.push({ input: s, feed });
  }

  const activeHomeFeeds: { feed: FeedItem; kgPerDay: number }[] = [];
  const homeFeedMap = new Map<string, number>();
  for (const h of homeFeeds) {
    const feed = feedMap.get(h.feedId);
    if (!feed) continue;
    if (!Number.isFinite(h.kgPerDay) || h.kgPerDay <= 0) continue;
    if (!homeFeedMap.has(h.feedId)) {
      homeFeedMap.set(h.feedId, h.kgPerDay);
      activeHomeFeeds.push({ feed, kgPerDay: h.kgPerDay });
    }
  }

  const animalContexts: InternalAnimalContext[] = animals.map((animal) => {
    const breed =
      breedLibrary.find((b) => b.id === animal.profile.breedId) ??
      breedById(animal.profile.breedId) ??
      breedLibrary.find((b) => b.species === animal.profile.species)!;
    const todayMilk = Math.max(
      0,
      Number.isFinite(animal.profile.milkYieldLitersPerDay) ? animal.profile.milkYieldLitersPerDay : 0,
    );
    const effectiveCap = Math.max(breed.milkCapLPerDay, todayMilk);
    const effectiveCapSource: 'breed' | 'today_milk' =
      todayMilk > breed.milkCapLPerDay + TOL ? 'today_milk' : 'breed';
    const g = todayMilk > 0 ? effectiveCap : 0;
    const reqModel = buildRequirementModel({
      ...animal.profile,
      budgetInrPerDay: budget,
      isConfirmed: animal.isConfirmed,
    });
    const merged = buildMergedInputs(activeBuyFeeds, activeHomeFeeds);
    return {
      animal,
      breed,
      todayMilk,
      effectiveCap,
      effectiveCapSource,
      g,
      reqModel,
      merged,
    };
  });

  // 1. M_H(k)
  const zeroMilkMap: Record<string, number> = {};
  for (const ctx of animalContexts) {
    zeroMilkMap[ctx.animal.key] = 0;
  }
  const maintSol = solveHerdFixedMilk(animalContexts, activeBuyFeeds, activeHomeFeeds, zeroMilkMap, null);
  if (!maintSol) {
    return { status: 'not_optimal' };
  }

  // 2. Below maintenance
  if (budget < maintSol.totalCost - TOL) {
    return { status: 'not_optimal' };
  }

  // 3. Every animal dry
  const allDry = animalContexts.every((ctx) => ctx.todayMilk <= 0);
  if (allDry) {
    const milkLPerDay: Record<string, number> = {};
    for (const ctx of animalContexts) {
      milkLPerDay[ctx.animal.key] = 0;
    }
    return {
      status: 'optimal',
      shareT: 0,
      milkLPerDay,
      totalMilkL: 0,
      purchaseCostInrPerDay: maintSol.totalCost,
    };
  }

  // 4. Stage 1
  const stage1Result = solveHerdStage1(animalContexts, activeBuyFeeds, activeHomeFeeds, budget);
  const shareT = stage1Result.shareT;

  const YMap: Record<string, number> = {};
  const SMap: Record<string, number> = {};
  for (const ctx of animalContexts) {
    if (ctx.todayMilk > 0) {
      if (animals.length === 1 && activeHomeFeeds.length === 0) {
        const rawMilk =
          stage1Result.values[`${ctx.animal.key}__milk`] ??
          stage1Result.values[`${ctx.animal.key}__Y`] ??
          (shareT * ctx.g);
        YMap[ctx.animal.key] = Math.min(ctx.effectiveCap, Math.max(0, rawMilk));
      } else {
        YMap[ctx.animal.key] = Math.min(ctx.g, shareT * ctx.g);
      }
    } else {
      YMap[ctx.animal.key] = 0;
    }
    SMap[ctx.animal.key] = roundSupportedMilkDown(YMap[ctx.animal.key] ?? 0);
  }

  // 5. Stage 2 at S only
  let stage2AtS = solveHerdFixedMilk(animalContexts, activeBuyFeeds, activeHomeFeeds, SMap, budget);
  if (!stage2AtS) {
    const SRetryMap: Record<string, number> = {};
    let canRetry = false;
    for (const ctx of animalContexts) {
      const s = SMap[ctx.animal.key] ?? 0;
      if (s >= 0.1 - 1e-9) {
        SRetryMap[ctx.animal.key] = Math.max(0, Math.round((s - 0.1) * 10) / 10);
        canRetry = true;
      } else {
        SRetryMap[ctx.animal.key] = s;
      }
    }

    if (canRetry) {
      stage2AtS = solveHerdFixedMilk(animalContexts, activeBuyFeeds, activeHomeFeeds, SRetryMap, budget);
      if (stage2AtS) {
        for (const k of Object.keys(SRetryMap)) {
          SMap[k] = SRetryMap[k];
        }
      }
    }

    if (!stage2AtS) {
      stage2AtS = maintSol;
      for (const ctx of animalContexts) {
        SMap[ctx.animal.key] = 0;
      }
    }
  }

  let totalMilkL = 0;
  for (const ctx of animalContexts) {
    totalMilkL += SMap[ctx.animal.key] ?? 0;
  }

  return {
    status: 'optimal',
    shareT,
    milkLPerDay: SMap,
    totalMilkL,
    purchaseCostInrPerDay: stage2AtS.totalCost,
  };
}
