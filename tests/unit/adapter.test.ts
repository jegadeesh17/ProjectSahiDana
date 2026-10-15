import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { FeedChip, FeedName } from '../../src/components/FeedName';
import { auditRoughageMin, auditRoughageShare } from '../../src/domain/audit';
import { VERTICAL_CLASS } from '../../src/domain/feedNames';
import { DEMO_CASES } from '../../src/domain/presets';
import type { AnimalProfile, FeedItem, RationAppAdapter, SelectedFeedInput } from '../../src/domain/types';
import { todayCostInr, validateAnimal, validateFeed } from '../../src/domain/validation';
import { LanguageProvider } from '../../src/i18n/LanguageProvider';
import { LANG_STORAGE_KEY, setActiveLang } from '../../src/i18n/lang';
import { LIVE_BREEDS, LIVE_FEEDS, liveAdapter } from '../../src/services/liveAdapter';
import { mockAdapter, mockControls } from '../../src/services/mockAdapter';
import {
  ADAPTERS,
  getInitialBreeds,
  getInitialFeeds,
  getRationAdapterMode,
  PROTOTYPE_BREEDS,
  PROTOTYPE_FEEDS,
  rationService,
  selectAdapter,
  setRationAdapterMode,
} from '../../src/services/rationService';

const SAMPLE_ANIMAL: AnimalProfile = {
  species: 'buffalo',
  breedId: 'murrah',
  bodyWeightKg: 450,
  milkYieldLitersPerDay: 8,
  milkFatPct: 6.5,
  budgetInrPerDay: 220,
  isConfirmed: true,
};

const SAMPLE_FEEDS: SelectedFeedInput[] = [
  { feedId: 'wheat_straw', priceInrPerKgAsFed: 6, maxKgAsFedPerDay: 8, currentKgAsFedPerDay: 4 },
  { feedId: 'maize_green', priceInrPerKgAsFed: 2.5, maxKgAsFedPerDay: 40, currentKgAsFedPerDay: 20 },
  { feedId: 'bajra_grain', priceInrPerKgAsFed: 24, maxKgAsFedPerDay: 6, currentKgAsFedPerDay: 4 },
  { feedId: 'wheat_bran', priceInrPerKgAsFed: 20, maxKgAsFedPerDay: 5, currentKgAsFedPerDay: 2 },
  { feedId: 'mustard_cake', priceInrPerKgAsFed: 33, maxKgAsFedPerDay: 3, currentKgAsFedPerDay: 2.5 },
  { feedId: 'mineral_mix', priceInrPerKgAsFed: 70, maxKgAsFedPerDay: 0.15, currentKgAsFedPerDay: 0.1 },
];

