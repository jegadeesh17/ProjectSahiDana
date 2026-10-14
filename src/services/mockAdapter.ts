// Prototype mock adapter: deterministic fixtures behind the RationAppAdapter interface.
// NOT the cited library and NOT the live solver: every value carries a PROTO-* source key (see FeedItem.sourceKey).
// The two-stage solve lives in mockSolver.ts. The live adapter (browser LP solver + /api/llm) replaces this in M1-M3
// without touching components.
import lexicon from '../data/prototypeLexicon.json';
import { BREEDS, breedLabel } from '../domain/breeds';
import type {
  AnimalProfile,
  ExplanationRequestContext,
  ExtractionResponse,
  LlmErrorCode,
  NutrientKey,
  RationAppAdapter,
  RequirementResult,
  VerifiedExplanationResult,
} from '../domain/types';
import { LlmError } from '../domain/types';
import { verdictText } from '../domain/verdict';
import { buildTemplateExplanation, countNumericTokens } from '../domain/verifier';
import { formatInr, formatKg, formatLitres, formatNumber, formatPct, naturalDecimals, parseDecimal, toLatinDigits } from '../i18n/format';
import { FEEDS, PROTOTYPE_SOLVED_ON, requirementLinear, solveRation } from './mockSolver';

export { FEEDS, PROTOTYPE_SOLVED_ON, solveRation };
export const PROTOTYPE_BREEDS = BREEDS;
const FIXTURE_DOC = 'PROTOTYPE FIXTURE: placeholder formula, not an ICAR or NASEM table';

