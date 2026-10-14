// Nutrient requirements engine (docs/ARCHITECTURE.md sections 5 & 6):
// Linear nutrient requirements (ICAR 2013 / CELKAU / NASEM 2021),
// NRC 2001 Ch. 1 Eq. 1-1 DMI ceiling at WOL = 20, and roughage minimum share of DM.
import requirementsV1 from '../data/requirements.v1.json';
import { formatNumber } from '../i18n/format';
import type {
  AnimalProfile,
  AuditCitation,
  NutrientKey,
  NutrientVector,
  RequirementModel,
  RequirementResult,
} from './types';

function resolveFatPct(animal: AnimalProfile): number {
  const raw = animal.milkFatPct;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return animal.species === 'buffalo' ? 6 : 4;
}

export function computeCitationsAtMilk(
  model: RequirementModel,
  bodyWeightKg: number,
  milkYieldLPerDay: number,
): Record<NutrientKey, AuditCitation> {
  const { maintenance, lactation, nutrientCitations } = requirementsV1;
  const y = Math.max(0, Number.isFinite(milkYieldLPerDay) ? milkYieldLPerDay : 0);
  const bw = Math.max(0, Number.isFinite(bodyWeightKg) ? bodyWeightKg : 0);
  const f = model.fatPctUsed;
  const fAbove = Math.max(0, f - lactation.caFatBaselinePct);

  const dmMaint = model.dmMax.maintenance;
  const dmLact = model.dmMax.perLitre * y;
  const dmTotal = dmMaint + dmLact;

  const cpMaint = model.CP.maintenance;
  const cpLact = model.CP.perLitre * y;
  const cpTotal = cpMaint + cpLact;

  const meMaint = model.ME.maintenance;
  const meLact = model.ME.perLitre * y;
  const meTotal = meMaint + meLact;

  const caMaint = model.Ca.maintenance;
  const caLact = model.Ca.perLitre * y;
  const caTotal = caMaint + caLact;

  const pMaint = model.P.maintenance;
  const pLact = model.P.perLitre * y;
  const pTotal = pMaint + pLact;

  return {
    DM: {
      sourceDoc: nutrientCitations.DM.doc,
      sourceTable: nutrientCitations.DM.table,
      sourcePage: nutrientCitations.DM.page,
      formulaDisplay: `k0 + kY * ${formatNumber(y, 1)} L = ${formatNumber(dmMaint, 2)} + ${formatNumber(model.dmMax.perLitre, 3)} * ${formatNumber(y, 1)} = ${formatNumber(dmTotal, 2)} kg/d (WOL=${model.dmi.weekOfLactation}, lambda=${formatNumber(model.dmi.lagFactor, 3)}, W^0.75=${formatNumber(model.dmi.bw075, 2)}, FCM/L=${formatNumber(model.dmi.fcmPerLitre, 3)})`,
      maintenancePart: dmMaint,
      lactationPart: dmLact,
      provenanceStatus: 'cited',
      sourceKey: 'REQ-DMI-NRC2001-EQ1-1',
    },
    CP: {
      sourceDoc: nutrientCitations.CP.doc,
      sourceTable: nutrientCitations.CP.table,
      sourcePage: nutrientCitations.CP.page,
      formulaDisplay: `${maintenance.cpPerKgBw075} * ${formatNumber(bw, 0)}^0.75 + (${lactation.cpBaseGramsPerL} + ${lactation.cpPerFatPctGramsPerL} * ${formatNumber(f, 1)}) * ${formatNumber(y, 1)} = ${formatNumber(cpMaint, 0)} + ${formatNumber(cpLact, 0)} = ${formatNumber(cpTotal, 0)} g/d`,
      maintenancePart: cpMaint,
      lactationPart: cpLact,
      provenanceStatus: 'cited',
      sourceKey: 'REQ-CP-ICAR2013',
    },
    ME: {
      sourceDoc: nutrientCitations.ME.doc,
      sourceTable: nutrientCitations.ME.table,
      sourcePage: nutrientCitations.ME.page,
      formulaDisplay: `${maintenance.meMcalPerKgBw075} * ${formatNumber(bw, 0)}^0.75 + (${lactation.meBaseMcalPerL} + ${lactation.mePerFatPctMcalPerL} * ${formatNumber(f, 1)}) * ${formatNumber(y, 1)} = ${formatNumber(meMaint, 2)} + ${formatNumber(meLact, 2)} = ${formatNumber(meTotal, 2)} Mcal/d`,
      maintenancePart: meMaint,
      lactationPart: meLact,
      provenanceStatus: 'cited',
      sourceKey: 'REQ-ME-ICAR2013',
    },
    Ca: {
      sourceDoc: nutrientCitations.Ca.doc,
      sourceTable: nutrientCitations.Ca.table,
      sourcePage: nutrientCitations.Ca.page,
      formulaDisplay: `${maintenance.caGramsPerKgBw} * ${formatNumber(bw, 0)} + (${lactation.caBaseGramsPerL} + ${lactation.caPerFatPctAbove35GramsPerL} * ${formatNumber(fAbove, 1)}) * ${formatNumber(y, 1)} = ${formatNumber(caMaint, 1)} + ${formatNumber(caLact, 1)} = ${formatNumber(caTotal, 1)} g/d`,
      maintenancePart: caMaint,
      lactationPart: caLact,
      provenanceStatus: 'cited',
      sourceKey: 'REQ-CA-ICAR2013',
    },
    P: {
      sourceDoc: nutrientCitations.P.doc,
      sourceTable: nutrientCitations.P.table,
      sourcePage: nutrientCitations.P.page,
      formulaDisplay: `${maintenance.pGramsPerKgBw} * ${formatNumber(bw, 0)} + ${lactation.pGramsPerL} * ${formatNumber(y, 1)} = ${formatNumber(pMaint, 1)} + ${formatNumber(pLact, 1)} = ${formatNumber(pTotal, 1)} g/d`,
      maintenancePart: pMaint,
      lactationPart: pLact,
      provenanceStatus: 'cited',
      sourceKey: 'REQ-P-ICAR2013',
    },
  };
}

