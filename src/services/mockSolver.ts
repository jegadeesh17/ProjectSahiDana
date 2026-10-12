// Prototype two-stage solver behind the mock adapter.
// NOT the live solver and NOT the cited library: the nutrient values are placeholders (PROTO-* keys) and the
// requirement formulas are fixtures. The arithmetic is real, though: stage 1 maximises milk within the budget and
// the breed cap, stage 2 finds the cheapest ration at that milk, both by a small simplex (miniSimplex.ts).
import feedsJson from '../data/feeds.prototype.json';
import { breedById } from '../domain/breeds';
import { MIN_NUTRIENTS, perKgFed, suppliedFor } from '../domain/nutrition';
import type { PerKg } from '../domain/nutrition';
import type {
  AnimalProfile,
  BindingConstraint,
  BreedStandard,
  BudgetShortfallReport,
  FeedItem,
  FeedSuggestion,
  InfeasibilityReport,
  LimitingKey,
  LimitingNutrient,
  NutrientKey,
  RationFeedLine,
  RationSolution,
  RationSolveOutcome,
  SelectedFeedInput,
  SolvedVerdict,
} from '../domain/types';
import type { LpRow } from './miniSimplex';
import { maximize } from './miniSimplex';

export const FEEDS = feedsJson as unknown as FeedItem[];
const FEED_BY_ID = new Map(FEEDS.map((f) => [f.id, f]));

/** Fixed so screenshots and tests are deterministic. */
export const PROTOTYPE_SOLVED_ON = '2026-10-13';
export const DM_FLOOR_FRACTION = 0.85;
/** PROTOTYPE FIXTURE: roughage (indigenous forage + crop residue) as a share of total dry matter. The cited ICAR/NDDB value arrives in M1. */
export const ROUGHAGE_MIN_SHARE = 0.4;

export function isRoughage(feed: FeedItem): boolean {
  return feed.vertical === 'indigenous_forage' || feed.vertical === 'crop_residue';
}

type MinKey = (typeof MIN_NUTRIENTS)[number];
const MIN_FIELD: Record<MinKey, keyof PerKg> = { CP: 'cp', ME: 'me', Ca: 'ca', P: 'p' };

/** requirement(milk) = base + slope * milk for each nutrient (placeholder formulas, flagged as fixtures). */
export interface Linear {
  base: number;
  slope: number;
}

export function requirementLinear(animal: Pick<AnimalProfile, 'bodyWeightKg' | 'milkFatPct'>): Record<NutrientKey, Linear> {
  const w = animal.bodyWeightKg;
  const f = animal.milkFatPct;
  const w075 = Math.pow(w, 0.75);
  return {
    DM: { base: 0.022 * w, slope: 0.4 },
    CP: { base: 5 * w075, slope: 55 + 8 * f },
    ME: { base: 0.133 * w075, slope: 0.9 + 0.19 * f },
    Ca: { base: 0.04 * w, slope: 1.9 + 0.2 * f },
    P: { base: 0.03 * w, slope: 1.1 + 0.1 * f },
  };
}

// ---- the model: selected feeds as LP coefficients ---------------------------------------------------
interface Model {
  inputs: SelectedFeedInput[];
  feeds: FeedItem[];
  per: PerKg[];
  lin: Record<NutrientKey, Linear>;
  rough: number[];
}

function makeModel(animal: AnimalProfile, inputs: SelectedFeedInput[]): Model {
  const feeds = inputs.map((i) => FEED_BY_ID.get(i.feedId)!);
  return { inputs, feeds, per: feeds.map(perKgFed), lin: requirementLinear(animal), rough: feeds.map((f) => (isRoughage(f) ? 1 : 0)) };
}

interface Mods {
  budget?: number;
  cap?: number;
  intake?: number;
  need?: Partial<Record<MinKey, number>>;
  feedCaps?: number;
  /** Multiplies the roughage minimum share (0.99 relaxes it). */
  roughage?: number;
}

