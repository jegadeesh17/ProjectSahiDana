import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import feeds from '../../src/data/feeds.prototype.json';
import type { FeedItem } from '../../src/domain/types';
import { LANG_STORAGE_KEY, setActiveLang } from '../../src/i18n/lang';
import { PRESET_BUFFALO } from '../../src/domain/presets';

const DEVA = /[\u0900-\u097F]/g;
const library = feeds as unknown as FeedItem[];

/** Visible text plus the attributes a screen reader or a hover would expose. */
function everything(root: HTMLElement): string {
  const attrs = [...root.querySelectorAll<HTMLElement>('[aria-label],[title],[placeholder]')].flatMap((el) =>
    ['aria-label', 'title', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
  );
  return [root.textContent ?? '', ...attrs].join('\n');
}

function balanceBuffalo(container: HTMLElement) {
  const button = container.querySelector<HTMLElement>('[data-preset="buffalo"]');
  expect(button).toBeTruthy();
  act(() => {
    fireEvent.click(button!);
  });
  expect(container.querySelector('.solved')).toBeTruthy();
}

describe('one language at a time', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = () => undefined; // jsdom does not implement it
    window.localStorage.clear();
    setActiveLang('en');
  });
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    setActiveLang('en');
    document.documentElement.lang = 'en';
  });

  it('English mode shows no Devanagari outside the toggle label', () => {
    const { container } = render(<App />);
    balanceBuffalo(container);
    const toggleLabel = container.querySelector('.langtoggle-btn[lang="hi"]')?.textContent ?? '';
    expect(toggleLabel).not.toBe('');
    const text = everything(container).split(toggleLabel).join('');
    expect(text.match(DEVA) ?? []).toEqual([]);
  });

  it('Hindi mode shows Devanagari feed names in the result and the feed rows, never the English names', () => {
    window.localStorage.setItem(LANG_STORAGE_KEY, 'hi');
    const { container } = render(<App />);
    balanceBuffalo(container);
    const rows = [...container.querySelectorAll('tr[data-feed], .feedrow, .feedchip')];
    expect(rows.length).toBeGreaterThan(0);
    const picked = new Set(PRESET_BUFFALO.feeds.map((f) => f.feedId));
    for (const feed of library.filter((f) => picked.has(f.id) && f.localNameDeva)) {
      const text = rows.map((r) => r.textContent ?? '').join('\n');
      expect(text, feed.englishName).toContain(feed.localNameDeva!);
      expect(text, feed.englishName).not.toContain(feed.englishName);
    }
  });

  it('shows the one-line how-to-use banner at the top of the workspace in the active language', () => {
    const { container } = render(<App />);
    const main = container.querySelector('main.page');
    const banner = container.querySelector('[data-testid="how-to-use"]');
    expect(banner).toBeTruthy();
    expect(main?.firstElementChild).toBe(banner);
    expect(banner?.textContent).toContain('How to use:');
    expect(banner?.textContent).toContain('Balance ration');
    expect(banner?.textContent?.match(DEVA) ?? []).toEqual([]);

    const hiToggle = container.querySelector<HTMLElement>('.langtoggle-btn[lang="hi"]');
    act(() => {
      fireEvent.click(hiToggle!);
    });
    expect(banner?.textContent).toContain('कैसे इस्तेमाल करें:');
    expect(banner?.textContent).not.toContain('How to use:');
  });
});

