import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import { AuditProvider, useAudit } from '../../src/components/AuditDrawer';
import feedsV1 from '../../src/data/feeds.v1.json';
import { BreedBenchmark } from '../../src/components/BreedBenchmark';
import breedsV1 from '../../src/data/breeds.v1.json';
import { auditFeedKg, auditFeedPrice, auditRoughageMin } from '../../src/domain/audit';
import { CAP_BASIS_LABEL, breedById } from '../../src/domain/breeds';
import { buildRequirementModel } from '../../src/domain/requirements';
import type { AuditMeta, BreedStandard, FeedItem, RationSolution } from '../../src/domain/types';
import { LanguageProvider } from '../../src/i18n/LanguageProvider';
import { LANG_STORAGE_KEY, setActiveLang } from '../../src/i18n/lang';
import { setRationAdapterMode } from '../../src/services/rationService';

const LATIN_WORD = /[A-Za-z]{3,}/g;
// Units, abbreviations and source names that stay in Latin script in Hindi mode.
const ALLOWED = new Set(['DAHD', 'NDDB', 'RCDF', 'ICAR', 'kg', 'CP', 'ME', 'Ca']);

function demo(container: HTMLElement, key: string) {
  if (!container.querySelector('[data-demo]')) {
    act(() => {
      fireEvent.click(container.querySelector<HTMLElement>('.proto-toggle')!);
    });
  }
  act(() => {
    fireEvent.click(container.querySelector<HTMLElement>(`[data-demo="${key}"]`)!);
  });
}

