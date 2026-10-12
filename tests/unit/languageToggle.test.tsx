import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import { LANG_STORAGE_KEY, setActiveLang } from '../../src/i18n/lang';
import { strings } from '../../src/i18n/strings';

const hiBalance = strings.action_balance_ration.hi;
const enBalance = strings.action_balance_ration.en;

describe('language toggle', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setActiveLang('en');
  });
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    setActiveLang('en');
    document.documentElement.lang = 'en';
  });

  it('opens in English and shows only one language', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: enBalance })).toBeTruthy();
    expect(screen.queryByText(hiBalance)).toBeNull();
    expect(document.documentElement.lang).toBe('en');
  });

  it('switches the rendered language, sets <html lang> and persists the choice', () => {
    const first = render(<App />);
    const toggle = screen.getAllByRole('button').filter((b) => b.classList.contains('langtoggle-btn'));
    expect(toggle).toHaveLength(2);
    expect(toggle[0].getAttribute('aria-pressed')).toBe('false');
    expect(toggle[1].getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(toggle[0]);
    expect(screen.getByRole('button', { name: hiBalance })).toBeTruthy();
    expect(screen.queryByText(enBalance)).toBeNull();
    expect(toggle[0].getAttribute('aria-pressed')).toBe('true');
    expect(document.documentElement.lang).toBe('hi');
    expect(window.localStorage.getItem(LANG_STORAGE_KEY)).toBe('hi');

    // A new visit on the same device keeps the choice.
    first.unmount();
    render(<App />);
    expect(screen.getByRole('button', { name: hiBalance })).toBeTruthy();
    expect(document.documentElement.lang).toBe('hi');
  });

  it('falls back to English when the saved value is invalid', () => {
    window.localStorage.setItem(LANG_STORAGE_KEY, 'fr');
    render(<App />);
    expect(screen.getByRole('button', { name: enBalance })).toBeTruthy();
  });
});
