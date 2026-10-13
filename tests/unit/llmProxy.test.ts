import { readFileSync } from 'node:fs';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler, {
  buildExplainMessages,
  buildExtractMessages,
  checkRateLimit,
  DEFAULT_FALLBACK_MODELS,
  DEFAULT_PRIMARY_MODEL,
  isAllowedOrigin,
  OPENROUTER_API_URL,
  RATE_LIMIT_MAX_REQUESTS,
  resetRateLimits,
  resolveModelChain,
  sanitizeExtractResponse,
  type CatalogBreedInput,
  type CatalogFeedInput,
} from '../../api/llm';
import { verifyExplanationNumbers } from '../../src/domain/verifier';

const SAMPLE_CATALOG: CatalogFeedInput[] = [
  {
    id: 'wheat_straw',
    englishName: 'Wheat straw',
    localNameLatn: 'Bhusa / Bhoosa',
    localNameDeva: '\u0917\u0947\u0939\u0942\u0902 \u0915\u093e \u092d\u0942\u0938\u093e',
  },
  {
    id: 'mustard_cake',
    englishName: 'Mustard cake',
    localNameLatn: 'Sarson khal / Sarson ki khali',
    localNameDeva: '\u0938\u0930\u0938\u094b\u0902 \u0915\u0940 \u0916\u0932',
  },
  {
    id: 'bajra_grain',
    englishName: 'Pearl millet grain (Bajra)',
    localNameLatn: 'Bajra',
    localNameDeva: '\u092c\u093e\u091c\u0930\u093e',
  },
];

const SAMPLE_BREEDS: CatalogBreedInput[] = [
  {
    id: 'murrah',
    species: 'buffalo',
    englishName: 'Murrah',
    localNameLatn: 'Murrah',
    localNameDeva: '\u092e\u0941\u0930\u094d\u0930\u093e',
  },
  {
    id: 'sahiwal',
    species: 'cow',
    englishName: 'Sahiwal',
    localNameLatn: 'Sahiwal',
    localNameDeva: '\u0938\u093e\u0939\u0940\u0935\u093e\u0932',
  },
];

interface MockVercelContext {
  req: VercelRequest;
  res: VercelResponse;
  getStatus: () => number;
  getJson: () => unknown;
}

function createMockReqRes(body: unknown, method = 'POST'): MockVercelContext {
  let statusCode = 200;
  let jsonPayload: unknown = undefined;

  const req = {
    method,
    body,
    headers: {},
    query: {},
    cookies: {},
  } as unknown as VercelRequest;

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      jsonPayload = payload;
      return this;
    },
    send(payload: unknown) {
      jsonPayload = payload;
      return this;
    },
  } as unknown as VercelResponse;

  return {
    req,
    res,
    getStatus: () => statusCode,
    getJson: () => jsonPayload,
  };
}