describe('result card per verdict case', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = () => undefined;
    window.localStorage.clear();
    setActiveLang('en');
  });
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    setActiveLang('en');
    document.documentElement.lang = 'en';
  });

  const cases: [string, string, RegExp][] = [
    ['gain', 'gain', /\+\d+\.\d\sL\/day possible/],
    ['at_level', 'at_breed_level', /Already at the breed level; same milk for ₹[\d.]+ less/],
    ['above', 'above_breed_level', /Above the breed level; same milk for ₹[\d.]+ less/],
    ['below_cost', 'below_today', /This budget supports [\d.]+\sL\/day, less than today’s 6\.5\sL\/day\. Keeping 6\.5\sL needs ₹[\d.]+\/day\./],
    ['below_no', 'below_today', /Keeping 6\sL is not possible with these feeds: CP limits it\./],
    ['same', 'same_as_today', /This budget supports 5\.0\sL\/day, the same as today\./],
    ['dry', 'dry_animal', /Dry cow or buffalo: maintenance ration/],
  ];
  for (const [key, kind, text] of cases) {
    it(`${key}: shows the ${kind} verdict`, () => {
      const { container } = render(<App />);
      demo(container, key);
      const verdict = container.querySelector('[data-testid="verdict"]');
      expect(verdict?.getAttribute('data-verdict')).toBe(kind);
      expect(verdict?.textContent?.replace(/ /g, ' ')).toMatch(text);
    });
  }

  it('shows Today and This ration supports as two tiles, each opening its own audit, with the benchmark line below', () => {
    const { container } = render(<App />);
    demo(container, 'gain');
    const supports = container.querySelector('[data-testid="supports"]')!;
    const tiles = supports.querySelectorAll('.supports-tiles > .supports-tile');
    expect(tiles.length).toBe(2);
    expect(tiles[0].getAttribute('data-tile')).toBe('today');
    expect(tiles[1].getAttribute('data-tile')).toBe('supported');
    expect(tiles[0].textContent).toContain('Today');
    expect(tiles[1].textContent).toContain('This ration supports');
    for (const tile of tiles) expect(tile.textContent).toContain('per day');

    const benchmark = supports.querySelector('.supports-context')!;
    expect(benchmark.textContent).toContain('Cited breed benchmark');
    // The benchmark line follows the tiles in document order and is not inside either of them.
    expect(supports.querySelector('.supports-tiles')!.compareDocumentPosition(benchmark) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tiles[0].contains(benchmark) || tiles[1].contains(benchmark)).toBe(false);

    const expected: [Element, string][] = [
      [tiles[0], 'in-milk'],
      [tiles[1], 'supported-milk'],
      [benchmark, 'breed-cap-'],
    ];
    for (const [holder, auditId] of expected) {
      const fig = holder.querySelector<HTMLButtonElement>('.fig')!;
      expect(fig).toBeTruthy();
      act(() => {
        fireEvent.click(fig);
      });
      expect(container.querySelector('[role="dialog"]')?.getAttribute('data-audit-id')).toMatch(new RegExp(`^${auditId}`));
    }
  });

  it('shows the milk tiles for below_today and same_as_today results too', () => {
    for (const [key, kind] of [['below_cost', 'below_today'], ['below_no', 'below_today'], ['same', 'same_as_today']]) {
      const { container, unmount } = render(<App />);
      demo(container, key);
      expect(container.querySelector('[data-testid="verdict"]')?.getAttribute('data-verdict'), key).toBe(kind);
      const tiles = container.querySelectorAll('[data-testid="supports"] .supports-tiles > .supports-tile');
      expect(tiles.length, key).toBe(2);
      expect(container.querySelector('[data-testid="supports"] .supports-context')?.textContent, key).toContain('benchmark');
      unmount();
    }
  });

  it('Hindi mode: the milk tiles read in Hindi', () => {
    window.localStorage.setItem(LANG_STORAGE_KEY, 'hi');
    const { container } = render(<App />);
    demo(container, 'gain');
    const text = container.querySelector('[data-testid="supports"] .supports-tiles')!.textContent ?? '';
    expect(text).toContain('आज');
    expect(text).toContain('इस राशन से संभव');
    expect(text).toContain('प्रति दिन');
  });

  it('the caveat appears for a gain and not for the other verdicts', () => {
    const { container } = render(<App />);
    demo(container, 'gain');
    expect(container.querySelector('.verdict-caveat')).toBeTruthy();
    demo(container, 'below_cost');
    expect(container.querySelector('.verdict-caveat')).toBeNull();
  });

  it('shows the fat comparison, and “not cited” for a breed with no fat percent', () => {
    const { container } = render(<App />);
    demo(container, 'gain');
    expect(container.querySelector('[data-testid="fat-line"]')?.textContent).toContain('7.34%');
    demo(container, 'kankrej');
    expect(container.querySelector('[data-testid="fat-line"]')?.textContent).toContain('not cited');
  });

  it('the budget-below-maintenance case shows no ration and no milk figure', () => {
    const { container } = render(<App />);
    demo(container, 'shortfall');
    expect(container.querySelector('#analysis')?.getAttribute('data-state')).toBe('shortfall');
    expect(container.querySelector('.ration-table')).toBeNull();
    expect(container.querySelector('[data-testid="supports"]')).toBeNull();
  });

  it('the roughage case is infeasible and offers a roughage feed', () => {
    const { container } = render(<App />);
    demo(container, 'roughage');
    expect(container.querySelector('#analysis')?.getAttribute('data-state')).toBe('infeasible');
    expect(container.querySelector('[data-nutrient="roughage"]')).toBeTruthy();
    expect(container.querySelector('.suggest-row')).toBeTruthy();
  });

  it('Show details reveals the working and the cited roughage minimum, and tapping the minimum opens the citation sheet', () => {
    const { container } = render(<App />);
    demo(container, 'gain');
    expect(container.querySelector('#result-details')).toBeNull();
    act(() => {
      fireEvent.click(container.querySelector<HTMLElement>('.details-toggle')!);
    });
    const detailsText = container.querySelector('#result-details')?.textContent ?? '';
    expect(detailsText).toContain('ICAR 2013');
    expect(detailsText).toContain('NDDB');
    expect(detailsText).toContain('40%');
    expect(container.querySelectorAll('.nutrient').length).toBe(5);

    const roughageMinBtn = [...container.querySelectorAll<HTMLButtonElement>('#result-details .fig')].find((b) =>
      b.textContent?.includes('40%'),
    )!;
    expect(roughageMinBtn).toBeTruthy();
    act(() => {
      fireEvent.click(roughageMinBtn);
    });
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog?.getAttribute('data-audit-id')).toBe('req-roughage');
    expect(dialog?.textContent).toContain('ICAR 2013');
    expect(dialog?.textContent).toContain('p. 28');
  });

  it('Hindi mode: the new result parts carry no English words', () => {
    window.localStorage.setItem(LANG_STORAGE_KEY, 'hi');
    const { container } = render(<App />);
    for (const key of ['gain', 'above', 'below_cost', 'below_no', 'dry']) {
      demo(container, key);
      const parts = ['[data-testid="verdict"]', '[data-testid="supports"]', '[data-testid="cost-budget"]', '.benchmark'];
      for (const selector of parts) {
        const el = container.querySelector(selector);
        if (!el) continue;
        const words = (el.textContent ?? '').match(LATIN_WORD) ?? [];
        expect(words.filter((w) => !ALLOWED.has(w)), `${key} ${selector}`).toEqual([]);
      }
    }
  });
});

