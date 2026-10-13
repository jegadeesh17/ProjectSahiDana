// Serverless OpenRouter proxy (POST /api/llm) with model fallback chain and nutrient safety
// (docs/ARCHITECTURE.md §"2. Serverless API endpoint: POST /api/llm", ADR-0003, SPEC AC-2.3, AC-7.1, AC-E4.1, AC-E4.2, AC-E5.1, AC-E6.1, AC-L1.5, AC-L1.6).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type {
  ExtractedFeed,
  ExtractionResponse,
  LlmErrorCode,
  Species,
} from '../src/domain/types';

export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const DEFAULT_PRIMARY_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';
export const DEFAULT_FALLBACK_MODELS: readonly string[] = [
  'google/gemma-3-27b-it:free',
  'qwen/qwen-2.5-72b-instruct:free',
];
export const DEFAULT_TIMEOUT_MS = 15_000;
export const MAX_FREE_TEXT_LENGTH = 1000;

export interface CatalogFeedInput {
  id: string;
  englishName: string;
  localNameLatn?: string | null;
  localNameDeva?: string | null;
}

export interface CatalogBreedInput {
  id: string;
  species: Species;
  englishName: string;
  localNameLatn?: string | null;
  localNameDeva?: string | null;
}

export interface AuthorizedNumberInput {
  label: string;
  value: number;
  formatted: string;
}

export interface ExtractRequestBody {
  action: 'extract';
  freeText: string;
  catalog: CatalogFeedInput[];
  breeds: CatalogBreedInput[];
}

export interface ExplainRequestBody {
  action: 'explain';
  attempt?: 1 | 2;
  authorizedNumbers: AuthorizedNumberInput[];
  rationSummary: Record<string, unknown>;
  flaggedNumbers?: string[];
}

export interface ExplainResponsePayload {
  action: 'explain';
  modelUsed: string;
  explanationText: string;
}

export interface LlmErrorResponse {
  error: {
    code: LlmErrorCode;
    message: string;
  };
}

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

