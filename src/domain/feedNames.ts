import type { BiText } from '../i18n/strings';
import type { FeedCategory, FeedItem, LimitingKey, NutrientKey } from './types';

/** Hindi half: Devanagari name, else transliteration, else English. English half: the English name. */
export function feedNameBi(feed: FeedItem): BiText {
  return { hi: feed.localNameDeva ?? feed.localNameLatn ?? feed.englishName, en: feed.englishName };
}

/** One full-strength hue per feed class (tokens in index.css). Used only on the row chip. */
export const CATEGORY_CLASS: Record<FeedCategory, string> = {
  dry_roughage: 'chip-dry',
  green_fodder: 'chip-green',
  concentrate: 'chip-conc',
  byproduct: 'chip-byp',
  mineral: 'chip-min',
};

export const NUTRIENT_STRING_ID = {
  DM: 'nutrient_dm',
  CP: 'nutrient_cp',
  ME: 'nutrient_me',
  Ca: 'nutrient_ca',
  P: 'nutrient_p',
} as const satisfies Record<NutrientKey, string>;

/** Nutrients plus the roughage minimum, for the infeasibility report and the verdict. */
export const LIMIT_STRING_ID = {
  ...NUTRIENT_STRING_ID,
  roughage: 'nutrient_roughage',
} as const satisfies Record<LimitingKey, string>;
