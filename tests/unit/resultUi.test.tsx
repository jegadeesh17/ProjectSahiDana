import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import { LANG_STORAGE_KEY, setActiveLang } from '../../src/i18n/lang';

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
    ['dry', 'dry_animal', /Dry animal: maintenance ration/],
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

  it('Show details reveals the working and the roughage row, and hides them again', () => {
    const { container } = render(<App />);
    demo(container, 'gain');
    expect(container.querySelector('#result-details')).toBeNull();
    act(() => {
      fireEvent.click(container.querySelector<HTMLElement>('.details-toggle')!);
    });
    expect(container.querySelector('#result-details')?.textContent).toContain('PROTOTYPE FIXTURE');
    expect(container.querySelectorAll('.nutrient').length).toBe(5);
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
    const budget = [...container.querySelectorAll<HTMLInputElement>('input.input')].find((i) => i.value === '299.5')!;
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
});