const ERROR_HTTP_STATUS: Record<LlmErrorCode, number> = {
  INVALID_REQUEST: 400,
  RATE_LIMITED: 429,
  UPSTREAM_ERROR: 502,
  TIMEOUT: 504,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX_REQUESTS = 20;

const ipRequestMap = new Map<string, { count: number; resetAt: number }>();

/** In-memory sliding-window IP rate limiter to protect free model quotas during hackathon judging. */
export function checkRateLimit(ip: string, now: number = Date.now()): boolean {
  const entry = ipRequestMap.get(ip);
  if (!entry || now >= entry.resetAt) {
    ipRequestMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  entry.count += 1;
  return true;
}

export function resetRateLimits(): void {
  ipRequestMap.clear();
}

/** Validates request origin/referer to block unauthorized third-party cross-origin calls. */
export function isAllowedOrigin(originHeader: string | undefined, hostHeader: string | undefined): boolean {
  if (!originHeader) return true; // Direct, serverless, or non-browser request
  try {
    const parsed = new URL(originHeader);
    const hostname = parsed.hostname.toLowerCase();
    // Allow localhost / loopback
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
    // Allow vercel.app preview and production deployments
    if (hostname.endsWith('.vercel.app')) return true;
    // Allow matching host header
    if (hostHeader) {
      const cleanHost = hostHeader.split(':')[0].toLowerCase();
      if (hostname === cleanHost) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Converts Devanagari digits (U+0966..U+096F) to Latin digits 0..9 without embedding Devanagari literals. */
export function normalizeDigits(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code >= 0x0966 && code <= 0x096f) {
      out += String(code - 0x0966);
    } else {
      out += input[i];
    }
  }
  return out.normalize('NFC');
}

/**
 * Resolves the ordered, deduplicated OpenRouter model chain from server environment variables.
 * Primary model defaults to `meta-llama/llama-3.3-70b-instruct:free`;
 * fallback list defaults to `google/gemma-3-27b-it:free,qwen/qwen-2.5-72b-instruct:free` when unset or empty.
 */
export function resolveModelChain(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const primaryRaw = (env.OPENROUTER_MODEL ?? '').trim();
  const primary = primaryRaw.length > 0 ? primaryRaw : DEFAULT_PRIMARY_MODEL;

  const fallbackRaw = (env.OPENROUTER_FALLBACK_MODELS ?? '').trim();
  const fallbacks =
    fallbackRaw.length > 0
      ? fallbackRaw
          .split(',')
          .map((m) => m.trim())
          .filter((m) => m.length > 0)
      : [...DEFAULT_FALLBACK_MODELS];

  const seen = new Set<string>();
  const chain: string[] = [];
  for (const model of [primary, ...fallbacks]) {
    if (!seen.has(model)) {
      seen.add(model);
      chain.push(model);
    }
  }
  return chain;
}

function sendError(res: VercelResponse, code: LlmErrorCode, message: string): void {
  res.status(ERROR_HTTP_STATUS[code]).json({
    error: { code, message },
  } satisfies LlmErrorResponse);
}

/** Strips any nutrient, price, or season fields from catalog entries before prompting the LLM (AC-E5.1). */
export function sanitizeCatalogForPrompt(catalog: readonly unknown[]): CatalogFeedInput[] {
  const out: CatalogFeedInput[] = [];
  for (const item of catalog) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const englishName = typeof item.englishName === 'string' ? item.englishName.trim() : '';
    if (!id || !englishName) continue;
    out.push({
      id,
      englishName,
      localNameLatn: typeof item.localNameLatn === 'string' ? item.localNameLatn.trim() : null,
      localNameDeva:
        typeof item.localNameDeva === 'string' ? item.localNameDeva.trim().normalize('NFC') : null,
    });
  }
  return out;
}

/** Strips any yield, cap, or fat fields from breed entries before prompting the LLM (AC-E5.1). */
export function sanitizeBreedsForPrompt(breeds: readonly unknown[]): CatalogBreedInput[] {
  const out: CatalogBreedInput[] = [];
  for (const item of breeds) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const species = item.species === 'cow' || item.species === 'buffalo' ? item.species : null;
    const englishName = typeof item.englishName === 'string' ? item.englishName.trim() : '';
    if (!id || !species || !englishName) continue;
    out.push({
      id,
      species,
      englishName,
      localNameLatn: typeof item.localNameLatn === 'string' ? item.localNameLatn.trim() : null,
      localNameDeva:
        typeof item.localNameDeva === 'string' ? item.localNameDeva.trim().normalize('NFC') : null,
    });
  }
  return out;
}

export function buildExtractMessages(
  freeText: string,
  catalog: readonly CatalogFeedInput[],
  breeds: readonly CatalogBreedInput[],
): ChatMessage[] {
  const systemPrompt = [
    'You are an agricultural data extraction parser for dairy ration balancing in Rajasthan and North India.',
    'Parse the user description (which may be in English, Hindi in Devanagari, or Hinglish) into strict JSON.',
    'Term mappings:',
    '- bhains -> species: "buffalo"',
    '- gaay / gai -> species: "cow"',
    '- kilo / kg -> bodyWeightKg (animal body weight in kg)',
    '- litre / liter / L / doodh -> milkYieldLitersPerDay (daily milk yield in L/day; 0 if dry)',
    '- fat / fat% -> milkFatPct (milk fat percentage)',
    '- rupaye roz / rs per day / daily budget -> budgetInrPerDay (daily budget in INR/day, or null if not stated)',
    '- Convert any Hindi or Hinglish number words into standard Latin numbers.',
    'Rules for breeds and feeds (CRITICAL):',
    '1. Match breedId ONLY against the provided breeds list for the extracted species. If no breed is mentioned or the breed is not in the list for that species, set breedId to null.',
    '2. Match feeds ONLY against the provided catalog list (by id, englishName, localNameLatn, or localNameDeva). Put matched catalog ids into matchedFeeds as { "feedId": "<catalog id>", "priceInrPerKgAsFed": null, "maxKgAsFedPerDay": null }.',
    '3. If the user mentions any feed, supplement, or mix that does NOT match an entry in the provided catalog, place its name as a string in unmatchedFeeds.',
    '4. NEVER invent, estimate, or output nutrient values (DM, CP, ME, Ca, P), feed prices, seasonal months, or breed milk caps.',
    'Respond with ONLY a valid JSON object matching this exact structure:',
    '{"animal":{"species":"cow|buffalo","bodyWeightKg":450,"milkYieldLitersPerDay":8,"milkFatPct":6.5},"breedId":"string|null","budgetInrPerDay":null,"matchedFeeds":[{"feedId":"string","priceInrPerKgAsFed":null,"maxKgAsFedPerDay":null}],"unmatchedFeeds":["string"]}',
  ].join('\n');

  const userPayload = JSON.stringify({
    freeText: normalizeDigits(freeText.trim()),
    catalog: sanitizeCatalogForPrompt(catalog),
    breeds: sanitizeBreedsForPrompt(breeds),
  });

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPayload },
  ];
}

