import { describe, expect, it } from 'vitest';
import { DEMO_CASES } from '../../src/domain/presets';
import { computeRequirements } from '../../src/domain/requirements';
import { solveRation } from '../../src/domain/solver';
import type { AnimalProfile, ExplanationRequestContext, SelectedFeedInput } from '../../src/domain/types';
import { todayCostInr, validateAnimal, validateFeed } from '../../src/domain/validation';
import {
  buildTemplateExplanation,
  collectAuthorizedNumbers,
  countNumericTokens,
  isAuthorizedNumber,
  verifyExplanationNumbers,
} from '../../src/domain/verifier';
import { LIVE_BREEDS, LIVE_FEEDS } from '../../src/services/liveAdapter';

const SAMPLE_ANIMAL: AnimalProfile = {
  species: 'buffalo',
  breedId: 'murrah',
  bodyWeightKg: 450,
  milkYieldLitersPerDay: 8,
  milkFatPct: 6.5,
  budgetInrPerDay: 220,
  isConfirmed: true,
};

const SAMPLE_FEEDS: SelectedFeedInput[] = [
  { feedId: 'wheat_straw', priceInrPerKgAsFed: 6, maxKgAsFedPerDay: 8, currentKgAsFedPerDay: 4 },
  { feedId: 'maize_green', priceInrPerKgAsFed: 2.5, maxKgAsFedPerDay: 40, currentKgAsFedPerDay: 20 },
  { feedId: 'bajra_grain', priceInrPerKgAsFed: 24, maxKgAsFedPerDay: 6, currentKgAsFedPerDay: 4 },
  { feedId: 'wheat_bran', priceInrPerKgAsFed: 20, maxKgAsFedPerDay: 5, currentKgAsFedPerDay: 2 },
  { feedId: 'mustard_cake', priceInrPerKgAsFed: 33, maxKgAsFedPerDay: 3, currentKgAsFedPerDay: 2.5 },
  { feedId: 'mineral_mix', priceInrPerKgAsFed: 70, maxKgAsFedPerDay: 0.15, currentKgAsFedPerDay: 0.1 },
];

function buildSampleContext(
  animal: AnimalProfile = SAMPLE_ANIMAL,
  selectedFeeds: SelectedFeedInput[] = SAMPLE_FEEDS,
): ExplanationRequestContext {
  const outcome = solveRation(animal, selectedFeeds, LIVE_FEEDS, LIVE_BREEDS);
  if (outcome.status !== 'optimal') {
    throw new Error(`Expected optimal solution, got ${outcome.status}`);
  }
  const requirement = computeRequirements({
    ...animal,
    milkYieldLitersPerDay: outcome.supportedMilkLPerDay,
  });
  return {
    animal,
    requirement,
    solution: outcome,
    feeds: LIVE_FEEDS,
  };
}

