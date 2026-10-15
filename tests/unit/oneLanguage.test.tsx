import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import { ExplanationCard } from '../../src/components/ExplanationCard';
import feedsPrototype from '../../src/data/feeds.prototype.json';
import feedsV1 from '../../src/data/feeds.v1.json';
import { PRESET_BUFFALO } from '../../src/domain/presets';
import type { FeedItem } from '../../src/domain/types';
import { LanguageProvider } from '../../src/i18n/LanguageProvider';
import { LANG_STORAGE_KEY, setActiveLang } from '../../src/i18n/lang';
import { setRationAdapterMode } from '../../src/services/rationService';

const DEVA = /[\u0900-\u097F]/g;
const DEVA_DIGITS = /[\u0966-\u096F]/g;
const ALLOWED_HI_LATIN = new Set([
  'kg',
  'DM',
  'CP',
  'ME',
  'Ca',
  'AI',
  'OpenRouter',
  'DAHD',
  'ICAR',
  'NDDB',
  'RCDF',
  'CIRB',
  'Buffalopedia',
  'Mcal',
  'Down',
  'To',
  'Earth',
  'Kisan',
  'Tak',
]);

const LIBRARIES: Record<'mock' | 'live', FeedItem[]> = {
  mock: feedsPrototype as unknown as FeedItem[],
  live: feedsV1 as unknown as FeedItem[],
};

/** Visible text plus the attributes a screen reader or a hover would expose, after stripping [data-lang-exempt]. */
function nonExemptText(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement;
  for (const el of clone.querySelectorAll('[data-lang-exempt]')) {
    el.remove();
  }
  const textParts: string[] = [];
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (current.nodeValue) textParts.push(current.nodeValue);
    current = walker.nextNode();
  }
  const attrs = [...clone.querySelectorAll<HTMLElement>('[aria-label],[title],[placeholder]')].flatMap((el) =>
    ['aria-label', 'title', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
  );
  return [...textParts, ...attrs].join(' ');
}

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

function balanceBuffalo(container: HTMLElement) {
  const button = container.querySelector<HTMLElement>('[data-preset="buffalo"]');
  expect(button).toBeTruthy();
  act(() => {
    fireEvent.click(button!);
  });
  expect(container.querySelector('.solved')).toBeTruthy();
}