describe('breed, budget and the feed picker', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = () => undefined;
    window.localStorage.clear();
    setActiveLang('en');
  });
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    setActiveLang('en');
    document.documentElement.lang = 'en';
  });

  it('filters the breed list by species and shows the benchmark', () => {
    const { container } = render(<App />);
    const select = container.querySelector<HTMLSelectElement>('select.input')!;
    expect(select.disabled).toBe(true);
    const cow = [...container.querySelectorAll<HTMLElement>('.seg-btn')][0];
    act(() => {
      fireEvent.click(cow);
    });
    const options = [...select.options].map((o) => o.textContent);
    expect(options).toContain('Rathi');
    expect(options).not.toContain('Murrah');
    expect(options[options.length - 1]).toBe('Non-descript');
    act(() => {
      fireEvent.change(select, { target: { value: 'nondescript_cow' } });
    });
    expect(container.querySelector('.benchmark')?.textContent).toContain('National average (DAHD)');
    expect(container.querySelector('.benchmark')?.textContent).toContain('not cited');
  });

  it('the budget follows today’s cost until the user types one', () => {
    const { container } = render(<App />);
    act(() => {
      fireEvent.click(container.querySelector<HTMLElement>('[data-preset="buffalo"]')!);
    });
    const budget = [...container.querySelectorAll<HTMLInputElement>('input.input')].find((i) => i.value === '251.2')!;
    expect(budget).toBeTruthy();
    expect(container.querySelector('[data-pill="budget-default"]')).toBeTruthy();
    act(() => {
      fireEvent.change(budget, { target: { value: '200' } });
    });
    expect(container.querySelector('[data-pill="budget-default"]')).toBeNull();
    expect(container.querySelector('.budget-today .btn')).toBeTruthy();
  });

  it('groups the library into four sections and marks the season by month', () => {
    const { container } = render(<App />);
    const groups = [...container.querySelectorAll('.libgroup')];
    expect(groups.map((g) => g.getAttribute('data-vertical'))).toEqual(['indigenous_forage', 'crop_residue', 'agro_byproduct', 'mineral']);
    const month = container.querySelector<HTMLSelectElement>('.library-controls select')!;
    expect(month.options).toHaveLength(12);
    act(() => {
      fireEvent.change(month, { target: { value: '7' } });
    });
    const berseem = [...container.querySelectorAll('.librow')].find((r) => r.textContent?.includes('Berseem'))!;
    expect(berseem.querySelector('[data-season="out"]')).toBeTruthy();
    act(() => {
      fireEvent.change(month, { target: { value: '12' } });
    });
    const berseemWinter = [...container.querySelectorAll('.librow')].find((r) => r.textContent?.includes('Berseem'))!;
    expect(berseemWinter.querySelector('[data-season="in"]')).toBeTruthy();
  });

  it('adding an unpriced feed (molasses) leaves the price input empty until the user enters a price (AC-3.2, AC-3.6)', () => {
    setRationAdapterMode('live');
    try {
      const { container } = render(<App />);
      const addButtons = [...container.querySelectorAll<HTMLButtonElement>('.librow-act')];
      const addMolasses = addButtons.find((btn) => btn.getAttribute('aria-label')?.toLowerCase().includes('molasses'))!;
      expect(addMolasses).toBeTruthy();
      act(() => {
        fireEvent.click(addMolasses);
      });
      const row = container.querySelector('.feedrow')!;
      const priceInput = row.querySelector<HTMLInputElement>('input.input.num')!;
      expect(priceInput.value).toBe('');
      act(() => {
        fireEvent.change(priceInput, { target: { value: '12' } });
        fireEvent.blur(priceInput);
      });
      expect(row.querySelector('[data-pill="your-price"]')).toBeTruthy();
    } finally {
      setRationAdapterMode('env');
    }
  });
});

describe('honest labelling of unverified and benchmark figures', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = () => undefined;
    window.localStorage.clear();
    setActiveLang('en');
  });
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    setActiveLang('en');
    document.documentElement.lang = 'en';
  });

  it('labels the breed cap as a cited benchmark (not a peak) and flags “Expert check: pending” in the audit sheet', () => {
    const { container } = render(<App />);
    demo(container, 'gain');
    const benchmark = container.querySelector('.benchmark')!;
    expect(benchmark.textContent).toContain('Cited breed benchmark');
    expect(benchmark.textContent).not.toMatch(/peak/i);
    expect(container.textContent).not.toContain('Cited breed peak');
    act(() => {
      fireEvent.click(benchmark.querySelector<HTMLElement>('.fig')!);
    });
    const dialog = container.querySelector('[role="dialog"][data-audit-id^="breed-cap-"]')!;
    expect(dialog).toBeTruthy();
    expect(dialog.querySelector('[data-testid="expert-pending"]')?.textContent).toContain('Expert check: pending');
    expect(dialog.textContent).toContain('Cited figure:');
    expect(dialog.textContent).not.toContain('Cited average');
    expect(dialog.textContent).not.toMatch(/peak/i);
  });

  it('shows the pending line in Hindi too, with no English leaking in', () => {
    window.localStorage.setItem(LANG_STORAGE_KEY, 'hi');
    const { container } = render(<App />);
    demo(container, 'gain');
    act(() => {
      fireEvent.click(container.querySelector<HTMLElement>('.benchmark .fig')!);
    });
    const pending = container.querySelector('[data-testid="expert-pending"]');
    expect(container.querySelector('[role="dialog"][data-audit-id^="breed-cap-"]')?.textContent).not.toContain('चरम');
    expect(pending?.textContent).toContain('विशेषज्ञ जाँच: बाकी');
    expect(pending?.textContent).not.toMatch(/[A-Za-z]/);
  });
});

