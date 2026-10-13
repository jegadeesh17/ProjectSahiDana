// Client-side explanation number verifier, Devanagari language gate, authorized number collector,
// and deterministic bilingual template (ARCHITECTURE.md §"3. Client-side number verifier", SPEC AC-7.1, AC-E6.1, AC-L1.3, AC-L1.6).
import { formatInr, formatKg, formatLitres, formatNumber, formatPct, naturalDecimals } from '../i18n/format';
import { t } from '../i18n/strings';
import type { BiText } from '../i18n/strings';
import { breedById } from './breeds';
import { feedNameBi } from './feedNames';
import { NUTRIENT_KEYS } from './types';
import type { ExplanationRequestContext, NutrientVector } from './types';
import { litres1, verdictText } from './verdict';

export interface AuthorizedNumber {
  label: string;
  value: number;
  formatted: string;
}

export interface VerifyExplanationOptions {
  /**
   * When true, Devanagari script prose (U+0900..U+097F except Devanagari digits U+0966..U+096F)
   * is permitted so the Hindi deterministic template half can be number-verified.
   * Defaults to false (strict English-only gate for LLM explanations per AC-L1.6).
   */
  allowDevanagari?: boolean;
}

export interface ExplanationVerificationResult {
  status: 'verified' | 'unverified';
  ok: boolean;
  verifiedCount: number;
  flaggedNumbers: string[];
  hasDevanagari: boolean;
  languageGatePassed: boolean;
  reason?: 'devanagari' | 'untraced_numbers';
  badge:
    | { id: 'badge_all_verified'; params: { n: number } }
    | { id: 'badge_template_fallback' };
}

const DEVANAGARI_RE = /[\u0900-\u097F]/;
const DEVANAGARI_DIGIT_RE = /[\u0966-\u096F]/;
const NUMERIC_TOKEN_RE = /\d[\d,]*(?:\.\d+)?/g;

function roundTo(value: number, decimals: 0 | 1 | 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Math.sign(value) * 1e-12) * factor) / factor;
}

function addNutrientVectorNumbers(
  prefix: string,
  vec: NutrientVector | undefined,
  push: (label: string, value: number | null | undefined, decimals: 0 | 1 | 2) => void,
): void {
  if (!vec) return;
  push(`${prefix} DM (kg/day)`, vec.dmKgPerDay, 2);
  push(`${prefix} CP (g/day)`, vec.cpGramsPerDay, 0);
  push(`${prefix} ME (Mcal/day)`, vec.meMcalPerDay, 2);
  push(`${prefix} Ca (g/day)`, vec.caGramsPerDay, 1);
  push(`${prefix} P (g/day)`, vec.pGramsPerDay, 1);
}

/**
 * Gathers all numeric values displayed or used in the run (ARCHITECTURE.md §"Request B: ration explanation"):
 * animal inputs, breed figures, nutrient requirements at S, and solver outputs (S, effectiveCap, M, B, X, Z,
 * totals, budget/today comparisons, roughage shares, per-feed amounts/costs/prices, supplied nutrients, coveragePct).
 */
