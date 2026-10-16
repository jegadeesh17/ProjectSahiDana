// AuditMeta builders for Change 4 (docs/ARCHITECTURE.md, "C4 audit metadata" and "Visible season").
// Produces real solver and cited metadata for the herd plan and breed prefill.
import { formatInr, formatInrPerKg, formatLitres, formatNumber } from '../i18n/format';
import { getActiveLang } from '../i18n/lang';
import { monthName, monthRangeText } from '../i18n/months';
import { bi, t } from '../i18n/strings';
import type { BiText } from '../i18n/strings';
import { breedPrefill } from './breeds';
import { inSeason, RELIABILITY_STRING } from './feedGroups';
import { feedNameBi } from './feedNames';
import { GRAM_FEED_IDS } from './format';
import type {
  AnimalLabel,
  AuditMeta,
  BreedStandard,
  FeedItem,
  HerdAnimal,
  HerdAnimalSolution,
  HerdBudgetPrompt,
  HerdPlan,
  HerdShortfallPrompt,
  HerdSolution,
  ShoppingLine,
  ShoppingList,
} from './types';

export const PROTO_HERD_KEY = 'PROTO-HERD-FIXTURE';
export const SOLVER_HERD_KEY = 'SOLVER-HERD';

/** "Cow 2" in the active language, for audit breakdowns. */
export function labelText(label: AnimalLabel): string {
  return bi(label.species === 'cow' ? 'label_cow_n' : 'label_buffalo_n', { n: label.n });
}

/** The same label as a pair, for audit titles that carry both languages. */
export function labelBi(label: AnimalLabel): BiText {
  return t(label.species === 'cow' ? 'label_cow_n' : 'label_buffalo_n', { n: label.n });
}

const exactKg = (kg: number) => `${formatNumber(kg, 3)} kg`;

function solverOutput(
  id: string,
  label: BiText,
  formattedValue: string,
  numericValue: number,
  role: BiText,
  activeConstraint: BiText,
  breakdown: string,
  extraRows?: AuditMeta['extraRows'],
  notes?: BiText[],
): AuditMeta {
  return {
    id,
    label,
    formattedValue,
    numericValue,
    originType: 'solver_output',
    citation: null,
    solverConstraint: { role, activeConstraint, breakdown },
    sourceKey: SOLVER_HERD_KEY,
    extraRows,
    notes,
  };
}

function feedSeasonRows(feed: FeedItem): NonNullable<AuditMeta['extraRows']> {
  const lang = getActiveLang();
  const range = monthRangeText(feed.availableMonths, lang);
  const rows: NonNullable<AuditMeta['extraRows']> = [
    {
      label: t('c4_audit_row_available'),
      value: range ?? t('label_all_year')[lang],
    },
  ];
  if (feed.seasonNote) {
    rows.push({ label: t('audit_season_note'), value: feed.seasonNote });
  }
  return rows;
}

/** A line's kg (or g) in "What to buy": every animal's share added up, exact (AC-C4-1.13). */
export function auditShoppingKg(line: ShoppingLine, feed: FeedItem, labels: Map<string, AnimalLabel>): AuditMeta {
  const parts = line.perAnimalKg.map((p) => `${labels.has(p.key) ? labelText(labels.get(p.key)!) : p.key} ${exactKg(p.kg)}`);
  const grams = GRAM_FEED_IDS.includes(line.feedId);
  const breakdown = `${parts.join(' + ')} = ${exactKg(line.kgPerDay)}${grams ? ` × 1000 = ${formatNumber(line.kgPerDay * 1000, 0)} g` : ''}`;
  const extraRows: NonNullable<AuditMeta['extraRows']> = [...feedSeasonRows(feed)];

  return solverOutput(
    `shop-kg-${line.feedId}`,
    t('c4_audit_label_shop_kg', { feed: feedNameBi(feed) }),
    grams ? `${formatNumber(line.kgPerDay * 1000, 0)} g` : exactKg(line.kgPerDay),
    line.kgPerDay,
    t('c4_audit_role_stage2'),
    t('c4_audit_constraint_shop_kg'),
    breakdown,
    extraRows,
  );
}

