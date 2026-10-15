// AuditMeta builders for the Change 4 screens (docs/ARCHITECTURE.md, "C4 audit metadata").
// Prototype subset: every plan figure is tagged `prototype_fixture` with the PROTO-HERD-FIXTURE key, because the
// plan comes from src/data/herdPrototype.json and not from the joint herd LP. The two prefill builders are real:
// they quote the cited breed row and carry no fixture tag.
import { formatInr, formatInrPerKg, formatLitres, formatNumber } from '../i18n/format';
import { bi, t } from '../i18n/strings';
import type { BiText } from '../i18n/strings';
import { RELIABILITY_STRING } from './feedGroups';
import { feedNameBi } from './feedNames';
import { GRAM_FEED_IDS } from './format';
import { breedPrefill } from './breeds';
import type {
  AnimalLabel,
  AuditMeta,
  BreedStandard,
  FeedItem,
  HerdAnimalSolution,
  HerdBudgetPrompt,
  HerdShortfallPrompt,
  ShoppingLine,
  ShoppingList,
} from './types';

export const PROTO_HERD_KEY = 'PROTO-HERD-FIXTURE';

/** "Cow 2" in the active language, for audit breakdowns (plain text, like the other audit builders). */
export function labelText(label: AnimalLabel): string {
  return bi(label.species === 'cow' ? 'label_cow_n' : 'label_buffalo_n', { n: label.n });
}

/** The same label as a pair, for audit titles that carry both languages. */
export function labelBi(label: AnimalLabel): BiText {
  return t(label.species === 'cow' ? 'label_cow_n' : 'label_buffalo_n', { n: label.n });
}

const exactKg = (kg: number) => `${formatNumber(kg, 3)} kg`;

function fixture(
  id: string,
  label: BiText,
  formattedValue: string,
  numericValue: number,
  breakdown: string,
  extraRows?: AuditMeta['extraRows'],
): AuditMeta {
  return {
    id,
    label,
    formattedValue,
    numericValue,
    originType: 'prototype_fixture',
    citation: null,
    solverConstraint: { role: t('c4_audit_role'), activeConstraint: t('c4_audit_constraint'), breakdown },
    sourceKey: PROTO_HERD_KEY,
    extraRows,
  };
}

/** A line's kg (or g) in "What to buy": every animal's share added up, exact. */
export function auditShoppingKg(line: ShoppingLine, feed: FeedItem, labels: Map<string, AnimalLabel>): AuditMeta {
  const parts = line.perAnimalKg.map((p) => `${labels.has(p.key) ? labelText(labels.get(p.key)!) : p.key} ${exactKg(p.kg)}`);
  const grams = GRAM_FEED_IDS.includes(line.feedId);
  const breakdown = `${parts.join(' + ')} = ${exactKg(line.kgPerDay)}${grams ? ` × 1000 = ${formatNumber(line.kgPerDay * 1000, 0)} g` : ''}`;
  return fixture(
    `shop-kg-${line.feedId}`,
    t('c4_audit_label_shop_kg', { feed: feedNameBi(feed) }),
    grams ? `${formatNumber(line.kgPerDay * 1000, 0)} g` : exactKg(line.kgPerDay),
    line.kgPerDay,
    breakdown,
  );
}

/** A line's rupees: kg × the cited price, exact, with the price's own reliability and date. */
export function auditShoppingCost(line: ShoppingLine, feed: FeedItem): AuditMeta {
  const extra: NonNullable<AuditMeta['extraRows']> = [
    { label: t('audit_label_price', { feed: feedNameBi(feed) }), value: formatInrPerKg(line.priceInrPerKg) },
  ];
  if (feed.priceReliability !== null) extra.push({ label: t('audit_price_reliability'), value: t(RELIABILITY_STRING[feed.priceReliability]) });
  if (feed.priceDate !== null) extra.push({ label: t('label_price_date'), value: feed.priceDate });
  return fixture(
    `shop-cost-${line.feedId}`,
    t('c4_audit_label_shop_cost', { feed: feedNameBi(feed) }),
    formatInr(line.costInrPerDay, 2),
    line.costInrPerDay,
    `${exactKg(line.kgPerDay)} × ${formatInrPerKg(line.priceInrPerKg)} = ${formatInr(line.costInrPerDay, 2)}`,
    extra,
  );
}

/** "→ about +L L milk": the step's milk minus the milk of the step before it, rounded down to 0.1 L. */
export function auditStepGain(later: ShoppingList['later'][number], byId: Map<string, FeedItem>): AuditMeta {
  const names = (ids: string[]): BiText => ({
    hi: ids.map((id) => (byId.has(id) ? feedNameBi(byId.get(id)!).hi : id)).join(', '),
    en: ids.map((id) => (byId.has(id) ? feedNameBi(byId.get(id)!).en : id)).join(', '),
  });
  const feed = byId.get(later.line.feedId);
  return fixture(
    `step-gain-${later.line.feedId}`,
    t('c4_audit_label_gain', { feed: feed ? feedNameBi(feed) : later.line.feedId }),
    `+${formatLitres(later.deltaMilkL, 1)}`,
    later.deltaMilkExactL,
    `${formatNumber(later.step.totalMilkL, 3)} − ${formatNumber(later.previous.totalMilkL, 3)} = ${formatNumber(later.deltaMilkExactL, 3)} L (rounded down to ${formatNumber(later.deltaMilkL, 1)} L)`,
    [
      { label: t('c4_shop_first'), value: names(later.previous.prefixFeedIds) },
      { label: t('c4_shop_later'), value: names(later.step.prefixFeedIds) },
    ],
  );
}

