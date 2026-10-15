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
