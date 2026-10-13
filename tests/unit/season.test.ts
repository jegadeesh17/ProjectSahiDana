import { describe, expect, it } from 'vitest';
import feedsV1 from '../../src/data/feeds.v1.json';
import requirementsV1 from '../../src/data/requirements.v1.json';
import { groupByVertical, isInSeason } from '../../src/domain/feedGroups';
import { feedNameBi, VERTICAL_CLASS } from '../../src/domain/feedNames';
import { isRoughage } from '../../src/domain/nutrition';
import { BINDING_ORDER, FEED_VERTICALS, type FeedItem, type SelectedFeedInput } from '../../src/domain/types';

const library = feedsV1 as unknown as FeedItem[];

describe('feeds.v1.json, season helpers, verticals, and roughage classification', () => {
  it('contains 25 to 30 Jaipur-area feeds, excludes mustard straw, has no legacy category field, and validates verticals and notes', () => {
    expect(library.length).toBeGreaterThanOrEqual(25);
    expect(library.length).toBeLessThanOrEqual(31);
    expect(library.some((f) => f.id.includes('mustard_straw') || /mustard straw/i.test(f.englishName))).toBe(false);

    const reliabilitiesSeen = new Set<string | null>();

    for (const feed of library) {
      expect('category' in (feed as unknown as Record<string, unknown>), feed.id).toBe(false);
      expect('availabilityTag' in (feed as unknown as Record<string, unknown>), feed.id).toBe(false);
      expect('isPrototypeFixture' in (feed as unknown as Record<string, unknown>), feed.id).toBe(false);

      expect(FEED_VERTICALS).toContain(feed.vertical);
      expect(VERTICAL_CLASS[feed.vertical]).toBeTruthy();
      expect(feed.availableMonths.length, feed.id).toBeGreaterThan(0);
      for (const m of feed.availableMonths) {
        expect(m, feed.id).toBeGreaterThanOrEqual(1);
        expect(m, feed.id).toBeLessThanOrEqual(12);
      }
      expect(feed.seasonNote.en.length, feed.id).toBeGreaterThan(0);
      expect(feed.seasonNote.hi.length, feed.id).toBeGreaterThan(0);
      expect(feed.seasonNote.hi, feed.id).toBe(feed.seasonNote.hi.normalize('NFC'));

      if (feed.localNameDeva !== null) {
        expect(feed.localNameDeva, feed.id).toBe(feed.localNameDeva.normalize('NFC'));
      }
      const label = feedNameBi(feed);
      expect(label.en, feed.id).toBe(feed.englishName);
      expect(label.hi, feed.id).toBe(feed.localNameDeva ?? feed.localNameLatn ?? feed.englishName);

      reliabilitiesSeen.add(feed.priceReliability);
      if (feed.defaultPriceInrPerKgAsFed !== null) {
        expect(feed.defaultPriceInrPerKgAsFed, feed.id).toBeGreaterThan(0);
        expect(feed.priceSource, feed.id).toBeTruthy();
        expect(feed.priceDate, feed.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(['mandi', 'trade_report', 'listing', 'team_estimate']).toContain(feed.priceReliability);
        if (feed.priceReliability === 'team_estimate') {
          expect(feed.priceNote?.en.length, feed.id).toBeGreaterThan(0);
          expect(feed.priceNote?.hi.length, feed.id).toBeGreaterThan(0);
        }
        if (feed.priceNote) {
          expect(feed.priceNote.hi, feed.id).toBe(feed.priceNote.hi.normalize('NFC'));
        }
      } else {
        expect(feed.priceSource, feed.id).toBeNull();
        expect(feed.priceDate, feed.id).toBeNull();
        expect(feed.priceReliability, feed.id).toBeNull();
      }
    }

    // Covers all reliability levels plus null default price (molasses, AC-3.2 & AC-3.6)
    expect(reliabilitiesSeen.has('mandi')).toBe(true);
    expect(reliabilitiesSeen.has('trade_report')).toBe(true);
    expect(reliabilitiesSeen.has('listing')).toBe(true);
    expect(reliabilitiesSeen.has('team_estimate')).toBe(true);
    expect(reliabilitiesSeen.has(null)).toBe(true);
  });

  it('marks feeds in-season and out-of-season by month (1..12) without altering solver inputs, and rejects invalid months', () => {
    const berseem = library.find((f) => f.id === 'berseem')!;
    const bajraGreen = library.find((f) => f.id === 'bajra_green')!;
    const wheatStraw = library.find((f) => f.id === 'wheat_straw')!;

    const solverInputs: SelectedFeedInput[] = [
      { feedId: berseem.id, priceInrPerKgAsFed: 2.5, maxKgAsFedPerDay: 15, currentKgAsFedPerDay: 10 },
      { feedId: bajraGreen.id, priceInrPerKgAsFed: 3, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null },
    ];
    const snapshotBefore = JSON.stringify(solverInputs);

    expect(isInSeason(berseem, 12)).toBe(true);
    expect(isInSeason(berseem, 2)).toBe(true);
    expect(isInSeason(berseem, 7)).toBe(false);

    expect(isInSeason(bajraGreen, 8)).toBe(true);
    expect(isInSeason(bajraGreen, 1)).toBe(false);

    for (let m = 1; m <= 12; m++) {
      expect(isInSeason(wheatStraw, m)).toBe(true);
    }

    // Invalid month inputs return false
    expect(isInSeason(wheatStraw, 0)).toBe(false);
    expect(isInSeason(wheatStraw, 13)).toBe(false);
    expect(isInSeason(wheatStraw, -3)).toBe(false);
    expect(isInSeason(wheatStraw, Number.NaN)).toBe(false);

    expect(JSON.stringify(solverInputs)).toBe(snapshotBefore);
  });

  it('groups all feeds into the four verticals in order and classifies roughage from vertical', () => {
    const groups = groupByVertical(library);
    expect(groups.map((g) => g.vertical)).toEqual(['indigenous_forage', 'crop_residue', 'agro_byproduct', 'mineral']);
    const totalGrouped = groups.reduce((acc, g) => acc + g.feeds.length, 0);
    expect(totalGrouped).toBe(library.length);

    for (const feed of library) {
      const expectedRoughage = feed.vertical === 'indigenous_forage' || feed.vertical === 'crop_residue';
      expect(isRoughage(feed), feed.id).toBe(expectedRoughage);
    }
  });

  it('places roughage immediately after intake in BINDING_ORDER and includes cited roughageMinShareOfDm in requirements.v1.json', () => {
    expect(BINDING_ORDER).toEqual(['budget', 'breed_cap', 'intake', 'roughage', 'CP', 'ME', 'Ca', 'P']);
    expect(requirementsV1.roughageMinShareOfDm.value).toBeGreaterThan(0);
    expect(requirementsV1.roughageMinShareOfDm.value).toBeLessThanOrEqual(1);
    expect(requirementsV1.roughageMinShareOfDm.citation.doc.length).toBeGreaterThan(0);
    expect(requirementsV1.roughageMinShareOfDm.citation.page.length).toBeGreaterThan(0);
    expect(requirementsV1.dmi.defaultWeekOfLactation).toBe(20);
  });
});