// ---- reviewer-controlled behaviour ("Prototype states" strip) -----------------------------------
export type MockLlmMode = 'ok' | 'upstream_error' | 'rate_limited' | 'timeout';
export type MockExplainMode = 'verified' | 'regenerated' | 'fallback_untraced';
export interface MockBehavior {
  llm: MockLlmMode;
  explain: MockExplainMode;
  latencyMs: number;
}
export const mockControls: { behavior: MockBehavior } = {
  behavior: { llm: 'ok', explain: 'verified', latencyMs: 900 },
};
const LLM_MODE_CODE: Record<Exclude<MockLlmMode, 'ok'>, LlmErrorCode> = {
  upstream_error: 'UPSTREAM_ERROR',
  rate_limited: 'RATE_LIMITED',
  timeout: 'TIMEOUT',
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(id);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

// ---- requirements (placeholder formulas, flagged as fixtures) ---------------------------------------
export function computeRequirements(animal: AnimalProfile): RequirementResult {
  const w = animal.bodyWeightKg;
  const milk = animal.milkYieldLitersPerDay;
  const fat = animal.milkFatPct;
  const lin = requirementLinear(animal);
  const at = (k: NutrientKey) => lin[k].base + lin[k].slope * milk;

  const cite = (key: string, formula: string, m: number, l: number) => ({
    sourceDoc: FIXTURE_DOC,
    sourceTable: 'n/a (fixture)',
    sourcePage: 'n/a (fixture)',
    formulaDisplay: formula,
    maintenancePart: m,
    lactationPart: l,
    provenanceStatus: 'team-asserted' as const,
    verifiedOn: null,
    sourceKey: `PROTO-REQ-${key}`,
  });
  const n = (v: number, d: 0 | 1 | 2) => formatNumber(v, d);
  const part = (k: NutrientKey) => lin[k].slope * milk;

  return {
    requirements: {
      dmKgPerDay: at('DM'),
      cpGramsPerDay: at('CP'),
      meMcalPerDay: at('ME'),
      caGramsPerDay: at('Ca'),
      pGramsPerDay: at('P'),
    },
    citations: {
      DM: cite('DM', `0.022 × ${n(w, 0)} kg + 0.4 × ${n(milk, 1)} L = ${n(at('DM'), 2)} kg DM`, lin.DM.base, part('DM')),
      CP: cite('CP', `5 × ${n(w, 0)}^0.75 + ${n(milk, 1)} L × (55 + 8 × ${n(fat, 1)}%) = ${n(lin.CP.base, 0)} + ${n(part('CP'), 0)} g`, lin.CP.base, part('CP')),
      ME: cite('ME', `0.133 × ${n(w, 0)}^0.75 + ${n(milk, 1)} L × (0.9 + 0.19 × ${n(fat, 1)}%) = ${n(lin.ME.base, 1)} + ${n(part('ME'), 1)} Mcal`, lin.ME.base, part('ME')),
      Ca: cite('Ca', `0.04 × ${n(w, 0)} kg + ${n(milk, 1)} L × (1.9 + 0.2 × ${n(fat, 1)}%) = ${n(lin.Ca.base, 1)} + ${n(part('Ca'), 1)} g`, lin.Ca.base, part('Ca')),
      P: cite('P', `0.03 × ${n(w, 0)} kg + ${n(milk, 1)} L × (1.1 + 0.1 × ${n(fat, 1)}%) = ${n(lin.P.base, 1)} + ${n(part('P'), 1)} g`, lin.P.base, part('P')),
    },
  };
}

// ---- extraction (rule-based stand-in for the LLM; reads lexicon JSON so Devanagari stays out of code) --
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nfc = (s: string) => s.normalize('NFC');

function numberBefore(text: string, words: string[]): number | null {
  const re = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:${words.map((w) => escapeRe(nfc(w))).join('|')})`, 'i');
  const m = re.exec(text);
  return m ? parseDecimal(m[1]) : null;
}

function parseDescription(raw: string): ExtractionResponse {
  const text = nfc(toLatinDigits(raw)).toLowerCase();
  const hasAny = (words: string[]) => words.some((w) => text.includes(nfc(w).toLowerCase()));
  const species = hasAny(lexicon.species.buffalo) ? 'buffalo' : hasAny(lexicon.species.cow) ? 'cow' : null;
  const weight = numberBefore(text, lexicon.kgWords);
  const milk = numberBefore(text, lexicon.litreWords);
  const fatMatch = /(\d+(?:\.\d+)?)\s*%/.exec(text);
  const fat = fatMatch ? parseDecimal(fatMatch[1]) : null;
  if (species === null || weight === null) throw new LlmError('INVALID_REQUEST');

  // Breed: the longest name from the table for this species that appears in the text (AC-2.3).
  let breedId: string | null = null;
  let breedLen = 0;
  for (const b of BREEDS.filter((x) => x.species === species && x.capBasis !== 'dahd_average')) {
    for (const name of [b.englishName, b.localNameLatn, b.localNameDeva]) {
      const n = name ? nfc(name).toLowerCase() : '';
      if (n.length > breedLen && text.includes(n)) {
        breedId = b.id;
        breedLen = n.length;
      }
    }
  }

  // Budget: a number right after "budget" (or its Hindi word), in rupees per day.
  const budgetMatch = new RegExp(`(?:${lexicon.budgetWords.map((w) => escapeRe(nfc(w))).join('|')})[^\d]{0,24}(\d+(?:\.\d+)?)`, 'i').exec(text);
  const budget = budgetMatch ? parseDecimal(budgetMatch[1]) : null;

  const matched: string[] = [];
  let remaining = text;
  for (const feed of FEEDS) {
    const generated = [feed.englishName.replace(/s*(.*)/, ''), ...(feed.localNameLatn ?? '').split(' / '), feed.localNameDeva ?? ''].filter(
      (a) => a.length >= 4,
    );
    const aliases = [...((lexicon.feedAliases as Record<string, string[]>)[feed.id] ?? []), ...generated]
      .map((a) => nfc(a).toLowerCase())
      .sort((a, b) => b.length - a.length);
    const hit = aliases.find((a) => remaining.includes(a));
    if (hit) {
      matched.push(feed.id);
      remaining = remaining.split(hit).join(' ');
    }
  }

  const unmatched: string[] = [];
  const seps = new RegExp(lexicon.separators.map((s) => escapeRe(nfc(s))).join('|'), 'i');
  for (const segment of text.split(seps)) {
    const hint = lexicon.unmatchedHints.find((h) => segment.includes(h));
    if (!hint) continue;
    let name = segment.trim();
    for (const article of lexicon.articles) if (name.startsWith(article)) name = name.slice(article.length);
    if (name.length > 0 && !unmatched.includes(name)) unmatched.push(name);
  }

  return {
    action: 'extract',
    modelUsed: 'prototype-fixture (no real model call)',
    animal: {
      species,
      bodyWeightKg: weight,
      milkYieldLitersPerDay: milk ?? 0,
      milkFatPct: fat ?? (species === 'cow' ? 4 : 6),
    },
    matchedFeeds: matched.map((feedId) => ({ feedId, priceInrPerKgAsFed: null, maxKgAsFedPerDay: null })),
    breedId,
    budgetInrPerDay: budget !== null && Number.isFinite(budget) ? budget : null,
    unmatchedFeeds: unmatched,
  };
}

async function extractFromText(freeText: string, options?: { signal?: AbortSignal }): Promise<ExtractionResponse> {
  await sleep(mockControls.behavior.latencyMs, options?.signal);
  const mode = mockControls.behavior.llm;
  if (mode !== 'ok') throw new LlmError(LLM_MODE_CODE[mode]);
  const result = parseDescription(freeText);
  // Values outside the form ranges are passed on as-is; the form validates them (E1).
  return result;
}

// ---- explanation -------------------------------------------------------------------------------------
function explanationTextFor(ctx: ExplanationRequestContext): string {
  const { animal, solution, feeds } = ctx;
  const breed = BREEDS.find((x) => x.id === animal.breedId);
  const parts = solution.feeds.map((l) => {
    const feed = feeds.find((f) => f.id === l.feedId)!;
    return `${formatKg(l.kgAsFed)} of ${feed.englishName}`;
  });
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
  const species = animal.species === 'cow' ? 'cow' : 'buffalo';
  const breedName = breed && breed.capBasis !== 'dahd_average' ? `${breedLabel(breed, 'en')} ` : '';
  const today = formatLitres(animal.milkYieldLitersPerDay, naturalDecimals(animal.milkYieldLitersPerDay));
  if (solution.verdict.kind === 'dry_animal') {
    return (
      `For your ${formatKg(animal.bodyWeightKg, 0)} ${breedName}${species}, which is dry, the cheapest maintenance ration is ${list} each day, as fed. ` +
      `It costs ${formatInr(solution.totalCostInr)} per day and covers ${formatPct(solution.coveragePct.CP, 0)} of the crude protein and ${formatPct(solution.coveragePct.ME, 0)} of the metabolizable energy needed. ` +
      `In short: ${verdictText(solution.verdict, 0, 0).en}.`
    );
  }
  let text =
    `For your ${formatKg(animal.bodyWeightKg, 0)} ${breedName}${species} giving ${today} of milk a day at ${formatPct(animal.milkFatPct, 1)} fat, ` +
    `a budget of ${formatInr(animal.budgetInrPerDay)} per day supports ${formatLitres(solution.supportedMilkLPerDay, 1)} of milk a day, ` +
    `never above the cap of ${formatLitres(solution.effectiveCapLPerDay, 2)}. ` +
    `The cheapest ration for that milk is ${list} each day, as fed. ` +
    `It costs ${formatInr(solution.totalCostInr)} per day and covers ${formatPct(solution.coveragePct.CP, 0)} of the crude protein and ${formatPct(solution.coveragePct.ME, 0)} of the metabolizable energy needed. `;
  text += `In short: ${verdictText(solution.verdict, animal.milkYieldLitersPerDay, solution.supportedMilkLPerDay).en.replace(/.$/, '')}.`;
  if (solution.savingsInr !== null && solution.savingsPct !== null && solution.savingsInr > 0 && solution.currentCostInr !== null) {
    text += ` Compared with today’s ration at ${formatInr(solution.currentCostInr)} per day, this saves ${formatInr(solution.savingsInr)} per day (${formatPct(solution.savingsPct, 1)}).`;
  }
  return text;
}

async function explainRation(
  context: ExplanationRequestContext,
  options?: { signal?: AbortSignal },
): Promise<VerifiedExplanationResult> {
  await sleep(mockControls.behavior.latencyMs, options?.signal);
  const { llm, explain } = mockControls.behavior;
  if (llm !== 'ok') {
    return {
      status: 'deterministic_fallback',
      template: buildTemplateExplanation(context),
      badge: { id: 'badge_template_fallback' },
      reason: 'llm_error',
      errorCode: LLM_MODE_CODE[llm],
      flaggedNumbers: [],
    };
  }
  if (explain === 'fallback_untraced') {
    return {
      status: 'deterministic_fallback',
      template: buildTemplateExplanation(context),
      badge: { id: 'badge_template_fallback' },
      reason: 'untraced_numbers',
      errorCode: null,
      flaggedNumbers: ['31.7'],
    };
  }
  const text = explanationTextFor(context);
  return {
    status: 'verified',
    explanationText: text,
    verifiedCount: countNumericTokens(text),
    badge: { id: 'badge_all_verified', params: { n: countNumericTokens(text) } },
    flaggedNumbers: explain === 'regenerated' ? ['9.5'] : [],
    modelUsed: 'prototype-fixture (no real model call)',
  };
}

export const mockAdapter: RationAppAdapter = {
  getFeedLibrary: async () => FEEDS,
  getBreedLibrary: async () => BREEDS,
  computeRequirements,
  solveRation,
  extractFromText,
  explainRation,
};