function mockOpenRouterOk(content: string | Record<string, unknown>): Response {
  const serialized = typeof content === 'string' ? content : JSON.stringify(content);
  return new Response(
    JSON.stringify({
      choices: [{ message: { role: 'assistant', content: serialized } }],
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

describe('POST /api/llm serverless OpenRouter proxy (M2-TASK-02)', () => {
  const originalEnv = { ...process.env };
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    resetRateLimits();
    process.env = {
      ...originalEnv,
      OPENROUTER_API_KEY: 'test-or-key-123',
      OPENROUTER_MODEL: '',
      OPENROUTER_FALLBACK_MODELS: '',
    };
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it('keeps api/llm.ts free of Devanagari literals and Intl.NumberFormat / toLocaleString', () => {
    const src = readFileSync('api/llm.ts', 'utf8');
    expect(/[\u0900-\u097F]/.test(src)).toBe(false);
    expect(/toLocaleString|Intl\.NumberFormat/.test(src)).toBe(false);
  });

  it('resolves default primary and fallback models and deduplicates custom model chains', () => {
    expect(resolveModelChain({})).toEqual([
      DEFAULT_PRIMARY_MODEL,
      ...DEFAULT_FALLBACK_MODELS,
    ]);

    expect(
      resolveModelChain({
        OPENROUTER_MODEL: 'custom/primary:free',
        OPENROUTER_FALLBACK_MODELS: 'custom/fallback-1:free, custom/primary:free, custom/fallback-2:free',
      }),
    ).toEqual([
      'custom/primary:free',
      'custom/fallback-1:free',
      'custom/fallback-2:free',
    ]);
  });

  it('calls the primary model for action: "extract", normalizes Devanagari digits, and returns sanitized ExtractionResponse (AC-2.3, AC-L1.5)', async () => {
    fetchMock.mockResolvedValueOnce(
      mockOpenRouterOk({
        animal: {
          species: 'buffalo',
          breedId: 'murrah',
          bodyWeightKg: 450,
          milkYieldLitersPerDay: 8,
          milkFatPct: 6.5,
        },
        breedId: 'murrah',
        budgetInrPerDay: 250,
        matchedFeeds: [
          { feedId: 'wheat_straw', priceInrPerKgAsFed: null, maxKgAsFedPerDay: null },
          { feedId: 'mustard_cake', priceInrPerKgAsFed: null, maxKgAsFedPerDay: null },
        ],
        unmatchedFeeds: [],
      }),
    );

    const { req, res, getStatus, getJson } = createMockReqRes({
      action: 'extract',
      freeText:
        '\u096A\u096B\u0966 kilo ki Murrah bhains 8 litre doodh deti hai, 6.5% fat, gehun ka bhusa aur sarson khali hai, 250 rupaye roz',
      catalog: SAMPLE_CATALOG,
      breeds: SAMPLE_BREEDS,
    });

    await handler(req, res);

    expect(getStatus()).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(OPENROUTER_API_URL);
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-or-key-123');

    const sentBody = JSON.parse(String(init?.body)) as {
      model: string;
      messages: { role: string; content: string }[];
    };
    expect(sentBody.model).toBe(DEFAULT_PRIMARY_MODEL);
    // Prompt includes Hinglish mappings and normalized Latin digits "450"
    expect(sentBody.messages[0].content).toContain('bhains');
    expect(sentBody.messages[0].content).toContain('gaay');
    expect(sentBody.messages[0].content).toContain('rupaye roz');
    expect(sentBody.messages[1].content).toContain('450 kilo ki Murrah bhains');

    expect(getJson()).toEqual({
      action: 'extract',
      modelUsed: DEFAULT_PRIMARY_MODEL,
      animal: {
        species: 'buffalo',
        bodyWeightKg: 450,
        milkYieldLitersPerDay: 8,
        milkFatPct: 6.5,
      },
      breedId: 'murrah',
      budgetInrPerDay: 250,
      matchedFeeds: [
        { feedId: 'wheat_straw', priceInrPerKgAsFed: null, maxKgAsFedPerDay: null },
        { feedId: 'mustard_cake', priceInrPerKgAsFed: null, maxKgAsFedPerDay: null },
      ],
      unmatchedFeeds: [],
    });
  });

  it('enforces nutrient, price, season, and breed-cap safety and preserves unmatched feed names (AC-2.3, AC-E5.1)', async () => {
    // LLM attempts to inject out-of-species breedId ('sahiwal' for a buffalo), nutrient fields,
    // price fields, breed cap numbers, an unknown feed in matchedFeeds, and an unmatched feed.
    fetchMock.mockResolvedValueOnce(
      mockOpenRouterOk({
        animal: {
          species: 'buffalo',
          breedId: 'sahiwal',
          bodyWeightKg: 480,
          milkYieldLitersPerDay: 9,
          milkFatPct: 7.0,
          milkCapLPerDay: 25.0,
          cpGramsPerDay: 1500,
        },
        breedId: 'sahiwal',
        budgetInrPerDay: 240,
        matchedFeeds: [
          {
            feedId: 'wheat_straw',
            priceInrPerKgAsFed: 99,
            defaultPriceInrPerKgAsFed: 99,
            cpPctDm: 45.0,
            meMcalPerKgDm: 3.5,
            dmPct: 90,
            availableMonths: [1, 2, 3],
            maxKgAsFedPerDay: 8,
          },
          {
            feedId: 'magic_calcium_booster',
            priceInrPerKgAsFed: 120,
            caGramsPerKgDm: 300,
          },
        ],
        unmatchedFeeds: ['magic probiotic mix'],
      }),
    );

    const { req, res, getStatus, getJson } = createMockReqRes({
      action: 'extract',
      freeText: '480 kg buffalo giving 9 L milk at 7% fat, wheat straw, magic probiotic mix, magic calcium booster',
      catalog: SAMPLE_CATALOG,
      breeds: SAMPLE_BREEDS,
    });

    await handler(req, res);

    expect(getStatus()).toBe(200);
    const payload = getJson() as Record<string, unknown>;
    // Out-of-species breed ('sahiwal' is cow, animal is buffalo) is stripped to null
    expect(payload.breedId).toBeNull();
    // Animal has no injected milkCapLPerDay or cpGramsPerDay
    expect(payload.animal).toEqual({
      species: 'buffalo',
      bodyWeightKg: 480,
      milkYieldLitersPerDay: 9,
      milkFatPct: 7.0,
    });
    // matchedFeeds contains only catalog feeds, with priceInrPerKgAsFed forced to null and all nutrient/season fields stripped
    expect(payload.matchedFeeds).toEqual([
      {
        feedId: 'wheat_straw',
        priceInrPerKgAsFed: null,
        maxKgAsFedPerDay: 8,
      },
    ]);
    // Both the out-of-catalog feed from matchedFeeds and the item in unmatchedFeeds are preserved in unmatchedFeeds
    expect(payload.unmatchedFeeds).toEqual(['magic_calcium_booster', 'magic probiotic mix']);

    // Also test direct sanitizeExtractResponse with completely unknown breedId
    const sanitizedUnknownBreed = sanitizeExtractResponse(
      {
        animal: { species: 'cow', bodyWeightKg: 400, milkYieldLitersPerDay: 6, milkFatPct: 4.5 },
        breedId: 'invented_super_cow',
        matchedFeeds: ['Sarson khal'],
        unmatchedFeeds: ['herbal tonic'],
      },
      SAMPLE_CATALOG,
      SAMPLE_BREEDS,
      'test-model',
    );
    expect(sanitizedUnknownBreed.breedId).toBeNull();
    expect(sanitizedUnknownBreed.matchedFeeds).toEqual([
      { feedId: 'mustard_cake', priceInrPerKgAsFed: null, maxKgAsFedPerDay: null },
    ]);
    expect(sanitizedUnknownBreed.unmatchedFeeds).toEqual(['herbal tonic']);

    // Also verify buildExtractMessages strips nutrient/price/cap fields if full FeedItem/BreedStandard objects are passed
    const fullCatalogWithNutrients = [
      {
        ...SAMPLE_CATALOG[0],
        cpPctDm: 3.5,
        meMcalPerKgDm: 1.4,
        defaultPriceInrPerKgAsFed: 7,
      },
    ];
    const fullBreedsWithCaps = [
      {
        ...SAMPLE_BREEDS[0],
        milkCapLPerDay: 9.64,
        peakDailyYieldKg: 9.64,
      },
    ];
    const messages = buildExtractMessages(
      '450 kg Murrah buffalo',
      fullCatalogWithNutrients,
      fullBreedsWithCaps,
    );
    expect(messages[1].content).not.toContain('9.64');
    expect(messages[1].content).not.toContain('cpPctDm');
  });

  it('automatically retries across the fallback chain on HTTP 429 and HTTP 502 and returns the working fallback model (AC-E4.1, AC-E4.2)', async () => {
    process.env.OPENROUTER_MODEL = 'model-primary:free';
    process.env.OPENROUTER_FALLBACK_MODELS = 'model-fallback-1:free,model-fallback-2:free';

    // 1st model -> 429 Rate Limited
    fetchMock.mockResolvedValueOnce(new Response('Rate limited', { status: 429 }));
    // 2nd model -> 502 Bad Gateway
    fetchMock.mockResolvedValueOnce(new Response('Bad gateway', { status: 502 }));
    // 3rd model -> 200 OK
    fetchMock.mockResolvedValueOnce(
      mockOpenRouterOk({
        animal: {
          species: 'cow',
          bodyWeightKg: 380,
          milkYieldLitersPerDay: 10,
          milkFatPct: 4.5,
        },
        breedId: 'sahiwal',
        budgetInrPerDay: 200,
        matchedFeeds: [{ feedId: 'bajra_grain', priceInrPerKgAsFed: null, maxKgAsFedPerDay: null }],
        unmatchedFeeds: [],
      }),
    );

    const { req, res, getStatus, getJson } = createMockReqRes({
      action: 'extract',
      freeText: '380 kg Sahiwal cow giving 10 L milk at 4.5% fat with bajra, 200 rs budget',
      catalog: SAMPLE_CATALOG,
      breeds: SAMPLE_BREEDS,
    });

    await handler(req, res);

    expect(getStatus()).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const calledModels = fetchMock.mock.calls.map(
      (call) => (JSON.parse(String(call[1]?.body)) as { model: string }).model,
    );
    expect(calledModels).toEqual([
      'model-primary:free',
      'model-fallback-1:free',
      'model-fallback-2:free',
    ]);

    expect(getJson()).toMatchObject({
      action: 'extract',
      modelUsed: 'model-fallback-2:free',
      breedId: 'sahiwal',
      budgetInrPerDay: 200,
    });
  });

  it('returns structured RATE_LIMITED (429), UPSTREAM_ERROR (502), and TIMEOUT (504) when all models in the chain fail (AC-E4.1, AC-E4.2)', async () => {
    process.env.OPENROUTER_MODEL = 'm1:free';
    process.env.OPENROUTER_FALLBACK_MODELS = 'm2:free';

    // Case 1: All models fail with 429 -> 429 RATE_LIMITED
    fetchMock
      .mockResolvedValueOnce(new Response('Too Many Requests', { status: 429 }))
      .mockResolvedValueOnce(new Response('Too Many Requests', { status: 429 }));

    const ctx429 = createMockReqRes({
      action: 'extract',
      freeText: '450 kg buffalo giving 8 L milk',
      catalog: SAMPLE_CATALOG,
      breeds: SAMPLE_BREEDS,
    });
    await handler(ctx429.req, ctx429.res);
    expect(ctx429.getStatus()).toBe(429);
    expect(ctx429.getJson()).toMatchObject({
      error: { code: 'RATE_LIMITED' },
    });

    // Case 2: All models fail with 502/503 -> 502 UPSTREAM_ERROR
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }))
      .mockResolvedValueOnce(new Response('Service Unavailable', { status: 503 }));

    const ctx502 = createMockReqRes({
      action: 'extract',
      freeText: '450 kg buffalo giving 8 L milk',
      catalog: SAMPLE_CATALOG,
      breeds: SAMPLE_BREEDS,
    });
    await handler(ctx502.req, ctx502.res);
    expect(ctx502.getStatus()).toBe(502);
    expect(ctx502.getJson()).toMatchObject({
      error: { code: 'UPSTREAM_ERROR' },
    });

    // Case 3: Upstream timeout (AbortError) across chain -> 504 TIMEOUT
    fetchMock.mockReset();
    const abortErr = new DOMException('The operation was aborted', 'AbortError');
    fetchMock.mockRejectedValueOnce(abortErr).mockRejectedValueOnce(abortErr);

    const ctxTimeout = createMockReqRes({
      action: 'extract',
      freeText: '450 kg buffalo giving 8 L milk',
      catalog: SAMPLE_CATALOG,
      breeds: SAMPLE_BREEDS,
    });
    await handler(ctxTimeout.req, ctxTimeout.res);
    expect(ctxTimeout.getStatus()).toBe(504);
    expect(ctxTimeout.getJson()).toMatchObject({
      error: { code: 'TIMEOUT' },
    });
  });

  it('validates requests and returns INVALID_REQUEST (400) for malformed inputs', async () => {
    // Non-POST method
    const getCtx = createMockReqRes({ action: 'extract' }, 'GET');
    await handler(getCtx.req, getCtx.res);
    expect(getCtx.getStatus()).toBe(400);
    expect(getCtx.getJson()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });

    // Empty freeText
    const emptyTextCtx = createMockReqRes({
      action: 'extract',
      freeText: '   ',
      catalog: SAMPLE_CATALOG,
      breeds: SAMPLE_BREEDS,
    });
    await handler(emptyTextCtx.req, emptyTextCtx.res);
    expect(emptyTextCtx.getStatus()).toBe(400);
    expect(emptyTextCtx.getJson()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });

    // Over 1000 chars freeText
    const longTextCtx = createMockReqRes({
      action: 'extract',
      freeText: 'a'.repeat(1001),
      catalog: SAMPLE_CATALOG,
      breeds: SAMPLE_BREEDS,
    });
    await handler(longTextCtx.req, longTextCtx.res);
    expect(longTextCtx.getStatus()).toBe(400);
    expect(longTextCtx.getJson()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });

    // Invalid explain request (empty authorizedNumbers)
    const badExplainCtx = createMockReqRes({
      action: 'explain',
      attempt: 1,
      authorizedNumbers: [],
      rationSummary: {},
    });
    await handler(badExplainCtx.req, badExplainCtx.res);
    expect(badExplainCtx.getStatus()).toBe(400);
    expect(badExplainCtx.getJson()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
  });

  it('handles action: "explain" on attempt 1 and attempt 2 (forbidding flaggedNumbers) and returns plain-English explanation (AC-7.1, AC-E6.1, AC-L1.6)', async () => {
    const authorizedNumbers = [
      { label: 'Body weight (kg)', value: 450, formatted: '450' },
      { label: "Today's milk (L/day)", value: 8, formatted: '8.0' },
      { label: 'Supported milk (L/day)', value: 9.1, formatted: '9.1' },
      { label: 'Milk possible above today (L/day)', value: 1.1, formatted: '1.1' },
      { label: 'Breed milk cap (L/day)', value: 9.64, formatted: '9.64' },
      { label: 'Budget (INR/day)', value: 250, formatted: '250.00' },
      { label: 'Total cost (INR/day)', value: 231.4, formatted: '231.40' },
      { label: 'Wheat straw (kg/day as fed)', value: 7.1, formatted: '7.10' },
    ];

    const rationSummary = {
      species: 'buffalo',
      breed: 'Murrah',
      supportedMilkLPerDay: 9.1,
      verdict: { kind: 'gain', gainLPerDay: 1.1 },
      feeds: [{ name: 'Wheat straw', kgAsFedPerDay: 7.1, costInr: 49.7 }],
      totalCostInrPerDay: 231.4,
      budgetInrPerDay: 250,
    };

    const validExplanation =
      'Your 450 kg Murrah buffalo gives 8.0 L a day. With these feeds, a budget of ₹250.00 a day supports 9.1 L, so 1.1 L more is possible, below the cited Murrah peak of 9.64 L. Feed 7.10 kg of Wheat straw for a total cost of ₹231.40 per day.';

    fetchMock.mockResolvedValueOnce(
      mockOpenRouterOk({
        explanationText: validExplanation,
      }),
    );

    const ctx1 = createMockReqRes({
      action: 'explain',
      attempt: 2,
      authorizedNumbers,
      rationSummary,
      flaggedNumbers: ['31.7', '14.2'],
    });

    await handler(ctx1.req, ctx1.res);

    expect(ctx1.getStatus()).toBe(200);
    const payload = ctx1.getJson() as {
      action: string;
      modelUsed: string;
      explanationText: string;
    };
    expect(payload).toEqual({
      action: 'explain',
      modelUsed: DEFAULT_PRIMARY_MODEL,
      explanationText: validExplanation,
    });

    // Verify attempt 2 prompt explicitly forbids the flaggedNumbers and instructs English-only, no veterinary advice
    const messages = buildExplainMessages({
      action: 'explain',
      attempt: 2,
      authorizedNumbers,
      rationSummary,
      flaggedNumbers: ['31.7', '14.2'],
    });
    expect(messages[0].content).toContain('Plain English ONLY');
    expect(messages[0].content).toContain('No veterinary');
    expect(messages[0].content).toContain('31.7, 14.2');

    // Verify the returned explanation passes the client-side verifier
    const verification = verifyExplanationNumbers(payload.explanationText, authorizedNumbers);
    expect(verification.status).toBe('verified');
    expect(verification.verifiedCount).toBe(8);
  });

  it('covers explain model fallback on upstream error/invalid output, Devanagari feed/breed matching, and missing API key handling', async () => {
    // 1. Missing OPENROUTER_API_KEY -> 502 UPSTREAM_ERROR
    process.env.OPENROUTER_API_KEY = '   ';
    const noKeyCtx = createMockReqRes({
      action: 'extract',
      freeText: '450 kg buffalo',
      catalog: SAMPLE_CATALOG,
      breeds: SAMPLE_BREEDS,
    });
    await handler(noKeyCtx.req, noKeyCtx.res);
    expect(noKeyCtx.getStatus()).toBe(502);
    expect(noKeyCtx.getJson()).toMatchObject({ error: { code: 'UPSTREAM_ERROR' } });

    // Restore key and configure 2-model chain
    process.env.OPENROUTER_API_KEY = 'test-or-key-123';
    process.env.OPENROUTER_MODEL = 'primary-explain:free';
    process.env.OPENROUTER_FALLBACK_MODELS = 'fallback-explain:free';

    // 2. Invalid attempt number -> 400 INVALID_REQUEST
    const badAttemptCtx = createMockReqRes({
      action: 'explain',
      attempt: 3,
      authorizedNumbers: [{ label: 'Body weight (kg)', value: 450, formatted: '450' }],
      rationSummary: { species: 'buffalo' },
    });
    await handler(badAttemptCtx.req, badAttemptCtx.res);
    expect(badAttemptCtx.getStatus()).toBe(400);
    expect(badAttemptCtx.getJson()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });

    // 3. Explain fallback: primary returns empty explanation JSON, fallback returns valid markdown-fenced JSON
    fetchMock
      .mockResolvedValueOnce(mockOpenRouterOk({ explanationText: '   ' }))
      .mockResolvedValueOnce(
        mockOpenRouterOk('```json\n{"explanationText": "The 450 kg buffalo ration is balanced."}\n```'),
      );

    const explainFallbackCtx = createMockReqRes({
      action: 'explain',
      attempt: 1,
      authorizedNumbers: [{ label: 'Body weight (kg)', value: 450, formatted: '450' }],
      rationSummary: { species: 'buffalo' },
    });
    await handler(explainFallbackCtx.req, explainFallbackCtx.res);
    expect(explainFallbackCtx.getStatus()).toBe(200);
    expect(explainFallbackCtx.getJson()).toEqual({
      action: 'explain',
      modelUsed: 'fallback-explain:free',
      explanationText: 'The 450 kg buffalo ration is balanced.',
    });

    // 4. Devanagari breed and feed matching in sanitizeExtractResponse (AC-L1.5)
    const devaSanitized = sanitizeExtractResponse(
      {
        animal: { species: 'buffalo', bodyWeightKg: 450, milkYieldLitersPerDay: 8, milkFatPct: 6.5 },
        breedId: '\u092e\u0941\u0930\u094d\u0930\u093e',
        matchedFeeds: ['\u092c\u093e\u091c\u0930\u093e'],
        unmatchedFeeds: [],
      },
      SAMPLE_CATALOG,
      SAMPLE_BREEDS,
      'primary-explain:free',
    );
    expect(devaSanitized.breedId).toBe('murrah');
    expect(devaSanitized.matchedFeeds).toEqual([
      { feedId: 'bajra_grain', priceInrPerKgAsFed: null, maxKgAsFedPerDay: null },
    ]);
  });

  it('enforces origin validation and blocks untrusted cross-origin requests', async () => {
    // 1. Helper function checks
    expect(isAllowedOrigin(undefined, 'sahidana.vercel.app')).toBe(true);
    expect(isAllowedOrigin('http://localhost:5173', 'localhost:5173')).toBe(true);
    expect(isAllowedOrigin('https://project-sahidana.vercel.app', 'project-sahidana.vercel.app')).toBe(true);
    expect(isAllowedOrigin('https://malicious-site.example.com', 'sahidana.vercel.app')).toBe(false);

    // 2. Handler enforcement: untrusted origin is rejected with INVALID_REQUEST
    const badOriginCtx = createMockReqRes({
      action: 'extract',
      freeText: 'cow 400 kg',
      catalog: SAMPLE_CATALOG,
      breeds: SAMPLE_BREEDS,
    });
    (badOriginCtx.req.headers as Record<string, string>)['origin'] = 'https://unauthorized-domain.com';
    await handler(badOriginCtx.req, badOriginCtx.res);
    expect(badOriginCtx.getStatus()).toBe(400);
    expect(badOriginCtx.getJson()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
  });

  it('enforces sliding-window IP rate limiting to protect free OpenRouter quota', async () => {
    const testIp = '192.168.1.100';
    resetRateLimits();

    // First RATE_LIMIT_MAX_REQUESTS succeed
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) {
      expect(checkRateLimit(testIp)).toBe(true);
    }
    // Next request exceeds rate limit
    expect(checkRateLimit(testIp)).toBe(false);

    // Rate limit window reset works
    expect(checkRateLimit(testIp, Date.now() + 61_000)).toBe(true);

    // Handler enforcement: 429 RATE_LIMITED returned
    resetRateLimits();
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) {
      checkRateLimit('10.0.0.1');
    }
    const rateLimitedCtx = createMockReqRes({
      action: 'extract',
      freeText: 'cow 400 kg',
      catalog: SAMPLE_CATALOG,
      breeds: SAMPLE_BREEDS,
    });
    (rateLimitedCtx.req.headers as Record<string, string>)['x-forwarded-for'] = '10.0.0.1';
    await handler(rateLimitedCtx.req, rateLimitedCtx.res);
    expect(rateLimitedCtx.getStatus()).toBe(429);
    expect(rateLimitedCtx.getJson()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
  });
});