describe('feed audit sheet', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setActiveLang('en');
  });
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    setActiveLang('en');
  });

  function OpenFeed({ feed }: { feed: FeedItem }) {
    const { open } = useAudit();
    return <button onClick={() => open(auditFeedPrice(feed, null))}>open feed</button>;
  }
  const feed = (feedsV1 as unknown as FeedItem[])[0]!;

  it('shows “Expert check: pending” when the feed’s verifiedOn is null, and nothing when it is set', () => {
    const view = (f: FeedItem) =>
      render(
        <LanguageProvider>
          <AuditProvider>
            <OpenFeed feed={f} />
          </AuditProvider>
        </LanguageProvider>,
      );
    const { container, unmount } = view({ ...feed, verifiedOn: null });
    act(() => {
      fireEvent.click(container.querySelector('button')!);
    });
    expect(container.ownerDocument.querySelector('[data-testid="expert-pending"]')?.textContent).toContain('Expert check: pending');
    unmount();
    const second = view({ ...feed, verifiedOn: '2026-10-01' });
    act(() => {
      fireEvent.click(second.container.querySelector('button')!);
    });
    expect(second.container.ownerDocument.querySelector('[data-testid="expert-pending"]')).toBeNull();
  });
});

describe('breed cap label follows how the cap was obtained', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = () => undefined;
    window.localStorage.clear();
    setActiveLang('en');
  });
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    setActiveLang('en');
    document.documentElement.lang = 'en';
  });

  const breeds = breedsV1 as unknown as BreedStandard[];
  const benchmarkText = (id: string) => {
    const { container, unmount } = render(
      <LanguageProvider>
        <AuditProvider>
          <BreedBenchmark breed={breedById(id, breeds)!} todayMilk={null} />
        </AuditProvider>
      </LanguageProvider>,
    );
    const text = container.querySelector('.benchmark')!.textContent ?? '';
    unmount();
    return text;
  };

  it('maps every cap basis to one label id', () => {
    expect(CAP_BASIS_LABEL).toEqual({
      cited_peak: 'label_milk_cap_benchmark',
      range_top: 'label_milk_cap_calculated',
      breed_average: 'label_milk_cap_benchmark',
      breed_average_calc: 'label_milk_cap_calculated',
      dahd_average: 'label_milk_cap_national',
    });
  });

  it('Rathi (range_top) is a calculated benchmark, never a cited one', () => {
    const text = benchmarkText('rathi');
    expect(text).toContain('Breed benchmark (calculated from cited figures)');
    expect(text).toContain('top of cited yield range ÷ shortest lactation');
    expect(text).not.toContain('Cited breed benchmark');
    expect(text).not.toContain('no peak cited');
  });

  it('Gir (breed_average_calc) says the cited yield is divided by lactation days', () => {
    const text = benchmarkText('gir');
    expect(text).toContain('Breed benchmark (calculated from cited figures)');
    expect(text).toContain('cited lactation yield ÷ lactation days');
    expect(text).not.toContain('Cited breed benchmark');
  });

  it('Murrah (cited_peak) keeps "Cited breed benchmark", and the non-descript cow keeps the national label', () => {
    const murrah = benchmarkText('murrah');
    expect(murrah).toContain('Cited breed benchmark');
    expect(murrah).not.toContain('calculated');
    const national = benchmarkText('nondescript_cow');
    expect(national).toContain('National average');
    expect(national).not.toContain('Cited breed benchmark');
  });

  it('the result card for a calculated cap (Kankrej) uses the calculated label too', () => {
    const { container } = render(<App />);
    demo(container, 'kankrej');
    const context = container.querySelector('.supports-context')!.textContent ?? '';
    expect(context).toContain('Breed benchmark (calculated from cited figures)');
    expect(context).not.toContain('Cited breed benchmark');
    expect(container.querySelector('.benchmark')!.textContent).not.toContain('Cited breed benchmark');
  });

  it('the result card for a cited peak (Murrah) keeps "Cited breed benchmark"', () => {
    const { container } = render(<App />);
    demo(container, 'gain');
    expect(container.querySelector('.supports-context')!.textContent).toContain('Cited breed benchmark');
  });

  it('shows the calculated label in Hindi with no English leaking in', () => {
    window.localStorage.setItem(LANG_STORAGE_KEY, 'hi');
    setActiveLang('hi');
    const text = benchmarkText('rathi');
    expect(text).toContain('नस्ल-मानक दूध (प्रकाशित आँकड़ों से गणना)');
    expect(text).toContain('प्रकाशित उत्पादन सीमा का ऊपरी मान ÷ सबसे छोटी दुग्ध-अवधि');
    expect((text.match(LATIN_WORD) ?? []).filter((w) => !ALLOWED.has(w))).toEqual([]);
  });
});