describe('collectAuthorizedNumbers and verifyExplanationNumbers (M2-TASK-01)', () => {
  it('collects animal inputs, breed figures, requirements at S, and all solver outputs including S, X, Z, B, M, cap, and coverage', () => {
    const ctx = buildSampleContext();
    const auth = collectAuthorizedNumbers(ctx);
    const values = auth.map((a) => a.value);

    // Animal inputs
    expect(values).toContain(ctx.animal.bodyWeightKg);
    expect(values).toContain(ctx.animal.milkYieldLitersPerDay);
    expect(values).toContain(ctx.animal.milkFatPct);
    expect(values).toContain(ctx.animal.budgetInrPerDay);

    // Breed figures (Murrah cap 9.64, fat 7.34; Rathi fatPctLow 3.7, fatPctHigh 4)
    expect(values).toContain(ctx.solution.milkCapLPerDay);
    expect(values).toContain(7.34);

    const rathiCtx = buildSampleContext({
      species: 'cow',
      breedId: 'rathi',
      bodyWeightKg: 350,
      milkYieldLitersPerDay: 6,
      milkFatPct: 4,
      budgetInrPerDay: 180,
      isConfirmed: true,
    });
    const rathiValues = collectAuthorizedNumbers(rathiCtx).map((a) => a.value);
    expect(rathiValues).toContain(3.7);
    expect(rathiValues).toContain(4);

    // Requirements at S
    expect(values).toContain(ctx.solution.requirementsAtS!.dmKgPerDay);
    expect(values).toContain(ctx.solution.requirementsAtS!.cpGramsPerDay);
    expect(values).toContain(ctx.solution.requirementsAtS!.meMcalPerDay);
    expect(values).toContain(ctx.solution.requirementsAtS!.caGramsPerDay);
    expect(values).toContain(ctx.solution.requirementsAtS!.pGramsPerDay);

    // Solver outputs: S, effectiveCap, M, totals, roughage shares, coveragePct, per-feed kg/cost/price
    expect(values).toContain(ctx.solution.supportedMilkLPerDay);
    expect(values).toContain(ctx.solution.effectiveCapLPerDay);
    expect(values).toContain(ctx.solution.maintenanceCostInrPerDay);
    expect(values).toContain(ctx.solution.totalKgAsFed);
    expect(values).toContain(ctx.solution.totalCostInr);
    expect(values).toContain(ctx.solution.roughageSharePct);
    expect(values).toContain(ctx.solution.roughageMinSharePct);
    expect(values).toContain(ctx.solution.coveragePct.CP);
    expect(values).toContain(ctx.solution.coveragePct.ME);
    expect(values).toContain(ctx.solution.coveragePct.Ca);
    expect(values).toContain(ctx.solution.coveragePct.P);
    expect(values).toContain(ctx.solution.coveragePct.DM);

    for (const f of ctx.solution.feeds) {
      expect(values).toContain(f.kgAsFed);
      expect(values).toContain(f.costInr);
      expect(values).toContain(f.priceInrPerKg);
    }

    // Check verdict-specific numbers across DEMO_CASES (X for gain, Z for at_breed_level / above_breed_level, B for below_today)
    for (const demoKey of ['gain', 'at_level', 'above', 'below_cost'] as const) {
      const demo = DEMO_CASES.find((c) => c.key === demoKey)!;
      const checked = validateAnimal(demo.preset.animal, todayCostInr(demo.preset.feeds));
      const inputs = demo.preset.feeds.map((d) => validateFeed(d).input!);
      const dCtx = buildSampleContext({ ...checked.profile!, isConfirmed: true }, inputs);
      const dValues = collectAuthorizedNumbers(dCtx).map((a) => a.value);
      const v = dCtx.solution.verdict;
      if (v.kind === 'gain') {
        expect(dValues).toContain(v.gainLPerDay);
      } else if (v.kind === 'at_breed_level' || v.kind === 'above_breed_level') {
        expect(v.savingInrPerDay).not.toBeNull();
        expect(dValues).toContain(v.savingInrPerDay!);
      } else if (v.kind === 'below_today') {
        expect(v.keepCostInrPerDay).not.toBeNull();
        expect(dValues).toContain(v.keepCostInrPerDay!);
        expect(dValues).toContain(dCtx.solution.costAtTodayMilkInrPerDay!);
      }
    }
  });

  it('verifies explanations containing only authorized numbers (S, X, Z, B, M, cap, coverage) with exact verifiedCount (AC-7.1)', () => {
    const ctx = buildSampleContext();
    const auth = collectAuthorizedNumbers(ctx);
    const s = ctx.solution.supportedMilkLPerDay.toFixed(1);
    const x = ctx.solution.verdict.kind === 'gain' ? ctx.solution.verdict.gainLPerDay.toFixed(1) : '1.6';
    const m = ctx.solution.maintenanceCostInrPerDay.toFixed(2);
    const cap = ctx.solution.milkCapLPerDay.toFixed(2);
    const totalCost = ctx.solution.totalCostInr.toFixed(2);
    const cpCov = Math.round(ctx.solution.coveragePct.CP);
    const meCov = Math.round(ctx.solution.coveragePct.ME);

    // Also include B and Z from authorized values to test all key figures together
    const zVal = 18.45;
    const bVal = 165.3;
    const extendedAuth = [
      ...auth,
      { label: 'Saving Z (INR/day)', value: zVal, formatted: '18.45' },
      { label: 'Keep today cost B (INR/day)', value: bVal, formatted: '165.30' },
    ];

    const explanation =
      `Your 450 kg Murrah buffalo giving 8 L/day at 6.5% fat has a ₹220.00/day budget. ` +
      `This budget supports ${s} L/day (+${x} L/day possible), up to the breed cap of ${cap} L/day. ` +
      `Maintenance cost M is ₹${m}/day, keeping today's milk B costs ₹165.30/day, and saving Z is ₹18.45/day. ` +
      `The ration costs ₹${totalCost}/day and achieves ${cpCov}% CP coverage and ${meCov}% ME coverage.`;

    const res = verifyExplanationNumbers(explanation, extendedAuth);
    expect(res.status).toBe('verified');
    expect(res.ok).toBe(true);
    expect(res.flaggedNumbers).toEqual([]);
    expect(res.hasDevanagari).toBe(false);
    expect(res.languageGatePassed).toBe(true);
    expect(res.verifiedCount).toBe(13);
    expect(res.badge).toEqual({ id: 'badge_all_verified', params: { n: 13 } });
  });

  it('applies tolerance |v - a| <= max(0.05, 0.01 * |a|) and 0/1/2 decimal rounding rules accurately', () => {
    // Tolerance: within 0.05 absolute for small numbers, 1% relative for larger numbers
    expect(isAuthorizedNumber(1.24, [1.2])).toBe(true);
    expect(isAuthorizedNumber(1.26, [1.2])).toBe(false);
    expect(isAuthorizedNumber(201.8, [200])).toBe(true);
    expect(isAuthorizedNumber(203.0, [200])).toBe(false);

    // Rounding to 0, 1, or 2 decimal places: e.g. 2.6 rounds to 3 at 0 decimals, 9.64 rounds to 9.6 at 1 decimal and 10 at 0 decimals
    expect(isAuthorizedNumber(3, [2.6])).toBe(true);
    expect(isAuthorizedNumber(9.6, [9.64])).toBe(true);
    expect(isAuthorizedNumber(10, [9.64])).toBe(true);
    // 9.5 does NOT match 9.64 (|9.5 - 9.64| = 0.14 > 0.0964, and 9.5 != 10, 9.6, 9.64)
    expect(isAuthorizedNumber(9.5, [9.64])).toBe(false);
  });

  it('flags any untraced numbers in flaggedNumbers and returns badge_template_fallback (AC-E6.1)', () => {
    const ctx = buildSampleContext();
    const auth = collectAuthorizedNumbers(ctx);

    const textWithUntraced =
      `Your 450 kg buffalo on a ₹220.00 budget gets 31.7 kg of concentrate and 9.5 L extra milk (31.7 kg repeated).`;
    const res = verifyExplanationNumbers(textWithUntraced, auth);

    expect(res.status).toBe('unverified');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('untraced_numbers');
    expect(res.languageGatePassed).toBe(true);
    expect(res.flaggedNumbers).toEqual(['31.7', '9.5']);
    expect(res.verifiedCount).toBe(2); // 450 and 220.00
    expect(res.badge).toEqual({ id: 'badge_template_fallback' });
  });

  it('fails the language gate when any Devanagari character (U+0900..U+097F) is present in the LLM explanation body (AC-L1.6, AC-L1.3)', () => {
    const ctx = buildSampleContext();
    const auth = collectAuthorizedNumbers(ctx);

    // Hindi word mixed into English explanation with only authorized numbers
    const withHindiWord = 'Your 450 kg buffalo gives 8 L of दूध per day on a ₹220.00 budget.';
    const resWord = verifyExplanationNumbers(withHindiWord, auth);
    expect(resWord.status).toBe('unverified');
    expect(resWord.ok).toBe(false);
    expect(resWord.hasDevanagari).toBe(true);
    expect(resWord.languageGatePassed).toBe(false);
    expect(resWord.reason).toBe('devanagari');
    expect(resWord.badge).toEqual({ id: 'badge_template_fallback' });

    // Devanagari digits (U+0966..U+096F) fail even when allowDevanagari is true (AC-L1.3)
    const withDevaDigits = 'पशु का वज़न ४५० kg है।';
    const resDigits = verifyExplanationNumbers(withDevaDigits, auth, { allowDevanagari: true });
    expect(resDigits.status).toBe('unverified');
    expect(resDigits.ok).toBe(false);
    expect(resDigits.languageGatePassed).toBe(false);
    expect(resDigits.reason).toBe('devanagari');
  });

  it('verifies both English and Hindi halves of buildTemplateExplanation with 0 untraced numbers across all solved demo cases (AC-L1.3, AC-L1.6)', () => {
    const optimalDemoKeys = ['gain', 'at_level', 'above', 'below_cost', 'below_no', 'same', 'nondescript', 'kankrej', 'dry'];

    for (const key of optimalDemoKeys) {
      const demo = DEMO_CASES.find((c) => c.key === key)!;
      const checked = validateAnimal(demo.preset.animal, todayCostInr(demo.preset.feeds));
      const inputs = demo.preset.feeds.map((d) => validateFeed(d).input!);
      const ctx = buildSampleContext({ ...checked.profile!, isConfirmed: true }, inputs);

      const auth = collectAuthorizedNumbers(ctx);
      const template = buildTemplateExplanation(ctx);
      const enText = template.map((line) => line.en).join(' ');
      const hiText = template.map((line) => line.hi).join(' ');

      const enRes = verifyExplanationNumbers(enText, auth);
      expect(enRes.status, `${key} EN status`).toBe('verified');
      expect(enRes.flaggedNumbers, `${key} EN flagged`).toEqual([]);
      expect(enRes.hasDevanagari, `${key} EN hasDevanagari`).toBe(false);
      expect(enRes.verifiedCount, `${key} EN verifiedCount`).toBe(countNumericTokens(enText));
      expect(enRes.verifiedCount, `${key} EN > 0`).toBeGreaterThan(0);

      // Hindi template half uses Devanagari prose + Latin digits; all numeric tokens must verify with 0 untraced numbers
      expect(/[\u0966-\u096F]/.test(hiText), `${key} HI no Devanagari digits`).toBe(false);
      const hiRes = verifyExplanationNumbers(hiText, auth, { allowDevanagari: true });
      expect(hiRes.status, `${key} HI status`).toBe('verified');
      expect(hiRes.flaggedNumbers, `${key} HI flagged`).toEqual([]);
      expect(hiRes.verifiedCount, `${key} HI verifiedCount matches EN`).toBe(enRes.verifiedCount);
    }
  });

  it('handles invalid numeric inputs (NaN, Infinity), empty authorized sets, comma-formatted tokens, and combined Devanagari with untraced numbers', () => {
    // Non-finite candidate or authorized values are rejected safely
    expect(isAuthorizedNumber(Number.NaN, [100])).toBe(false);
    expect(isAuthorizedNumber(Number.POSITIVE_INFINITY, [100])).toBe(false);
    expect(isAuthorizedNumber(Number.NEGATIVE_INFINITY, [100])).toBe(false);
    expect(isAuthorizedNumber(100, [Number.NaN, Number.POSITIVE_INFINITY])).toBe(false);
    expect(isAuthorizedNumber(100, [])).toBe(false);

    // Empty authorized set flags any number in text
    const emptyAuthRes = verifyExplanationNumbers('The cow needs 12.5 kg dry matter.', [Number.NaN]);
    expect(emptyAuthRes.status).toBe('unverified');
    expect(emptyAuthRes.reason).toBe('untraced_numbers');
    expect(emptyAuthRes.flaggedNumbers).toEqual(['12.5']);
    expect(emptyAuthRes.verifiedCount).toBe(0);

    // Comma-separated thousands token matches raw authorized number
    const commaRes = verifyExplanationNumbers('Daily CP requirement is 1,245 g/day.', [1245]);
    expect(commaRes.status).toBe('verified');
    expect(commaRes.verifiedCount).toBe(1);
    expect(commaRes.flaggedNumbers).toEqual([]);

    // Both Devanagari and untraced numbers: language gate fails first with reason 'devanagari' while still reporting flaggedNumbers
    const bothRes = verifyExplanationNumbers('गाय को 999 kg चारा दें।', [450]);
    expect(bothRes.status).toBe('unverified');
    expect(bothRes.languageGatePassed).toBe(false);
    expect(bothRes.reason).toBe('devanagari');
    expect(bothRes.flaggedNumbers).toEqual(['999']);
  });
});