/** sum((r_i - share) * dm_i * x_i) >= 0: roughage dry matter is at least the minimum share of the total. */
function roughageRow(model: Model, width: number, factor: number): LpRow {
  const coef = new Array<number>(width).fill(0);
  model.per.forEach((p, i) => {
    coef[i] = (model.rough[i] - ROUGHAGE_MIN_SHARE * factor) * p.dm;
  });
  return { coef, sense: '>=', rhs: 0 };
}

function feedCapRows(model: Model, width: number, scale: number): LpRow[] {
  const rows: LpRow[] = [];
  model.inputs.forEach((inp, i) => {
    if (inp.maxKgAsFedPerDay === null) return;
    const coef = new Array<number>(width).fill(0);
    coef[i] = 1;
    rows.push({ coef, sense: '<=', rhs: inp.maxKgAsFedPerDay * scale });
  });
  return rows;
}

/** Stage 1: the largest milk the feeds support within the budget and the breed cap. */
function stage1(model: Model, budget: number, capMilk: number, mods: Mods = {}): { milk: number; x: number[] } | null {
  const n = model.feeds.length;
  const width = n + 1;
  const rows = feedCapRows(model, width, mods.feedCaps ?? 1);
  for (const k of MIN_NUTRIENTS) {
    const f = mods.need?.[k] ?? 1;
    const coef = new Array<number>(width).fill(0);
    model.per.forEach((p, i) => {
      coef[i] = p[MIN_FIELD[k]];
    });
    coef[n] = -model.lin[k].slope * f;
    rows.push({ coef, sense: '>=', rhs: model.lin[k].base * f });
  }
  const ik = mods.intake ?? 1;
  const dm = new Array<number>(width).fill(0);
  model.per.forEach((p, i) => {
    dm[i] = p.dm;
  });
  rows.push({ coef: dm.map((v, j) => (j === n ? -model.lin.DM.slope * ik : v)), sense: '<=', rhs: model.lin.DM.base * ik });
  rows.push({
    coef: dm.map((v, j) => (j === n ? -DM_FLOOR_FRACTION * model.lin.DM.slope * ik : v)),
    sense: '>=',
    rhs: DM_FLOOR_FRACTION * model.lin.DM.base * ik,
  });
  rows.push(roughageRow(model, width, mods.roughage ?? 1));
  const cost = new Array<number>(width).fill(0);
  model.inputs.forEach((inp, i) => {
    cost[i] = inp.priceInrPerKgAsFed;
  });
  rows.push({ coef: cost, sense: '<=', rhs: budget * (mods.budget ?? 1) });
  const capRow = new Array<number>(width).fill(0);
  capRow[n] = 1;
  rows.push({ coef: capRow, sense: '<=', rhs: capMilk * (mods.cap ?? 1) });
  const objective = new Array<number>(width).fill(0);
  objective[n] = 1;
  const res = maximize(objective, rows);
  if (res.status !== 'optimal') return null;
  return { milk: res.x[n], x: res.x.slice(0, n) };
}

/** Stage 2: the cheapest ration at a fixed milk (and, optionally, within a budget). */
function stage2(model: Model, milk: number, budget: number | null): { x: number[]; cost: number } | null {
  const n = model.feeds.length;
  const rows = feedCapRows(model, n, 1);
  for (const k of MIN_NUTRIENTS) {
    rows.push({
      coef: model.per.map((p) => p[MIN_FIELD[k]]),
      sense: '>=',
      rhs: model.lin[k].base + model.lin[k].slope * milk,
    });
  }
  const dmMax = model.lin.DM.base + model.lin.DM.slope * milk;
  rows.push({ coef: model.per.map((p) => p.dm), sense: '<=', rhs: dmMax });
  rows.push({ coef: model.per.map((p) => p.dm), sense: '>=', rhs: DM_FLOOR_FRACTION * dmMax });
  rows.push(roughageRow(model, n, 1));
  const price = model.inputs.map((i) => i.priceInrPerKgAsFed);
  if (budget !== null) rows.push({ coef: price, sense: '<=', rhs: budget });
  const res = maximize(
    price.map((p) => -p),
    rows,
  );
  if (res.status !== 'optimal') return null;
  return { x: res.x, cost: res.x.reduce((s, v, i) => s + v * price[i], 0) };
}