/** Build the linear requirement coefficients (m_n, l_n, k_0, k_Y, r) for an animal. */
export function buildRequirementModel(animal: AnimalProfile): RequirementModel {
  const { dmi, maintenance, lactation, roughageMinShareOfDm } = requirementsV1;
  const bw = Math.max(0, Number.isFinite(animal.bodyWeightKg) ? animal.bodyWeightKg : 0);
  const y = Math.max(0, Number.isFinite(animal.milkYieldLitersPerDay) ? animal.milkYieldLitersPerDay : 0);
  const f = resolveFatPct(animal);

  const bw075 = Math.pow(bw, 0.75);
  const wol = dmi.defaultWeekOfLactation as 20;
  const lagFactor = 1 - Math.exp(-dmi.lagRate * (wol + dmi.lagOffset));
  const fcmPerLitre = dmi.fcmMilkCoeff + dmi.fcmFatCoeff * (f / 100);
  const k0 = dmi.bw075Coeff * lagFactor * bw075;
  const kY = dmi.fcmCoeff * lagFactor * fcmPerLitre;
  const fAbove = Math.max(0, f - lactation.caFatBaselinePct);

  const roughageCit: AuditCitation = {
    sourceDoc: roughageMinShareOfDm.citation.doc,
    sourceTable: roughageMinShareOfDm.citation.table,
    sourcePage: roughageMinShareOfDm.citation.page,
    formulaDisplay: roughageMinShareOfDm.note,
    maintenancePart: roughageMinShareOfDm.value,
    lactationPart: 0,
    provenanceStatus: 'cited',
    sourceKey: 'REQ-ROUGHAGE-MIN',
  };

  const baseModel: RequirementModel = {
    CP: {
      maintenance: maintenance.cpPerKgBw075 * bw075,
      perLitre: lactation.cpBaseGramsPerL + lactation.cpPerFatPctGramsPerL * f,
    },
    ME: {
      maintenance: maintenance.meMcalPerKgBw075 * bw075,
      perLitre: lactation.meBaseMcalPerL + lactation.mePerFatPctMcalPerL * f,
    },
    Ca: {
      maintenance: maintenance.caGramsPerKgBw * bw,
      perLitre: lactation.caBaseGramsPerL + lactation.caPerFatPctAbove35GramsPerL * fAbove,
    },
    P: {
      maintenance: maintenance.pGramsPerKgBw * bw,
      perLitre: lactation.pGramsPerL,
    },
    dmMax: {
      maintenance: k0,
      perLitre: kY,
    },
    dmi: {
      weekOfLactation: wol,
      lagFactor,
      bw075,
      fcmPerLitre,
    },
    roughage: {
      minShareOfDm: roughageMinShareOfDm.value,
      citation: roughageCit,
    },
    mineralSupplement: requirementsV1.mineralSupplement,
    calciumMax: requirementsV1.calciumMaxRatioOfRequirement,
    fatPctUsed: f,
    citations: {} as Record<NutrientKey, AuditCitation>,
  };

  return {
    ...baseModel,
    citations: computeCitationsAtMilk(baseModel, bw, y),
  };
}

export const buildLinearRequirementModel = buildRequirementModel;

/** Evaluate total daily requirements at a given milk yield Y >= 0 (L/day). */
export function evaluateRequirementsAtMilk(
  model: RequirementModel,
  milkYieldLPerDay: number,
): NutrientVector {
  const y = Math.max(0, Number.isFinite(milkYieldLPerDay) ? milkYieldLPerDay : 0);
  return {
    dmKgPerDay: model.dmMax.maintenance + model.dmMax.perLitre * y,
    cpGramsPerDay: model.CP.maintenance + model.CP.perLitre * y,
    meMcalPerDay: model.ME.maintenance + model.ME.perLitre * y,
    caGramsPerDay: model.Ca.maintenance + model.Ca.perLitre * y,
    pGramsPerDay: model.P.maintenance + model.P.perLitre * y,
  };
}

/** Compute requirements at the animal's current milk yield T, with citations (AC-2.1). */
export function computeRequirements(animal: AnimalProfile): RequirementResult {
  const model = buildRequirementModel(animal);
  const atMilkLPerDay = Math.max(
    0,
    Number.isFinite(animal.milkYieldLitersPerDay) ? animal.milkYieldLitersPerDay : 0,
  );
  const requirements = evaluateRequirementsAtMilk(model, atMilkLPerDay);
  return {
    model,
    atMilkLPerDay,
    requirements,
    citations: model.citations,
  };
}