export function collectAuthorizedNumbers(context: ExplanationRequestContext): AuthorizedNumber[] {
  const { animal, requirement, solution, feeds } = context;
  const result: AuthorizedNumber[] = [];

  const push = (label: string, value: number | null | undefined, decimals: 0 | 1 | 2) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return;
    result.push({
      label,
      value,
      formatted: formatNumber(value, decimals),
    });
  };

  // 1. Animal inputs
  push('Body weight (kg)', animal.bodyWeightKg, 0);
  push("Today's milk (L/day)", animal.milkYieldLitersPerDay, naturalDecimals(animal.milkYieldLitersPerDay));
  push("Today's fat (%)", animal.milkFatPct, 1);
  push('Budget (INR/day)', animal.budgetInrPerDay, 2);
  if (solution.budgetInrPerDay !== animal.budgetInrPerDay) {
    push('Solver budget (INR/day)', solution.budgetInrPerDay, 2);
  }
  if (solution.referenceCostInrPerDay !== undefined) {
    push('Reference cost (INR/day)', solution.referenceCostInrPerDay, 2);
  }

  // 2. Breed figures (milkCapLPerDay, fatPctLow, fatPctHigh)
  const breed = breedById(animal.breedId);
  push('Breed milk cap (L/day)', solution.milkCapLPerDay, 2);
  if (breed && breed.milkCapLPerDay !== solution.milkCapLPerDay) {
    push(`${breed.englishName} milk cap (L/day)`, breed.milkCapLPerDay, 2);
  }
  const fatPctLow =
    solution.fatComparison?.breedFatPctLow ??
    solution.fatComparison?.breedFatPct ??
    breed?.fatPctLow ??
    breed?.fatPct ??
    null;
  const fatPctHigh = solution.fatComparison?.breedFatPctHigh ?? breed?.fatPctHigh ?? null;
  if (fatPctLow !== null && Number.isFinite(fatPctLow)) {
    push('Breed fat low (%)', fatPctLow, naturalDecimals(fatPctLow));
  }
  if (fatPctHigh !== null && Number.isFinite(fatPctHigh) && fatPctHigh !== fatPctLow) {
    push('Breed fat high (%)', fatPctHigh, naturalDecimals(fatPctHigh));
  }

  // 3. Nutrient requirements at S (and requirement context)
  addNutrientVectorNumbers('Required at S', solution.requirementsAtS, push);
  addNutrientVectorNumbers('Required', requirement?.requirements, push);

  // 4. Solver outputs
  push('Supported milk (L/day)', solution.supportedMilkLPerDay, 1);
  push('Effective milk cap (L/day)', solution.effectiveCapLPerDay, 2);
  push('Maintenance cost (INR/day)', solution.maintenanceCostInrPerDay, 2);
  push("Cost at today's milk (INR/day)", solution.costAtTodayMilkInrPerDay, 2);

  // Verdict figures (X, Z, B)
  const verdict = solution.verdict;
  if (verdict.kind === 'gain') {
    push('Milk possible above today (L/day)', verdict.gainLPerDay, 1);
  } else if (verdict.kind === 'at_breed_level' || verdict.kind === 'above_breed_level') {
    push('Saving for the same milk (INR/day)', verdict.savingInrPerDay, 2);
  } else if (verdict.kind === 'below_today') {
    push('Keep today milk cost (INR/day)', verdict.keepCostInrPerDay ?? verdict.costToKeepTodayInrPerDay ?? null, 2);
    push('Today milk in verdict (L/day)', verdict.todayMilkLPerDay, naturalDecimals(verdict.todayMilkLPerDay));
  }

  // Ration totals & cost comparisons
  push('Total as fed (kg/day)', solution.totalKgAsFed, 2);
  push('Total cost (INR/day)', solution.totalCostInr, 2);
  const underBudget =
    solution.underBudgetInr !== undefined
      ? solution.underBudgetInr
      : animal.budgetInrPerDay - solution.totalCostInr;
  push('Under budget (INR/day)', underBudget, 2);
  push("Today's ration cost (INR/day)", solution.currentCostInr, 2);
  if (solution.savingsInr !== null && Number.isFinite(solution.savingsInr)) {
    push('Savings vs today (INR/day)', solution.savingsInr, 2);
    if (solution.savingsInr < 0) {
      push('Extra cost vs today (INR/day)', Math.abs(solution.savingsInr), 2);
    }
  }
  if (solution.savingsPct !== null && Number.isFinite(solution.savingsPct)) {
    push('Savings vs today (%)', solution.savingsPct, 1);
    if (solution.savingsPct < 0) {
      push('Extra cost vs today (%)', Math.abs(solution.savingsPct), 1);
    }
  }

  // Roughage share figures
  push('Roughage share of DM (%)', solution.roughageSharePct, 0);
  push('Minimum roughage share of DM (%)', solution.roughageMinSharePct, 0);

  // Per-feed amounts, costs, and prices
  for (const line of solution.feeds) {
    const feed = feeds.find((f) => f.id === line.feedId);
    const name = feed ? feed.englishName : line.feedId;
    push(`${name} (kg/day as fed)`, line.kgAsFed, 2);
    push(`${name} cost (INR/day)`, line.costInr, 2);
    push(`${name} price (INR/kg)`, line.priceInrPerKg, 2);
    push(`${name} DM (kg/day)`, line.dmKg, 2);
  }

  // Supplied nutrients
  addNutrientVectorNumbers('Supplied', solution.supplied, push);

  // Coverage percentages
  for (const key of NUTRIENT_KEYS) {
    push(`Coverage ${key} (%)`, solution.coveragePct[key], 0);
  }

  return result;
}

/**
 * Checks whether a single numeric value `v` is authorized by set `A` within
 * `|v - a| <= max(0.05, 0.01 * |a|)` or matching `round(a, d)` at `d in {0, 1, 2}`.
 */