// ---- diagnosis: which nutrient can these feeds not reach at all? -------------------------------------
function maxSupply(nutrient: MinKey, model: Model, dmMax: number): number {
  const items = model.feeds
    .map((feed, i) => {
      const field = nutrient === 'CP' ? 'cpPctDm' : nutrient === 'ME' ? 'meMcalPerKgDm' : nutrient === 'Ca' ? 'caGramsPerKgDm' : 'pGramsPerKgDm';
      const density = field === 'cpPctDm' ? feed.cpPctDm * 10 : feed[field];
      const cap = model.inputs[i].maxKgAsFedPerDay;
      return { density, capDm: cap === null ? Infinity : cap * (feed.dmPct / 100) };
    })
    .sort((a, b) => b.density - a.density);
  let room = dmMax;
  let total = 0;
  for (const it of items) {
    const take = Math.min(room, it.capDm);
    total += take * it.density;
    room -= take;
    if (room <= 0) break;
  }
  return total;
}

/** The highest roughage share of dry matter these feeds allow (0 to 1). */
function maxRoughageShare(model: Model, dmMax: number): number {
  if (model.rough.every((r) => r === 1)) return 1;
  let roughCapDm = 0;
  model.inputs.forEach((inp, i) => {
    if (model.rough[i] !== 1) return;
    roughCapDm += inp.maxKgAsFedPerDay === null ? Infinity : inp.maxKgAsFedPerDay * (model.feeds[i].dmPct / 100);
  });
  if (roughCapDm === 0) return 0;
  return Math.min(1, roughCapDm / (DM_FLOOR_FRACTION * dmMax));
}

/** Nutrients (and the DM intake floor) that the selected feeds cannot meet at this milk, whatever the budget. */
export function limitingAt(animal: AnimalProfile, inputs: SelectedFeedInput[], milk: number): LimitingNutrient[] {
  const model = makeModel(animal, inputs);
  const dmMax = model.lin.DM.base + model.lin.DM.slope * milk;
  const out: LimitingNutrient[] = [];
  for (const k of MIN_NUTRIENTS) {
    const required = model.lin[k].base + model.lin[k].slope * milk;
    const max = maxSupply(k, model, dmMax);
    if (max < required - 1e-6) out.push({ nutrient: k, required, maxSupply: max });
  }
  const capDmTotal = inputs.reduce(
    (s, i, idx) => s + (i.maxKgAsFedPerDay === null ? Infinity : i.maxKgAsFedPerDay * (model.feeds[idx].dmPct / 100)),
    0,
  );
  const share = maxRoughageShare(model, dmMax);
  if (share < ROUGHAGE_MIN_SHARE - 1e-6) {
    out.push({ nutrient: 'roughage', required: ROUGHAGE_MIN_SHARE * 100, maxSupply: share * 100 });
  }
  if (capDmTotal < DM_FLOOR_FRACTION * dmMax - 1e-6) {
    out.push({ nutrient: 'DM', required: DM_FLOOR_FRACTION * dmMax, maxSupply: capDmTotal });
  }
  return out;
}

function suggestFeeds(limiting: LimitingKey[], inputs: SelectedFeedInput[]): FeedSuggestion[] {
  const chosen = new Set(inputs.map((i) => i.feedId));
  const targets: LimitingKey[] = limiting.length > 0 ? limiting.filter((n) => n !== 'DM') : ['CP', 'ME'];
  const byFeed = new Map<string, LimitingKey[]>();
  for (const n of targets) {
    if (n === 'roughage') {
      const rough = FEEDS.filter(
        (f) => !chosen.has(f.id) && isRoughage(f) && f.defaultPriceInrPerKgAsFed !== null && f.defaultPriceInrPerKgAsFed > 0,
      ).sort((a, b) => b.meMcalPerKgDm - a.meMcalPerKgDm)[0];
      if (rough) byFeed.set(rough.id, [...(byFeed.get(rough.id) ?? []), n]);
      continue;
    }
    const field = n === 'CP' ? 'cpPctDm' : n === 'ME' ? 'meMcalPerKgDm' : n === 'Ca' ? 'caGramsPerKgDm' : 'pGramsPerKgDm';
    const best = FEEDS.filter((f) => !chosen.has(f.id)).sort((a, b) => b[field] - a[field])[0];
    if (!best) continue;
    byFeed.set(best.id, [...(byFeed.get(best.id) ?? []), n]);
  }
  return [...byFeed.entries()].slice(0, 3).map(([feedId, nutrients]) => ({ feedId, nutrients }));
}

