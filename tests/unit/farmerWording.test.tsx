import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import { setActiveLang } from '../../src/i18n/lang';
import { setRationAdapterMode } from '../../src/services/rationService';

// QA for C3-M1-T1 (AC-C3-1.2, AC-C3-1.3, AC-C3-1.4). Complements the developer's tests in
// oneLanguage.test.tsx, whose 30-character windows miss a short "animal" or "पशु" at the edge of a text.

/** Visible text and accessible attributes after removing [data-lang-exempt] elements (same contract as oneLanguage.test.tsx). */
function visibleText(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement;
  for (const el of clone.querySelectorAll('[data-lang-exempt]')) {
    el.remove();
  }
  const parts: string[] = [];
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (current.nodeValue) parts.push(current.nodeValue);
    current = walker.nextNode();
  }
  const attrs = [...clone.querySelectorAll<HTMLElement>('[aria-label],[title],[placeholder]')].flatMap((el) =>
    ['aria-label', 'title', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
  );
  return [...parts, ...attrs].join(' ');
}

/** Every occurrence of a word with its surrounding text, for readable failure messages. */
function occurrences(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(new RegExp(`.{0,25}${pattern.source}.{0,25}`, 'gi'))].map((m) => m[0]);
}

function legendTitle(container: HTMLElement): string | null | undefined {
  return container.querySelector('fieldset:has(.seg) > legend')?.textContent;
}

function setLang(container: HTMLElement, lang: 'en' | 'hi') {
  act(() => {
    fireEvent.click(container.querySelector<HTMLElement>(`.langtoggle-btn[lang="${lang}"]`)!);
  });
}

function clickPreset(container: HTMLElement, preset: 'buffalo' | 'straw') {
  const button = container.querySelector<HTMLElement>(`[data-preset="${preset}"]`);
  expect(button, preset).toBeTruthy();
  act(() => {
    fireEvent.click(button!);
  });
}

function setWeight(container: HTMLElement, value: string) {
  const weight = container.querySelector<HTMLInputElement>('input[id*="weight"]');
  expect(weight).toBeTruthy();
  act(() => {
    fireEvent.change(weight!, { target: { value } });
  });
  act(() => {
    fireEvent.blur(weight!); // field errors show after the field is left
  });
}

function openDetails(container: HTMLElement) {
  for (const details of container.querySelectorAll<HTMLElement>('.details-toggle')) {
    act(() => {
      fireEvent.click(details);
    });
  }
}

type FarmerState = { name: string; reach: (container: HTMLElement) => void };

const STATES: FarmerState[] = [
  { name: 'initial', reach: () => undefined },
  { name: 'buffalo preset (solved)', reach: (c) => clickPreset(c, 'buffalo') },
  { name: 'straw preset (solved, cow)', reach: (c) => clickPreset(c, 'straw') },
  {
    name: 'invalid weight (validation error)',
    reach: (c) => {
      clickPreset(c, 'straw');
      setWeight(c, '5000');
    },
  },
];

describe('helper sanity (the wording check can fail)', () => {
  it('finds a stray "animal" and a stray "पशु" in visible text', () => {
    const el = document.createElement('div');
    el.innerHTML = '<p>Animal</p><span aria-label="पशु">x</span><b data-lang-exempt="x">animal</b>';
    expect(occurrences(visibleText(el), /animal/)).toHaveLength(1);
    expect(occurrences(visibleText(el), /पशु/)).toHaveLength(1);
  });
});

describe.each(['mock', 'live'] as const)('farmer wording (%s adapter)', (mode) => {
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
  });

  for (const state of STATES) {
    it(`English, ${state.name}: no visible word "animal" (AC-C3-1.4)`, () => {
      const { container } = render(<App />);
      state.reach(container);
      openDetails(container);
      const text = visibleText(container);
      expect(legendTitle(container)).toBeTruthy();
      expect(text).toContain(legendTitle(container)!); // the text was really collected
      expect(occurrences(text, /animal/)).toEqual([]);
    });

    it(`Hindi, ${state.name}: no visible "पशु" naming the farmer's animal (AC-C3-1.4)`, () => {
      const { container } = render(<App />);
      setLang(container, 'hi');
      state.reach(container);
      openDetails(container);
      const text = visibleText(container);
      // "पशु आहार" is a cited feed-library name (cattle feed), not the farmer's cow or buffalo.
      expect(occurrences(text.replace(/पशु आहार/g, ''), /पशु/)).toEqual([]);
    });
  }

  it('titles the card after a species preset, in English (AC-C3-1.2, AC-C3-1.3)', () => {
    const { container } = render(<App />);
    expect(legendTitle(container)).toBe('Your cow or buffalo');
    clickPreset(container, 'buffalo');
    expect(legendTitle(container)).toBe('Your buffalo');
    clickPreset(container, 'straw');
    expect(legendTitle(container)).toBe('Your cow');
  });

  it('titles the card after a species preset, in Hindi (AC-C3-1.2, AC-C3-1.3)', () => {
    const { container } = render(<App />);
    setLang(container, 'hi');
    expect(legendTitle(container)).toBe('आपकी गाय या भैंस');
    clickPreset(container, 'buffalo');
    expect(legendTitle(container)).toBe('आपकी भैंस');
    clickPreset(container, 'straw');
    expect(legendTitle(container)).toBe('आपकी गाय');
  });

  it('keeps the species title and the other inputs when a weight is invalid (invalid input, AC-C3-1.3)', () => {
    const { container } = render(<App />);
    clickPreset(container, 'buffalo');
    setWeight(container, '5000');
    const text = visibleText(container);
    expect(legendTitle(container)).toBe('Your buffalo');
    expect(occurrences(text, /Body weight must be/)).toHaveLength(1);
    expect(occurrences(text, /animal/)).toEqual([]);
    expect(container.querySelector<HTMLInputElement>('input[id*="weight"]')!.value).toBe('5000');
  });

  it('shows the no-species title and no "animal" when Balance ration is blocked (invalid input)', () => {
    const { container } = render(<App />);
    const balance = [...container.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.classList.contains('btn-primary'),
    );
    expect(balance?.disabled).toBe(true);
    expect(legendTitle(container)).toBe('Your cow or buffalo');
    expect(occurrences(visibleText(container), /animal/)).toEqual([]);
  });
});
