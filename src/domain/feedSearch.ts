// Normalized search over English, transliterated and Devanagari feed names (AC-L1.3).
import type { FeedItem } from './types';

// Code points are built numerically so this file holds no Devanagari literal (ADR-0005).
const ch = (code: number) => String.fromCharCode(code);
const DEVANAGARI = new RegExp(`[${ch(0x0900)}-${ch(0x097f)}]`);
const NUKTA = new RegExp(ch(0x093c), 'g');
const CHANDRABINDU = new RegExp(ch(0x0901), 'g');
const COMBINING = new RegExp(`[${ch(0x0300)}-${ch(0x036f)}]`, 'g');

/** Unicode NFC, nukta removed, chandrabindu treated as anusvara. */
export function normalizeDeva(text: string): string {
  return text
    .normalize('NFC')
    .replace(NUKTA, '')
    .replace(CHANDRABINDU, ch(0x0902))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lowercase, diacritics stripped, non-alphanumerics removed, doubled vowels collapsed (Bhoosa -> bhusa). */
export function normalizeLatn(text: string): string {
  return text
    .normalize('NFD')
    .replace(COMBINING, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/oo/g, 'u')
    .replace(/ee/g, 'i')
    .replace(/aa/g, 'a');
}

export function searchFeeds(query: string, feeds: FeedItem[]): FeedItem[] {
  const trimmed = query.trim();
  if (trimmed === '') return feeds;
  if (DEVANAGARI.test(trimmed)) {
    const q = normalizeDeva(trimmed);
    return feeds.filter((f) => f.localNameDeva !== null && normalizeDeva(f.localNameDeva).includes(q));
  }
  const q = normalizeLatn(trimmed);
  if (q === '') return feeds;
  return feeds.filter((f) => {
    const names = [f.englishName, ...(f.localNameLatn ? f.localNameLatn.split(' / ') : [])];
    return names.some((name) => normalizeLatn(name).includes(q));
  });
}