/** A line's rupees: kg × cited price, exact, with reliability, date, and season availability (ARCHITECTURE line 2108). */
export function auditShoppingCost(line: ShoppingLine, feed: FeedItem): AuditMeta {
  const extra: NonNullable<AuditMeta['extraRows']> = [
    { label: t('audit_label_price', { feed: feedNameBi(feed) }), value: formatInrPerKg(line.priceInrPerKg) },
  ];
  if (feed.priceReliability !== null) {
    extra.push({ label: t('audit_price_reliability'), value: t(RELIABILITY_STRING[feed.priceReliability]) });
  }
  if (feed.priceDate !== null) {
    extra.push({ label: t('label_price_date'), value: feed.priceDate });
  }
  extra.push(...feedSeasonRows(feed));

  return solverOutput(
    `shop-cost-${line.feedId}`,
    t('c4_audit_label_shop_cost', { feed: feedNameBi(feed) }),
    formatInr(line.costInrPerDay, 2),
    line.costInrPerDay,
    t('c4_audit_role_stage2'),
    t('c4_audit_constraint_shop_cost'),
    `${exactKg(line.kgPerDay)} × ${formatInrPerKg(line.priceInrPerKg)} = ${formatInr(line.costInrPerDay, 2)}`,
    extra,
  );
}

/** "→ about +L L milk": the step's milk minus the milk of the step before it, rounded down to 0.1 L (AC-C4-1.14). */
export function auditStepGain(
  later: ShoppingList['later'][number],
  byId: Map<string, FeedItem>,
  _labels?: Map<string, AnimalLabel>,
): AuditMeta {
  const names = (ids: string[]): BiText => ({
    hi: ids.map((id) => (byId.has(id) ? feedNameBi(byId.get(id)!).hi : id)).join(', '),
    en: ids.map((id) => (byId.has(id) ? feedNameBi(byId.get(id)!).en : id)).join(', '),
  });
  const feed = byId.get(later.line.feedId);
  const extra: NonNullable<AuditMeta['extraRows']> = [
    { label: t('c4_shop_first'), value: names(later.previous.prefixFeedIds) },
    { label: t('c4_shop_later'), value: names(later.step.prefixFeedIds) },
    { label: t('c4_audit_row_prev_milk'), value: `${formatNumber(later.previous.totalMilkL, 1)} L` },
    { label: t('c4_audit_row_step_milk'), value: `${formatNumber(later.step.totalMilkL, 1)} L` },
  ];

  return solverOutput(
    `step-gain-${later.line.feedId}`,
    t('c4_audit_label_gain', { feed: feed ? feedNameBi(feed) : later.line.feedId }),
    later.deltaMilkL > 0 ? `+${formatLitres(later.deltaMilkL, 1)}` : bi('c4_shop_same'),
    later.deltaMilkExactL,
    t('c4_audit_role_step_k', { k: later.step.k }),
    t('c4_audit_constraint_step_gain'),
    `${formatNumber(later.step.totalMilkL, 3)} − ${formatNumber(later.previous.totalMilkL, 3)} = ${formatNumber(later.deltaMilkExactL, 3)} L (rounded down to ${formatNumber(later.deltaMilkL, 1)} L)`,
    extra,
  );
}

/** Total purchase cost A: sum of every shopping line, exact; note: "home feed costs ₹0" (ARCHITECTURE line 1674). */
export function auditShoppingTotal(shopping: ShoppingList): AuditMeta {
  const allLines = [...shopping.buyFirst, ...shopping.later.map((l) => l.line)];
  const breakdown = allLines.length > 0
    ? allLines.map((l) => formatInr(l.costInrPerDay, 2)).join(' + ') + ` = ${formatInr(shopping.totalInr, 2)}`
    : `0 = ${formatInr(0, 2)}`;

  return solverOutput(
    'shop-total',
    t('c4_audit_label_total'),
    formatInr(shopping.totalInr, 2),
    shopping.totalInr,
    t('c4_audit_role_stage2'),
    t('c4_audit_label_total'),
    breakdown,
    undefined,
    [t('c4_audit_note_home_free')],
  );
}

