// Audit records for the breed benchmark, the season of a feed and the two-stage result (Round 3).
import { formatInr, formatLitres, formatNumber, formatPct, naturalDecimals } from '../i18n/format';
import { getActiveLang } from '../i18n/lang';
import { monthRangeText } from '../i18n/months';
import type { BiText } from '../i18n/strings';
import { t } from '../i18n/strings';
import { CAP_BASIS_EXPLAIN, CAP_BASIS_STRING, capFromCitedFigures, isNonDescript } from './breeds';
import { feedNameBi, LIMIT_STRING_ID } from './feedNames';
import type { AuditMeta, BindingConstraint, BreedStandard, BudgetShortfallReport, FeedItem, RationSolution } from './types';
import { litres1 } from './verdict';

const breedNameBi = (breed: BreedStandard): BiText =>
  isNonDescript(breed) ? t('label_benchmark_national') : { hi: breed.localNameDeva ?? breed.englishName, en: breed.englishName };

function join(a: BiText, b: BiText, sep = ' · '): BiText {
  return { hi: a.hi + sep + b.hi, en: a.en + sep + b.en };
}

// ---- season ------------------------------------------------------------------------------------------
/** The months a feed is available near Jaipur, with the source's own note. */
export function auditSeason(feed: FeedItem): AuditMeta {
  const lang = getActiveLang();
  const range = monthRangeText(feed.availableMonths, lang);
  return {
    id: `season-${feed.id}`,
    label: t('audit_label_season', { feed: feedNameBi(feed) }),
    formattedValue: range ?? t('label_all_year')[lang],
    numericValue: feed.availableMonths.length,
    originType: 'cited_source',
    citation: null,
    solverConstraint: null,
    sourceKey: feed.sourceKey,
    extraRows: [{ label: t('audit_season_note'), value: feed.seasonNote }],
  };
}

// ---- breed benchmark ---------------------------------------------------------------------------------
/** The milk cap of a breed: source document, table and page, the division used with its basis, and the kg-to-L assumption. */
export function auditBreedCap(breed: BreedStandard, todayMilk: number | null = null): AuditMeta {
  const cap = capFromCitedFigures(breed);
  const working =
    cap.yieldKg !== null && cap.lengthDays !== null
      ? t('audit_cap_working', {
          yield: formatNumber(cap.yieldKg, 0),
          days: formatNumber(cap.lengthDays, 0),
          cap: formatNumber(cap.value, 2),
        })
      : t(cap.basis === 'cited_peak' ? 'audit_cap_working_cited' : 'audit_cap_working_avg', { cap: formatNumber(cap.value, 2) });
  return {
    id: `breed-cap-${breed.id}`,
    label: t('audit_label_breed_cap', { breed: breedNameBi(breed) }),
    formattedValue: formatLitres(breed.milkCapLPerDay, 2),
    numericValue: breed.milkCapLPerDay,
    originType: 'cited_source',
    citation: {
      doc: breed.sourceDoc,
      table: breed.sourceTable,
      page: breed.sourcePage,
      provenanceStatus: breed.provenanceStatus,
      verifiedOn: breed.verifiedOn,
    },
    solverConstraint: null,
    sourceKey: breed.sourceKey,
    extraRows: [
      { label: t('audit_cap_basis'), value: t(CAP_BASIS_STRING[breed.capBasis]) },
      { label: t('audit_source_note'), value: breed.sourceNote },
      ...(breed.peakNote ? [{ label: t('audit_peak_note'), value: breed.peakNote }] : []),
    ],
    notes: [
      t(CAP_BASIS_EXPLAIN[breed.capBasis]),
      working,
      ...(todayMilk !== null && todayMilk > breed.milkCapLPerDay + 1e-9 ? [t('audit_cap_today_higher')] : []),
      t('note_milk_kg_l'),
    ],
  };
}

/** "7.34%" or "4.69–4.97%"; null when the sources give none. */
export function formatBreedFat(breed: BreedStandard): string | null {
  if (breed.fatPct === null) return null;
  const decimals = (v: number): 1 | 2 => (naturalDecimals(v) === 2 ? 2 : 1);
  if (breed.fatPctHigh !== null) {
    return `${formatNumber(breed.fatPct, decimals(breed.fatPct))}–${formatNumber(breed.fatPctHigh, decimals(breed.fatPctHigh))}%`;
  }
  return formatPct(breed.fatPct, decimals(breed.fatPct));
}

export function auditBreedFat(breed: BreedStandard): AuditMeta | null {
  const text = formatBreedFat(breed);
  if (text === null || breed.fatPct === null) return null;
  return {
    id: `breed-fat-${breed.id}`,
    label: t('audit_label_breed_fat', { breed: breedNameBi(breed) }),
    formattedValue: text,
    numericValue: breed.fatPct,
    originType: 'cited_source',
    citation: { doc: breed.sourceDoc, table: breed.sourceTable, page: breed.sourcePage, provenanceStatus: breed.provenanceStatus, verifiedOn: breed.verifiedOn },
    solverConstraint: null,
    sourceKey: breed.sourceKey,
    notes: [t('note_milk_kg_l')],
  };
}

// ---- two-stage result --------------------------------------------------------------------------------
export function bindingName(which: BindingConstraint): BiText {
  if (which === 'budget') return t('bind_budget');
  if (which === 'breed_cap') return t('bind_breed_cap');
  if (which === 'intake') return t('bind_intake');
  if (which === 'roughage') return t('bind_roughage');
  return t(LIMIT_STRING_ID[which]);
}

