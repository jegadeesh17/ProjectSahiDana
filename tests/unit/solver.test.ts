import { describe, expect, it } from 'vitest';
import breedsJson from '../../src/data/breeds.prototype.json';
import feedsJson from '../../src/data/feeds.prototype.json';
import { BREEDS, breedsFor, capFromCitedFigures, isNonDescript } from '../../src/domain/breeds';
import { groupFeeds, inSeason } from '../../src/domain/feedGroups';
import { DEMO_CASES } from '../../src/domain/presets';
import type { DemoKey } from '../../src/domain/presets';
import type { FeedItem, RationSolveOutcome } from '../../src/domain/types';
import { FEED_VERTICALS } from '../../src/domain/types';
import { budgetFieldText, budgetIsDefault, todayCostInr, validateAnimal, validateBudget, validateFeed } from '../../src/domain/validation';
import { monthRangeText } from '../../src/i18n/months';
import { solveRation } from '../../src/services/mockSolver';

const feeds = feedsJson as unknown as FeedItem[];

function run(key: DemoKey): { outcome: RationSolveOutcome; milk: number } {
  const demo = DEMO_CASES.find((c) => c.key === key)!;
  const inputs = demo.preset.feeds.flatMap((d) => {
    const { input } = validateFeed(d);
    return input ? [input] : [];
  });
  const { profile, errors } = validateAnimal(demo.preset.animal, todayCostInr(demo.preset.feeds));
  expect(errors).toEqual({});
  return { outcome: solveRation({ ...profile!, isConfirmed: true }, inputs), milk: profile!.milkYieldLitersPerDay };
}

describe('verdict cases (SPEC AC-5.6 to 5.11, AC-E7.1, OQ15)', () => {
  it('gain: supported milk above today by at least 0.1 L', () => {
    const { outcome } = run('gain');
    expect(outcome.status).toBe('optimal');
    if (outcome.status !== 'optimal') return;
    expect(outcome.verdict).toMatchObject({ kind: 'gain' });
    if (outcome.verdict.kind === 'gain') expect(outcome.verdict.gainLPerDay).toBeGreaterThanOrEqual(0.1);
  });

  it('at breed level: today is within 0.1 L of the cap, with a saving for the same milk', () => {
    const { outcome } = run('at_level');
    if (outcome.status !== 'optimal') throw new Error('expected a ration');
    expect(outcome.verdict.kind).toBe('at_breed_level');
    if (outcome.verdict.kind === 'at_breed_level') expect(outcome.verdict.savingInrPerDay).toBeGreaterThan(0);
  });

  it('above breed level: today is higher than the cited cap, so today is the cap and no shortfall line appears', () => {
    const { outcome, milk } = run('above');
    if (outcome.status !== 'optimal') throw new Error('expected a ration');
    expect(milk).toBeGreaterThan(outcome.milkCapLPerDay);
    expect(outcome.effectiveCapLPerDay).toBe(milk);
    expect(outcome.verdict.kind).toBe('above_breed_level');
    expect(outcome.supportedMilkLPerDay).toBeLessThanOrEqual(milk);
  });

  it('below today with the cost of keeping today’s milk', () => {
    const { outcome } = run('below_cost');
    if (outcome.status !== 'optimal') throw new Error('expected a ration');
    expect(outcome.verdict.kind).toBe('below_today');
    if (outcome.verdict.kind === 'below_today') {
      expect(outcome.verdict.keepCostInrPerDay).toBeGreaterThan(outcome.budgetInrPerDay);
    }
  });

  it('below today where keeping today’s milk is impossible: names the limiting nutrient and shows no saving', () => {
    const { outcome } = run('below_no');
    if (outcome.status !== 'optimal') throw new Error('expected a ration');
    expect(outcome.verdict).toMatchObject({ kind: 'below_today', keepCostInrPerDay: null, limitingNutrients: ['CP'] });
    expect(outcome.costAtTodayMilkInrPerDay).toBeNull();
  });

  it('same as today', () => {
    const { outcome } = run('same');
    if (outcome.status !== 'optimal') throw new Error('expected a ration');
    expect(outcome.verdict.kind).toBe('same_as_today');
    expect(outcome.bindingConstraint).toBe('budget');
  });

  it('budget below maintenance (AC-E7.1): no ration, a fix feed within the budget', () => {
    const { outcome } = run('shortfall');
    expect(outcome.status).toBe('budget_below_maintenance');
    if (outcome.status !== 'budget_below_maintenance') return;
    expect(outcome.verdict.maintenanceCostInrPerDay).toBeGreaterThan(outcome.verdict.budgetInrPerDay);
    expect(outcome.fixFeedId).not.toBeNull();
    expect(outcome.maintenanceWithFixInrPerDay!).toBeLessThanOrEqual(outcome.verdict.budgetInrPerDay);
  });

  it('infeasible (E2): straw alone names protein and phosphorus', () => {
    const { outcome } = run('infeasible');
    expect(outcome.status).toBe('infeasible');
    if (outcome.status !== 'infeasible') return;
    expect(outcome.limitingNutrients.map((l) => l.nutrient)).toEqual(expect.arrayContaining(['CP', 'P']));
  });

  it('infeasible because of the roughage minimum: concentrates only, and a roughage feed is suggested', () => {
    const { outcome } = run('roughage');
    expect(outcome.status).toBe('infeasible');
    if (outcome.status !== 'infeasible') return;
    expect(outcome.limitingNutrients.map((l) => l.nutrient)).toEqual(['roughage']);
    const suggested = feeds.find((f) => f.id === outcome.suggestedFeeds[0].feedId)!;
    expect(['indigenous_forage', 'crop_residue']).toContain(suggested.vertical);
  });

  it('dry animal: stage 1 is skipped and the maintenance ration is shown', () => {
    const { outcome } = run('dry');
    if (outcome.status !== 'optimal') throw new Error('expected a ration');
    expect(outcome.verdict.kind).toBe('dry_animal');
    expect(outcome.supportedMilkLPerDay).toBe(0);
    expect(outcome.totalCostInr).toBeCloseTo(outcome.maintenanceCostInrPerDay, 6);
    expect(outcome.fatComparison).toBeNull();
  });

  it('non-descript cow: DAHD cap, no breed fat', () => {
    const { outcome } = run('nondescript');
    if (outcome.status !== 'optimal') throw new Error('expected a ration');
    expect(outcome.milkCapLPerDay).toBe(3.86);
    expect(outcome.fatComparison?.breedFatPct).toBeNull();
  });

  it('Kankrej: no cited fat percent', () => {
    const { outcome } = run('kankrej');
    if (outcome.status !== 'optimal') throw new Error('expected a ration');
    expect(outcome.fatComparison?.breedFatPct).toBeNull();
  });
});

