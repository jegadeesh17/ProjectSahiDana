// Month names in the selected language, from the platform's calendar data (no Devanagari literals here).
import type { Lang } from './lang';

const LOCALE: Record<Lang, string> = { en: 'en-IN', hi: 'hi-IN' };
const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(lang: Lang, style: 'long' | 'short'): Intl.DateTimeFormat {
  const key = `${lang}-${style}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(`${LOCALE[lang]}-u-ca-gregory`, { month: style, timeZone: 'UTC' });
    cache.set(key, f);
  }
  return f;
}

/** Month 1 to 12 as "October" / "Oct", or the Hindi name. */
export function monthName(month: number, lang: Lang, style: 'long' | 'short' = 'long'): string {
  return formatter(lang, style).format(new Date(Date.UTC(2026, month - 1, 15)));
}

/** The device's current month, 1 to 12 (AC-3.4). */
export function currentMonth(now: Date = new Date()): number {
  return now.getMonth() + 1;
}

/** "Jul–Oct", "Nov–Apr", "Mar–Jun, Dec–Feb"; null when all twelve months are listed. Runs wrap over the year end. */
export function monthRangeText(months: number[], lang: Lang): string | null {
  const set = new Set(months);
  if (set.size >= 12) return null;
  const runs: string[] = [];
  for (let m = 1; m <= 12; m++) {
    const prev = m === 1 ? 12 : m - 1;
    if (!set.has(m) || set.has(prev)) continue;
    let end = m;
    while (set.has(end === 12 ? 1 : end + 1) && (end === 12 ? 1 : end + 1) !== m) end = end === 12 ? 1 : end + 1;
    runs.push(end === m ? monthName(m, lang, 'short') : `${monthName(m, lang, 'short')}–${monthName(end, lang, 'short')}`);
  }
  return runs.join(', ');
}