/** One feed on one animal's card, exact, tagged "From home" or "Buy". */
export function auditCardKg(label: AnimalLabel, feed: FeedItem, kg: number, source: 'home' | 'buy'): AuditMeta {
  const grams = GRAM_FEED_IDS.includes(feed.id);
  const extraRows: NonNullable<AuditMeta['extraRows']> = [
    { label: t('c4_audit_row_source'), value: source === 'home' ? t('c4_tag_home') : t('tag_buy') },
  ];
  if (source === 'buy') {
    extraRows.push(...feedSeasonRows(feed));
  }

  return solverOutput(
    `card-kg-${label.species}-${label.n}-${feed.id}-${source}`,
    t('c4_audit_label_card_kg', { animal: labelBi(label), feed: feedNameBi(feed) }),
    grams ? `${formatNumber(kg * 1000, 0)} g` : exactKg(kg),
    kg,
    t('c4_audit_role_stage2'),
    t('c4_audit_label_card_kg', { animal: labelBi(label), feed: feedNameBi(feed) }),
    `${labelText(label)}: ${exactKg(kg)}${grams ? ` × 1000 = ${formatNumber(kg * 1000, 0)} g` : ''}`,
    extraRows,
  );
}

/** S_i on a card: animal's milk supported by plan, Y_i = t* × g_i, S_i = floor(10 Y_i)/10 (ARCHITECTURE line 1669). */
export function auditHerdMilk(label: AnimalLabel, sol: HerdAnimalSolution, shareT: number): AuditMeta {
  return solverOutput(
    `card-milk-${label.species}-${label.n}`,
    t('c4_audit_label_card_milk', { animal: labelBi(label) }),
    formatLitres(sol.milkLPerDay, 1),
    sol.milkLPerDay,
    t('c4_audit_role_stage1'),
    t('c4_det_share'),
    `${formatNumber(shareT, 3)} × ${formatNumber(sol.milkTargetLPerDay, 2)} = ${formatNumber(sol.milkExactLPerDay, 3)} L (rounded down to ${formatNumber(sol.milkLPerDay, 1)} L)`,
  );
}

/** Share t* in Details (ARCHITECTURE line 1668). */
export function auditShare(best: HerdSolution, animals: HerdAnimal[]): AuditMeta {
  const breakdown = `t* = ${formatNumber(best.shareT, 3)}; ` +
    animals.map((a, i) => `${labelText(a.label)}: ${formatNumber(best.shareT, 3)} × ${formatNumber(best.animals[i]?.milkTargetLPerDay ?? 0, 1)} = ${formatNumber(best.animals[i]?.milkExactLPerDay ?? 0, 2)} L`).join('; ');

  const limitKinds = best.limits.map((l) => l.kind).join(', ');
  return solverOutput(
    'herd-share-t',
    t('c4_det_share'),
    formatNumber(best.shareT, 3),
    best.shareT,
    t('c4_audit_role_stage1'),
    { hi: limitKinds, en: limitKinds },
    breakdown,
  );
}

/** Prompt X: Add ₹X/day to reach Y L (ARCHITECTURE line 1677). */
export function auditPromptX(prompt: HerdBudgetPrompt): AuditMeta {
  return solverOutput(
    'prompt-x',
    t('c4_audit_label_prompt_x'),
    formatInr(prompt.extraInrPerDay, 0),
    prompt.extraInrPerDay,
    t('c4_audit_label_prompt_x'),
    t('c4_audit_label_prompt_x'),
    `${formatInr(prompt.costAtTargetInrPerDay, 2)} − ${formatInr(prompt.budgetInrPerDay, 2)} = ${formatInr(prompt.costAtTargetInrPerDay - prompt.budgetInrPerDay, 2)} (rounded up to ${formatInr(prompt.extraInrPerDay, 0)})`,
  );
}
export const auditHerdBudgetIncrease = auditPromptX;

