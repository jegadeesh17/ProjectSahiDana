import { describe, expect, it } from 'vitest';
import feeds from '../../src/data/feeds.prototype.json';
import { searchFeeds } from '../../src/domain/feedSearch';
import type { FeedItem } from '../../src/domain/types';

const library = feeds as unknown as FeedItem[];
const ids = (q: string) => searchFeeds(q, library).map((f) => f.id);

describe('searchFeeds (AC-L1.3)', () => {
  it('finds mustard cake by English, transliterated and Devanagari names', () => {
    expect(ids('Mustard')).toEqual(['mustard_cake']);
    expect(ids('Sarson')).toEqual(['mustard_cake']);
    expect(ids('\u0938\u0930\u0938\u094B\u0902')).toEqual(['mustard_cake']);
  });

  it('finds wheat straw by Bhusa, including the Bhoosa spelling', () => {
    expect(ids('Bhusa')).toContain('wheat_straw');
    expect(ids('Bhoosa')).toContain('wheat_straw');
  });

  it('still finds a feed with no local name by its English name', () => {
    expect(ids('molasses')).toEqual(['molasses']);
  });
});