/** "feed limit: Maize fodder (green)" for each feed whose own max kg/day caps the milk (OQ6). */
export function feedLimitNames(solution: RationSolution, byId: Map<string, FeedItem>): BiText[] {
  return solution.feedLimitIds.flatMap((id) => {
    const feed = byId.get(id);
    return feed ? [t('bind_feed_limit', { feed: feedNameBi(feed) })] : [];
  });
}

/** S: stage 1. Names the constraint that limits it; every other tight one goes in the note. */
export function auditSupportedMilk(solution: RationSolution, byId: Map<string, FeedItem>): AuditMeta {
  const S = solution.supportedMilkLPerDay;
  const limitedBy = join(t('label_limited_by'), bindingName(solution.bindingConstraint), ': ');
  const others = [...solution.tightConstraints.slice(1).map(bindingName), ...feedLimitNames(solution, byId)];
  return {
    id: 'supported-milk',
    label: t('audit_label_supported'),
    formattedValue: formatLitres(S, 1),
    numericValue: S,
    originType: 'solver_output',
    citation: null,
    solverConstraint: {
      role: t('audit_role_stage1'),
      activeConstraint: join(t('audit_constraint_stage1'), limitedBy, '. '),
      breakdown: `S = ${formatNumber(S, 2)} L; cap ${formatNumber(solution.effectiveCapLPerDay, 2)} L; cost ${formatInr(solution.totalCostInr)} ≤ ${formatInr(solution.budgetInrPerDay)}`,
    },
    binding: true,
    sourceKey: solution.sourceKey,
    notes: [
      ...(others.length > 0 ? [others.reduce((a, b) => join(a, b, ', '), t('label_limited_by'))] : []),
      ...(solution.effectiveCapLPerDay > solution.milkCapLPerDay + 1e-9 ? [t('audit_cap_today_higher')] : []),
    ],
  };
}

export function auditGain(solution: RationSolution, todayMilk: number, gain: number): AuditMeta {
  return {
    id: 'gain',
    label: t('audit_label_gain'),
    formattedValue: litres1(gain),
    numericValue: gain,
    originType: 'solver_output',
    citation: null,
    solverConstraint: {
      role: t('audit_role_derived'),
      activeConstraint: t('audit_constraint_gain'),
      breakdown: `${formatNumber(solution.supportedMilkLPerDay, 1)} − ${formatNumber(todayMilk, naturalDecimals(todayMilk))} = ${formatNumber(gain, 1)} L`,
    },
    sourceKey: solution.sourceKey,
  };
}

export function auditSaving(solution: RationSolution, saving: number): AuditMeta {
  const reference = solution.currentCostInr ?? solution.budgetInrPerDay;
  const atToday = solution.costAtTodayMilkInrPerDay ?? 0;
  return {
    id: 'saving-z',
    label: t('audit_label_saving'),
    formattedValue: formatInr(saving),
    numericValue: saving,
    originType: 'solver_output',
    citation: null,
    solverConstraint: {
      role: t('audit_role_stage2_t'),
      activeConstraint: t('audit_constraint_saving'),
      breakdown: `${formatInr(reference)} − ${formatInr(atToday)} = ${formatInr(saving)}`,
    },
    notes: [t('note_reference_cost')],
    sourceKey: solution.sourceKey,
  };
}

export function auditKeepCost(solution: RationSolution, cost: number, todayMilk: number): AuditMeta {
  return {
    id: 'keep-cost-b',
    label: t('audit_label_keep_cost'),
    formattedValue: formatInr(cost),
    numericValue: cost,
    originType: 'solver_output',
    citation: null,
    solverConstraint: {
      role: t('audit_role_stage2_t'),
      activeConstraint: t('audit_constraint_stage2_t'),
      breakdown: `${formatNumber(todayMilk, naturalDecimals(todayMilk))} L → ${formatInr(cost)}`,
    },
    sourceKey: solution.sourceKey,
  };
}

export function auditMaintenance(cost: number, sourceKey: string): AuditMeta {
  return {
    id: 'maintenance-m',
    label: t('audit_label_maintenance'),
    formattedValue: formatInr(cost),
    numericValue: cost,
    originType: 'solver_output',
    citation: null,
    solverConstraint: {
      role: t('audit_role_stage2_m'),
      activeConstraint: t('audit_constraint_stage2_m'),
      breakdown: `0 L → ${formatInr(cost)}`,
    },
    sourceKey,
  };
}

export function auditShortfall(report: BudgetShortfallReport): AuditMeta {
  return auditMaintenance(report.verdict.maintenanceCostInrPerDay, report.sourceKey);
}

/** The amount under the budget (AC-5.2). */
export function auditUnderBudget(solution: RationSolution): AuditMeta {
  const under = solution.budgetInrPerDay - solution.totalCostInr;
  return {
    id: 'under-budget',
    label: t('audit_label_budget'),
    formattedValue: formatInr(Math.max(0, under)),
    numericValue: under,
    originType: 'solver_output',
    citation: null,
    solverConstraint: {
      role: t('audit_role_derived'),
      activeConstraint: t('audit_constraint_cost'),
      breakdown: `${formatInr(solution.budgetInrPerDay)} − ${formatInr(solution.totalCostInr)} = ${formatInr(under)}`,
    },
    sourceKey: solution.sourceKey,
  };
}