/** Prompt Y: target milk for all animals, originType 'cited_source' (ARCHITECTURE line 1678). */
export function auditPromptY(prompt: HerdBudgetPrompt, labels: Map<string, AnimalLabel>): AuditMeta {
  const breakdown = prompt.perAnimalTargetL
    .map((p) => `${labels.has(p.key) ? labelText(labels.get(p.key)!) : p.key} ${formatNumber(p.targetL, 1)}`)
    .join(' + ') + ` = ${formatNumber(prompt.targetMilkL, 1)} L`;

  return {
    id: 'prompt-y',
    label: t('c4_audit_label_prompt_y'),
    formattedValue: formatLitres(prompt.targetMilkL, 1),
    numericValue: prompt.targetMilkL,
    originType: 'cited_source',
    citation: null,
    solverConstraint: {
      role: t('c4_audit_label_prompt_y'),
      activeConstraint: t('c4_audit_label_prompt_y'),
      breakdown,
    },
    sourceKey: 'BREED-CAPS',
  };
}
export const auditHerdTarget = auditPromptY;

/** Prompt X: Spend at least ₹X more a day (below maintenance, ARCHITECTURE line 1679). */
export function auditShortfallX(prompt: HerdShortfallPrompt): AuditMeta {
  return solverOutput(
    'shortfall-x',
    t('c4_prompt_short'),
    formatInr(prompt.extraInrPerDay, 0),
    prompt.extraInrPerDay,
    t('c4_prompt_short'),
    t('c4_prompt_short'),
    `${formatInr(prompt.maintenanceCostInrPerDay, 2)} − ${formatInr(prompt.budgetInrPerDay, 2)} = ${formatInr(prompt.maintenanceCostInrPerDay - prompt.budgetInrPerDay, 2)} (rounded up to ${formatInr(prompt.extraInrPerDay, 0)})`,
  );
}
export const auditHerdShortfall = auditShortfallX;

export function auditHerdMaintenance(prompt: HerdShortfallPrompt): AuditMeta {
  return solverOutput(
    'herd-maintenance',
    t('c4_audit_maintenance_title'),
    formatInr(prompt.maintenanceCostInrPerDay, 2),
    prompt.maintenanceCostInrPerDay,
    t('c4_audit_maintenance_role'),
    t('c4_audit_maintenance_constraint'),
    `M_H = ${formatInr(prompt.maintenanceCostInrPerDay, 2)}`,
  );
}

export function auditHerdCostAtTarget(prompt: HerdBudgetPrompt): AuditMeta {
  return solverOutput(
    'herd-cost-at-target',
    t('c4_audit_cost_target_title'),
    formatInr(prompt.costAtTargetInrPerDay, 2),
    prompt.costAtTargetInrPerDay,
    t('c4_audit_cost_target_role'),
    t('c4_audit_cost_target_constraint'),
    `costAtCap_H = ${formatInr(prompt.costAtTargetInrPerDay, 2)}`,
  );
}

/** Tappable season date: opens audit listing feeds in C(m) (SPEC AC-C4-1.30, ARCHITECTURE line 2101-2107). */
export function auditSeasonSet(plan: HerdPlan, library: FeedItem[]): AuditMeta {
  const lang = getActiveLang();
  const priced = library.filter((f) => f.defaultPriceInrPerKgAsFed !== null);
  const inSeasonFeeds = priced.filter((f) => inSeason(f, plan.month));
  const excludedFeeds = priced.filter((f) => !inSeason(f, plan.month));

  const day = parseInt(plan.planDate.split('-')[2] ?? '1', 10);
  const mName = monthName(plan.month, lang);
  const inSeasonNames = inSeasonFeeds.map((f) => feedNameBi(f)[lang]).join(', ');
  const excludedNames = excludedFeeds.length > 0 ? excludedFeeds.map((f) => feedNameBi(f)[lang]).join(', ') : 'None';

  const extraRows: NonNullable<AuditMeta['extraRows']> = [
    { label: t('c4_audit_row_date'), value: plan.planDate },
    { label: t('c4_audit_row_month'), value: { hi: monthName(plan.month, 'hi'), en: monthName(plan.month, 'en') } },
    { label: t('c4_audit_row_rule'), value: t('c4_audit_rule_season') },
    { label: t('c4_audit_row_in_season_count'), value: String(inSeasonFeeds.length) },
    { label: t('c4_audit_row_in_season'), value: inSeasonNames },
    { label: t('c4_audit_row_excluded'), value: excludedNames },
  ];

  return {
    id: 'season-set',
    label: t('c4_audit_season_set'),
    formattedValue: `${day} ${mName}`,
    numericValue: inSeasonFeeds.length,
    originType: 'cited_source',
    citation: null,
    solverConstraint: null,
    sourceKey: 'JAIPUR-CALENDAR-2026',
    extraRows,
    notes: [t('c4_audit_note_home_season'), t('c4_audit_note_wrong_date')],
  };
}

