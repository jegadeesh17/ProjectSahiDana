import type { FeedItem } from '../domain/types';
import type { Lang } from './lang';
import { getActiveLang } from './lang';

/**
 * One feed name in one language, never a mix. Hindi: the Devanagari name, else the transliteration, else English.
 * English: the English name. Search still matches all three spellings (see domain/feedSearch.ts).
 */
export function feedLabel(feed: FeedItem, lang: Lang = getActiveLang()): string {
  if (lang === 'hi') return feed.localNameDeva ?? feed.localNameLatn ?? feed.englishName;
  return feed.englishName;
}
