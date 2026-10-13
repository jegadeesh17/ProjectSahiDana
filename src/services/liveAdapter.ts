// Live v1 adapter: cited v1 feed & breed libraries (ICAR 2013 / NDDB / INAPH / DAHD),
// cited nutrient requirements (ICAR 2013 / NRC 2001 / NASEM 2021), the two-stage browser LP solver,
// and online POST /api/llm integration with client-side explanation number verification (M2-TASK-03).
import breedsV1 from '../data/breeds.v1.json';
import feedsV1 from '../data/feeds.v1.json';
import { computeRequirements } from '../domain/requirements';
import { solveRation as solveV1Ration } from '../domain/solver';
import type {
  AnimalProfile,
  BreedStandard,
  ExplanationRequestContext,
  ExtractedFeed,
  ExtractionResponse,
  FeedItem,
  LlmErrorCode,
  RationAppAdapter,
  RationSolveOutcome,
  SelectedFeedInput,
  Species,
  VerifiedExplanationResult,
} from '../domain/types';
import { LlmError } from '../domain/types';
import {
  buildTemplateExplanation,
  collectAuthorizedNumbers,
  verifyExplanationNumbers,
} from '../domain/verifier';
import { toLatinDigits } from '../i18n/format';

export const LIVE_FEEDS: FeedItem[] = feedsV1 as unknown as FeedItem[];
export const LIVE_BREEDS: BreedStandard[] = breedsV1 as unknown as BreedStandard[];
export const LLM_PROXY_ENDPOINT = '/api/llm';
export const MAX_FREE_TEXT_LENGTH = 1000;

export { computeRequirements };

export function solveRation(
  animal: AnimalProfile,
  selectedFeeds: SelectedFeedInput[],
): RationSolveOutcome {
  return solveV1Ration(animal, selectedFeeds, LIVE_FEEDS, LIVE_BREEDS);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidLlmErrorCode(value: unknown): value is LlmErrorCode {
  return (
    value === 'RATE_LIMITED' ||
    value === 'UPSTREAM_ERROR' ||
    value === 'TIMEOUT' ||
    value === 'INVALID_REQUEST'
  );
}

function statusToLlmErrorCode(status: number): LlmErrorCode {
  if (status === 400) return 'INVALID_REQUEST';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 408 || status === 504) return 'TIMEOUT';
  return 'UPSTREAM_ERROR';
}

function isCallerAbortError(err: unknown, signal?: AbortSignal): boolean {
  if (!signal?.aborted) return false;
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  return isRecord(err) && err.name === 'AbortError';
}

function toLlmError(err: unknown): LlmError {
  if (err instanceof LlmError) return err;
  if (isRecord(err)) {
    const name = typeof err.name === 'string' ? err.name : '';
    const message = typeof err.message === 'string' ? err.message.toLowerCase() : '';
    if (
      name === 'TimeoutError' ||
      name === 'AbortError' ||
      message.includes('timeout') ||
      message.includes('timed out')
    ) {
      return new LlmError('TIMEOUT');
    }
  }
  return new LlmError('UPSTREAM_ERROR');
}

async function postLlmJson(
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(LLM_PROXY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err) {
    if (isCallerAbortError(err, signal)) {
      throw err;
    }
    throw toLlmError(err);
  }

  if (!response.ok) {
    let errBody: unknown = null;
    try {
      errBody = await response.json();
    } catch {
      errBody = null;
    }
    if (isRecord(errBody) && isRecord(errBody.error) && isValidLlmErrorCode(errBody.error.code)) {
      throw new LlmError(errBody.error.code);
    }
    throw new LlmError(statusToLlmErrorCode(response.status));
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    throw new LlmError('UPSTREAM_ERROR');
  }

  if (!isRecord(data)) {
    throw new LlmError('UPSTREAM_ERROR');
  }

  return data;
}

function findLiveFeed(token: string): FeedItem | null {
  const norm = token.trim().normalize('NFC').toLowerCase();
  if (!norm) return null;
  for (const item of LIVE_FEEDS) {
    if (item.id.toLowerCase() === norm) return item;
    if (item.englishName.normalize('NFC').toLowerCase() === norm) return item;
    if (item.localNameDeva && item.localNameDeva.normalize('NFC').toLowerCase() === norm) {
      return item;
    }
    if (item.localNameLatn) {
      const parts = item.localNameLatn
        .split('/')
        .map((p) => p.trim().normalize('NFC').toLowerCase())
        .filter((p) => p.length > 0);
      if (parts.includes(norm)) return item;
    }
  }
  return null;
}

