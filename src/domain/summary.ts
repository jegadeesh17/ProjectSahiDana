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