export function buildExplainMessages(body: ExplainRequestBody): ChatMessage[] {
  const attempt = body.attempt ?? 1;
  const flagged = Array.isArray(body.flaggedNumbers)
    ? body.flaggedNumbers.map((s) => String(s).trim()).filter((s) => s.length > 0)
    : [];

  const systemLines = [
    'You are a factual dairy ration explanation assistant for field paravets.',
    'Write a concise (2 to 4 sentences) plain-English explanation of the solved ration.',
    'STRICT RULES:',
    '1. Plain English ONLY. Do NOT output any Hindi or Devanagari characters. Use Latin digits (0-9) and units (kg, L, INR, %).',
    '2. No veterinary, medical, health, breeding, or lactation-stage advice. State the solver verdict and ration figures as facts only.',
    '3. Every single number in your response MUST come directly from the provided authorizedNumbers list. Do NOT compute new numbers, do NOT round differently, and do NOT use numbered lists (1., 2.).',
    'Respond with ONLY valid JSON: {"explanationText": "<plain English explanation>"}',
  ];

  if (attempt === 2 || flagged.length > 0) {
    systemLines.push(
      `RETRY NOTICE (Attempt 2): Your previous response was rejected. Do NOT use any of these unauthorized numbers: ${flagged.join(', ') || 'none'}. Use ONLY exact numbers listed in authorizedNumbers and strictly English characters.`,
    );
  }

  const userPayload = JSON.stringify({
    attempt,
    authorizedNumbers: body.authorizedNumbers,
    rationSummary: body.rationSummary,
    ...(flagged.length > 0 ? { forbiddenNumbers: flagged } : {}),
  });

  return [
    { role: 'system', content: systemLines.join('\n') },
    { role: 'user', content: userPayload },
  ];
}

export function parseJsonFromModelContent(content: string): unknown {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error('Empty model response content');
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    // Strip markdown code fences if present
    const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
    if (fenceMatch && fenceMatch[1]) {
      return JSON.parse(fenceMatch[1].trim());
    }
    // Extract first JSON object block
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('Model response is not valid JSON');
  }
}