describe('the cap is never exceeded', () => {
  it('S stays at or below the effective cap in every demo, and is a multiple of 0.1 L', () => {
    for (const demo of DEMO_CASES) {
      const { outcome } = run(demo.key);
      if (outcome.status !== 'optimal') continue;
      expect(outcome.supportedMilkLPerDay, demo.key).toBeLessThanOrEqual(outcome.effectiveCapLPerDay + 1e-9);
      expect(Math.abs(outcome.supportedMilkLPerDay * 10 - Math.round(outcome.supportedMilkLPerDay * 10)), demo.key).toBeLessThan(1e-6);
    }
  });

  it('with a generous budget, every breed stops at its own cap', () => {
    const rich = ['wheat_straw', 'maize_green', 'bajra_grain', 'wheat_bran', 'mustard_cake', 'mineral_mix'].map((feedId) => {
      const feed = feeds.find((f) => f.id === feedId)!;
      return { feedId, priceInrPerKgAsFed: feed.defaultPriceInrPerKgAsFed, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null };
    });
    for (const breed of BREEDS) {
      const outcome = solveRation(
        {
          species: breed.species,
          breedId: breed.id,
          bodyWeightKg: 500,
          milkYieldLitersPerDay: 1,
          milkFatPct: 5,
          budgetInrPerDay: 5000,
          isConfirmed: true,
        },
        rich,
      );
      if (outcome.status !== 'optimal') continue;
      expect(outcome.supportedMilkLPerDay, breed.id).toBeLessThanOrEqual(breed.milkCapLPerDay + 1e-9);
    }
  });
});

