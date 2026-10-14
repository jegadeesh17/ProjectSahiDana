// Builders for AuditMeta: every figure on screen gets a record that opens the fine-print sheet.
import requirementsV1 from '../data/requirements.v1.json';
import { formatInr, formatInrPerKg, formatKg, formatNumber, formatPct } from '../i18n/format';
import type { BiText } from '../i18n/strings';
import { t } from '../i18n/strings';
import { RELIABILITY_STRING } from './feedGroups';
import { feedNameBi, LIMIT_STRING_ID } from './feedNames';
import { formatLimit, formatNutrient, perKgFed, PER_KG_FIELD, REQ_FIELD } from './nutrition';
import type {
  AuditMeta,
  FeedItem,
  InfeasibilityReport,
  LimitingKey,
  NutrientKey,
  RationSolution,
  RequirementResult,
} from './types';

const nutrientName = (n: LimitingKey): BiText => t(LIMIT_STRING_ID[n]);

export function auditUserInput(id: string, label: BiText, formattedValue: string, numericValue: number): AuditMeta {
  return {
    id,
    label,
    formattedValue,
    numericValue,
    originType: 'user_input',
    citation: null,
    solverConstraint: null,
  };
}

export function auditRequirement(n: NutrientKey, req: RequirementResult): AuditMeta {
  const c = req.citations[n];
  const value = req.requirements[REQ_FIELD[n]];
  return {
    id: `req-${n}`,
    label: t('audit_label_requirement', { nutrient: nutrientName(n) }),
    formattedValue: formatNutrient(n, value),
    numericValue: value,
    originType: 'cited_source',
    citation: {
      doc: c.sourceDoc,
      table: c.sourceTable,
      page: c.sourcePage,
      formula: c.formulaDisplay,
      provenanceStatus: c.provenanceStatus,
      verifiedOn: c.verifiedOn,
    },
    solverConstraint: null,
    sourceKey: c.sourceKey,
  };
}

function contributionBreakdown(n: NutrientKey, solution: RationSolution, feeds: FeedItem[]): string {
  const key = PER_KG_FIELD[n];
  const parts = solution.feeds.map((l) => {
    const feed = feeds.find((f) => f.id === l.feedId)!;
    const per = perKgFed(feed)[key];
    return `${formatNumber(l.kgAsFed, 3)} kg × ${formatNumber(per, 2)} = ${formatNumber(l.kgAsFed * per, 2)}`;
  });
  return `${parts.join('  +  ')}  =  ${formatNutrient(n, solution.supplied[REQ_FIELD[n]])}`;
}

export function auditSupplied(n: NutrientKey, solution: RationSolution, feeds: FeedItem[], req: RequirementResult): AuditMeta {
  const value = solution.supplied[REQ_FIELD[n]];
  const isDm = n === 'DM';
  return {
    id: `sup-${n}`,
    label: t('audit_label_supplied', { nutrient: nutrientName(n) }),
    formattedValue: formatNutrient(n, value),
    numericValue: value,
    originType: 'solver_output',
    citation: null,
    solverConstraint: {
      role: t(isDm ? 'audit_role_dm' : 'audit_role_min'),
      activeConstraint: t(isDm ? 'audit_constraint_dm' : 'audit_constraint_min', { nutrient: nutrientName(n) }),
      breakdown: `${contributionBreakdown(n, solution, feeds)}  |  ${formatNutrient(n, req.requirements[REQ_FIELD[n]])}`,
    },
    binding: solution.bindingConstraints.includes(n),
    sourceKey: solution.sourceKey,
  };
}