function infeasible(limiting: LimitingNutrient[], dmConflict: boolean, inputs: SelectedFeedInput[]): InfeasibilityReport {
  return {
    status: 'infeasible',
    limitingNutrients: limiting,
    dmConflict,
    suggestedFeeds: suggestFeeds(limiting.map((l) => l.nutrient), inputs),
    checkedOn: PROTOTYPE_SOLVED_ON,
    sourceKey: 'PROTO-SOLVE-DIAGNOSIS',
  };
}

// ---- AC-E7.1: the budget is below the maintenance cost -----------------------------------------------
function budgetShortfall(
  animal: AnimalProfile,
  inputs: SelectedFeedInput[],
  maintenance: number,
): BudgetShortfallReport {
  const chosen = new Set(inputs.map((i) => i.feedId));
  let fix: { id: string; cost: number } | null = null;
  for (const feed of FEEDS) {
    if (chosen.has(feed.id) || feed.defaultPriceInrPerKgAsFed === null) continue;
    const extra: SelectedFeedInput = {
      feedId: feed.id,
      priceInrPerKgAsFed: feed.defaultPriceInrPerKgAsFed,
      maxKgAsFedPerDay: null,
      currentKgAsFedPerDay: null,
    };
    const withFeed = stage2(makeModel(animal, [...inputs, extra]), 0, null);
    if (withFeed && withFeed.cost <= animal.budgetInrPerDay + 1e-9 && (fix === null || withFeed.cost < fix.cost)) {
      fix = { id: feed.id, cost: withFeed.cost };
    }
  }
  return {
    status: 'budget_below_maintenance',
    verdict: {
      kind: 'budget_below_maintenance',
      maintenanceCostInrPerDay: maintenance,
      budgetInrPerDay: animal.budgetInrPerDay,
    },
    fixFeedId: fix?.id ?? null,
    maintenanceWithFixInrPerDay: fix?.cost ?? null,
    checkedOn: PROTOTYPE_SOLVED_ON,
    sourceKey: 'PROTO-SOLVE-2STAGE',
  };
}

// ---- the public entry point --------------------------------------------------------------------------
const round1 = (n: number) => Math.round(n * 10) / 10;
/** S: Y* rounded down to 0.1 L, so S never exceeds Y* or the cap. */
const floor1 = (n: number) => Math.floor(n * 10 + 1e-7) / 10;

export function todayCostOf(inputs: SelectedFeedInput[]): number | null {
  const entered = inputs.some((i) => i.currentKgAsFedPerDay !== null && i.currentKgAsFedPerDay > 0);
  return entered ? inputs.reduce((s, i) => s + (i.currentKgAsFedPerDay ?? 0) * i.priceInrPerKgAsFed, 0) : null;
}

export function breedOf(animal: AnimalProfile): BreedStandard {
  const breed = breedById(animal.breedId);
  if (!breed) throw new Error(`Unknown breed: ${animal.breedId}`);
  return breed;
}

/** The cap the solver uses (OQ15): an animal already giving more than the cited breed figure has shown it can. */
export function effectiveCap(breedCap: number, todayMilk: number): number {
  return Math.max(breedCap, todayMilk);
}

