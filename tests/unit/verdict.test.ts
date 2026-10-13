import { describe, expect, it } from 'vitest';
import {
  buildFatComparison,
  roundSupportedMilkDown,
  selectVerdict,
  verdictId,
  verdictText,
} from '../../src/domain/verdict';
import type { Verdict } from '../../src/domain/types';

describe('pure verdict selector and fat comparison (AC-5.6 to AC-5.13, OQ14, OQ15, AC-E7.1)', () => {
  it('rounds supported milk Y* down to 0.1 L with 1e-7 float-noise cushion', () => {
    expect(roundSupportedMilkDown(0)).toBe(0);
    expect(roundSupportedMilkDown(6.09999999)).toBe(6.1);
    expect(roundSupportedMilkDown(3.86)).toBe(3.8);
    expect(roundSupportedMilkDown(9.64)).toBe(9.6);
  });

  it('returns dry_animal when todayMilkLPerDay is 0 (AC-5.13)', () => {
    const v = selectVerdict({
      todayMilkLPerDay: 0,
      breedCapLPerDay: 8.6,
      yStar: 0,
      referenceCostInrPerDay: 100,
      costAtTodayMilkInrPerDay: 65,
    });
    expect(v).toEqual({ kind: 'dry_animal' });
  });

  it('uses unrounded Y* (not S) for below_today comparison so Y* = T = 9.64 with S = 9.6 is never a shortfall', () => {
    // At breed cap 9.64 and T = 9.64: Y* = 9.64, S = 9.6 -> at_breed_level, not below_today
    const atCap = selectVerdict({
      todayMilkLPerDay: 9.64,
      breedCapLPerDay: 9.64,
      yStar: 9.64,
      supportedMilkLPerDay: 9.6,
      referenceCostInrPerDay: 160,
      costAtTodayMilkInrPerDay: 140,
    });
    expect(atCap).toEqual({ kind: 'at_breed_level', savingInrPerDay: 20 });

    // Below breed cap (cap = 12.0), T = 9.64, Y* = 9.64, S = 9.6 -> same_as_today (OQ14), not below_today
    const belowCap = selectVerdict({
      todayMilkLPerDay: 9.64,
      breedCapLPerDay: 12.0,
      yStar: 9.64,
      supportedMilkLPerDay: 9.6,
      referenceCostInrPerDay: 140,
      costAtTodayMilkInrPerDay: 140,
    });
    expect(belowCap).toEqual({ kind: 'same_as_today' });
  });

  it('returns below_today when Y* < T - 1e-6, with keepCostInrPerDay B or limiting nutrients when Stage 2prime is infeasible (AC-5.11)', () => {
    const feasibleAtT = selectVerdict({
      todayMilkLPerDay: 8,
      breedCapLPerDay: 8.6,
      yStar: 6.4,
      referenceCostInrPerDay: 95,
      costAtTodayMilkInrPerDay: 118.5,
    });
    expect(feasibleAtT).toEqual({
      kind: 'below_today',
      todayMilkLPerDay: 8,
      keepCostInrPerDay: 118.5,
      costToKeepTodayInrPerDay: 118.5,
      limitingNutrients: [],
      limitingAtToday: [],
    });

    const infeasibleAtT = selectVerdict({
      todayMilkLPerDay: 8,
      breedCapLPerDay: 8.6,
      yStar: 5.2,
      referenceCostInrPerDay: 95,
      costAtTodayMilkInrPerDay: null,
      limitingAtToday: ['CP', 'roughage'],
    });
    expect(infeasibleAtT).toEqual({
      kind: 'below_today',
      todayMilkLPerDay: 8,
      keepCostInrPerDay: null,
      costToKeepTodayInrPerDay: null,
      limitingNutrients: ['CP', 'roughage'],
      limitingAtToday: ['CP', 'roughage'],
    });
  });

  it('returns above_breed_level when T > breedCap and Y* >= T - 1e-6, with saving Z only when Stage 2prime is feasible and Z > 0 (AC-5.7, OQ15)', () => {
    const withSaving = selectVerdict({
      todayMilkLPerDay: 11,
      breedCapLPerDay: 8.6,
      yStar: 11,
      referenceCostInrPerDay: 220,
      costAtTodayMilkInrPerDay: 185,
    });
    expect(withSaving).toEqual({ kind: 'above_breed_level', savingInrPerDay: 35 });

    const noSaving = selectVerdict({
      todayMilkLPerDay: 11,
      breedCapLPerDay: 8.6,
      yStar: 11,
      referenceCostInrPerDay: 185,
      costAtTodayMilkInrPerDay: 185,
    });
    expect(noSaving).toEqual({ kind: 'above_breed_level', savingInrPerDay: null });

    const infeasibleStage2Prime = selectVerdict({
      todayMilkLPerDay: 11,
      breedCapLPerDay: 8.6,
      yStar: 11,
      referenceCostInrPerDay: 250,
      costAtTodayMilkInrPerDay: null,
    });
    expect(infeasibleStage2Prime).toEqual({ kind: 'above_breed_level', savingInrPerDay: null });
  });

  it('returns at_breed_level when T equals breedCap within 1e-6 and Y* >= T - 1e-6 (AC-5.7)', () => {
    const withSaving = selectVerdict({
      todayMilkLPerDay: 8.6,
      breedCapLPerDay: 8.6,
      yStar: 8.6,
      referenceCostInrPerDay: 200,
      costAtTodayMilkInrPerDay: 152,
    });
    expect(withSaving).toEqual({ kind: 'at_breed_level', savingInrPerDay: 48 });

    const noSaving = selectVerdict({
      todayMilkLPerDay: 8.6,
      breedCapLPerDay: 8.6,
      yStar: 8.6,
      referenceCostInrPerDay: 150,
      costAtTodayMilkInrPerDay: 152,
    });
    expect(noSaving).toEqual({ kind: 'at_breed_level', savingInrPerDay: null });
  });

  it('returns gain when S - T >= 0.1 L/day and same_as_today when S - T < 0.1 L/day below breedCap (AC-5.6, OQ14)', () => {
    const gainVerdict = selectVerdict({
      todayMilkLPerDay: 6.0,
      breedCapLPerDay: 8.6,
      yStar: 7.48,
      referenceCostInrPerDay: 140,
      costAtTodayMilkInrPerDay: 110,
    });
    expect(gainVerdict).toEqual({ kind: 'gain', gainLPerDay: 1.4 });

    const sameVerdict = selectVerdict({
      todayMilkLPerDay: 6.05,
      breedCapLPerDay: 8.6,
      yStar: 6.12, // S = 6.1, S - T = 0.05 < 0.1
      referenceCostInrPerDay: 115,
      costAtTodayMilkInrPerDay: 114,
    });
    expect(sameVerdict).toEqual({ kind: 'same_as_today' });
  });

  it('builds fatComparison for milking animals and returns null for dry animals (AC-5.9, AC-5.10)', () => {
    expect(buildFatComparison(0, 6.5, { fatPct: 7, fatPctLow: 7, fatPctHigh: 8 })).toBeNull();
    expect(buildFatComparison(8, 6.5, { fatPct: 7, fatPctLow: 7, fatPctHigh: 8 })).toEqual({
      todayFatPct: 6.5,
      breedFatPct: 7,
      breedFatPctLow: 7,
      breedFatPctHigh: 8,
    });
    expect(buildFatComparison(6, 4.2, { fatPct: null, fatPctLow: null, fatPctHigh: null })).toEqual({
      todayFatPct: 4.2,
      breedFatPct: null,
      breedFatPctLow: null,
      breedFatPctHigh: null,
    });
  });

  it('formats all 7 verdict kinds into bilingual text without placeholders remaining', () => {
    const cases: Verdict[] = [
      { kind: 'gain', gainLPerDay: 1.2 },
      { kind: 'at_breed_level', savingInrPerDay: 25 },
      { kind: 'above_breed_level', savingInrPerDay: 18 },
      { kind: 'below_today', todayMilkLPerDay: 8, keepCostInrPerDay: 130, limitingNutrients: [] },
      { kind: 'same_as_today' },
      { kind: 'dry_animal' },
      { kind: 'budget_below_maintenance', maintenanceCostInrPerDay: 72, budgetInrPerDay: 50 },
    ];

    for (const c of cases) {
      expect(verdictId(c).length).toBeGreaterThan(0);
      const bi = verdictText(c, 8, 7.2);
      expect(bi.en.length).toBeGreaterThan(0);
      expect(bi.hi.length).toBeGreaterThan(0);
      expect(bi.en).not.toMatch(/\{[a-z0-9]+\}/i);
      expect(bi.hi).not.toMatch(/\{[a-z0-9]+\}/i);
    }
  });

  it('handles exact boundary values (S - T = 0.1, Y* at T - 1e-6, Z < 0) and invalid inputs to roundSupportedMilkDown', () => {
    expect(roundSupportedMilkDown(-3.5)).toBe(0);
    expect(roundSupportedMilkDown(Number.NaN)).toBe(0);
    expect(roundSupportedMilkDown(Number.POSITIVE_INFINITY)).toBe(0);

    // Exact S - T = 0.1 -> gain of 0.1 L/day
    const exactPointOne = selectVerdict({
      todayMilkLPerDay: 5.0,
      breedCapLPerDay: 9.64,
      yStar: 5.1,
      referenceCostInrPerDay: 140,
      costAtTodayMilkInrPerDay: 120,
    });
    expect(exactPointOne).toEqual({ kind: 'gain', gainLPerDay: 0.1 });

    // Y* right at T - 1e-6 -> keeps today's milk (same_as_today when S - T < 0.1)
    const atTolerance = selectVerdict({
      todayMilkLPerDay: 5.0,
      breedCapLPerDay: 9.64,
      yStar: 5.0 - 5e-7,
      referenceCostInrPerDay: 120,
      costAtTodayMilkInrPerDay: 120,
    });
    expect(atTolerance).toEqual({ kind: 'same_as_today' });

    // Z < 0 when referenceCost < costAtTodayMilk -> savingInrPerDay is null
    const negativeZ = selectVerdict({
      todayMilkLPerDay: 11.0,
      breedCapLPerDay: 9.64,
      yStar: 11.0,
      referenceCostInrPerDay: 150,
      costAtTodayMilkInrPerDay: 180,
    });
    expect(negativeZ).toEqual({ kind: 'above_breed_level', savingInrPerDay: null });
  });
});