export function auditCoverage(n: NutrientKey, solution: RationSolution, req: RequirementResult): AuditMeta {
  const value = solution.coveragePct[n];
  const supplied = solution.supplied[REQ_FIELD[n]];
  const required = req.requirements[REQ_FIELD[n]];
  return {
    id: `cov-${n}`,
    label: t('audit_label_coverage', { nutrient: nutrientName(n) }),
    formattedValue: formatPct(value, 0),
    numericValue: value,
    originType: 'solver_output',
    citation: null,
    solverConstraint: {
      role: t(n === 'DM' ? 'audit_role_dm' : 'audit_role_min'),
      activeConstraint: t(n === 'DM' ? 'audit_constraint_dm' : 'audit_constraint_min', { nutrient: nutrientName(n) }),
      breakdown: `${formatNutrient(n, supplied)} ÷ ${formatNutrient(n, required)} = ${formatPct(value, 1)}`,
    },
    binding: solution.bindingConstraints.includes(n),
    sourceKey: solution.sourceKey,
  };
}

export function auditFeedKg(feed: FeedItem, kg: number, atCap: boolean, solution: RationSolution): AuditMeta {
  return {
    id: `kg-${feed.id}`,
    label: t('audit_label_feed_kg', { feed: feedNameBi(feed) }),
    formattedValue: formatKg(kg),
    numericValue: kg,
    originType: 'solver_output',
    citation: null,
    solverConstraint: {
      role: t('audit_role_decision'),
      activeConstraint: atCap ? t('audit_constraint_cap') : t('audit_constraint_cost'),
      breakdown: `${formatKg(kg, 3)} × ${formatNumber(feed.dmPct / 100, 2)} DM = ${formatNumber(kg * (feed.dmPct / 100), 3)} kg DM`,
    },
    binding: atCap,
    sourceKey: solution.sourceKey,
  };
}

export function auditFeedCost(feed: FeedItem, kg: number, price: number, cost: number, solution: RationSolution): AuditMeta {
  return {
    id: `cost-${feed.id}`,
    label: t('audit_label_feed_cost', { feed: feedNameBi(feed) }),
    formattedValue: formatInr(cost),
    numericValue: cost,
    originType: 'solver_output',
    citation: null,
    solverConstraint: {
      role: t('audit_role_objective'),
      activeConstraint: t('audit_constraint_none'),
      breakdown: `${formatKg(kg, 3)} × ${formatInrPerKg(price)} = ${formatInr(cost)}`,
    },
    sourceKey: solution.sourceKey,
  };
}

export function auditTotalKg(solution: RationSolution): AuditMeta {
  return {
    id: 'total-kg',
    label: t('audit_label_total_kg'),
    formattedValue: formatKg(solution.totalKgAsFed),
    numericValue: solution.totalKgAsFed,
    originType: 'solver_output',
    citation: null,
    solverConstraint: {
      role: t('audit_role_derived'),
      activeConstraint: t('audit_constraint_dm'),
      breakdown: solution.feeds.map((l) => formatNumber(l.kgAsFed, 3)).join(' + ') + ` = ${formatKg(solution.totalKgAsFed, 3)}`,
    },
    sourceKey: solution.sourceKey,
  };
}

export function auditTotalCost(solution: RationSolution): AuditMeta {
  return {
    id: 'total-cost',
    label: t('audit_label_total_cost'),
    formattedValue: formatInr(solution.totalCostInr),
    numericValue: solution.totalCostInr,
    originType: 'solver_output',
    citation: null,
    solverConstraint: {
      role: t('audit_role_objective'),
      activeConstraint: t('audit_constraint_cost'),
      breakdown: solution.feeds.map((l) => formatInr(l.costInr)).join(' + ') + ` = ${formatInr(solution.totalCostInr)}`,
    },
    binding: solution.tightConstraints.includes('budget'),
    sourceKey: solution.sourceKey,
  };
}

export function auditTodayCost(solution: RationSolution): AuditMeta | null {
  if (solution.currentCostInr === null) return null;
  return {
    id: 'today-cost',
    label: t('audit_label_today_cost'),
    formattedValue: formatInr(solution.currentCostInr),
    numericValue: solution.currentCostInr,
    originType: 'user_input',
    citation: null,
    solverConstraint: null,
    sourceKey: 'PROTO-TODAY-RATION',
  };
}