describe('breed table', () => {
  it('every stored cap equals the cap re-derived from the cited figures', () => {
    for (const breed of BREEDS) {
      expect(Math.abs(capFromCitedFigures(breed).value - breed.milkCapLPerDay), breed.id).toBeLessThan(0.005);
    }
  });

  it('the cited peak is the cap where one exists (Murrah 9.64, Nili-Ravi 9.4, Sahiwal 11.15, Bhadawari 6.93)', () => {
    const cap = (id: string) => BREEDS.find((b) => b.id === id)!.milkCapLPerDay;
    expect(cap('murrah')).toBe(9.64);
    expect(cap('nili_ravi')).toBe(9.4);
    expect(cap('sahiwal')).toBe(11.15);
    expect(cap('bhadawari')).toBe(6.93);
    for (const breed of BREEDS.filter((b) => b.peakDailyYieldKg !== null)) expect(breed.capBasis).toBe('cited_peak');
  });

  it('keeps the earlier rules for breeds with no cited peak', () => {
    const cap = (id: string) => BREEDS.find((b) => b.id === id)!.milkCapLPerDay;
    expect(cap('rathi')).toBe(8.36);
    expect(cap('gir')).toBe(6.33);
    expect(cap('nondescript_cow')).toBe(3.86);
    expect(cap('nondescript_buffalo')).toBe(4.73);
  });

  it('offers one non-descript row per species, listed last', () => {
    for (const species of ['cow', 'buffalo'] as const) {
      const list = breedsFor(species);
      expect(list.filter(isNonDescript)).toHaveLength(1);
      expect(isNonDescript(list[list.length - 1])).toBe(true);
    }
  });

  it('every breed has a Hindi name in the data file and every note is an {en, hi} pair', () => {
    for (const breed of breedsJson as unknown as { id: string; localNameDeva: string | null }[]) expect(breed.localNameDeva, breed.id).toBeTruthy();
    for (const feed of feeds) {
      expect(feed.seasonNote.en.length, feed.id).toBeGreaterThan(0);
      expect(feed.seasonNote.hi.length, feed.id).toBeGreaterThan(0);
      expect(feed.priceNote.en.length, feed.id).toBeGreaterThan(0);
      expect(feed.priceNote.hi.length, feed.id).toBeGreaterThan(0);
    }
  });
});

describe('budget (AC-4.2, AC-4.3)', () => {
  const drafts = [{ feedId: 'wheat_straw', price: '6', cap: '', current: '5' }];
  const animal = { species: 'buffalo' as const, breedId: 'murrah', weight: '450', milk: '5', fat: '6.5', budget: '', budgetEdited: false };

  it('defaults to today’s ration cost and says so', () => {
    const cost = todayCostInr(drafts);
    expect(cost).toBe(30);
    expect(budgetFieldText(animal, cost)).toBe('30');
    expect(budgetIsDefault(animal, cost)).toBe(true);
    expect(validateAnimal(animal, cost).profile?.budgetInrPerDay).toBe(30);
  });

  it('keeps the user’s own value once edited, even when today’s ration changes', () => {
    const edited = { ...animal, budget: '120', budgetEdited: true };
    expect(budgetFieldText(edited, 30)).toBe('120');
    expect(budgetIsDefault(edited, 30)).toBe(false);
  });

  it('is required when no ration is entered, and must be positive', () => {
    expect(validateAnimal(animal, null).errors.budget?.id).toBe('error_budget_required');
    expect(validateBudget('0').error?.id).toBe('error_budget_invalid');
    expect(validateBudget('-5').error?.id).toBe('error_budget_invalid');
    expect(validateBudget('abc').error?.id).toBe('error_budget_invalid');
    expect(validateBudget('150').value).toBe(150);
  });

  it('requires a breed that matches the species', () => {
    expect(validateAnimal({ ...animal, breedId: '' }, 30).errors.breed?.id).toBe('error_breed_required');
    expect(validateAnimal({ ...animal, breedId: 'gir' }, 30).errors.breed?.id).toBe('error_breed_required');
  });
});

describe('feed grouping and season (AC-3.3, AC-3.4)', () => {
  it('puts every feed in exactly one of the four groups, in a fixed order', () => {
    const groups = groupFeeds(feeds);
    expect(groups.map((g) => g.vertical)).toEqual([...FEED_VERTICALS]);
    expect(groups.flatMap((g) => g.feeds.map((f) => f.id)).sort()).toEqual(feeds.map((f) => f.id).sort());
  });

  it('marks a feed in season by its months', () => {
    const berseem = feeds.find((f) => f.id === 'berseem')!;
    expect(inSeason(berseem, 12)).toBe(true);
    expect(inSeason(berseem, 7)).toBe(false);
    expect(inSeason(feeds.find((f) => f.id === 'wheat_straw')!, 7)).toBe(true);
  });

  it('writes month runs, wrapping over the year end, and nothing for all year', () => {
    expect(monthRangeText([11, 12, 1, 2, 3, 4], 'en')).toBe('Nov–Apr');
    expect(monthRangeText([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'en')).toBeNull();
  });
});