describe('rationService & RationAppAdapter contract (mockAdapter and liveAdapter)', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = () => undefined;
    window.localStorage.clear();
    setActiveLang('en');
    setRationAdapterMode('env');
    mockControls.behavior.llm = 'ok';
    mockControls.behavior.explain = 'verified';
    mockControls.behavior.latencyMs = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
    window.localStorage.clear();
    setActiveLang('en');
    document.documentElement.lang = 'en';
    setRationAdapterMode('env');
    mockControls.behavior.llm = 'ok';
    mockControls.behavior.explain = 'verified';
    mockControls.behavior.latencyMs = 900;
  });

  it('defaults to liveAdapter for production builds unless VITE_USE_MOCK_ADAPTER is explicitly true, and allows mode overrides', async () => {
    expect(selectAdapter(true)).toBe(mockAdapter);
    expect(selectAdapter(false)).toBe(liveAdapter);

    // Default when modeOverride === 'env' and VITE_USE_MOCK_ADAPTER is unset (undefined) or 'false'
    const prevVite = import.meta.env.VITE_USE_MOCK_ADAPTER;
    const prevProc = process.env.VITE_USE_MOCK_ADAPTER;
    try {
      delete (import.meta.env as Record<string, unknown>).VITE_USE_MOCK_ADAPTER;
      delete process.env.VITE_USE_MOCK_ADAPTER;
      expect(getRationAdapterMode()).toBe('live');

      process.env.VITE_USE_MOCK_ADAPTER = 'true';
      expect(getRationAdapterMode()).toBe('mock');

      process.env.VITE_USE_MOCK_ADAPTER = 'false';
      expect(getRationAdapterMode()).toBe('live');
    } finally {
      (import.meta.env as Record<string, unknown>).VITE_USE_MOCK_ADAPTER = prevVite;
      if (prevProc === undefined) {
        delete process.env.VITE_USE_MOCK_ADAPTER;
      } else {
        process.env.VITE_USE_MOCK_ADAPTER = prevProc;
      }
    }

    setRationAdapterMode('mock');
    expect(getRationAdapterMode()).toBe('mock');
    expect(getInitialFeeds()).toBe(PROTOTYPE_FEEDS);
    expect(getInitialBreeds()).toBe(PROTOTYPE_BREEDS);
    expect(await rationService.getFeedLibrary()).toBe(PROTOTYPE_FEEDS);

    setRationAdapterMode('live');
    expect(getRationAdapterMode()).toBe('live');
    expect(getInitialFeeds()).toBe(LIVE_FEEDS);
    expect(getInitialBreeds()).toBe(LIVE_BREEDS);
    expect(await rationService.getFeedLibrary()).toBe(LIVE_FEEDS);
    expect(await rationService.getBreedLibrary()).toBe(LIVE_BREEDS);
  });

  for (const [mode, adapter] of Object.entries(ADAPTERS) as [keyof typeof ADAPTERS, RationAppAdapter][]) {
    describe(`${mode} adapter contract`, () => {
      it('getFeedLibrary and getBreedLibrary return populated libraries covering all verticals and species', async () => {
        const feeds = await adapter.getFeedLibrary();
        const breeds = await adapter.getBreedLibrary();
        expect(feeds.length).toBeGreaterThanOrEqual(15);
        expect(breeds.length).toBe(16);
        const verticals = new Set(feeds.map((f) => f.vertical));
        expect(verticals).toEqual(new Set(['indigenous_forage', 'crop_residue', 'agro_byproduct', 'mineral']));
        expect(breeds.filter((b) => b.species === 'cow').length).toBe(10);
        expect(breeds.filter((b) => b.species === 'buffalo').length).toBe(6);
      });

      it('computeRequirements returns positive requirements and 5 nutrient citations', () => {
        const req = adapter.computeRequirements(SAMPLE_ANIMAL);
        expect(req.requirements.dmKgPerDay).toBeGreaterThan(0);
        expect(req.requirements.cpGramsPerDay).toBeGreaterThan(0);
        expect(req.requirements.meMcalPerDay).toBeGreaterThan(0);
        expect(req.requirements.caGramsPerDay).toBeGreaterThan(0);
        expect(req.requirements.pGramsPerDay).toBeGreaterThan(0);
        for (const k of ['DM', 'CP', 'ME', 'Ca', 'P'] as const) {
          expect(req.citations[k].sourceDoc.length).toBeGreaterThan(0);
          expect(req.citations[k].formulaDisplay.length).toBeGreaterThan(0);
          if (mode === 'live') {
            expect(req.citations[k].provenanceStatus).toBe('cited');
          }
        }
      });

      it('solveRation solves optimal, infeasible, and budget_below_maintenance cases', () => {
        const optimal = adapter.solveRation(SAMPLE_ANIMAL, SAMPLE_FEEDS);
        expect(optimal.status).toBe('optimal');
        if (optimal.status === 'optimal') {
          expect(optimal.roughageMinSharePct).toBeCloseTo(40, 5);
          expect(optimal.roughageSharePct).toBeGreaterThanOrEqual(40 - 1e-4);
          expect(optimal.totalCostInr).toBeLessThanOrEqual(SAMPLE_ANIMAL.budgetInrPerDay + 1e-6);
          expect('costAtCapInrPerDay' in optimal).toBe(true);
          expect(optimal.costAtCapInrPerDay === null || typeof optimal.costAtCapInrPerDay === 'number').toBe(true);
          if (mode === 'mock') {
            expect(optimal.costAtCapInrPerDay).toBeNull();
          } else {
            expect(optimal.sourceKey).toBe('SOLVER-LP-V1');
            expect(typeof optimal.costAtCapInrPerDay).toBe('number');
            expect(optimal.costAtCapInrPerDay).toBeGreaterThan(0);
          }
        }

        const infeasible = adapter.solveRation(SAMPLE_ANIMAL, [
          { feedId: 'wheat_straw', priceInrPerKgAsFed: 6, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
        ]);
        expect(infeasible.status).toBe('infeasible');

        const shortfall = adapter.solveRation(
          { ...SAMPLE_ANIMAL, budgetInrPerDay: 20 },
          SAMPLE_FEEDS.map((f) => ({ ...f, currentKgAsFedPerDay: null })),
        );
        expect(shortfall.status).toBe('budget_below_maintenance');
      });

      it('extractFromText and explainRation fulfill the async contract', async () => {
        if (mode === 'live') {
          vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
            const body = JSON.parse(String(init?.body ?? '{}'));
            if (body.action === 'extract') {
              return new Response(
                JSON.stringify({
                  action: 'extract',
                  modelUsed: 'meta-llama/llama-3.3-70b-instruct:free',
                  animal: {
                    species: 'buffalo',
                    bodyWeightKg: 450,
                    milkYieldLitersPerDay: 8,
                    milkFatPct: 6.5,
                  },
                  breedId: 'murrah',
                  budgetInrPerDay: 180,
                  matchedFeeds: [
                    { feedId: 'wheat_straw', priceInrPerKgAsFed: null, maxKgAsFedPerDay: null },
                    { feedId: 'mustard_cake', priceInrPerKgAsFed: null, maxKgAsFedPerDay: null },
                  ],
                  unmatchedFeeds: [],
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } },
              );
            }
            return new Response(
              JSON.stringify({
                action: 'explain',
                modelUsed: 'meta-llama/llama-3.3-70b-instruct:free',
                explanationText:
                  'Your 450 kg Murrah buffalo gives 8 L of milk a day at 6.5% fat. A budget of ₹220.00 per day supports 9.6 L of milk a day, below the breed cap of 9.64 L.',
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            );
          });
        }

        const extracted = await adapter.extractFromText(
          '450 kg Murrah buffalo giving 8 litre milk at 6.5% fat with wheat straw and mustard cake, budget 180',
        );
        expect(extracted.action).toBe('extract');
        expect(extracted.animal.species).toBe('buffalo');
        expect(extracted.animal.bodyWeightKg).toBe(450);
        expect(extracted.breedId).toBe('murrah');
        if (mode === 'live') {
          expect(extracted.budgetInrPerDay).toBe(180);
        }
        expect(extracted.matchedFeeds.map((m) => m.feedId)).toEqual(
          expect.arrayContaining(['wheat_straw', 'mustard_cake']),
        );

        const optimal = adapter.solveRation(SAMPLE_ANIMAL, SAMPLE_FEEDS);
        expect(optimal.status).toBe('optimal');
        if (optimal.status === 'optimal') {
          const feeds = await adapter.getFeedLibrary();
          const requirement = adapter.computeRequirements({
            ...SAMPLE_ANIMAL,
            milkYieldLitersPerDay: optimal.supportedMilkLPerDay,
          });
          const explained = await adapter.explainRation({
            animal: SAMPLE_ANIMAL,
            requirement,
            solution: optimal,
            feeds,
          });
          expect(explained.status).toBe('verified');
          if (explained.status === 'verified') {
            expect(explained.verifiedCount).toBeGreaterThan(0);
          }
        }
      });

      it('all 12 DEMO_CASES produce their expected outcomes under this adapter', () => {
        setRationAdapterMode(mode);
        const expectedByKey: Record<string, { status: string; verdict?: string }> = {
          gain: { status: 'optimal', verdict: 'gain' },
          at_level: { status: 'optimal', verdict: 'at_breed_level' },
          below_cost: { status: 'optimal', verdict: 'below_today' },
          below_no: { status: 'optimal', verdict: 'below_today' },
          same: { status: 'optimal', verdict: 'same_as_today' },
          shortfall: { status: 'budget_below_maintenance' },
          infeasible: { status: 'infeasible' },
          nondescript: { status: 'optimal' },
          kankrej: { status: 'optimal' },
          above: { status: 'optimal', verdict: 'above_breed_level' },
          roughage: { status: 'infeasible' },
          dry: { status: 'optimal', verdict: 'dry_animal' },
        };

        for (const c of DEMO_CASES) {
          const animalDraft = c.preset.animal;
          const feedDrafts = c.preset.feeds;
          const checked = validateAnimal(animalDraft, todayCostInr(feedDrafts));
          expect(checked.profile, `${mode}:${c.key} profile`).toBeTruthy();
          const inputs = feedDrafts.map((d) => validateFeed(d).input!);
          const outcome = adapter.solveRation({ ...checked.profile!, isConfirmed: true }, inputs);
          const exp = expectedByKey[c.key];
          expect(outcome.status, `${mode}:${c.key} status`).toBe(exp.status);
          if (exp.verdict && outcome.status === 'optimal') {
            expect(
              outcome.verdict.kind,
              `${mode}:${c.key} verdict ${JSON.stringify(outcome.verdict)} (S=${outcome.supportedMilkLPerDay})`,
            ).toBe(exp.verdict);
          }
        }
      });
    });
  }
});