export function auditSavings(solution: RationSolution): AuditMeta | null {
  if (solution.savingsInr === null || solution.currentCostInr === null) return null;
  return {
    id: 'savings',
    label: t('audit_label_savings'),
    formattedValue: formatInr(Math.abs(solution.savingsInr)),
    numericValue: solution.savingsInr,
    originType: 'solver_output',
    citation: null,
    solverConstraint: {
      role: t('audit_role_derived'),
      activeConstraint: t('audit_constraint_savings'),
      breakdown: `${formatInr(solution.currentCostInr)} − ${formatInr(solution.totalCostInr)} = ${formatInr(solution.savingsInr)} (${formatPct(solution.savingsPct ?? 0, 1)})`,
    },
    sourceKey: solution.sourceKey,
  };
}

/** Feed row source: price and composition with the full citation fields, the price's reliability and the user's own edit. */
export function auditFeedPrice(feed: FeedItem, price: number | null): AuditMeta {
  const hasUserPrice = price !== null && Number.isFinite(price);
  const effectivePrice = hasUserPrice ? price : feed.defaultPriceInrPerKgAsFed;
  const edited =
    hasUserPrice &&
    (feed.defaultPriceInrPerKgAsFed === null || Math.abs(price - feed.defaultPriceInrPerKgAsFed) > 1e-9);
  const extraRows: { label: BiText; value: string | BiText }[] = [];
  if (feed.priceReliability !== null) {
    extraRows.push({ label: t('audit_price_reliability'), value: t(RELIABILITY_STRING[feed.priceReliability]) });
  }
  if (feed.priceNote !== null) {
    extraRows.push({ label: t('audit_price_note'), value: feed.priceNote });
  }
  return {
    id: `price-${feed.id}`,
    label: t('audit_label_price', { feed: feedNameBi(feed) }),
    formattedValue: effectivePrice !== null && Number.isFinite(effectivePrice) ? formatInrPerKg(effectivePrice) : '—',
    numericValue: effectivePrice !== null && Number.isFinite(effectivePrice) ? effectivePrice : 0,
    originType: edited ? 'user_input' : 'cited_source',
    notes: edited ? [t('audit_note_user_price')] : undefined,
    extraRows: extraRows.length > 0 ? extraRows : undefined,
    citation: {
      doc: feed.priceSource && feed.priceDate ? `${feed.priceSource} · ${feed.priceDate}` : feed.sourceDoc,
      table: feed.sourceTable,
      page: feed.sourcePage,
      formula: `CP ${formatNumber(feed.cpPctDm, 1)}% · ME ${formatNumber(feed.meMcalPerKgDm, 2)} Mcal/kg · Ca ${formatNumber(feed.caGramsPerKgDm, 1)} g/kg · P ${formatNumber(feed.pGramsPerKgDm, 1)} g/kg (DM basis) · DM ${formatNumber(feed.dmPct, 0)}%`,
      provenanceStatus: feed.provenanceStatus === 'cited' && !feed.priceSource ? 'cited' : 'team-asserted',
      verifiedOn: feed.verifiedOn,
    },
    solverConstraint: null,
    sourceKey: feed.sourceKey ?? feed.id,
  };
}

export function auditMaxSupply(item: InfeasibilityReport['limitingNutrients'][number]): AuditMeta {
  const n = item.nutrient;
  return {
    id: `max-${n}`,
    label: n === 'roughage' ? t('audit_label_roughage_max') : t('audit_label_max_supply', { nutrient: nutrientName(n) }),
    formattedValue: formatLimit(n, item.maxSupply),
    numericValue: item.maxSupply,
    originType: 'solver_output',
    citation: null,
    solverConstraint: {
      role: t('audit_role_diagnosis'),
      activeConstraint: t('audit_constraint_diagnosis'),
      breakdown: `${formatLimit(n, item.maxSupply)} < ${formatLimit(n, item.required)}`,
    },
    binding: true,
    sourceKey: 'SOLVER-DIAGNOSIS',
  };
}