/** Generic fixture figure. */
export function auditFixtureFigure(id: string, what: BiText, formattedValue: string, numericValue: number, breakdown: string): AuditMeta {
  return {
    id,
    label: t('c4_audit_label_generic', { what }),
    formattedValue,
    numericValue,
    originType: 'prototype_fixture',
    citation: null,
    solverConstraint: { role: t('c4_audit_role'), activeConstraint: t('c4_audit_constraint'), breakdown },
    sourceKey: PROTO_HERD_KEY,
  };
}

// ---- cited prefill (real data, no fixture tag) --------------------------------------------------------------

const breedName = (breed: BreedStandard): BiText => ({ hi: breed.localNameDeva ?? breed.englishName, en: breed.englishName });

/** Prefilled body weight: breed table's cited value (AC-C4-1.3). */
export function auditPrefillWeight(breed: BreedStandard): AuditMeta | null {
  const { weightKg } = breedPrefill(breed);
  const c = breed.bodyWeightCitation;
  if (weightKg === null || !c) return null;
  return {
    id: `prefill-weight-${breed.id}`,
    label: t('c4_audit_label_prefill_weight', { breed: breedName(breed) }),
    formattedValue: `${formatNumber(weightKg, 0)} kg`,
    numericValue: weightKg,
    originType: 'cited_source',
    citation: { doc: c.doc, table: c.table, page: c.page, provenanceStatus: breed.provenanceStatus, verifiedOn: breed.verifiedOn },
    solverConstraint: null,
    notes: [t('c4_audit_note_prefill_weight')],
    sourceKey: breed.sourceKey,
  };
}

/** Prefilled fat: single cited value or midpoint of cited range (AC-C4-1.4). */
export function auditPrefillFat(breed: BreedStandard): AuditMeta | null {
  const { fatPct, fatIsMidpoint } = breedPrefill(breed);
  const c = breed.fatCitation;
  if (fatPct === null || !c) return null;
  const low = breed.fatPctLow ?? null;
  const high = breed.fatPctHigh ?? null;
  return {
    id: `prefill-fat-${breed.id}`,
    label: t('c4_audit_label_prefill_fat', { breed: breedName(breed) }),
    formattedValue: `${formatNumber(fatPct, 2)}%`,
    numericValue: fatPct,
    originType: 'cited_source',
    citation: {
      doc: c.doc,
      table: c.table,
      page: c.page,
      formula: fatIsMidpoint && low !== null && high !== null ? `(low + high) / 2 = (${low} + ${high}) / 2 = ${fatPct}` : undefined,
      provenanceStatus: breed.provenanceStatus,
      verifiedOn: breed.verifiedOn,
    },
    solverConstraint: null,
    notes: fatIsMidpoint ? [t('c4_hint_midpoint')] : undefined,
    extraRows:
      fatIsMidpoint && low !== null && high !== null
        ? [
            { label: t('c4_audit_row_low'), value: `${low}%` },
            { label: t('c4_audit_row_high'), value: `${high}%` },
          ]
        : undefined,
    sourceKey: breed.sourceKey,
  };
}
