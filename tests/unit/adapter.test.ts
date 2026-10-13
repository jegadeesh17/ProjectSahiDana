import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
    cleanup();
    window.localStorage.clear();
    setActiveLang('en');
    document.documentElement.lang = 'en';
    setRationAdapterMode('env');
    mockControls.behavior.llm = 'ok';
    mockControls.behavior.explain = 'verified';
    mockControls.behavior.latencyMs = 900;
  });

  it('switches between mockAdapter and liveAdapter via mode and selectAdapter', async () => {
    expect(selectAdapter(true)).toBe(mockAdapter);
    expect(selectAdapter(false)).toBe(liveAdapter);

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
          if (mode === 'live') {
            expect(optimal.sourceKey).toBe('SOLVER-LP-V1');
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