describe('liveAdapter /api/llm integration, breed validation, and verifier retry flow (M2-TASK-03)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('extractFromText posts toLatinDigits(freeText), v1 catalog, and v1 breeds to /api/llm and drops cross-species breedId (AC-2.3, AC-E5.1, AC-L1.5)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          action: 'extract',
          modelUsed: 'meta-llama/llama-3.3-70b-instruct:free',
          animal: {
            species: 'buffalo',
            bodyWeightKg: 450,
            milkYieldLitersPerDay: 8,
            milkFatPct: 6.5,
          },
          // Cross-species breed ('sahiwal' is a cow breed, whereas species is 'buffalo')
          breedId: 'sahiwal',
          budgetInrPerDay: 250,
          matchedFeeds: [
            { feedId: 'wheat_straw', priceInrPerKgAsFed: 999, maxKgAsFedPerDay: null },
          ],
          unmatchedFeeds: ['magic probiotic mix'],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    // Input includes Devanagari digits ४५० (450) and ८ (8)
    const devanagariDigitInput =
      '\u096A\u096B\u0966 kilo ki bhains \u096E litre doodh deti hai, 6.5% fat, gehun ka bhusa aur magic probiotic mix';
    const res = await liveAdapter.extractFromText(devanagariDigitInput);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/llm');
    expect(init?.method).toBe('POST');
    const sentBody = JSON.parse(String(init?.body));
    expect(sentBody.action).toBe('extract');
    expect(sentBody.freeText).toContain('450 kilo ki bhains 8 litre doodh');
    expect(Array.isArray(sentBody.catalog)).toBe(true);
    expect(sentBody.catalog.length).toBe(LIVE_FEEDS.length);
    // Nutrient safety: catalog entries sent to /api/llm contain only id and names
    expect(sentBody.catalog[0]).not.toHaveProperty('cpPctDm');
    expect(Array.isArray(sentBody.breeds)).toBe(true);
    expect(sentBody.breeds.length).toBe(LIVE_BREEDS.length);

    // AC-2.3: cross-species breedId ('sahiwal' for 'buffalo') must be dropped to null
    expect(res.breedId).toBeNull();
    expect(res.budgetInrPerDay).toBe(250);
    expect(res.unmatchedFeeds).toEqual(['magic probiotic mix']);
    // AC-E5.1: LLM-injected priceInrPerKgAsFed is never trusted
    expect(res.matchedFeeds[0].priceInrPerKgAsFed).toBeNull();
  });

  it('extractFromText throws LlmError with mapped code when /api/llm returns HTTP 429, 502, 504, or 400 (AC-E4.1)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Rate limited' } }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    await expect(liveAdapter.extractFromText('450 kg Murrah buffalo')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'TIMEOUT', message: 'Timed out' } }),
        { status: 504, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    await expect(liveAdapter.extractFromText('450 kg Murrah buffalo')).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });

  it('explainRation verifies clean LLM output on attempt 1, retries once on untraced numbers (attempt 2), and falls back to template if attempt 2 fails or /api/llm errors (AC-7.1, AC-E4.2, AC-E6.1, AC-L1.6)', async () => {
    const solved = liveAdapter.solveRation(SAMPLE_ANIMAL, SAMPLE_FEEDS);
    expect(solved.status).toBe('optimal');
    if (solved.status !== 'optimal') return;

    const requirement = liveAdapter.computeRequirements({
      ...SAMPLE_ANIMAL,
      milkYieldLitersPerDay: solved.supportedMilkLPerDay,
    });
    const ctx = {
      animal: SAMPLE_ANIMAL,
      requirement,
      solution: solved,
      feeds: LIVE_FEEDS,
    };

    // Case 1: Attempt 1 has untraced number 777.77 -> triggers Attempt 2 with flaggedNumbers: ['777.77'] -> succeeds
    const retrySpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            action: 'explain',
            modelUsed: 'meta-llama/llama-3.3-70b-instruct:free',
            explanationText:
              'Your 450 kg Murrah buffalo gives 8 L a day. A budget of ₹220.00 supports 9.6 L/day with 777.77 g extra.',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            action: 'explain',
            modelUsed: 'meta-llama/llama-3.3-70b-instruct:free',
            explanationText:
              'Your 450 kg Murrah buffalo gives 8 L a day at 6.5% fat. A budget of ₹220.00 supports 9.6 L a day, below the breed cap of 9.64 L.',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const retryResult = await liveAdapter.explainRation(ctx);
    expect(retrySpy).toHaveBeenCalledTimes(2);
    const attempt1Body = JSON.parse(String(retrySpy.mock.calls[0][1]?.body));
    const attempt2Body = JSON.parse(String(retrySpy.mock.calls[1][1]?.body));
    expect(attempt1Body.attempt).toBe(1);
    expect(attempt2Body.attempt).toBe(2);
    expect(attempt2Body.flaggedNumbers).toContain('777.77');
    expect(retryResult.status).toBe('verified');
    if (retryResult.status === 'verified') {
      expect(retryResult.verifiedCount).toBe(6);
      expect(retryResult.badge).toEqual({ id: 'badge_all_verified', params: { n: 6 } });
      expect(retryResult.flaggedNumbers).toContain('777.77');
    }

    // Case 2: Both Attempt 1 and Attempt 2 contain untraced numbers -> falls back to deterministic template with reason 'untraced_numbers'
    vi.restoreAllMocks();
    const failBothSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            action: 'explain',
            modelUsed: 'meta-llama/llama-3.3-70b-instruct:free',
            explanationText: 'Your 450 kg buffalo needs 888.88 kg of feed.',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            action: 'explain',
            modelUsed: 'meta-llama/llama-3.3-70b-instruct:free',
            explanationText: 'Your 450 kg buffalo still needs 999.99 kg of feed.',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const fallbackUntraced = await liveAdapter.explainRation(ctx);
    expect(failBothSpy).toHaveBeenCalledTimes(2);
    expect(fallbackUntraced.status).toBe('deterministic_fallback');
    if (fallbackUntraced.status === 'deterministic_fallback') {
      expect(fallbackUntraced.reason).toBe('untraced_numbers');
      expect(fallbackUntraced.badge).toEqual({ id: 'badge_template_fallback' });
      expect(fallbackUntraced.flaggedNumbers).toContain('999.99');
      expect(fallbackUntraced.template.length).toBeGreaterThan(0);
    }

    // Case 2b: Attempt 1 contains Devanagari characters (AC-L1.6 language gate failure) -> triggers Attempt 2 -> succeeds
    vi.restoreAllMocks();
    const devaRetrySpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            action: 'explain',
            modelUsed: 'meta-llama/llama-3.3-70b-instruct:free',
            explanationText: 'Your 450 kg \u092E\u0941\u0930\u094D\u0930\u093E buffalo gives 8 L a day.',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            action: 'explain',
            modelUsed: 'meta-llama/llama-3.3-70b-instruct:free',
            explanationText:
              'Your 450 kg Murrah buffalo gives 8 L a day at 6.5% fat. A budget of ₹220.00 supports 9.6 L a day.',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    const devaRetryResult = await liveAdapter.explainRation(ctx);
    expect(devaRetrySpy).toHaveBeenCalledTimes(2);
    expect(devaRetryResult.status).toBe('verified');

    // Case 3: HTTP 429 on Attempt 1 -> falls back to deterministic template with reason 'llm_error' and errorCode 'RATE_LIMITED'
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Rate limited' } }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const fallbackError = await liveAdapter.explainRation(ctx);
    expect(fallbackError.status).toBe('deterministic_fallback');
    if (fallbackError.status === 'deterministic_fallback') {
      expect(fallbackError.reason).toBe('llm_error');
      expect(fallbackError.errorCode).toBe('RATE_LIMITED');
      expect(fallbackError.badge).toEqual({ id: 'badge_template_fallback' });
    }
  });
});