export function solveRation(animal: AnimalProfile, inputs: SelectedFeedInput[]): RationSolveOutcome {
  if (inputs.length === 0) return infeasible([], true, inputs);
  const breed = breedOf(animal);
  const breedCap = breed.milkCapLPerDay;
  const model = makeModel(animal, inputs);
  const budget = animal.budgetInrPerDay;
  const T = animal.milkYieldLitersPerDay;
  const cap = effectiveCap(breedCap, T);

  // AC-E2.1: can the feeds meet maintenance (0 L/day) at all, whatever the budget?
  const limiting0 = limitingAt(animal, inputs, 0);
  if (limiting0.length > 0) return infeasible(limiting0, false, inputs);
  const maintenance = stage2(model, 0, null);
  if (!maintenance) return infeasible([], true, inputs);

  // AC-E7.1: maintenance is possible, but not within this budget.
  if (budget < maintenance.cost - 1e-9) return budgetShortfall(animal, inputs, maintenance.cost);

  // Stage 1 (skipped for a dry animal): the most milk within the budget and the cap.
  const dry = T <= 0;
  const first = dry ? null : stage1(model, budget, cap);
  if (!dry && !first) return infeasible([], true, inputs);
  const yStar = first ? Math.min(first.milk, cap) : 0;

  // Stage 2: the cheapest ration at S = Y* rounded down to 0.1 (one retry a step lower if rounding noise made it infeasible).
  let S = dry ? 0 : floor1(yStar);
  let second = dry ? maintenance : stage2(model, S, null);
  if (!second && S >= 0.1) {
    S = round1(S - 0.1);
    second = stage2(model, S, null);
  }
  if (!second) return infeasible([], true, inputs);

  const costAtS = second.cost;
  const tight = dry || !first ? [] : tightConstraints(model, budget, cap, yStar, first.x);
  const feedLimitIds = dry || !first ? [] : feedLimits(model, budget, cap, yStar, first.x);

  // Verdict (AC-5.6, 5.7, 5.11, OQ14, OQ15). Stage 2' is the cheapest ration at today's milk; null when the feeds cannot give it.
  const todayCost = todayCostOf(inputs);
  const referenceCost = todayCost ?? budget;
  const atT = dry ? maintenance : stage2(model, T, null);
  const saving = (): number | null => {
    const z = atT ? referenceCost - atT.cost : null;
    return z !== null && z > 0.005 ? z : null;
  };
  let verdict: SolvedVerdict;
  if (dry) {
    verdict = { kind: 'dry_animal' };
  } else {
    const diff = round1(S - T);
    if (diff >= 0.1) verdict = { kind: 'gain', gainLPerDay: diff };
    else if (diff <= -0.1) {
      const named = atT ? [] : limitingAt(animal, inputs, T).map((l) => l.nutrient);
      verdict = {
        kind: 'below_today',
        todayMilkLPerDay: T,
        keepCostInrPerDay: atT ? atT.cost : null,
        limitingNutrients: atT ? [] : named.length > 0 ? named : ['DM'],
      };
    } else if (T > breedCap + 1e-9) verdict = { kind: 'above_breed_level', savingInrPerDay: saving() };
    else if (yStar >= breedCap - 1e-6) verdict = { kind: 'at_breed_level', savingInrPerDay: saving() };
    else verdict = { kind: 'same_as_today' };
  }

  const lines: RationFeedLine[] = inputs
    .map((input, i) => {
      const kg = second.x[i];
      return {
        feedId: input.feedId,
        kgAsFed: kg,
        dmKg: kg * (model.feeds[i].dmPct / 100),
        costInr: kg * input.priceInrPerKgAsFed,
        priceInrPerKg: input.priceInrPerKgAsFed,
        atCap: input.maxKgAsFedPerDay !== null && Math.abs(kg - input.maxKgAsFedPerDay) < 0.005,
      };
    })
    .filter((l) => l.kgAsFed > 1e-6);

  const supplied = suppliedFor(lines.map((l) => ({ feed: FEED_BY_ID.get(l.feedId)!, kg: l.kgAsFed })));
  const req = {
    dmKgPerDay: model.lin.DM.base + model.lin.DM.slope * S,
    cpGramsPerDay: model.lin.CP.base + model.lin.CP.slope * S,
    meMcalPerDay: model.lin.ME.base + model.lin.ME.slope * S,
    caGramsPerDay: model.lin.Ca.base + model.lin.Ca.slope * S,
    pGramsPerDay: model.lin.P.base + model.lin.P.slope * S,
  };
  const coveragePct: Record<NutrientKey, number> = {
    DM: (supplied.dmKgPerDay / req.dmKgPerDay) * 100,
    CP: (supplied.cpGramsPerDay / req.cpGramsPerDay) * 100,
    ME: (supplied.meMcalPerDay / req.meMcalPerDay) * 100,
    Ca: (supplied.caGramsPerDay / req.caGramsPerDay) * 100,
    P: (supplied.pGramsPerDay / req.pGramsPerDay) * 100,
  };
  const barBinding: NutrientKey[] = [];
  if (coveragePct.DM >= 99) barBinding.push('DM');
  for (const n of MIN_NUTRIENTS) if (coveragePct[n] <= 101) barBinding.push(n);

  const roughDm = lines.reduce((sum, l) => sum + (isRoughage(FEED_BY_ID.get(l.feedId)!) ? l.dmKg : 0), 0);
  const totalDm = lines.reduce((sum, l) => sum + l.dmKg, 0);

  const bindingConstraint: BindingConstraint =
    tight[0] ?? (MIN_NUTRIENTS.find((n) => coveragePct[n] <= 100.5) as BindingConstraint | undefined) ?? 'intake';

  return {
    status: 'optimal',
    supportedMilkLPerDay: S,
    milkCapLPerDay: breedCap,
    effectiveCapLPerDay: cap,
    bindingConstraint,
    tightConstraints: tight,
    feedLimitIds,
    verdict,
    costAtTodayMilkInrPerDay: atT ? atT.cost : null,
    fatComparison:
      T > 0 ? { todayFatPct: animal.milkFatPct, breedFatPct: breed.fatPct, breedFatPctHigh: breed.fatPctHigh } : null,
    maintenanceCostInrPerDay: maintenance.cost,
    budgetInrPerDay: budget,
    feeds: lines,
    totalKgAsFed: lines.reduce((s, l) => s + l.kgAsFed, 0),
    totalCostInr: lines.reduce((s, l) => s + l.costInr, 0),
    supplied,
    coveragePct,
    bindingConstraints: barBinding,
    roughageSharePct: totalDm > 0 ? (roughDm / totalDm) * 100 : 0,
    roughageMinSharePct: ROUGHAGE_MIN_SHARE * 100,
    currentCostInr: todayCost,
    savingsInr: todayCost === null ? null : todayCost - costAtS,
    savingsPct: todayCost === null || todayCost === 0 ? null : ((todayCost - costAtS) / todayCost) * 100,
    solvedOn: PROTOTYPE_SOLVED_ON,
    sourceKey: 'PROTO-SOLVE-2STAGE',
  } satisfies RationSolution;
}

