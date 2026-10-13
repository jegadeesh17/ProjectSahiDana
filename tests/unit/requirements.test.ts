import { describe, expect, it } from 'vitest';
import {
  buildLinearRequirementModel,
  buildRequirementModel,
  computeRequirements,
  evaluateRequirementsAtMilk,
} from '../../src/domain/requirements';
import { NUTRIENT_KEYS, type AnimalProfile } from '../../src/domain/types';

const murrahBuffalo: AnimalProfile = {
  species: 'buffalo',
  breedId: 'murrah',
  bodyWeightKg: 450,
  milkYieldLitersPerDay: 8,
  milkFatPct: 6.5,
  budgetInrPerDay: 140,
  isConfirmed: true,
};

describe('linear nutrient requirements engine and NRC 2001 DMI ceiling (AC-2.1)', () => {
  it('computes exact NRC 2001 Eq. 1-1 DMI ceiling at WOL=20 and ICAR 2013 requirements for a 450 kg buffalo at 8 L, 6.5% fat', () => {
    const model = buildRequirementModel(murrahBuffalo);
    const bw075 = Math.pow(450, 0.75);
    const expectedLambda = 1 - Math.exp(-0.192 * (20 + 3.67));
    const expectedFcmPerL = 0.4 + 0.15 * 6.5;
    const expectedK0 = 0.0968 * expectedLambda * bw075;
    const expectedKY = 0.372 * expectedLambda * expectedFcmPerL;

    expect(model.dmi.weekOfLactation).toBe(20);
    expect(model.dmi.lagFactor).toBeCloseTo(expectedLambda, 10);
    expect(model.dmi.bw075).toBeCloseTo(bw075, 10);
    expect(model.dmi.fcmPerLitre).toBeCloseTo(expectedFcmPerL, 10);
    expect(model.dmMax.maintenance).toBeCloseTo(expectedK0, 10);
    expect(model.dmMax.perLitre).toBeCloseTo(expectedKY, 10);
    // Worked check in ARCHITECTURE.md section 5: k0 ~ 9.36 kg, kY ~ 0.506 kg/L, DM_max(8) ~ 13.4 kg
    expect(model.dmMax.maintenance).toBeCloseTo(9.357, 2);
    expect(model.dmMax.perLitre).toBeCloseTo(0.506, 3);

    const res = computeRequirements(murrahBuffalo);
    expect(res.atMilkLPerDay).toBe(8);
    expect(res.requirements.dmKgPerDay).toBeCloseTo(expectedK0 + 8 * expectedKY, 8);
    expect(res.requirements.dmKgPerDay).toBeCloseTo(13.4055, 3);

    expect(res.requirements.cpGramsPerDay).toBeCloseTo(3.8 * bw075 + (55 + 9 * 6.5) * 8, 8);
    expect(res.requirements.meMcalPerDay).toBeCloseTo(0.133 * bw075 + (0.4 + 0.15 * 6.5) * 8, 8);
    expect(res.requirements.caGramsPerDay).toBeCloseTo(0.04 * 450 + (1.22 + 0.35 * (6.5 - 3.5)) * 8, 8);
    expect(res.requirements.pGramsPerDay).toBeCloseTo(0.028 * 450 + 0.9 * 8, 8);
  });

  it('evaluates requirements strictly linearly in milk yield Y across all nutrients', () => {
    const model = buildLinearRequirementModel(murrahBuffalo);
    const at0 = evaluateRequirementsAtMilk(model, 0);
    const at5 = evaluateRequirementsAtMilk(model, 5);
    const at10 = evaluateRequirementsAtMilk(model, 10);

    expect(at0.dmKgPerDay).toBeCloseTo(model.dmMax.maintenance, 10);
    expect(at0.cpGramsPerDay).toBeCloseTo(model.CP.maintenance, 10);
    expect(at0.meMcalPerDay).toBeCloseTo(model.ME.maintenance, 10);
    expect(at0.caGramsPerDay).toBeCloseTo(model.Ca.maintenance, 10);
    expect(at0.pGramsPerDay).toBeCloseTo(model.P.maintenance, 10);

    // Midpoint linearity: req(5) = 0.5 * (req(0) + req(10))
    expect(at5.dmKgPerDay).toBeCloseTo(0.5 * (at0.dmKgPerDay + at10.dmKgPerDay), 10);
    expect(at5.cpGramsPerDay).toBeCloseTo(0.5 * (at0.cpGramsPerDay + at10.cpGramsPerDay), 10);
    expect(at5.meMcalPerDay).toBeCloseTo(0.5 * (at0.meMcalPerDay + at10.meMcalPerDay), 10);
    expect(at5.caGramsPerDay).toBeCloseTo(0.5 * (at0.caGramsPerDay + at10.caGramsPerDay), 10);
    expect(at5.pGramsPerDay).toBeCloseTo(0.5 * (at0.pGramsPerDay + at10.pGramsPerDay), 10);
  });

  it('clamps Ca fat adjustment at 3.5% baseline and handles dry animals with missing fat (OQ1)', () => {
    const lowFatCow: AnimalProfile = {
      species: 'cow',
      breedId: 'gir',
      bodyWeightKg: 385,
      milkYieldLitersPerDay: 6,
      milkFatPct: 3.0,
      budgetInrPerDay: 120,
      isConfirmed: true,
    };
    const cowModel = buildRequirementModel(lowFatCow);
    expect(cowModel.Ca.perLitre).toBeCloseTo(1.22, 10);

    const dryCowNoFat: AnimalProfile = {
      ...lowFatCow,
      milkYieldLitersPerDay: 0,
      milkFatPct: Number.NaN,
    };
    const dryRes = computeRequirements(dryCowNoFat);
    expect(dryRes.model?.fatPctUsed).toBe(4);
    expect(dryRes.requirements.cpGramsPerDay).toBeCloseTo(3.8 * Math.pow(385, 0.75), 8);
    expect(dryRes.citations.CP.lactationPart).toBe(0);
    expect(dryRes.citations.DM.lactationPart).toBe(0);
  });

  it('includes cited roughage minimum share r = 0.40 and complete citations for all 5 NUTRIENT_KEYS', () => {
    const res = computeRequirements(murrahBuffalo);
    expect(res.model?.roughage.minShareOfDm).toBeCloseTo(0.4, 8);
    expect(res.model?.roughage.citation.sourceDoc).toContain('ICAR');

    for (const k of NUTRIENT_KEYS) {
      const cit = res.citations[k];
      expect(cit.sourceDoc.length).toBeGreaterThan(0);
      expect(cit.sourceTable.length).toBeGreaterThan(0);
      expect(cit.sourcePage.length).toBeGreaterThan(0);
      expect(cit.formulaDisplay.length).toBeGreaterThan(0);
      expect(cit.maintenancePart).toBeGreaterThan(0);
      expect(cit.lactationPart).toBeGreaterThan(0);
    }
  });

  it('matches direct NRC 2001 Eq. 1-1 formula across multiple weights, fats, and milk levels', () => {
    const cases = [
      { species: 'cow' as const, breedId: 'sahiwal', bw: 300, milk: 4, fat: 4.2 },
      { species: 'cow' as const, breedId: 'hf_crossbred', bw: 550, milk: 15, fat: 3.5 },
      { species: 'buffalo' as const, breedId: 'murrah', bw: 600, milk: 12, fat: 7.5 },
    ];
    const lambda = 1 - Math.exp(-0.192 * (20 + 3.67));

    for (const c of cases) {
      const res = computeRequirements({
        species: c.species,
        breedId: c.breedId,
        bodyWeightKg: c.bw,
        milkYieldLitersPerDay: c.milk,
        milkFatPct: c.fat,
        budgetInrPerDay: 200,
        isConfirmed: true,
      });
      const fcm = (0.4 + 0.15 * c.fat) * c.milk;
      const nrcDmi = (0.372 * fcm + 0.0968 * Math.pow(c.bw, 0.75)) * lambda;
      expect(res.requirements.dmKgPerDay).toBeCloseTo(nrcDmi, 10);
    }
  });

  it('clamps invalid or negative bodyWeightKg, milkYieldLitersPerDay, and milkFatPct safely without NaN', () => {
    const invalidAnimal: AnimalProfile = {
      species: 'buffalo',
      breedId: 'murrah',
      bodyWeightKg: -200,
      milkYieldLitersPerDay: -5,
      milkFatPct: -3,
      budgetInrPerDay: 100,
      isConfirmed: true,
    };
    const res = computeRequirements(invalidAnimal);
    expect(res.atMilkLPerDay).toBe(0);
    expect(res.model?.fatPctUsed).toBe(6); // default buffalo fat when invalid <= 0
    expect(res.requirements.dmKgPerDay).toBe(0);
    expect(res.requirements.cpGramsPerDay).toBe(0);
    expect(evaluateRequirementsAtMilk(res.model!, -10).dmKgPerDay).toBe(0);
  });
});