describe('UI wiring for v1 feed verticals, unpriced feeds, and cited roughage minimum', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = () => undefined;
    window.localStorage.clear();
    setActiveLang('en');
    setRationAdapterMode('live');
    mockControls.behavior.llm = 'ok';
    mockControls.behavior.explain = 'verified';
    mockControls.behavior.latencyMs = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
    window.localStorage.clear();
    setActiveLang('en');
    document.documentElement.lang = 'en';
    setRationAdapterMode('env');
    mockControls.behavior.latencyMs = 900;
  });

  it('FeedChip uses VERTICAL_CLASS[feed.vertical] and vertical_${feed.vertical} label; FeedName sets data-lang-exempt when localNameDeva is null', () => {
    const sampleByVertical = [
      LIVE_FEEDS.find((f) => f.vertical === 'indigenous_forage')!,
      LIVE_FEEDS.find((f) => f.vertical === 'crop_residue')!,
      LIVE_FEEDS.find((f) => f.vertical === 'agro_byproduct')!,
      LIVE_FEEDS.find((f) => f.vertical === 'mineral')!,
    ];

    for (const feed of sampleByVertical) {
      const { container, unmount } = render(
        createElement(LanguageProvider, null, createElement(FeedChip, { feed })),
      );
      const chip = container.querySelector('.chip')!;
      expect(chip.className).toContain(VERTICAL_CLASS[feed.vertical]);
      expect(chip.getAttribute('data-vertical')).toBe(feed.vertical);
      unmount();
    }

    window.localStorage.setItem(LANG_STORAGE_KEY, 'hi');
    const noDevaFeed: FeedItem = {
      ...LIVE_FEEDS[0],
      id: 'custom_no_deva',
      localNameDeva: null,
      localNameDevaProvenance: null,
    };
    const { container } = render(
      createElement(LanguageProvider, null, createElement(FeedName, { feed: noDevaFeed })),
    );
    const primary = container.querySelector('.feedname-primary')!;
    expect(primary.getAttribute('lang')).toBe('en');
    expect(primary.getAttribute('data-lang-exempt')).toBe('feed-no-deva');
  });

  it('handles unpriced v1 feed (molasses, defaultPriceInrPerKgAsFed === null) with empty price input and user_input provenance once entered (AC-3.2, AC-3.6)', () => {
    const molasses = LIVE_FEEDS.find((f) => f.id === 'molasses')!;
    expect(molasses.defaultPriceInrPerKgAsFed).toBeNull();

    const { container } = render(createElement(App));
    const addButtons = [...container.querySelectorAll<HTMLButtonElement>('.librow-act')];
    const addMolasses = addButtons.find((btn) =>
      btn.getAttribute('aria-label')?.includes(molasses.englishName),
    )!;
    expect(addMolasses).toBeTruthy();

    act(() => {
      fireEvent.click(addMolasses);
    });

    const row = container.querySelector('.feedrow')!;
    expect(row).toBeTruthy();
    const priceInput = row.querySelector<HTMLInputElement>('input.input.num')!;
    expect(priceInput.value).toBe('');
    expect(row.querySelector('[data-pill="your-price"]')).toBeNull();

    act(() => {
      fireEvent.change(priceInput, { target: { value: '14' } });
      fireEvent.blur(priceInput);
    });
    expect(priceInput.value).toBe('14');
    expect(row.querySelector('[data-pill="your-price"]')).toBeTruthy();

    const viewSourceBtn = row.querySelector<HTMLButtonElement>('.feedrow-source .linkbtn')!;
    act(() => {
      fireEvent.click(viewSourceBtn);
    });
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('data-audit-id')).toBe('price-molasses');
    expect(dialog.textContent).toContain('Entered by you');
  });

  it('auditRoughageMin and auditRoughageShare expose the cited ICAR 2013 / NDDB roughage minimum', () => {
    const minMeta = auditRoughageMin(40);
    expect(minMeta.originType).toBe('cited_source');
    expect(minMeta.citation?.doc).toContain('ICAR 2013');
    expect(minMeta.citation?.doc).toContain('NDDB');
    expect(minMeta.citation?.provenanceStatus).toBe('cited');
    expect(minMeta.sourceKey).toBe('REQ-ROUGHAGE-MIN');

    const solved = liveAdapter.solveRation(SAMPLE_ANIMAL, SAMPLE_FEEDS);
    expect(solved.status).toBe('optimal');
    if (solved.status === 'optimal') {
      const shareMeta = auditRoughageShare(solved, LIVE_FEEDS);
      expect(shareMeta.citation?.doc).toContain('ICAR 2013');
      expect(shareMeta.citation?.provenanceStatus).toBe('cited');
      expect(shareMeta.sourceKey).toBe('SOLVER-LP-V1');
    }
  });

  it('rejects invalid free-text extraction inputs with LlmError INVALID_REQUEST and disables Balance ration on invalid form/price inputs (AC-E1.1, AC-E1.2, AC-4.3)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'INVALID_REQUEST', message: 'Invalid extraction input' } }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    await expect(liveAdapter.extractFromText('just some random words without animal or weight')).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });

    const { container } = render(createElement(App));
    const balanceBtn = container.querySelector<HTMLButtonElement>('.balancebar .btn-primary')!;
    expect(balanceBtn.disabled).toBe(true);

    // Select cow species, leave breed empty, enter out-of-range weight (100 < 150), milk (50 > 40), fat (12 > 10)
    const cowBtn = [...container.querySelectorAll<HTMLButtonElement>('.seg-btn')][0];
    act(() => {
      fireEvent.click(cowBtn);
    });
    const numInputs = [...container.querySelectorAll<HTMLInputElement>('fieldset.block input.input.num')];
    expect(numInputs.length).toBe(3);
    act(() => {
      fireEvent.change(numInputs[0], { target: { value: '100' } });
      fireEvent.blur(numInputs[0]);
      fireEvent.change(numInputs[1], { target: { value: '50' } });
      fireEvent.blur(numInputs[1]);
      fireEvent.change(numInputs[2], { target: { value: '12' } });
      fireEvent.blur(numInputs[2]);
    });
    const alerts = [...container.querySelectorAll('[role="alert"]')].map((el) => el.textContent ?? '').join(' ');
    expect(alerts).toContain('Select a breed');
    expect(alerts).toContain('150');
    expect(alerts).toContain('40');
    expect(alerts).toContain('10');
    expect(balanceBtn.disabled).toBe(true);

    // Fix animal profile, add molasses (unpriced), enter valid budget: Balance stays disabled until molasses has a valid >= 0 price (AC-E1.2)
    const breedSelect = container.querySelector<HTMLSelectElement>('fieldset.block select.input')!;
    act(() => {
      fireEvent.change(breedSelect, { target: { value: 'sahiwal' } });
      fireEvent.change(numInputs[0], { target: { value: '400' } });
      fireEvent.change(numInputs[1], { target: { value: '8' } });
      fireEvent.change(numInputs[2], { target: { value: '4.5' } });
    });
    const budgetInput = [...container.querySelectorAll<HTMLInputElement>('input.input.num')].at(-1)!;
    act(() => {
      fireEvent.change(budgetInput, { target: { value: '200' } });
    });
    const addMolasses = [...container.querySelectorAll<HTMLButtonElement>('.librow-act')].find((btn) =>
      btn.getAttribute('aria-label')?.toLowerCase().includes('molasses'),
    )!;
    act(() => {
      fireEvent.click(addMolasses);
    });
    expect(balanceBtn.disabled).toBe(true);
    expect(container.querySelector('#balance-reason')?.textContent).toContain('price');

    const feedPriceInput = container.querySelector<HTMLInputElement>('.feedrow input.input.num')!;
    act(() => {
      fireEvent.change(feedPriceInput, { target: { value: '-5' } });
      fireEvent.blur(feedPriceInput);
    });
    expect(balanceBtn.disabled).toBe(true);

    act(() => {
      fireEvent.change(feedPriceInput, { target: { value: '14' } });
      fireEvent.blur(feedPriceInput);
    });
    expect(balanceBtn.disabled).toBe(false);
  });

  it('switches breed names and feed season notes from v1 data in the active language and copies summary (AC-3.5, AC-8.1, AC-L1.7)', async () => {
    let copiedText = '';
    Object.assign(navigator, {
      clipboard: {
        writeText: async (t: string) => {
          copiedText = t;
        },
      },
    });

    const { container } = render(createElement(App));
    act(() => {
      fireEvent.click(container.querySelector<HTMLElement>('[data-preset="buffalo"]')!);
    });
    expect(container.querySelector('.solved')).toBeTruthy();

    const copyBtn = [...container.querySelectorAll<HTMLButtonElement>('.frame-actions .btn')].find((b) =>
      b.textContent?.includes('Copy summary'),
    )!;
    await act(async () => {
      fireEvent.click(copyBtn);
    });
    expect(copiedText).toContain('Murrah');
    expect(copiedText).toContain('L/day');
    expect(copiedText).toContain('₹');
  });
});