/**
 * A constraint is tight when relaxing it by 1% raises Y* (or it is exactly met).
 * Order: budget, breed cap, intake, nutrients, roughage minimum.
 */
function tightConstraints(model: Model, budget: number, cap: number, yStar: number, x: number[]): BindingConstraint[] {
  const raises = (mods: Mods) => {
    const r = stage1(model, budget, cap, mods);
    return r !== null && r.milk > yStar + 1e-6;
  };
  const spent = x.reduce((sum, v, i) => sum + v * model.inputs[i].priceInrPerKgAsFed, 0);
  const out: BindingConstraint[] = [];
  if (spent >= budget * (1 - 1e-6) || raises({ budget: 1.01 })) out.push('budget');
  if (yStar >= cap - 1e-6 || raises({ cap: 1.01 })) out.push('breed_cap');
  if (raises({ intake: 1.01 })) out.push('intake');
  for (const k of MIN_NUTRIENTS) if (raises({ need: { [k]: 0.99 } })) out.push(k);
  if (raises({ roughage: 0.9 })) out.push('roughage');
  return out;
}

/** Feeds on their own max kg/day cap when lifting the caps would raise Y*. */
function feedLimits(model: Model, budget: number, cap: number, yStar: number, x: number[]): string[] {
  const relaxed = stage1(model, budget, cap, { feedCaps: 1.01 });
  if (!relaxed || relaxed.milk <= yStar + 1e-6) return [];
  return model.inputs.flatMap((inp, i) =>
    inp.maxKgAsFedPerDay !== null && x[i] >= inp.maxKgAsFedPerDay - 1e-6 ? [inp.feedId] : [],
  );
}
