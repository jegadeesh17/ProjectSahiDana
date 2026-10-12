// Grouping and season marks for the feed picker (AC-3.3, AC-3.4).
import type { FeedItem, FeedVertical } from './types';
import { FEED_VERTICALS } from './types';

export interface FeedGroup {
  vertical: FeedVertical;
  feeds: FeedItem[];
}

/** The four groups in their fixed order. A group with no feed (for example after a search) is left out. */
export function groupFeeds(feeds: FeedItem[]): FeedGroup[] {
  return FEED_VERTICALS.map((vertical) => ({ vertical, feeds: feeds.filter((f) => f.vertical === vertical) })).filter(
    (g) => g.feeds.length > 0,
  );
}

export function inSeason(feed: FeedItem, month: number): boolean {
  return feed.availableMonths.includes(month);
}

export const VERTICAL_STRING = {
  indigenous_forage: 'vertical_indigenous_forage',
  crop_residue: 'vertical_crop_residue',
  agro_byproduct: 'vertical_agro_byproduct',
  mineral: 'vertical_mineral',
} as const satisfies Record<FeedVertical, string>;

export const RELIABILITY_STRING = {
  mandi: 'reliability_mandi',
  trade_report: 'reliability_trade_report',
  listing: 'reliability_listing',
  team_estimate: 'reliability_team_estimate',
} as const satisfies Record<FeedItem['priceReliability'], string>;
