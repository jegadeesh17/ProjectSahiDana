// Plain-text summary for WhatsApp or SMS (AC-8.1). Labels follow the selected language via bi(); numbers are Latin digits.
import { formatInr, formatKg, formatLitres, formatPct, naturalDecimals } from '../i18n/format';
import { getActiveLang } from '../i18n/lang';
import { bi, biText, t } from '../i18n/strings';
import { breedById, breedLabel } from './breeds';
import { feedNameBi, NUTRIENT_STRING_ID } from './feedNames';
import { formatNutrient, REQ_FIELD } from './nutrition';
import type { ExplanationRequestContext } from './types';
import { NUTRIENT_KEYS } from './types';
import { litres1, verdictText } from './verdict';

export function buildSummary(context: ExplanationRequestContext): string {
  const { animal, solution, feeds, requirement } = context;
  const breed = breedById(animal.breedId);
  const lines: string[] = [];
  lines.push(bi('summary_title'));
  lines.push(
    `${biText(t(animal.species === 'cow' ? 'label_cow' : 'label_buffalo'))}${breed ? `, ${breedLabel(breed, getActiveLang())}` : ''}, ${formatKg(animal.bodyWeightKg, 0)}, ` +
      `${formatLitres(animal.milkYieldLitersPerDay, naturalDecimals(animal.milkYieldLitersPerDay))} ${bi('label_per_day')}, ${formatPct(animal.milkFatPct, 1)} ${bi('label_fat_short')}`,
  );
  lines.push('');
  lines.push(`${bi('summary_supported')}: ${litres1(solution.supportedMilkLPerDay)} ${bi('label_per_day')}`);
  lines.push(`${bi('summary_verdict')}: ${biText(verdictText(solution.verdict, animal.milkYieldLitersPerDay, solution.supportedMilkLPerDay))}`);
  if (solution.verdict.kind === 'gain' || solution.verdict.kind === 'at_breed_level') lines.push(bi('caveat_line'));
  lines.push(`${bi('summary_budget')}: ${formatInr(animal.budgetInrPerDay)} ${bi('label_per_day')}`);
  lines.push('');
  lines.push(`${bi('summary_ration')}:`);
  for (const l of solution.feeds) {
    const feed = feeds.find((f) => f.id === l.feedId);
    if (!feed) continue;
    lines.push(`- ${biText(feedNameBi(feed))}: ${formatKg(l.kgAsFed)} (${formatInr(l.costInr)})`);
  }
  lines.push('');
  lines.push(`${bi('summary_cost')}: ${formatInr(solution.totalCostInr)} ${bi('label_per_day')}`);
  if (solution.savingsInr !== null && solution.savingsPct !== null) {
    const id = solution.savingsInr >= 0 ? 'label_saves' : 'label_extra';
    lines.push(`${bi(id)}: ${formatInr(Math.abs(solution.savingsInr))} ${bi('label_per_day')} (${formatPct(Math.abs(solution.savingsPct), 1)})`);
  }
  lines.push('');
  lines.push(`${bi('summary_coverage')}:`);
  for (const n of NUTRIENT_KEYS) {
    const name = biText(t(NUTRIENT_STRING_ID[n]));
    lines.push(
      `- ${n} (${name}): ${formatNutrient(n, solution.supplied[REQ_FIELD[n]])} / ${formatNutrient(n, requirement.requirements[REQ_FIELD[n]])} = ${formatPct(solution.coveragePct[n], 0)}`,
    );
  }
  lines.push('');
  lines.push(`${bi('summary_sources')}: ${solution.sourceKey}; ${requirement.citations.CP.sourceKey}; ${breed?.sourceKey ?? 'PROTO-BREED-*'}; PROTO-FEED-*`);
  lines.push(bi('notice_prototype_fixture'));
  return lines.join('\n');
}

// ---- Change 4: herd plan plain-text summary (SPEC AC-C4-1.24, AC-C4-2.14) ------------------
import feedsV1 from '../data/feeds.v1.json';
import { feedLabel } from '../i18n/feedLabel';
import { formatAmount, formatInrWhole, formatNumber } from '../i18n/format';
import type { Lang } from '../i18n/lang';
import { monthName } from '../i18n/months';
import { displayAmount, isShownAmount, roundInrWhole } from './format';
import type { FeedItem, HerdPlan } from './types';

const LIVE_FEEDS = feedsV1 as unknown as FeedItem[];

