import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatInr, formatKg, formatNumber, formatPct, toLatinDigits } from '../../src/i18n/format';
import { setActiveLang } from '../../src/i18n/lang';
import { bi, biText, HINDI_REVIEW, LANGUAGE_LABELS, strings, t } from '../../src/i18n/strings';

const DEVA = /[\u0900-\u097F]/;
const DEVA_DIGITS = /[\u0966-\u096F]/;
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('strings', () => {
  const entries = Object.entries(strings) as [string, { hi: string; en: string }][];

  it('has a Hindi half with Devanagari and an English half without, for every id', () => {
    for (const [id, v] of entries) {
      expect(v.hi.length, id).toBeGreaterThan(0);
      expect(DEVA.test(v.hi), `${id} hi`).toBe(true);
      expect(DEVA.test(v.en), `${id} en`).toBe(false);
      expect(v.hi.normalize('NFC'), `${id} NFC`).toBe(v.hi);
    }
  });

  it('uses the same placeholders in both halves and never Devanagari digits', () => {
    for (const [id, v] of entries) {
      expect(placeholders(v.hi), id).toEqual(placeholders(v.en));
      expect(DEVA_DIGITS.test(v.hi) || DEVA_DIGITS.test(v.en), id).toBe(false);
    }
  });

  it('asserts the Hindi review gate is verified', () => {
    expect(HINDI_REVIEW.status).toBe('verified');
  });

  it('interpolates numbers as Latin digits', () => {
    const msg = t('error_weight_range', { min: 150, max: 800 });
    expect(msg.en).toBe('Body weight must be 150–800 kg');
    expect(DEVA_DIGITS.test(msg.hi)).toBe(false);
  });

  it('returns plain text in the selected language only', () => {
    setActiveLang('en');
    expect(bi('action_balance_ration')).toBe(strings.action_balance_ration.en);
    expect(biText(t('state_online'))).toBe('Online');
    setActiveLang('hi');
    expect(bi('action_balance_ration')).toBe(strings.action_balance_ration.hi);
    expect(bi('action_balance_ration')).not.toContain(' / ');
    expect(DEVA.test(biText(t('state_online')))).toBe(true);
    setActiveLang('en');
  });

  it('names each language in its own script for the toggle', () => {
    expect(LANGUAGE_LABELS.en).toBe('English');
    expect(DEVA.test(LANGUAGE_LABELS.hi)).toBe(true);
  });
});

describe('format', () => {
  it('never outputs Devanagari digits and keeps units Latin', () => {
    const samples = [formatNumber(1234.5, 1), formatKg(2.99), formatInr(220.44), formatPct(16.8, 1)];
    for (const s of samples) expect(DEVA_DIGITS.test(s), s).toBe(false);
    expect(formatInr(220.44)).toBe('₹220.44');
    expect(formatKg(2.99)).toBe('2.99\u00A0kg');
  });

  it('round-trips toLatinDigits', () => {
    expect(toLatinDigits('\u096A\u096B\u0966')).toBe('450');
    expect(toLatinDigits('450')).toBe('450');
  });
});

describe('source files', () => {
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  }
  const norm = (f: string) => f.split(String.fromCharCode(92)).join('/');
  const files = [...walk('src'), 'index.html'].filter((f) => /\.(ts|tsx|css|html)$/.test(f));

  it('keeps Devanagari literals inside src/i18n/strings.ts only', () => {
    const offenders = files.filter((f) => !norm(f).endsWith('src/i18n/strings.ts') && DEVA.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('builds number formatters only in src/i18n/format.ts', () => {
    const offenders = files.filter((f) => !norm(f).endsWith('src/i18n/format.ts') && /toLocaleString|Intl\.NumberFormat/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