export function auditShoppingTotal(shopping: ShoppingList): AuditMeta {
  return fixture(
    'shop-total',
    t('c4_audit_label_total'),
    formatInr(shopping.totalInr, 2),
    shopping.totalInr,
    [...shopping.buyFirst, ...shopping.later.map((l) => l.line)].map((l) => formatInr(l.costInrPerDay, 2)).join(' + ') +
      ` = ${formatInr(shopping.totalInr, 2)}`,
  );
}

/** One feed on one animal's card, exact, tagged "From home" or "Buy". */
export function auditCardKg(label: AnimalLabel, feed: FeedItem, kg: number, source: 'home' | 'buy'): AuditMeta {
  const grams = GRAM_FEED_IDS.includes(feed.id);
  return fixture(
    `card-kg-${label.species}-${label.n}-${feed.id}-${source}`,
    t('c4_audit_label_card_kg', { animal: labelBi(label), feed: feedNameBi(feed) }),
    grams ? `${formatNumber(kg * 1000, 0)} g` : exactKg(kg),
    kg,
    `${labelText(label)}: ${exactKg(kg)}${grams ? ` × 1000 = ${formatNumber(kg * 1000, 0)} g` : ''}`,
    [{ label: t('c4_audit_row_source'), value: source === 'home' ? t('c4_tag_home') : t('tag_buy') }],
  );
}

/** S_i on a card: the animal's share of its milk target, rounded down to 0.1 L. */
export function auditHerdMilk(label: AnimalLabel, sol: HerdAnimalSolution, shareT: number): AuditMeta {
  return fixture(
    `card-milk-${label.species}-${label.n}`,
    t('c4_audit_label_card_milk', { animal: labelBi(label) }),
    formatLitres(sol.milkLPerDay, 1),
    sol.milkLPerDay,
    `${formatNumber(shareT, 3)} × ${formatNumber(sol.milkTargetLPerDay, 2)} = ${formatNumber(sol.milkExactLPerDay, 3)} L (rounded down to ${formatNumber(sol.milkLPerDay, 1)} L)`,
  );
}

export function auditPromptX(prompt: HerdBudgetPrompt): AuditMeta {
  return fixture(
    'prompt-x',
    t('c4_audit_label_prompt_x'),
    formatInr(prompt.extraInrPerDay, 0),
    prompt.extraInrPerDay,
    `${formatInr(prompt.costAtTargetInrPerDay, 2)} − ${formatInr(prompt.budgetInrPerDay, 2)} = ${formatInr(prompt.costAtTargetInrPerDay - prompt.budgetInrPerDay, 2)} (rounded up to ${formatInr(prompt.extraInrPerDay, 0)})`,
  );
}

export function auditPromptY(prompt: HerdBudgetPrompt, labels: Map<string, AnimalLabel>): AuditMeta {
  return fixture(
    'prompt-y',
    t('c4_audit_label_prompt_y'),
    formatLitres(prompt.targetMilkL, 1),
    prompt.targetMilkL,
    prompt.perAnimalTargetL.map((p) => `${labels.has(p.key) ? labelText(labels.get(p.key)!) : p.key} ${formatNumber(p.targetL, 1)}`).join(' + ') +
      ` = ${formatNumber(prompt.targetMilkL, 1)} L`,
  );
}

export function auditShortfallX(prompt: HerdShortfallPrompt): AuditMeta {
  return fixture(
    'shortfall-x',
    t('c4_audit_label_prompt_x'),
    formatInr(prompt.extraInrPerDay, 0),
    prompt.extraInrPerDay,
    `${formatInr(prompt.maintenanceCostInrPerDay, 2)} − ${formatInr(prompt.budgetInrPerDay, 2)} = ${formatInr(prompt.maintenanceCostInrPerDay - prompt.budgetInrPerDay, 2)} (rounded up to ${formatInr(prompt.extraInrPerDay, 0)})`,
  );
}

/** Any other fixture figure (Details rows, coverage). */
export function auditFixtureFigure(id: string, what: BiText, formattedValue: string, numericValue: number, breakdown: string): AuditMeta {
  return fixture(id, t('c4_audit_label_generic', { what }), formattedValue, numericValue, breakdown);
}

// ---- cited prefill (real data, no fixture tag) --------------------------------------------------------------

const breedName = (breed: BreedStandard): BiText => ({ hi: breed.localNameDeva ?? breed.englishName, en: breed.englishName });

/** The prefilled body weight: the breed table's cited value (AC-C4-1.3). */
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

/** The prefilled fat: the single cited value, or the midpoint of a cited range with both ends shown (AC-C4-1.4). */
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