describe.each(['mock', 'live'] as const)('one language at a time (%s adapter)', (mode) => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = () => undefined; // jsdom does not implement it
    window.localStorage.clear();
    setActiveLang('en');
    setRationAdapterMode(mode);
  });
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    setActiveLang('en');
    document.documentElement.lang = 'en';
    setRationAdapterMode('env');
  });

  it('English mode shows no Devanagari outside [data-lang-exempt], including inside Show details and AuditDrawer', () => {
    const { container } = render(<App />);
    balanceBuffalo(container);
    act(() => {
      fireEvent.click(container.querySelector<HTMLElement>('.details-toggle')!);
    });
    act(() => {
      fireEvent.click(container.querySelector<HTMLElement>('.fig')!);
    });
    const text = nonExemptText(container);
    expect(text.match(DEVA) ?? []).toEqual([]);
    expect((container.textContent ?? '').match(DEVA_DIGITS) ?? []).toEqual([]);
  });

  it('Hindi mode shows no unexempted Latin words outside [data-lang-exempt] and uses Devanagari feed names', () => {
    window.localStorage.setItem(LANG_STORAGE_KEY, 'hi');
    const { container } = render(<App />);
    balanceBuffalo(container);
    act(() => {
      fireEvent.click(container.querySelector<HTMLElement>('.details-toggle')!);
    });
    const rows = [...container.querySelectorAll('tr[data-feed], .feedrow, .feedchip')];
    expect(rows.length).toBeGreaterThan(0);
    const picked = new Set(PRESET_BUFFALO.feeds.map((f) => f.feedId));
    for (const feed of LIBRARIES[mode].filter((f) => picked.has(f.id) && f.localNameDeva)) {
      const text = rows.map((r) => r.textContent ?? '').join('\n');
      expect(text, feed.englishName).toContain(feed.localNameDeva!);
      expect(text, feed.englishName).not.toContain(feed.englishName);
    }
    const nonExempt = nonExemptText(container);
    const latinWords = (nonExempt.match(/[A-Za-z]{2,}/g) ?? []).filter((w) => !ALLOWED_HI_LATIN.has(w));
    expect(latinWords).toEqual([]);
    expect((container.textContent ?? '').match(DEVA_DIGITS) ?? []).toEqual([]);
  });

  it('shows the one-line how-to-use banner at the top of the workspace in the active language', () => {
    const { container } = render(<App />);
    const main = container.querySelector('main.page');
    const banner = container.querySelector('[data-testid="how-to-use"]');
    expect(banner).toBeTruthy();
    expect(main?.firstElementChild).toBe(banner);
    expect(banner?.textContent).toContain('How to use:');
    expect(banner?.textContent).toContain('Calculate ration');
    expect(banner?.textContent?.match(DEVA) ?? []).toEqual([]);

    const hiToggle = container.querySelector<HTMLElement>('.langtoggle-btn[lang="hi"]');
    act(() => {
      fireEvent.click(hiToggle!);
    });
    expect(banner?.textContent).toContain('कैसे इस्तेमाल करें:');
    expect(banner?.textContent).not.toContain('How to use:');
  });

  it('titles the demo section "Try an example" below the balance bar, one language at a time (AC-C3-1.6)', () => {
    const { container } = render(<App />);
    const section = container.querySelector<HTMLElement>('.presets');
    const bar = container.querySelector('.balancebar');
    expect(section).toBeTruthy();
    expect(bar).toBeTruthy();
    expect(Boolean(bar!.compareDocumentPosition(section!) & Node.DOCUMENT_POSITION_FOLLOWING), 'section follows the balance bar').toBe(true);
    expect(section!.querySelector('.presets-title')?.textContent).toBe('Try an example');
    expect(section!.querySelectorAll('[data-preset]')).toHaveLength(3);
    expect(nonExemptText(section!).match(DEVA) ?? []).toEqual([]);

    act(() => {
      fireEvent.click(container.querySelector<HTMLElement>('.langtoggle-btn[lang="hi"]')!);
    });
    expect(section!.querySelector('.presets-title')?.textContent).toBe('उदाहरण आज़माएँ');
    expect(section!.textContent).not.toContain('Try an example');
    const latinWords = (nonExemptText(section!).match(/[A-Za-z]{2,}/g) ?? []).filter((w) => !ALLOWED_HI_LATIN.has(w));
    expect(latinWords).toEqual([]);
  });

  it('reactively translates an active toast when switching languages and gates .frame-foot to mock mode', () => {
    const { container } = render(<App />);
    balanceBuffalo(container);

    // .frame-foot is present only in mock mode, hidden in live mode
    const frameFoot = container.querySelector('.frame-foot');
    if (mode === 'mock') {
      expect(frameFoot).toBeTruthy();
    } else {
      expect(frameFoot).toBeNull();
    }

    // Trigger a toast by adding an unselected feed from the library
    const addBtn = container.querySelector<HTMLElement>('.librow:not([data-added]) .librow-act');
    expect(addBtn).toBeTruthy();
    act(() => {
      fireEvent.click(addBtn!);
    });
    const toast = container.querySelector('.toast');
    expect(toast?.textContent).toContain('Added:');

    // Switch to Hindi while the toast is still visible
    const hiToggle = container.querySelector<HTMLElement>('.langtoggle-btn[lang="hi"]');
    act(() => {
      fireEvent.click(hiToggle!);
    });
    expect(toast?.textContent).toContain('जुड़ी:');
    expect(toast?.textContent).not.toContain('Added:');
  });

  it('converts entered Devanagari numerals to Latin digits on the fly (AC-L1.3) and validates correctly', () => {
    const { container } = render(<App />);
    const weightInput = container.querySelector<HTMLInputElement>('input[id*="weight"]')!;
    expect(weightInput).toBeTruthy();

    act(() => {
      fireEvent.change(weightInput, { target: { value: '४५०' } });
    });
    expect(weightInput.value).toBe('450');

    act(() => {
      fireEvent.blur(weightInput);
    });
    const errorMsg = container.querySelector('.field-error');
    expect(errorMsg).toBeNull();
  });

  it('titles the cow-or-buffalo card by species and keeps other inputs (AC-C3-1.2, AC-C3-1.3)', () => {
    const { container } = render(<App />);
    const title = () => container.querySelector('fieldset:has(.seg) > legend')?.textContent;
    const segBtn = (i: number) => container.querySelectorAll<HTMLElement>('.seg-btn')[i]!;
    const weightInput = container.querySelector<HTMLInputElement>('input[id*="weight"]')!;
    expect(title()).toBe('Your cow or buffalo');

    act(() => {
      fireEvent.change(weightInput, { target: { value: '420' } });
    });
    act(() => {
      fireEvent.click(segBtn(0));
    });
    expect(title()).toBe('Your cow');
    act(() => {
      fireEvent.click(segBtn(1));
    });
    expect(title()).toBe('Your buffalo');
    expect(weightInput.value).toBe('420');

    act(() => {
      fireEvent.click(container.querySelector<HTMLElement>('.langtoggle-btn[lang="hi"]')!);
    });
    expect(title()).toBe('आपकी भैंस');
    act(() => {
      fireEvent.click(segBtn(0));
    });
    expect(title()).toBe('आपकी गाय');
    expect(weightInput.value).toBe('420');
    act(() => {
      fireEvent.click(container.querySelector<HTMLElement>('.langtoggle-btn[lang="en"]')!);
    });
    expect(title()).toBe('Your cow');
  });

  it('titles the card "Your cow or buffalo" / "आपकी गाय या भैंस" before a species is picked (AC-C3-1.2)', () => {
    const { container } = render(<App />);
    const title = () => container.querySelector('fieldset:has(.seg) > legend')?.textContent;
    expect(title()).toBe('Your cow or buffalo');
    act(() => {
      fireEvent.click(container.querySelector<HTMLElement>('.langtoggle-btn[lang="hi"]')!);
    });
    expect(title()).toBe('आपकी गाय या भैंस');
  });

  it('never calls the farmer’s cow or buffalo an animal or पशु outside the audit drawer (AC-C3-1.4)', () => {
    const { container } = render(<App />);
    const states: [string, string][] = [['idle', '']];
    for (const preset of ['buffalo', 'straw']) {
      states.push([preset, preset]);
    }
    for (const lang of ['en', 'hi'] as const) {
      act(() => {
        fireEvent.click(container.querySelector<HTMLElement>(`.langtoggle-btn[lang="${lang}"]`)!);
      });
      for (const [name, preset] of states) {
        if (preset) {
          const btn = container.querySelector<HTMLElement>(`[data-preset="${preset}"]`);
          expect(btn, preset).toBeTruthy();
          act(() => {
            fireEvent.click(btn!);
          });
        }
        const details = container.querySelector<HTMLElement>('.details-toggle');
        if (details) {
          act(() => {
            fireEvent.click(details);
          });
        }
        // “पशु आहार” (cattle feed) is a cited feed-library name, not the farmer's cow or buffalo.
        const text = nonExemptText(container).replace(/पशु आहार/g, '');
        expect(text.match(lang === 'en' ? /.{30}animal.{30}/i : /.{30}पशु.{30}/) ?? [], `${lang} ${name}`).toEqual([]);
      }
    }
  });

  it('preserves strict language isolation on straw demo, tight budget, infeasible and shortfall states', () => {
    // 1. Straw demo: shows buy ladder with rung 0 unbalanced and Buy tags
    const { container, unmount } = render(<App />);
    const strawBtn = container.querySelector<HTMLElement>('[data-preset="straw"]');
    act(() => {
      fireEvent.click(strawBtn!);
    });
    expect(container.querySelector('#analysis[data-state="solved"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="buy-ladder"]')).toBeTruthy();
    expect(container.querySelector('[data-rung="0"]')).toBeTruthy();

    // Check English mode
    let text = nonExemptText(container);
    expect(text.match(DEVA) ?? []).toEqual([]);

    // Switch to Hindi
    const hiToggle = container.querySelector<HTMLElement>('.langtoggle-btn[lang="hi"]');
    act(() => {
      fireEvent.click(hiToggle!);
    });
    text = nonExemptText(container);
    let latinWords = (text.match(/[A-Za-z]{2,}/g) ?? []).filter((w) => !ALLOWED_HI_LATIN.has(w));
    expect(latinWords).toEqual([]);
    expect((container.textContent ?? '').match(DEVA_DIGITS) ?? []).toEqual([]);
    unmount();

    // 2. Budget shortfall state (raise-by prompt)
    setActiveLang('en');
    window.localStorage.setItem(LANG_STORAGE_KEY, 'en');
    document.documentElement.lang = 'en';
    const shortfallRender = render(<App />);
    demo(shortfallRender.container, 'shortfall');
    expect(shortfallRender.container.querySelector('#analysis[data-state="shortfall"]')).toBeTruthy();
    expect(shortfallRender.container.querySelector('[data-testid="shortfall-raise"]')).toBeTruthy();
    text = nonExemptText(shortfallRender.container);
    expect(text.match(DEVA) ?? []).toEqual([]);

    act(() => {
      fireEvent.click(shortfallRender.container.querySelector<HTMLElement>('.langtoggle-btn[lang="hi"]')!);
    });
    text = nonExemptText(shortfallRender.container);
    latinWords = (text.match(/[A-Za-z]{2,}/g) ?? []).filter((w) => !ALLOWED_HI_LATIN.has(w));
    expect(latinWords).toEqual([]);
    expect((shortfallRender.container.textContent ?? '').match(DEVA_DIGITS) ?? []).toEqual([]);
    shortfallRender.unmount();

    // 3. Infeasible roughage state
    setActiveLang('en');
    window.localStorage.setItem(LANG_STORAGE_KEY, 'en');
    document.documentElement.lang = 'en';
    const roughageRender = render(<App />);
    demo(roughageRender.container, 'roughage');
    expect(roughageRender.container.querySelector('#analysis[data-state="infeasible"]')).toBeTruthy();
    text = nonExemptText(roughageRender.container);
    expect(text.match(DEVA) ?? []).toEqual([]);

    act(() => {
      fireEvent.click(roughageRender.container.querySelector<HTMLElement>('.langtoggle-btn[lang="hi"]')!);
    });
    text = nonExemptText(roughageRender.container);
    latinWords = (text.match(/[A-Za-z]{2,}/g) ?? []).filter((w) => !ALLOWED_HI_LATIN.has(w));
    expect(latinWords).toEqual([]);
    expect((roughageRender.container.textContent ?? '').match(DEVA_DIGITS) ?? []).toEqual([]);
    roughageRender.unmount();

    // 4. Tight budget preset (prompt appears under live adapter)
    if (mode === 'live') {
      setActiveLang('en');
      window.localStorage.setItem(LANG_STORAGE_KEY, 'en');
      document.documentElement.lang = 'en';
      const tightRender = render(<App />);
      act(() => {
        fireEvent.click(tightRender.container.querySelector<HTMLElement>('[data-preset="tight-budget"]')!);
      });
      expect(tightRender.container.querySelector('[data-testid="budget-increase-prompt"]')).toBeTruthy();
      text = nonExemptText(tightRender.container);
      expect(text.match(DEVA) ?? []).toEqual([]);

      act(() => {
        fireEvent.click(tightRender.container.querySelector<HTMLElement>('.langtoggle-btn[lang="hi"]')!);
      });
      text = nonExemptText(tightRender.container);
      latinWords = (text.match(/[A-Za-z]{2,}/g) ?? []).filter((w) => !ALLOWED_HI_LATIN.has(w));
      expect(latinWords).toEqual([]);
      expect((tightRender.container.textContent ?? '').match(DEVA_DIGITS) ?? []).toEqual([]);
      tightRender.unmount();
    }
  });
});

describe('ExplanationCard fallback & exemption', () => {
  afterEach(() => {
    cleanup();
  });

  it('falls back to notice_explain_unavailable when untraced_numbers has an empty flaggedNumbers list', () => {
    const { container } = render(
      <LanguageProvider>
        <ExplanationCard
          state={{
            kind: 'done',
            result: {
              status: 'deterministic_fallback',
              errorCode: null,
              reason: 'untraced_numbers',
              flaggedNumbers: [],
              template: [{ hi: 'टेम्पलेट पंक्ति', en: 'Template line' }],
              badge: { id: 'badge_template_fallback' },
            },
          }}
        />
      </LanguageProvider>,
    );

    const fallback = container.querySelector('[data-testid="fallback-notice"]');
    expect(fallback?.textContent).toContain('The live AI explanation could not be reached.');
    expect(fallback?.textContent).not.toContain('still had an untraced number ()');
  });
});