function findLiveBreedForSpecies(token: string, species: Species): BreedStandard | null {
  const norm = token.trim().normalize('NFC').toLowerCase();
  if (!norm) return null;
  for (const breed of LIVE_BREEDS) {
    if (breed.species !== species) continue;
    if (breed.id.toLowerCase() === norm) return breed;
    if (breed.englishName.normalize('NFC').toLowerCase() === norm) return breed;
    if (breed.localNameDeva && breed.localNameDeva.normalize('NFC').toLowerCase() === norm) {
      return breed;
    }
    if (breed.localNameLatn) {
      const parts = breed.localNameLatn
        .split('/')
        .map((p) => p.trim().normalize('NFC').toLowerCase())
        .filter((p) => p.length > 0);
      if (parts.includes(norm)) return breed;
    }
  }
  return null;
}

export async function extractFromText(
  freeText: string,
  options?: { signal?: AbortSignal },
): Promise<ExtractionResponse> {
  if (options?.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const normalizedText = toLatinDigits(freeText).normalize('NFC');
  const trimmed = normalizedText.trim();
  if (trimmed.length === 0 || normalizedText.length > MAX_FREE_TEXT_LENGTH) {
    throw new LlmError('INVALID_REQUEST');
  }

  // AC-E5.1: Only send catalog ids and names — never nutrient, price, season, or breed-cap numbers.
  const catalog = LIVE_FEEDS.map((f) => ({
    id: f.id,
    englishName: f.englishName,
    localNameLatn: f.localNameLatn,
    localNameDeva: f.localNameDeva,
  }));

  const breeds = LIVE_BREEDS.map((b) => ({
    id: b.id,
    species: b.species,
    englishName: b.englishName,
    localNameLatn: b.localNameLatn,
    localNameDeva: b.localNameDeva,
  }));

  const raw = await postLlmJson(
    {
      action: 'extract',
      freeText: normalizedText,
      catalog,
      breeds,
    },
    options?.signal,
  );

  const animalRaw = isRecord(raw.animal) ? raw.animal : raw;
  const rawSpecies = typeof animalRaw.species === 'string' ? animalRaw.species.trim().toLowerCase() : '';
  const species: Species | null =
    rawSpecies === 'buffalo'
      ? 'buffalo'
      : rawSpecies === 'cow' || rawSpecies === 'cattle'
        ? 'cow'
        : null;

  if (!species) {
    throw new LlmError('UPSTREAM_ERROR');
  }

  const bodyWeightKg = Number(animalRaw.bodyWeightKg);
  if (!Number.isFinite(bodyWeightKg) || bodyWeightKg <= 0) {
    throw new LlmError('UPSTREAM_ERROR');
  }

  const milkYieldLitersPerDay =
    animalRaw.milkYieldLitersPerDay === null || animalRaw.milkYieldLitersPerDay === undefined
      ? 0
      : Number(animalRaw.milkYieldLitersPerDay);
  if (!Number.isFinite(milkYieldLitersPerDay) || milkYieldLitersPerDay < 0) {
    throw new LlmError('UPSTREAM_ERROR');
  }

  const defaultFat = species === 'cow' ? 4 : 6;
  const milkFatPct =
    animalRaw.milkFatPct === null || animalRaw.milkFatPct === undefined
      ? defaultFat
      : Number(animalRaw.milkFatPct);
  if (!Number.isFinite(milkFatPct) || milkFatPct < 0) {
    throw new LlmError('UPSTREAM_ERROR');
  }

  // AC-2.3: Validate extracted breedId against LIVE_BREEDS for the extracted species; drop any mismatch.
  const candidateBreed =
    typeof raw.breedId === 'string'
      ? raw.breedId
      : typeof animalRaw.breedId === 'string'
        ? animalRaw.breedId
        : null;
  const matchedBreed = candidateBreed ? findLiveBreedForSpecies(candidateBreed, species) : null;
  const breedId = matchedBreed ? matchedBreed.id : null;

  const rawBudget = raw.budgetInrPerDay ?? animalRaw.budgetInrPerDay ?? null;
  let budgetInrPerDay: number | null = null;
  if (rawBudget !== null && rawBudget !== undefined && rawBudget !== '') {
    const parsedBudget = Number(rawBudget);
    if (Number.isFinite(parsedBudget) && parsedBudget > 0) {
      budgetInrPerDay = parsedBudget;
    }
  }

  // AC-E5.1: Sanitize feeds against LIVE_FEEDS and force priceInrPerKgAsFed to null so no LLM prices or nutrients enter the app.
  const matchedFeeds: ExtractedFeed[] = [];
  const seenFeedIds = new Set<string>();
  const unmatchedFeeds: string[] = [];
  const seenUnmatched = new Set<string>();

  const addUnmatched = (name: string) => {
    const cleaned = name.trim();
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    if (!seenUnmatched.has(key)) {
      seenUnmatched.add(key);
      unmatchedFeeds.push(cleaned);
    }
  };

  if (Array.isArray(raw.matchedFeeds)) {
    for (const entry of raw.matchedFeeds) {
      let token = '';
      let maxKgAsFedPerDay: number | null = null;
      if (typeof entry === 'string') {
        token = entry;
      } else if (isRecord(entry)) {
        token = String(entry.feedId ?? entry.id ?? entry.name ?? '');
        if (entry.maxKgAsFedPerDay !== null && entry.maxKgAsFedPerDay !== undefined) {
          const parsedMax = Number(entry.maxKgAsFedPerDay);
          if (Number.isFinite(parsedMax) && parsedMax >= 0) {
            maxKgAsFedPerDay = parsedMax;
          }
        }
      }
      const catalogHit = findLiveFeed(token);
      if (catalogHit) {
        if (!seenFeedIds.has(catalogHit.id)) {
          seenFeedIds.add(catalogHit.id);
          matchedFeeds.push({
            feedId: catalogHit.id,
            priceInrPerKgAsFed: null,
            maxKgAsFedPerDay,
          });
        }
      } else if (token.trim().length > 0) {
        addUnmatched(token);
      }
    }
  }

  if (Array.isArray(raw.unmatchedFeeds)) {
    for (const entry of raw.unmatchedFeeds) {
      const name =
        typeof entry === 'string'
          ? entry
          : isRecord(entry)
            ? String(entry.name ?? entry.feedId ?? entry.id ?? '')
            : '';
      if (!name.trim()) continue;
      const catalogHit = findLiveFeed(name);
      if (catalogHit) {
        if (!seenFeedIds.has(catalogHit.id)) {
          seenFeedIds.add(catalogHit.id);
          matchedFeeds.push({
            feedId: catalogHit.id,
            priceInrPerKgAsFed: null,
            maxKgAsFedPerDay: null,
          });
        }
      } else {
        addUnmatched(name);
      }
    }
  }

  const modelUsed =
    typeof raw.modelUsed === 'string' && raw.modelUsed.trim().length > 0
      ? raw.modelUsed.trim()
      : 'openrouter';

  return {
    action: 'extract',
    modelUsed,
    animal: {
      species,
      bodyWeightKg,
      milkYieldLitersPerDay,
      milkFatPct,
    },
    breedId,
    budgetInrPerDay,
    matchedFeeds,
    unmatchedFeeds,
  };
}

function buildRationSummary(context: ExplanationRequestContext): Record<string, unknown> {
  const { animal, solution, feeds } = context;
  const breed = LIVE_BREEDS.find((b) => b.id === animal.breedId);
  return {
    species: animal.species,
    breed: breed ? breed.englishName : animal.breedId,
    bodyWeightKg: animal.bodyWeightKg,
    todayMilkLPerDay: animal.milkYieldLitersPerDay,
    todayFatPct: animal.milkFatPct,
    supportedMilkLPerDay: solution.supportedMilkLPerDay,
    milkCapLPerDay: solution.milkCapLPerDay,
    effectiveCapLPerDay: solution.effectiveCapLPerDay,
    bindingConstraint: solution.bindingConstraint,
    verdict: solution.verdict,
    feeds: solution.feeds.map((line) => {
      const feed =
        feeds.find((f) => f.id === line.feedId) ?? LIVE_FEEDS.find((f) => f.id === line.feedId);
      return {
        feedId: line.feedId,
        name: feed ? feed.englishName : line.feedId,
        kgAsFedPerDay: line.kgAsFed,
        costInr: line.costInr,
        priceInrPerKg: line.priceInrPerKg,
      };
    }),
    totalKgAsFed: solution.totalKgAsFed,
    totalCostInrPerDay: solution.totalCostInr,
    budgetInrPerDay: animal.budgetInrPerDay,
    maintenanceCostInrPerDay: solution.maintenanceCostInrPerDay,
    costAtTodayMilkInrPerDay: solution.costAtTodayMilkInrPerDay,
    roughageSharePct: solution.roughageSharePct,
    roughageMinSharePct: solution.roughageMinSharePct,
    coveragePct: solution.coveragePct,
  };
}

async function requestExplainAttempt(
  attempt: 1 | 2,
  authorizedNumbers: ReturnType<typeof collectAuthorizedNumbers>,
  rationSummary: Record<string, unknown>,
  flaggedNumbers?: string[],
  signal?: AbortSignal,
): Promise<{ explanationText: string; modelUsed: string }> {
  const payload: Record<string, unknown> = {
    action: 'explain',
    attempt,
    authorizedNumbers,
    rationSummary,
  };
  if (flaggedNumbers && flaggedNumbers.length > 0) {
    payload.flaggedNumbers = flaggedNumbers;
  }

  const data = await postLlmJson(payload, signal);
  const explanationText =
    typeof data.explanationText === 'string' ? data.explanationText.trim() : '';
  if (!explanationText) {
    throw new LlmError('UPSTREAM_ERROR');
  }
  const modelUsed =
    typeof data.modelUsed === 'string' && data.modelUsed.trim().length > 0
      ? data.modelUsed.trim()
      : 'openrouter';
  return { explanationText, modelUsed };
}

export async function explainRation(
  context: ExplanationRequestContext,
  options?: { signal?: AbortSignal },
): Promise<VerifiedExplanationResult> {
  if (options?.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const authorizedNumbers = collectAuthorizedNumbers(context);
  const rationSummary = buildRationSummary(context);

  let attempt1: { explanationText: string; modelUsed: string };
  try {
    attempt1 = await requestExplainAttempt(1, authorizedNumbers, rationSummary, undefined, options?.signal);
  } catch (err) {
    if (isCallerAbortError(err, options?.signal)) {
      throw err;
    }
    const llmErr = toLlmError(err);
    return {
      status: 'deterministic_fallback',
      template: buildTemplateExplanation(context),
      badge: { id: 'badge_template_fallback' },
      reason: 'llm_error',
      errorCode: llmErr.code,
      flaggedNumbers: [],
    };
  }

  const v1 = verifyExplanationNumbers(attempt1.explanationText, authorizedNumbers);
  if (v1.status === 'verified') {
    return {
      status: 'verified',
      explanationText: attempt1.explanationText,
      verifiedCount: v1.verifiedCount,
      badge: { id: 'badge_all_verified', params: { n: v1.verifiedCount } },
      flaggedNumbers: [],
      modelUsed: attempt1.modelUsed,
    };
  }

  // AC-E6.1 & AC-L1.6: Perform at most one retry (attempt: 2) when untraced numbers or Devanagari characters are detected.
  let attempt2: { explanationText: string; modelUsed: string };
  try {
    attempt2 = await requestExplainAttempt(
      2,
      authorizedNumbers,
      rationSummary,
      v1.flaggedNumbers,
      options?.signal,
    );
  } catch (err) {
    if (isCallerAbortError(err, options?.signal)) {
      throw err;
    }
    const llmErr = toLlmError(err);
    return {
      status: 'deterministic_fallback',
      template: buildTemplateExplanation(context),
      badge: { id: 'badge_template_fallback' },
      reason: 'llm_error',
      errorCode: llmErr.code,
      flaggedNumbers: v1.flaggedNumbers,
    };
  }

  const v2 = verifyExplanationNumbers(attempt2.explanationText, authorizedNumbers);
  if (v2.status === 'verified') {
    return {
      status: 'verified',
      explanationText: attempt2.explanationText,
      verifiedCount: v2.verifiedCount,
      badge: { id: 'badge_all_verified', params: { n: v2.verifiedCount } },
      flaggedNumbers: v1.flaggedNumbers,
      modelUsed: attempt2.modelUsed,
    };
  }

  return {
    status: 'deterministic_fallback',
    template: buildTemplateExplanation(context),
    badge: { id: 'badge_template_fallback' },
    reason: 'untraced_numbers',
    errorCode: null,
    flaggedNumbers: Array.from(new Set([...v1.flaggedNumbers, ...v2.flaggedNumbers])),
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