const ROUGHAGE_CITATION = requirementsV1.roughageMinShareOfDm.citation;
const ROUGHAGE_NOTE = requirementsV1.roughageMinShareOfDm.note;

/** The cited roughage minimum share of total ration dry matter (ICAR 2013 / NDDB, AC-5.12, AC-6.1, AC-6.3, AC-E2.2). */
export function auditRoughageMin(minPct: number): AuditMeta {
  return {
    id: 'req-roughage',
    label: t('audit_label_roughage_need'),
    formattedValue: formatPct(minPct, 0),
    numericValue: minPct,
    originType: 'cited_source',
    citation: {
      doc: ROUGHAGE_CITATION.doc,
      table: ROUGHAGE_CITATION.table,
      page: ROUGHAGE_CITATION.page,
      formula: `roughage DM ÷ total DM ≥ ${formatPct(minPct, 0)} (${ROUGHAGE_NOTE})`,
      provenanceStatus: 'cited',
      verifiedOn: requirementsV1.roughageMinShareOfDm.verifiedOn,
    },
    solverConstraint: {
      role: t('audit_role_roughage'),
      activeConstraint: t('audit_constraint_roughage'),
      breakdown: `roughage DM ÷ total DM ≥ ${formatPct(minPct, 0)}`,
    },
    sourceKey: 'REQ-ROUGHAGE-MIN',
  };
}

/** The roughage share the ration actually has, against the cited minimum (ICAR 2013 / NDDB). */
export function auditRoughageShare(solution: RationSolution, feeds: FeedItem[]): AuditMeta {
  const byId = new Map(feeds.map((f) => [f.id, f]));
  const parts = solution.feeds.map((l) => {
    const feed = byId.get(l.feedId);
    const rough = feed && (feed.vertical === 'indigenous_forage' || feed.vertical === 'crop_residue');
    return { rough: Boolean(rough), dm: l.dmKg };
  });
  const roughDm = parts.filter((p) => p.rough).reduce((s, p) => s + p.dm, 0);
  const totalDm = parts.reduce((s, p) => s + p.dm, 0);
  return {
    id: 'sup-roughage',
    label: t('audit_label_roughage'),
    formattedValue: formatPct(solution.roughageSharePct, 0),
    numericValue: solution.roughageSharePct,
    originType: 'solver_output',
    citation: {
      doc: ROUGHAGE_CITATION.doc,
      table: ROUGHAGE_CITATION.table,
      page: ROUGHAGE_CITATION.page,
      formula: `${formatNumber(roughDm, 2)} ÷ ${formatNumber(totalDm, 2)} kg DM = ${formatPct(solution.roughageSharePct, 1)} (≥ ${formatPct(solution.roughageMinSharePct, 0)})`,
      provenanceStatus: 'cited',
      verifiedOn: requirementsV1.roughageMinShareOfDm.verifiedOn,
    },
    solverConstraint: {
      role: t('audit_role_roughage'),
      activeConstraint: t('audit_constraint_roughage'),
      breakdown: `${formatNumber(roughDm, 2)} ÷ ${formatNumber(totalDm, 2)} kg DM = ${formatPct(solution.roughageSharePct, 1)}  |  ≥ ${formatPct(solution.roughageMinSharePct, 0)}`,
    },
    binding: solution.tightConstraints.includes('roughage'),
    extraRows: [
      {
        label: t('audit_label_roughage_need'),
        value: t('label_roughage_min', { min: formatPct(solution.roughageMinSharePct, 0) }),
      },
    ],
    sourceKey: solution.sourceKey,
  };
}

export function auditLimitingRequirement(item: InfeasibilityReport['limitingNutrients'][number], req: RequirementResult): AuditMeta {
  if (item.nutrient === 'roughage') return auditRoughageMin(item.required);
  return item.nutrient === 'DM'
    ? { ...auditRequirement('DM', req), formattedValue: formatNutrient('DM', item.required), numericValue: item.required }
    : auditRequirement(item.nutrient, req);
}

