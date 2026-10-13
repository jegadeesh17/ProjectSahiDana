// Live v1 adapter: cited v1 feed & breed libraries (ICAR 2013 / NDDB / INAPH / DAHD),
// cited nutrient requirements (ICAR 2013 / NRC 2001 / NASEM 2021), and the two-stage browser LP solver.
import breedsV1 from '../data/breeds.v1.json';
import feedsV1 from '../data/feeds.v1.json';
import lexicon from '../data/prototypeLexicon.json';
import { breedLabel } from '../domain/breeds';
import { computeRequirements } from '../domain/requirements';
import { solveRation as solveV1Ration } from '../domain/solver';
import type {
  AnimalProfile,
  BreedStandard,
  ExplanationRequestContext,
  ExtractionResponse,
  FeedItem,
  LlmErrorCode,
  RationAppAdapter,
  RationSolveOutcome,
  SelectedFeedInput,
  VerifiedExplanationResult,
} from '../domain/types';
import { LlmError } from '../domain/types';
import { verdictText } from '../domain/verdict';
import { buildTemplateExplanation, countNumericTokens } from '../domain/verifier';
import {
  formatInr,
  formatKg,
  formatLitres,
  formatPct,
  naturalDecimals,
  parseDecimal,
  toLatinDigits,
} from '../i18n/format';
import { mockControls, type MockLlmMode } from './mockAdapter';

export const LIVE_FEEDS: FeedItem[] = feedsV1 as unknown as FeedItem[];
export const LIVE_BREEDS: BreedStandard[] = breedsV1 as unknown as BreedStandard[];

export { computeRequirements };

export function solveRation(
  animal: AnimalProfile,
  selectedFeeds: SelectedFeedInput[],
): RationSolveOutcome {
  return solveV1Ration(animal, selectedFeeds, LIVE_FEEDS, LIVE_BREEDS);
}

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

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nfc = (s: string) => s.normalize('NFC');

function numberBefore(text: string, words: string[]): number | null {
  const re = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:${words.map((w) => escapeRe(nfc(w))).join('|')})`, 'i');
  const m = re.exec(text);
  return m ? parseDecimal(m[1]) : null;
}

const EXTRA_FEED_ALIASES: Record<string, string[]> = {
  de_oiled_rice_bran: (lexicon.feedAliases as Record<string, string[]>).rice_bran_dorb ?? ['rice bran', 'dorb'],
  paddy_straw: ['paddy straw', 'rice straw', 'parali', 'pual'],
  rice_polish: ['rice polish', 'kura'],
  urea: ['urea', 'yuriya'],
};

function parseDescription(raw: string): ExtractionResponse {
  const text = nfc(toLatinDigits(raw)).toLowerCase();
  const hasAny = (words: string[]) => words.some((w) => text.includes(nfc(w).toLowerCase()));
  const species = hasAny(lexicon.species.buffalo) ? 'buffalo' : hasAny(lexicon.species.cow) ? 'cow' : null;
  const weight = numberBefore(text, lexicon.kgWords);
  const milk = numberBefore(text, lexicon.litreWords);
  const fatMatch = /(\d+(?:\.\d+)?)\s*%/.exec(text);
  const fat = fatMatch ? parseDecimal(fatMatch[1]) : null;
  if (species === null || weight === null) throw new LlmError('INVALID_REQUEST');

  // Breed: longest matching name from LIVE_BREEDS for this species (AC-2.3: never cross-species).
  let breedId: string | null = null;
  let breedLen = 0;
  for (const b of LIVE_BREEDS.filter((x) => x.species === species && x.capBasis !== 'dahd_average')) {
    for (const name of [b.englishName, b.localNameLatn, b.localNameDeva]) {
      const n = name ? nfc(name).toLowerCase() : '';
      if (n.length > breedLen && text.includes(n)) {
        breedId = b.id;
        breedLen = n.length;
      }
    }
  }

  const budgetMatch = new RegExp(
    `(?:${lexicon.budgetWords.map((w) => escapeRe(nfc(w))).join('|')})[^\\d]{0,24}(\\d+(?:\\.\\d+)?)`,
    'i',
  ).exec(text);
  const budget = budgetMatch ? parseDecimal(budgetMatch[1]) : null;

  const matched: string[] = [];
  let remaining = text;
  const aliasTable = lexicon.feedAliases as Record<string, string[]>;
  for (const feed of LIVE_FEEDS) {
    const generated = [
      feed.englishName.replace(/\s*\(.*\)/, ''),
      ...(feed.localNameLatn ?? '').split(' / '),
      feed.localNameDeva ?? '',
    ].filter((a) => a.length >= 4);
    const aliases = [...(aliasTable[feed.id] ?? []), ...(EXTRA_FEED_ALIASES[feed.id] ?? []), ...generated]
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
    modelUsed: 'live-local-v1 (browser adapter)',
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
  return parseDescription(freeText);
}

function explanationTextFor(ctx: ExplanationRequestContext): string {
  const { animal, solution, feeds } = ctx;
  const breed = LIVE_BREEDS.find((x) => x.id === animal.breedId);
  const parts = solution.feeds.map((l) => {
    const feed = feeds.find((f) => f.id === l.feedId) ?? LIVE_FEEDS.find((f) => f.id === l.feedId)!;
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
  text += `In short: ${verdictText(solution.verdict, animal.milkYieldLitersPerDay, solution.supportedMilkLPerDay).en.replace(/\.$/, '')}.`;
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
    modelUsed: 'live-local-v1 (browser adapter)',
  };
}

export const liveAdapter: RationAppAdapter = {
  getFeedLibrary: async () => LIVE_FEEDS,
  getBreedLibrary: async () => LIVE_BREEDS,
  computeRequirements,
  solveRation,
  extractFromText,
  explainRation,
};