describe('expert-check line only where the sheet shows a cited figure', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setActiveLang('en');
  });
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    setActiveLang('en');
  });

  const feeds = feedsV1 as unknown as FeedItem[];
  const byId = (id: string) => feeds.find((f) => f.id === id)!;
  const solutionOf = (kind: 'gain' | 'dry_animal') => ({ verdict: { kind }, sourceKey: 'TEST' }) as unknown as RationSolution;

  function Opener({ meta }: { meta: AuditMeta }) {
    const { open } = useAudit();
    return <button onClick={() => open(meta)}>open</button>;
  }
  function sheetFor(meta: AuditMeta) {
    const { container } = render(
      <LanguageProvider>
        <AuditProvider>
          <Opener meta={meta} />
        </AuditProvider>
      </LanguageProvider>,
    );
    act(() => {
      fireEvent.click(container.querySelector('button')!);
    });
    return container.ownerDocument.querySelector('[role="dialog"]')!;
  }

  it('a price the user typed shows no "Expert check: pending", even though the feed is unverified', () => {
    const feed = { ...byId('maize_grain'), verifiedOn: null, defaultPriceInrPerKgAsFed: 20 };
    const sheet = sheetFor(auditFeedPrice(feed, 31));
    expect(sheet.querySelector('[data-testid="expert-pending"]')).toBeNull();
    expect(sheet.textContent).not.toContain('Expert check: pending');
  });

  it('the same feed at its listed price still shows the pending line', () => {
    const feed = { ...byId('maize_grain'), verifiedOn: null, defaultPriceInrPerKgAsFed: 20 };
    expect(sheetFor(auditFeedPrice(feed, 20)).querySelector('[data-testid="expert-pending"]')?.textContent).toContain('Expert check: pending');
  });

  it('the mineral mixture kg sheet states the basal minimum, cites it and flags the pending check', () => {
    const sheet = sheetFor(auditFeedKg(byId('mineral_mix'), 0.1, false, solutionOf('gain')));
    expect(sheet.textContent).toContain('Basal minimum');
    expect(sheet.textContent).toContain('At least 0.10 kg a day for a cow or buffalo in milk');
    expect(sheet.textContent).toContain('NDDB, Ration Balancing Programme Field Guidelines');
    expect(sheet.querySelector('[data-testid="expert-pending"]')?.textContent).toContain('Expert check: pending');
  });

  it('the salt kg sheet uses the dry-animal minimum for a dry cow or buffalo', () => {
    const sheet = sheetFor(auditFeedKg(byId('common_salt'), 0.03, false, solutionOf('dry_animal')));
    expect(sheet.textContent).toContain('At least 0.03 kg a day for a dry cow or buffalo');
    expect(sheet.querySelector('[data-testid="expert-pending"]')).not.toBeNull();
  });

  it('an ordinary feed kg sheet has no basal row and no citation', () => {
    const meta = auditFeedKg(byId('maize_grain'), 2, false, solutionOf('gain'));
    expect(meta.citation).toBeNull();
    expect(meta.extraRows).toBeUndefined();
  });

  it('in Hindi the mineral mixture kg sheet and the roughage minimum sheet leak no English words', () => {
    window.localStorage.setItem(LANG_STORAGE_KEY, 'hi');
    setActiveLang('hi');
    const leaks = (meta: AuditMeta) => {
      const sheet = sheetFor(meta).cloneNode(true) as HTMLElement;
      // Citation titles and the fixture key are source names kept as given; every other word must be Hindi.
      const kept = new Set([meta.citation?.doc, meta.citation?.table, meta.citation?.page]);
      sheet.querySelectorAll('[data-lang-exempt="citation"], [data-lang-exempt="source-key"]').forEach((el) => {
        if (kept.has(el.textContent ?? '') || el.getAttribute('data-lang-exempt') === 'source-key') el.remove();
      });
      return (sheet.textContent?.match(LATIN_WORD) ?? []).filter((w) => !ALLOWED.has(w));
    };
    const mineral = auditFeedKg(byId('mineral_mix'), 0.1, false, solutionOf('gain'));
    expect(mineral.citation?.formula).toBeUndefined();
    expect(leaks(mineral)).toEqual([]);
    cleanup();
    const roughage = auditRoughageMin(40);
    expect(roughage.citation?.formula).toContain('रेशेदार');
    expect(leaks(roughage)).toEqual([]);
  });

  it('in English the roughage minimum formula keeps the computed percentage', () => {
    const meta = auditRoughageMin(40);
    expect(meta.citation?.formula).toBe('at least 40% of ration dry matter from roughage');
    expect(meta.solverConstraint?.breakdown).toContain('≥ 40%');
  });

  it('the roughage minimum takes its verifiedOn from the requirement model citation', () => {
    const animal = { species: 'cow', breedId: 'gir', bodyWeightKg: 400, milkYieldLitersPerDay: 8, milkFatPct: 4, budgetInrPerDay: 150, isConfirmed: true } as const;
    const modelVerified = buildRequirementModel(animal).roughage.citation.verifiedOn;
    expect(auditRoughageMin(40).citation?.verifiedOn).toBe(modelVerified);
  });
});