/**
 * Builds the plain text copied by "Copy summary" (AC-C4-1.24):
 * - Built from F with "What to buy" (Buy first and Then if you can with milk gains, total line)
 * - Animal cards in screen-1 list order
 * - "Not needed today", budget prompt, budget
 * - Season line with today's date in active language (AC-C4-1.30)
 * - Source attribution
 * - Plain words only: zero DM, ME, CP, rung, binding, supported milk, Stage (or Hindi step label)
 */
export function buildHerdSummary(
  plan: HerdPlan,
  libraryOrLang?: FeedItem[] | Lang,
  maybeLang?: Lang,
): string {
  const lang: Lang = typeof libraryOrLang === 'string' ? libraryOrLang : (maybeLang ?? getActiveLang());
  const library: FeedItem[] = Array.isArray(libraryOrLang) ? libraryOrLang : LIVE_FEEDS;
  const byId = new Map(library.map((f) => [f.id, f]));
  const name = (id: string) => (byId.has(id) ? feedLabel(byId.get(id)!, lang) : id);
  const rupees = (v: number) => formatInrWhole(roundInrWhole(v));
  const lines: string[] = [`SahiDana · ${t('c4_summary_title')[lang]}`];

  // Season line (AC-C4-1.30)
  const day = parseInt(plan.planDate.split('-')[2] ?? '1', 10);
  const monthStr = monthName(plan.month, lang);
  const dateStr = `${day} ${monthStr}`;
  lines.push(t('c4_season_line', { date: dateStr })[lang]);

  if (plan.status === 'below_maintenance') {
    lines.push('', t('c4_prompt_short', { x: formatInrWhole(plan.shortfall.extraInrPerDay) })[lang]);
  } else if (plan.status === 'infeasible') {
    lines.push('', t('c4_infeasible')[lang]);
  } else {
    const { shopping } = plan;
    lines.push('', t('c4_shop_title')[lang]);
    if (shopping.buyFirst.length === 0 && shopping.later.length === 0) {
      lines.push(t('c4_shop_none')[lang]);
    } else {
      lines.push(t('c4_shop_first')[lang]);
      for (const l of shopping.buyFirst) {
        if (isShownAmount(l.kgPerDay)) {
          lines.push(`- ${name(l.feedId)} ${formatAmount(displayAmount(l.feedId, l.kgPerDay))} (${rupees(l.costInrPerDay)})`);
        }
      }
      if (shopping.later.length > 0) {
        lines.push(t('c4_shop_later')[lang]);
        for (const s of shopping.later) {
          const gain = s.deltaMilkL > 0
            ? t('c4_shop_gain', { l: formatNumber(s.deltaMilkL, 1) })[lang]
            : t('c4_shop_same')[lang];
          lines.push(`- ${name(s.line.feedId)} ${formatAmount(displayAmount(s.line.feedId, s.line.kgPerDay))} (${rupees(s.line.costInrPerDay)}) ${gain}`);
        }
      }
      lines.push(t('c4_shop_total', { a: rupees(shopping.totalInr), b: rupees(plan.budgetInrPerDay) })[lang]);
    }

    lines.push('', t('c4_cards_title')[lang]);
    for (const sol of plan.perAnimal) {
      const animal = plan.animals.find((a) => a.key === sol.key);
      if (!animal) continue;
      const label = animal.label.species === 'cow'
        ? t('label_cow_n', { n: animal.label.n })[lang]
        : t('label_buffalo_n', { n: animal.label.n })[lang];
      const feedsText = sol.solution.feeds
        .filter((l) => isShownAmount(l.kgAsFed))
        .map((l) => `${name(l.feedId)} ${formatAmount(displayAmount(l.feedId, l.kgAsFed))} (${l.source === 'home' ? t('c4_tag_home')[lang] : t('tag_buy')[lang]})`)
        .join(' · ');
      const tail = sol.milkTargetLPerDay === 0
        ? t('c4_card_dry')[lang]
        : t('c4_card_enough', { l: formatNumber(sol.milkLPerDay, 1) })[lang];
      lines.push(`${label}: ${feedsText} — ${tail}`);
    }

    if (plan.notNeeded.length > 0) {
      lines.push('', `${t('c4_not_needed_title')[lang]}: ${plan.notNeeded.map(name).join(', ')}`);
    }

    if (plan.budgetPrompt) {
      lines.push(
        '',
        t('c4_prompt_add', {
          x: formatInrWhole(plan.budgetPrompt.extraInrPerDay),
          y: formatNumber(plan.budgetPrompt.targetMilkL, 1),
        })[lang],
      );
    }
  }

  lines.push('', `${t('summary_sources')[lang]}: ICAR-NIANP 2013 · ICAR 2013 · NDDB`);
  return lines.join('\n');
}