export function isAuthorizedNumber(v: number, authorizedValues: readonly number[]): boolean {
  if (!Number.isFinite(v)) return false;
  for (const a of authorizedValues) {
    if (!Number.isFinite(a)) continue;
    const tol = Math.max(0.05, 0.01 * Math.abs(a));
    if (Math.abs(v - a) <= tol + 1e-9) {
      return true;
    }
    for (const d of [0, 1, 2] as const) {
      if (Math.abs(v - roundTo(a, d)) <= 1e-9) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Verifies an explanation string against the language gate and authorized number set (SPEC AC-7.1, AC-E6.1, AC-L1.3, AC-L1.6).
 * 1. Language gate: any Devanagari character (U+0900..U+097F) fails verification unless `options.allowDevanagari` is set
 *    (and Devanagari digits U+0966..U+096F always fail per AC-L1.3).
 * 2. Number gate: parses every numeric token and checks it against `authorizedNumbers`.
 */
export function verifyExplanationNumbers(
  explanationText: string,
  authorizedNumbers: ReadonlyArray<AuthorizedNumber | number>,
  options?: VerifyExplanationOptions,
): ExplanationVerificationResult {
  const hasDevanagari = DEVANAGARI_RE.test(explanationText);
  const hasDevanagariDigits = DEVANAGARI_DIGIT_RE.test(explanationText);
  const languageGatePassed = options?.allowDevanagari ? !hasDevanagariDigits : !hasDevanagari;

  const authValues = authorizedNumbers
    .map((entry) => (typeof entry === 'number' ? entry : entry.value))
    .filter((val) => Number.isFinite(val));

  const tokens = explanationText.match(NUMERIC_TOKEN_RE) ?? [];
  let verifiedCount = 0;
  const flaggedNumbers: string[] = [];

  for (const token of tokens) {
    const cleaned = token.replace(/,/g, '');
    const numeric = Number(cleaned);
    if (isAuthorizedNumber(numeric, authValues)) {
      verifiedCount += 1;
    } else if (!flaggedNumbers.includes(token)) {
      flaggedNumbers.push(token);
    }
  }

  if (!languageGatePassed) {
    return {
      status: 'unverified',
      ok: false,
      verifiedCount,
      flaggedNumbers,
      hasDevanagari,
      languageGatePassed: false,
      reason: 'devanagari',
      badge: { id: 'badge_template_fallback' },
    };
  }

  if (flaggedNumbers.length > 0) {
    return {
      status: 'unverified',
      ok: false,
      verifiedCount,
      flaggedNumbers,
      hasDevanagari,
      languageGatePassed: true,
      reason: 'untraced_numbers',
      badge: { id: 'badge_template_fallback' },
    };
  }

  return {
    status: 'verified',
    ok: true,
    verifiedCount,
    flaggedNumbers: [],
    hasDevanagari,
    languageGatePassed: true,
    badge: { id: 'badge_all_verified', params: { n: verifiedCount } },
  };
}

/** One BiText line per sentence; every number comes from solver output, inputs or cited rows. */
export function buildTemplateExplanation(context: ExplanationRequestContext): BiText[] {
  const { animal, solution, feeds } = context;
  const lines: BiText[] = [];
  lines.push(
    t('template_animal', {
      species: t(animal.species === 'cow' ? 'label_cow' : 'label_buffalo'),
      weight: formatKg(animal.bodyWeightKg, 0),
      milk: formatLitres(animal.milkYieldLitersPerDay, naturalDecimals(animal.milkYieldLitersPerDay)),
      fat: formatPct(animal.milkFatPct, 1),
    }),
  );
  lines.push(
    t('template_supported', {
      budget: formatInr(animal.budgetInrPerDay),
      milk: litres1(solution.supportedMilkLPerDay),
      cap: formatLitres(solution.milkCapLPerDay, 2),
    }),
  );
  lines.push(
    t('template_verdict', {
      verdict: verdictText(solution.verdict, animal.milkYieldLitersPerDay, solution.supportedMilkLPerDay),
    }),
  );
  for (const line of solution.feeds) {
    const feed = feeds.find((f) => f.id === line.feedId);
    if (!feed) continue;
    lines.push(
      t('template_feed_line', { feed: feedNameBi(feed), kg: formatKg(line.kgAsFed), cost: formatInr(line.costInr) }),
    );
  }
  lines.push(t('template_total', { cost: formatInr(solution.totalCostInr) }));
  lines.push(
    t('template_coverage', {
      cp: formatPct(solution.coveragePct.CP, 0),
      me: formatPct(solution.coveragePct.ME, 0),
      ca: formatPct(solution.coveragePct.Ca, 0),
      p: formatPct(solution.coveragePct.P, 0),
      dm: formatPct(solution.coveragePct.DM, 0),
    }),
  );
  if (solution.savingsInr !== null && solution.savingsPct !== null && solution.savingsInr > 0) {
    lines.push(
      t('template_savings', {
        amount: formatInr(solution.savingsInr),
        pct: formatPct(solution.savingsPct, 1),
      }),
    );
  }
  lines.push(t('template_source'));
  return lines;
}

/** Numeric tokens in an explanation string, as the verifier counts them. */
export function countNumericTokens(text: string): number {
  return (text.match(NUMERIC_TOKEN_RE) ?? []).length;
}