describe('farmer-first UI: tags, buy ladder, not needed, budget prompt and shortfall raise (C3-M2)', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = () => undefined;
    window.localStorage.clear();
    setActiveLang('en');
  });
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    setActiveLang('en');
    document.documentElement.lang = 'en';
  });

  it('button is enabled with valid animal/budget and 0 feeds, disabled on invalid own feed price with notice_next_price (AC-C3-2.1, AC-C3-E3)', () => {
    const { container } = render(<App />);
    const [cowBtn] = container.querySelectorAll<HTMLElement>('.seg-btn');
    act(() => {
      fireEvent.click(cowBtn);
    });
    const numInputs = [...container.querySelectorAll<HTMLInputElement>('input.input.num')];
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

    const balanceBtn = container.querySelector<HTMLButtonElement>('.balancebar button')!;
    // 0 feeds entered, button is enabled (AC-C3-2.1)
    expect(container.querySelectorAll('.feedrow')).toHaveLength(0);
    expect(balanceBtn.disabled).toBe(false);
    expect(balanceBtn.textContent).toContain('Calculate ration');

    // Add unpriced feed (molasses) -> disabled with notice_next_price
    const addMolasses = [...container.querySelectorAll<HTMLButtonElement>('.librow-act')].find((btn) =>
      btn.getAttribute('aria-label')?.toLowerCase().includes('molasses'),
    )!;
    act(() => {
      fireEvent.click(addMolasses);
    });
    expect(balanceBtn.disabled).toBe(true);
    expect(container.querySelector('#balance-reason')?.textContent).toContain('enter a valid price');

    // Enter negative price -> still disabled
    const feedPriceInput = container.querySelector<HTMLInputElement>('.feedrow input.input.num')!;
    act(() => {
      fireEvent.change(feedPriceInput, { target: { value: '-5' } });
      fireEvent.blur(feedPriceInput);
    });
    expect(balanceBtn.disabled).toBe(true);

    // Fix price -> enabled
    act(() => {
      fireEvent.change(feedPriceInput, { target: { value: '14' } });
      fireEvent.blur(feedPriceInput);
    });
    expect(balanceBtn.disabled).toBe(false);
  });

  it('every ration row with kg > 0 carries exactly one You have or Buy tag, and Buy rows match plan.buyFeedIds (AC-C3-2.6, AC-C3-E1)', () => {
    // 1. Zero own feeds: all rows are Buy (AC-C3-E1)
    setRationAdapterMode('live');
    const { container, unmount } = render(<App />);
    const tightBtn = container.querySelector<HTMLElement>('[data-preset="tight-budget"]')!;
    act(() => {
      fireEvent.click(tightBtn);
    });
    const rows = container.querySelectorAll('.ration-table tbody tr');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.querySelectorAll('[data-tag="buy"]')).toHaveLength(1);
      expect(row.querySelectorAll('[data-tag="you-have"]')).toHaveLength(0);
    }
    unmount();

    // 2. Buffalo preset: owned feeds used are tagged "You have", buy feeds are tagged "Buy" (AC-C3-2.6)
    const bufRender = render(<App />);
    act(() => {
      fireEvent.click(bufRender.container.querySelector<HTMLElement>('[data-preset="buffalo"]')!);
    });
    const bufRows = bufRender.container.querySelectorAll('.ration-table tbody tr');
    expect(bufRows.length).toBeGreaterThan(0);
    const ownedIds = new Set(['wheat_straw', 'maize_green', 'bajra_grain', 'wheat_bran', 'mustard_cake', 'mineral_mix', 'common_salt']);
    for (const r of bufRows) {
      const feedId = r.getAttribute('data-feed')!;
      if (ownedIds.has(feedId)) {
        expect(r.querySelector('[data-tag="you-have"]'), `${feedId} is owned`).toBeTruthy();
        expect(r.querySelector('[data-tag="buy"]'), `${feedId} is not buy`).toBeNull();
      } else {
        expect(r.querySelector('[data-tag="buy"]'), `${feedId} is buy`).toBeTruthy();
        expect(r.querySelector('[data-tag="you-have"]'), `${feedId} is not owned`).toBeNull();
      }
    }
    bufRender.unmount();

    // 3. Straw preset: straw is unneeded in optimal solve, so it appears in Not needed line (AC-C3-2.11)
    const strawRender = render(<App />);
    act(() => {
      fireEvent.click(strawRender.container.querySelector<HTMLElement>('[data-preset="straw"]')!);
    });
    const notNeeded = strawRender.container.querySelector('[data-testid="not-needed"]');
    expect(notNeeded).toBeTruthy();
    expect(notNeeded?.textContent).toContain('Wheat straw');
    strawRender.unmount();
  });

  it('renders buy ladder with rung 0 states, rungs 1..n, and every figure opens its audit (AC-C3-2.7, AC-C3-2.8, AC-C3-2.9, AC-C3-2.10)', () => {
    // Straw preset: rung 0 is not balanced, rungs 1..n show steps
    const { container, unmount } = render(<App />);
    act(() => {
      fireEvent.click(container.querySelector<HTMLElement>('[data-preset="straw"]')!);
    });
    const ladder = container.querySelector('[data-testid="buy-ladder"]')!;
    expect(ladder).toBeTruthy();

    const rung0 = ladder.querySelector('[data-rung="0"]')!;
    expect(rung0).toBeTruthy();
    expect(rung0.textContent).toContain('Your feeds alone: not balanced');
    expect(rung0.querySelector('.fig')).toBeNull();

    const rung1 = ladder.querySelector('[data-rung="1"]')!;
    expect(rung1).toBeTruthy();
    const rung1Figs = rung1.querySelectorAll<HTMLButtonElement>('.fig');
    expect(rung1Figs.length).toBeGreaterThan(0);

    // Tapping a rung figure opens audit
    act(() => {
      fireEvent.click(rung1Figs[0]);
    });
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('data-audit-id')).toMatch(/^rung-/);
    unmount();

    // Buffalo preset: rung 0 is balanced, figures open audit
    const bufRender = render(<App />);
    act(() => {
      fireEvent.click(bufRender.container.querySelector<HTMLElement>('[data-preset="buffalo"]')!);
    });
    const bufLadder = bufRender.container.querySelector('[data-testid="buy-ladder"]');
    if (bufLadder) {
      const bufRung0 = bufLadder.querySelector('[data-rung="0"]');
      if (bufRung0) {
        const rung0Fig = bufRung0.querySelector<HTMLButtonElement>('.fig');
        if (rung0Fig) {
          act(() => {
            fireEvent.click(rung0Fig);
          });
          expect(bufRender.container.querySelector('[role="dialog"]')?.getAttribute('data-audit-id')).toMatch(/^rung-/);
        }
      }
    }
    bufRender.unmount();
  });

  it('budget increase prompt appears only when plan.budgetIncrease is set, and audits open for X and Y (AC-C3-2.12)', () => {
    setRationAdapterMode('live');
    const { container, unmount } = render(<App />);
    // Buffalo: budget is not tight, prompt does not appear
    act(() => {
      fireEvent.click(container.querySelector<HTMLElement>('[data-preset="buffalo"]')!);
    });
    expect(container.querySelector('[data-testid="budget-increase-prompt"]')).toBeNull();

    // Tight budget: prompt appears
    act(() => {
      fireEvent.click(container.querySelector<HTMLElement>('[data-preset="tight-budget"]')!);
    });
    const prompt = container.querySelector('[data-testid="budget-increase-prompt"]')!;
    expect(prompt).toBeTruthy();
    expect(prompt.textContent).toContain('Add ₹');
    expect(prompt.textContent).toContain('to your budget to reach');
    expect(prompt.textContent).toContain('breed best');

    const promptFigs = prompt.querySelectorAll<HTMLButtonElement>('.fig');
    expect(promptFigs).toHaveLength(2);

    // Figure X: extra budget audit
    act(() => {
      fireEvent.click(promptFigs[0]);
    });
    expect(container.querySelector('[role="dialog"]')?.getAttribute('data-audit-id')).toBe('budget-increase');

    // Figure Y: breed cap audit
    act(() => {
      fireEvent.click(promptFigs[1]);
    });
    expect(container.querySelector('[role="dialog"]')?.getAttribute('data-audit-id')).toMatch(/^breed-cap-/);
    unmount();
  });

  it('shows Raise the budget by at least ₹X/day on budget shortfall and opens audit (AC-C3-2.14)', () => {
    const { container } = render(<App />);
    demo(container, 'shortfall');
    expect(container.querySelector('#analysis[data-state="shortfall"]')).toBeTruthy();

    const raise = container.querySelector('[data-testid="shortfall-raise"]')!;
    expect(raise).toBeTruthy();
    expect(raise.textContent).toContain('Raise the budget by at least ₹');

    const raiseFig = raise.querySelector<HTMLButtonElement>('.fig')!;
    expect(raiseFig).toBeTruthy();
    act(() => {
      fireEvent.click(raiseFig);
    });
    expect(container.querySelector('[role="dialog"]')?.getAttribute('data-audit-id')).toBe('raise-to-maintenance');
  });

  it('renders Not needed line when owned feeds are not used in final solve and hides it otherwise (AC-C3-2.11)', () => {
    // When 0 own feeds: not needed is null
    const { container, unmount } = render(<App />);
    act(() => {
      fireEvent.click(container.querySelector<HTMLElement>('[data-preset="tight-budget"]')!);
    });
    expect(container.querySelector('[data-testid="not-needed"]')).toBeNull();
    unmount();
  });

  it('starts with own feeds section collapsed and titled Feeds you already have (optional) in en and hi, showing your price and how much you have when expanded (AC-C3-2.2)', () => {
    const { container, unmount } = render(<App />);
    const feedsHeadings = [...container.querySelectorAll('section.block h2.block-title')];
    const ownFeedsHead = feedsHeadings.find((h) => h.textContent?.includes('Feeds you already have (optional)'));
    expect(ownFeedsHead).toBeTruthy();

    const collapsible = ownFeedsHead?.closest('section.block')?.querySelector('.collapsible');
    expect(collapsible?.classList.contains('is-collapsed')).toBe(true);

    const addFeedsBtn = ownFeedsHead?.closest('section.block')?.querySelector('.block-head-actions button');
    expect(addFeedsBtn).toBeTruthy();
    act(() => {
      fireEvent.click(addFeedsBtn!);
    });
    expect(collapsible?.classList.contains('is-collapsed')).toBe(false);

    const addStraw = [...container.querySelectorAll<HTMLButtonElement>('.librow-act')].find((btn) =>
      btn.getAttribute('aria-label')?.toLowerCase().includes('wheat straw'),
    )!;
    act(() => {
      fireEvent.click(addStraw);
    });

    const feedRow = container.querySelector('.feedrow')!;
    expect(feedRow).toBeTruthy();
    expect(feedRow.textContent).toContain('your price');
    expect(feedRow.textContent).toContain('how much you have');
    unmount();

    window.localStorage.setItem(LANG_STORAGE_KEY, 'hi');
    setActiveLang('hi');
    const hiRender = render(<App />);
    const hiFeedsHeadings = [...hiRender.container.querySelectorAll('section.block h2.block-title')];
    const hiOwnFeedsHead = hiFeedsHeadings.find((h) => h.textContent?.includes('आपके पास पहले से मौजूद चारा (वैकल्पिक)'));
    expect(hiOwnFeedsHead).toBeTruthy();
    hiRender.unmount();
  });

  it('own feeds cover only part of the need: wheat straw only -> rung 0 not balanced, rung 1 groups supplements + next feed, used own straw is tagged You have (AC-C3-E2)', () => {
    const { container } = render(<App />);
    act(() => {
      fireEvent.click(container.querySelector<HTMLElement>('[data-preset="straw"]')!);
    });
    const ladder = container.querySelector('[data-testid="buy-ladder"]')!;
    expect(ladder).toBeTruthy();
    const rung0 = ladder.querySelector('[data-rung="0"]')!;
    expect(rung0.textContent).toContain('Your feeds alone: not balanced');

    const rung1 = ladder.querySelector('[data-rung="1"]')!;
    expect(rung1).toBeTruthy();
    expect(rung1.textContent).toContain('Mineral mixture');
    expect(rung1.textContent).toContain('Common salt');

    const rows = container.querySelectorAll('.ration-table tbody tr');
    expect(rows.length).toBeGreaterThan(0);
    const strawRow = [...rows].find((r) => r.getAttribute('data-feed') === 'wheat_straw');
    if (strawRow) {
      expect(strawRow.querySelector('[data-tag="you-have"]')).toBeTruthy();
    }
  });

  it('budget not limiting: no Add ₹X/day prompt is shown (AC-C3-E4)', () => {
    setRationAdapterMode('live');
    const { container } = render(<App />);
    act(() => {
      fireEvent.click(container.querySelector<HTMLElement>('[data-preset="buffalo"]')!);
    });
    expect(container.querySelector('[data-testid="budget-increase-prompt"]')).toBeNull();
  });

  it('dry animal: ladder rungs show cost only, no milk figure or gain, and no budget prompt (AC-C3-E6)', () => {
    const { container } = render(<App />);
    demo(container, 'dry');
    expect(container.querySelector('[data-testid="verdict"]')?.getAttribute('data-verdict')).toBe('dry_animal');
    expect(container.querySelector('[data-testid="budget-increase-prompt"]')).toBeNull();

    const ladder = container.querySelector('[data-testid="buy-ladder"]');
    if (ladder) {
      expect(ladder.querySelectorAll('.rung-milk')).toHaveLength(0);
    }
  });

  it('three demos: buffalo gives feasible ration, straw gives rung 0 unbalanced and Buy rows, tight-budget gives budget prompt (AC-C3-2.15)', () => {
    setRationAdapterMode('live');
    const { container, unmount } = render(<App />);
    const presetsSection = container.querySelector('.presets')!;
    const demoButtons = presetsSection.querySelectorAll('[data-preset]');
    expect(demoButtons).toHaveLength(3);

    act(() => {
      fireEvent.click(presetsSection.querySelector<HTMLElement>('[data-preset="buffalo"]')!);
    });
    expect(container.querySelector('#analysis[data-state="solved"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="verdict"]')?.getAttribute('data-verdict')).toBe('gain');

    act(() => {
      fireEvent.click(presetsSection.querySelector<HTMLElement>('[data-preset="straw"]')!);
    });
    expect(container.querySelector('#analysis[data-state="solved"]')).toBeTruthy();
    expect(container.querySelector('[data-rung="0"]')?.textContent).toContain('Your feeds alone: not balanced');
    expect(container.querySelectorAll('.tag-buy').length).toBeGreaterThan(0);

    act(() => {
      fireEvent.click(presetsSection.querySelector<HTMLElement>('[data-preset="tight-budget"]')!);
    });
    expect(container.querySelector('#analysis[data-state="solved"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="budget-increase-prompt"]')).toBeTruthy();
    unmount();
  });
});