function findCatalogFeed(
  token: string,
  catalog: readonly CatalogFeedInput[],
): CatalogFeedInput | null {
  const norm = token.trim().normalize('NFC').toLowerCase();
  if (!norm) return null;
  for (const item of catalog) {
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

function findCatalogBreed(
  token: string,
  species: Species,
  breeds: readonly CatalogBreedInput[],
): CatalogBreedInput | null {
  const norm = token.trim().normalize('NFC').toLowerCase();
  if (!norm) return null;
  for (const breed of breeds) {
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

/**
 * Validates and sanitizes the LLM extraction payload:
 * - Enforces valid species and finite animal metrics.
 * - Drops any `breedId` not present in `breeds` for the extracted `species` (AC-2.3).
 * - Strips all LLM-supplied nutrient, price, season, or breed-cap numbers (AC-E5.1).
 * - Moves any out-of-catalog feed from `matchedFeeds` into `unmatchedFeeds` and preserves `unmatchedFeeds` (AC-E5.1).
 */
export function sanitizeExtractResponse(
  raw: unknown,
  catalog: readonly CatalogFeedInput[],
  breeds: readonly CatalogBreedInput[],
  modelUsed: string,
): ExtractionResponse {
  if (!isRecord(raw)) {
    throw new Error('Invalid extraction payload: expected object');
  }

  const animalRaw = isRecord(raw.animal) ? raw.animal : raw;
  const rawSpecies = typeof animalRaw.species === 'string' ? animalRaw.species.trim().toLowerCase() : '';
  const species: Species | null =
    rawSpecies === 'buffalo'
      ? 'buffalo'
      : rawSpecies === 'cow' || rawSpecies === 'cattle'
        ? 'cow'
        : null;

  if (!species) {
    throw new Error('Invalid extraction payload: missing or invalid species');
  }

  const bodyWeightKg = Number(animalRaw.bodyWeightKg);
  if (!Number.isFinite(bodyWeightKg) || bodyWeightKg <= 0) {
    throw new Error('Invalid extraction payload: invalid bodyWeightKg');
  }

  const milkRaw =
    animalRaw.milkYieldLitersPerDay === null || animalRaw.milkYieldLitersPerDay === undefined
      ? 0
      : Number(animalRaw.milkYieldLitersPerDay);
  if (!Number.isFinite(milkRaw) || milkRaw < 0) {
    throw new Error('Invalid extraction payload: invalid milkYieldLitersPerDay');
  }

  const defaultFat = species === 'cow' ? 4 : 6;
  const fatRaw =
    animalRaw.milkFatPct === null || animalRaw.milkFatPct === undefined
      ? defaultFat
      : Number(animalRaw.milkFatPct);
  if (!Number.isFinite(fatRaw) || fatRaw < 0) {
    throw new Error('Invalid extraction payload: invalid milkFatPct');
  }

  // Breed validation: must match an entry in `breeds` for the extracted `species` (AC-2.3).
  const candidateBreed =
    typeof raw.breedId === 'string'
      ? raw.breedId
      : typeof animalRaw.breedId === 'string'
        ? animalRaw.breedId
        : null;
  const matchedBreed = candidateBreed ? findCatalogBreed(candidateBreed, species, breeds) : null;
  const breedId = matchedBreed ? matchedBreed.id : null;

  // Budget validation: positive finite number or null.
  const rawBudget = raw.budgetInrPerDay ?? animalRaw.budgetInrPerDay ?? null;
  let budgetInrPerDay: number | null = null;
  if (rawBudget !== null && rawBudget !== undefined && rawBudget !== '') {
    const parsedBudget = Number(rawBudget);
    if (Number.isFinite(parsedBudget) && parsedBudget > 0) {
      budgetInrPerDay = parsedBudget;
    }
  }

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

      const catalogHit = findCatalogFeed(token, catalog);
      if (catalogHit) {
        if (!seenFeedIds.has(catalogHit.id)) {
          seenFeedIds.add(catalogHit.id);
          // AC-E5.1: priceInrPerKgAsFed is forced to null; any LLM-supplied price, nutrient, or season fields are stripped.
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
      const catalogHit = findCatalogFeed(name, catalog);
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

  return {
    action: 'extract',
    modelUsed,
    animal: {
      species,
      bodyWeightKg,
      milkYieldLitersPerDay: milkRaw,
      milkFatPct: fatRaw,
    },
    breedId,
    budgetInrPerDay,
    matchedFeeds,
    unmatchedFeeds,
  };
}

export function sanitizeExplainResponse(rawContent: string, modelUsed: string): ExplainResponsePayload {
  const trimmed = rawContent.trim();
  if (!trimmed) {
    throw new Error('Empty explanation content from model');
  }

  let explanationText = trimmed;
  if (trimmed.startsWith('{') || trimmed.startsWith('```')) {
    try {
      const parsed = parseJsonFromModelContent(trimmed);
      if (isRecord(parsed) && typeof parsed.explanationText === 'string') {
        explanationText = parsed.explanationText.trim();
      }
    } catch {
      // Fall back to using raw text if it wasn't a JSON wrapper
    }
  }

  if (!explanationText) {
    throw new Error('Empty explanationText in model response');
  }

  return {
    action: 'explain',
    modelUsed,
    explanationText,
  };
}

interface UpstreamCallFailure {
  code: 'RATE_LIMITED' | 'UPSTREAM_ERROR' | 'TIMEOUT';
  message: string;
}

function isAbortOrTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = 'name' in err ? String(err.name) : '';
  const message = 'message' in err ? String(err.message).toLowerCase() : '';
  return (
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('aborted')
  );
}

async function callOpenRouterModel(
  model: string,
  messages: readonly ChatMessage[],
  apiKey: string,
  timeoutMs: number,
): Promise<{ ok: true; content: string } | { ok: false; failure: UpstreamCallFailure }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://sahidana.vercel.app',
        'X-Title': 'SahiDana',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    if (response.status === 429) {
      return {
        ok: false,
        failure: {
          code: 'RATE_LIMITED',
          message: `Model ${model} returned HTTP 429 rate limit`,
        },
      };
    }

    if (response.status === 408 || response.status === 504) {
      return {
        ok: false,
        failure: {
          code: 'TIMEOUT',
          message: `Model ${model} timed out with HTTP ${response.status}`,
        },
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        failure: {
          code: 'UPSTREAM_ERROR',
          message: `Model ${model} returned HTTP ${response.status}`,
        },
      };
    }

    const data: unknown = await response.json();
    if (!isRecord(data) || !Array.isArray(data.choices) || data.choices.length === 0) {
      return {
        ok: false,
        failure: {
          code: 'UPSTREAM_ERROR',
          message: `Model ${model} returned empty choices`,
        },
      };
    }

    const firstChoice = data.choices[0];
    const messageObj = isRecord(firstChoice) && isRecord(firstChoice.message) ? firstChoice.message : null;
    const rawContent = messageObj?.content;
    const content =
      typeof rawContent === 'string'
        ? rawContent
        : isRecord(rawContent)
          ? JSON.stringify(rawContent)
          : '';

    if (!content.trim()) {
      return {
        ok: false,
        failure: {
          code: 'UPSTREAM_ERROR',
          message: `Model ${model} returned empty message content`,
        },
      };
    }

    return { ok: true, content };
  } catch (err) {
    if (isAbortOrTimeoutError(err)) {
      return {
        ok: false,
        failure: {
          code: 'TIMEOUT',
          message: `Model ${model} request timed out`,
        },
      };
    }
    return {
      ok: false,
      failure: {
        code: 'UPSTREAM_ERROR',
        message: err instanceof Error ? err.message : `Model ${model} request failed`,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseRequestBody(req: VercelRequest): Record<string, unknown> | null {
  if (typeof req.body === 'string') {
    try {
      const parsed: unknown = JSON.parse(req.body);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return isRecord(req.body) ? req.body : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // 1. Origin check: block untrusted third-party origins
  const originHeader = (req.headers.origin as string | undefined) ?? (req.headers.referer as string | undefined);
  const hostHeader = req.headers.host as string | undefined;
  if (!isAllowedOrigin(originHeader, hostHeader)) {
    sendError(res, 'INVALID_REQUEST', 'Forbidden or untrusted cross-origin request.');
    return;
  }

  // 2. IP rate limiting: protect free OpenRouter quota during judging
  const forwarded = req.headers['x-forwarded-for'];
  const clientIp = typeof forwarded === 'string'
    ? forwarded.split(',')[0].trim()
    : (req.socket?.remoteAddress ?? 'unknown_client');
  if (!checkRateLimit(clientIp)) {
    sendError(res, 'RATE_LIMITED', 'Rate limit exceeded: maximum 20 requests per minute per IP.');
    return;
  }

  if (req.method !== 'POST') {
    sendError(res, 'INVALID_REQUEST', 'Method not allowed; use POST.');
    return;
  }

  const body = parseRequestBody(req);
  if (!body || (body.action !== 'extract' && body.action !== 'explain')) {
    sendError(res, 'INVALID_REQUEST', 'Request body must specify action "extract" or "explain".');
    return;
  }

  if (body.action === 'extract') {
    const freeText = typeof body.freeText === 'string' ? body.freeText : '';
    const trimmed = freeText.trim();
    if (trimmed.length < 1 || freeText.length > MAX_FREE_TEXT_LENGTH) {
      sendError(
        res,
        'INVALID_REQUEST',
        `freeText must be a non-empty string of 1 to ${MAX_FREE_TEXT_LENGTH} characters.`,
      );
      return;
    }
    if (!Array.isArray(body.catalog) || !Array.isArray(body.breeds)) {
      sendError(res, 'INVALID_REQUEST', 'extract requires catalog and breeds arrays.');
      return;
    }

    const catalog = sanitizeCatalogForPrompt(body.catalog);
    const breeds = sanitizeBreedsForPrompt(body.breeds);
    if (catalog.length === 0) {
      sendError(res, 'INVALID_REQUEST', 'catalog must contain at least one valid feed entry.');
      return;
    }

    const apiKey = (process.env.OPENROUTER_API_KEY ?? '').trim();
    if (!apiKey) {
      sendError(res, 'UPSTREAM_ERROR', 'OPENROUTER_API_KEY is not configured on the server.');
      return;
    }

    const messages = buildExtractMessages(freeText, catalog, breeds);
    const models = resolveModelChain(process.env);
    let lastFailure: UpstreamCallFailure = {
      code: 'UPSTREAM_ERROR',
      message: 'All OpenRouter models failed.',
    };

    for (const model of models) {
      const callResult = await callOpenRouterModel(model, messages, apiKey, DEFAULT_TIMEOUT_MS);
      if (!callResult.ok) {
        lastFailure = callResult.failure;
        continue;
      }

      try {
        const parsed = parseJsonFromModelContent(callResult.content);
        const sanitized = sanitizeExtractResponse(parsed, catalog, breeds, model);
        res.status(200).json(sanitized);
        return;
      } catch (err) {
        lastFailure = {
          code: 'UPSTREAM_ERROR',
          message:
            err instanceof Error
              ? `Model ${model} output failed validation: ${err.message}`
              : `Model ${model} output failed validation`,
        };
      }
    }

    sendError(res, lastFailure.code, lastFailure.message);
    return;
  }

  // action === 'explain'
  const attemptRaw = body.attempt ?? 1;
  if (attemptRaw !== 1 && attemptRaw !== 2) {
    sendError(res, 'INVALID_REQUEST', 'attempt must be 1 or 2.');
    return;
  }

  if (!Array.isArray(body.authorizedNumbers) || body.authorizedNumbers.length === 0) {
    sendError(res, 'INVALID_REQUEST', 'explain requires a non-empty authorizedNumbers array.');
    return;
  }

  const authorizedNumbers: AuthorizedNumberInput[] = [];
  for (const item of body.authorizedNumbers) {
    if (
      !isRecord(item) ||
      typeof item.label !== 'string' ||
      typeof item.value !== 'number' ||
      !Number.isFinite(item.value) ||
      typeof item.formatted !== 'string'
    ) {
      sendError(res, 'INVALID_REQUEST', 'Each authorizedNumbers entry must have label, finite value, and formatted.');
      return;
    }
    authorizedNumbers.push({
      label: item.label,
      value: item.value,
      formatted: item.formatted,
    });
  }

  if (!isRecord(body.rationSummary)) {
    sendError(res, 'INVALID_REQUEST', 'explain requires a rationSummary object.');
    return;
  }

  const flaggedNumbers = Array.isArray(body.flaggedNumbers)
    ? body.flaggedNumbers.map((x) => String(x))
    : undefined;

  const apiKey = (process.env.OPENROUTER_API_KEY ?? '').trim();
  if (!apiKey) {
    sendError(res, 'UPSTREAM_ERROR', 'OPENROUTER_API_KEY is not configured on the server.');
    return;
  }

  const explainReq: ExplainRequestBody = {
    action: 'explain',
    attempt: attemptRaw,
    authorizedNumbers,
    rationSummary: body.rationSummary,
    flaggedNumbers,
  };

  const messages = buildExplainMessages(explainReq);
  const models = resolveModelChain(process.env);
  let lastFailure: UpstreamCallFailure = {
    code: 'UPSTREAM_ERROR',
    message: 'All OpenRouter models failed.',
  };

  for (const model of models) {
    const callResult = await callOpenRouterModel(model, messages, apiKey, DEFAULT_TIMEOUT_MS);
    if (!callResult.ok) {
      lastFailure = callResult.failure;
      continue;
    }

    try {
      const sanitized = sanitizeExplainResponse(callResult.content, model);
      res.status(200).json(sanitized);
      return;
    } catch (err) {
      lastFailure = {
        code: 'UPSTREAM_ERROR',
        message:
          err instanceof Error
            ? `Model ${model} explanation failed validation: ${err.message}`
            : `Model ${model} explanation failed validation`,
      };
    }
  }

  sendError(res, lastFailure.code, lastFailure.message);
}
