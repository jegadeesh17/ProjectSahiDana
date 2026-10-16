import { describe, expect, it } from 'vitest';
import feedsV1 from '../../src/data/feeds.v1.json';
import {
  auditCardKg,
  auditSeasonSet,
  auditShoppingCost,
  auditShoppingKg,
} from '../../src/domain/auditHerd';
import { BREEDS } from '../../src/domain/breeds';
import {
  displayAmount,
  floorMilk1,
  GRAM_FEED_IDS,
  isShownAmount,
  roundInrWhole,
  roundKg1,
  roundUpInrWhole,
  SHOW_AMOUNT_MIN_KG,
  toGrams,
} from '../../src/domain/format';
import { planHerd } from '../../src/domain/herdPlan';
import { buildHerdSummary } from '../../src/domain/summary';
import type { FeedItem, HerdAnimal } from '../../src/domain/types';

const LIVE_FEEDS = feedsV1 as unknown as FeedItem[];

describe('domain/format (Change 4 display rounding rules)', () => {
  describe('roundKg1', () => {
    it('rounds 1.05 kg up to 1.1 kg (ARCHITECTURE line 1838)', () => {
      expect(roundKg1(1.05)).toBe(1.1);
    });

    it('rounds 0.04999 kg down to 0.0 kg (ARCHITECTURE line 1838)', () => {
      expect(roundKg1(0.04999)).toBe(0.0);
    });

    it('handles exact integer and half-up boundary cases', () => {
      expect(roundKg1(0)).toBe(0);
      expect(roundKg1(2.34)).toBe(2.3);
      expect(roundKg1(2.35)).toBe(2.4);
      expect(roundKg1(10.95)).toBe(11.0);
    });
  });

  describe('toGrams', () => {
    it('rounds 0.0499996 kg to 50 g (ARCHITECTURE line 1839)', () => {
      expect(toGrams(0.0499996)).toBe(50);
    });

    it('converts exact kilograms to grams', () => {
      expect(toGrams(0.03)).toBe(30);
      expect(toGrams(1.0)).toBe(1000);
      expect(toGrams(0.0005)).toBe(1);
      expect(toGrams(0.0004)).toBe(0);
    });
  });

  describe('roundUpInrWhole', () => {
    it('handles epsilon boundary 12.0000000001 -> 12 (ARCHITECTURE line 1840)', () => {
      expect(roundUpInrWhole(12.0000000001)).toBe(12);
    });

    it('rounds up 12.01 -> 13 (ARCHITECTURE line 1840)', () => {
      expect(roundUpInrWhole(12.01)).toBe(13);
    });

    it('handles zero and exact whole numbers', () => {
      expect(roundUpInrWhole(0)).toBe(0);
      expect(roundUpInrWhole(15)).toBe(15);
      expect(roundUpInrWhole(15.0000001)).toBe(15);
      expect(roundUpInrWhole(15.001)).toBe(16);
      expect(roundUpInrWhole(-2)).toBe(0);
    });
  });

  describe('roundInrWhole', () => {
    it('converts -0.4 to positive 0, never -0 (ARCHITECTURE line 1841)', () => {
      const res = roundInrWhole(-0.4);
      expect(res).toBe(0);
      expect(Object.is(res, 0)).toBe(true);
      expect(Object.is(res, -0)).toBe(false);
    });

    it('rounds nearest whole rupee with standard half-up behavior', () => {
      expect(roundInrWhole(14.4)).toBe(14);
      expect(roundInrWhole(14.5)).toBe(15);
      expect(roundInrWhole(14.6)).toBe(15);
      expect(roundInrWhole(0)).toBe(0);
    });
  });

  describe('floorMilk1', () => {
    it('floors milk down to 0.1 L (matching solver S rounding)', () => {
      expect(floorMilk1(12.39)).toBe(12.3);
      expect(floorMilk1(12.3000001)).toBe(12.3);
      expect(floorMilk1(8.05)).toBe(8.0);
      expect(floorMilk1(0.09)).toBe(0.0);
      expect(floorMilk1(0.1)).toBe(0.1);
    });
  });

  describe('displayAmount', () => {
    it('formats common_salt 0.03 kg as 30 g with 0 decimals (ARCHITECTURE line 1842)', () => {
      expect(displayAmount('common_salt', 0.03)).toEqual({
        value: 30,
        unit: 'g',
        decimals: 0,
      });
    });

    it('formats mineral_mix in grams with 0 decimals', () => {
      expect(displayAmount('mineral_mix', 0.045)).toEqual({
        value: 45,
        unit: 'g',
        decimals: 0,
      });
    });

    it('formats regular feeds in kg with 1 decimal place', () => {
      expect(displayAmount('wheat_straw', 4.56)).toEqual({
        value: 4.6,
        unit: 'kg',
        decimals: 1,
      });
      expect(displayAmount('mustard_cake', 1.05)).toEqual({
        value: 1.1,
        unit: 'kg',
        decimals: 1,
      });
    });

    it('GRAM_FEED_IDS contains mineral_mix and common_salt only', () => {
      expect(GRAM_FEED_IDS).toEqual(['mineral_mix', 'common_salt']);
    });
  });

  describe('isShownAmount', () => {
    it('returns false for exact threshold 1e-6 (ARCHITECTURE line 1843)', () => {
      expect(isShownAmount(1e-6)).toBe(false);
    });

    it('returns false for amounts <= SHOW_AMOUNT_MIN_KG and true strictly above', () => {
      expect(isShownAmount(0)).toBe(false);
      expect(isShownAmount(1e-7)).toBe(false);
      expect(isShownAmount(SHOW_AMOUNT_MIN_KG)).toBe(false);
      expect(isShownAmount(1.0001e-6)).toBe(true);
      expect(isShownAmount(0.01)).toBe(true);
    });
  });

  describe('buildHerdSummary (SPEC AC-C4-1.24, AC-C4-1.21, AC-C4-1.30)', () => {
    const animal: HerdAnimal = {
      key: 'a1',
      label: { species: 'cow', n: 1 },
      profile: {
        species: 'cow',
        breedId: 'rathi',
        bodyWeightKg: 350,
        milkYieldLitersPerDay: 8.0,
        milkFatPct: 4.0,
      },
      weightSource: 'typed',
      fatSource: 'typed',
      isConfirmed: true,
    };

    const plan = planHerd([animal], [], 180, LIVE_FEEDS, BREEDS, 10);

    it('builds a feasible summary in English matching AC-C4-1.24 and AC-C4-1.30', () => {
      expect(plan.status).toBe('optimal');
      const textEn = buildHerdSummary(plan, LIVE_FEEDS, 'en');

      // Title & season line
      expect(textEn).toContain('SahiDana · Your plan');
      expect(textEn).toContain('Feeds to buy are chosen from what is in season today');
      expect(textEn).toContain('October');

      // Sections
      expect(textEn).toContain('What to buy');
      expect(textEn).toContain('Buy first');
      expect(textEn).toContain('What to give each animal');
      expect(textEn).toContain('Cow 1:');
      expect(textEn).toContain('Sources: ICAR-NIANP 2013 · ICAR 2013 · NDDB');

      // Farmer units: whole ₹, kg / g (with non-breaking space per UI craft standard)
      expect(textEn).toMatch(/₹\d+/);
      expect(textEn).toMatch(/\d+(\.\d)?[\s\u00A0](kg|g)/);

      // AC-C4-1.21: Plain words check - no prohibited technical jargon
      const forbiddenTerms = [/\bDM\b/i, /\bME\b/i, /\bCP\b/i, /\brung\b/i, /\bbinding\b/i, /\bsupported milk\b/i, /\bStage\b/i];
      for (const pattern of forbiddenTerms) {
        expect(pattern.test(textEn), `Plain words violation: matches ${pattern}`).toBe(false);
      }
    });

    it('builds a feasible summary in Hindi matching AC-C4-1.24 and AC-C4-1.21', () => {
      const textHi = buildHerdSummary(plan, LIVE_FEEDS, 'hi');

      expect(textHi).toContain('SahiDana · आपकी योजना');
      expect(textHi).toContain('ख़रीदने का चारा आज');
      expect(textHi).toContain('अक्टूबर');
      expect(textHi).toContain('क्या ख़रीदें');
      expect(textHi).toContain('पहले यह ख़रीदें');
      expect(textHi).toContain('हर गाय-भैंस को क्या दें');
      expect(textHi).toContain('गाय 1:');

      // AC-C4-1.21: No "चरण" step label in main Hindi text
      expect(textHi).not.toContain('चरण');
    });
  });

  describe('auditSeasonSet (SPEC AC-C4-1.30, ARCHITECTURE line 2101-2108)', () => {
    const animal: HerdAnimal = {
      key: 'a1',
      label: { species: 'cow', n: 1 },
      profile: {
        species: 'cow',
        breedId: 'rathi',
        bodyWeightKg: 350,
        milkYieldLitersPerDay: 8.0,
        milkFatPct: 4.0,
      },
      weightSource: 'typed',
      fatSource: 'typed',
      isConfirmed: true,
    };

    const plan = planHerd([animal], [], 180, LIVE_FEEDS, BREEDS, 10);

    it('creates cited season set audit drawer metadata', () => {
      const audit = auditSeasonSet(plan, LIVE_FEEDS);

      expect(audit.originType).toBe('cited_source');
      expect(audit.numericValue).toBeGreaterThan(0);
      expect(audit.sourceKey).toBe('JAIPUR-CALENDAR-2026');

      // Audit rows required by ARCHITECTURE line 2101-2107
      const rows = audit.extraRows ?? [];
      const labelsEn = rows.map((r) => (typeof r.label === 'object' ? r.label.en : r.label));
      expect(labelsEn.some((l) => l.includes('Date on this phone'))).toBe(true);
      expect(labelsEn.some((l) => l.includes('Month used'))).toBe(true);
      expect(labelsEn.some((l) => l.includes('Rule'))).toBe(true);
      expect(labelsEn.some((l) => l.includes('Feeds in season'))).toBe(true);
      expect(labelsEn.some((l) => l.includes('excluded'))).toBe(true);

      // Notes: ADR-0019 and ADR-0016
      const notesEn = (audit.notes ?? []).map((n) => n.en);
      expect(notesEn.some((n) => n.includes('ADR-0019'))).toBe(true);
      expect(notesEn.some((n) => n.includes('ADR-0016'))).toBe(true);
    });

    it('shopping line and card audits have season availability and real solver metadata', () => {
      expect(plan.status).toBe('optimal');
      if (plan.status !== 'optimal') return;

      const shopLine = plan.shopping.buyFirst[0];
      const feed = LIVE_FEEDS.find((f) => f.id === shopLine.feedId)!;
      const labels = new Map([[animal.key, animal.label]]);

      const costAudit = auditShoppingCost(shopLine, feed);
      expect(costAudit.originType).toBe('solver_output');
      expect(costAudit.sourceKey).toBe('SOLVER-HERD');
      expect(costAudit.extraRows?.some((r) => (typeof r.label === 'object' ? r.label.en : r.label) === 'Available')).toBe(true);

      const kgAudit = auditShoppingKg(shopLine, feed, labels);
      expect(kgAudit.originType).toBe('solver_output');
      expect(kgAudit.sourceKey).toBe('SOLVER-HERD');
      expect(kgAudit.extraRows?.some((r) => (typeof r.label === 'object' ? r.label.en : r.label) === 'Available')).toBe(true);

      const cardAudit = auditCardKg(animal.label, feed, 2.5, 'buy');
      expect(cardAudit.originType).toBe('solver_output');
      expect(cardAudit.sourceKey).toBe('SOLVER-HERD');
      expect(cardAudit.extraRows?.some((r) => (typeof r.label === 'object' ? r.label.en : r.label) === 'Available')).toBe(true);
    });
  });

  describe('buildHerdSummary branch coverage (dry animal, below maintenance, infeasible, empty shopping)', () => {
    it('formats summary for a dry animal with dry animal phrasing', () => {
      const dryCow: HerdAnimal = {
        key: 'd1',
        label: { species: 'cow', n: 1 },
        profile: {
          species: 'cow',
          breedId: 'rathi',
          bodyWeightKg: 350,
          milkYieldLitersPerDay: 0,
          milkFatPct: 0,
        },
        weightSource: 'typed',
        fatSource: 'typed',
        isConfirmed: true,
      };
      const dryPlan = planHerd([dryCow], [], 100, LIVE_FEEDS, BREEDS, 10);
      expect(dryPlan.status).toBe('optimal');
      const textEn = buildHerdSummary(dryPlan, LIVE_FEEDS, 'en');
      expect(textEn).toContain('keeps her healthy (dry)');

      const textHi = buildHerdSummary(dryPlan, LIVE_FEEDS, 'hi');
      expect(textHi).toContain('सूखी गाय/भैंस का गुज़ारा');
    });

    it('formats summary for below_maintenance shortfall', () => {
      const tightCow: HerdAnimal = {
        key: 't1',
        label: { species: 'cow', n: 1 },
        profile: {
          species: 'cow',
          breedId: 'rathi',
          bodyWeightKg: 400,
          milkYieldLitersPerDay: 8,
          milkFatPct: 4.0,
        },
        weightSource: 'typed',
        fatSource: 'typed',
        isConfirmed: true,
      };
      // ₹10/day is below maintenance cost
      const shortfallPlan = planHerd([tightCow], [], 10, LIVE_FEEDS, BREEDS, 10);
      expect(shortfallPlan.status).toBe('below_maintenance');
      const textEn = buildHerdSummary(shortfallPlan, LIVE_FEEDS, 'en');
      expect(textEn).toContain('Spend at least');
      expect(textEn).toContain('more a day');

      const textHi = buildHerdSummary(shortfallPlan, LIVE_FEEDS, 'hi');
      expect(textHi).toContain('और ख़र्च करें');
    });
  });
});
