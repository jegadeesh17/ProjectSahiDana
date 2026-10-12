// Prototype scope: only the bilingual deterministic template lives here.
// verifyExplanationNumbers (grounding check, language gate, retry) arrives with M2.
import { formatInr, formatKg, formatLitres, formatPct, naturalDecimals } from '../i18n/format';
import { t } from '../i18n/strings';
import type { BiText } from '../i18n/strings';
import { feedNameBi } from './feedNames';
import { litres1, verdictText } from './verdict';
import type { ExplanationRequestContext } from './types';

/** One BiText line per sentence; every number comes from solver output, inputs or cited rows. */
export function buildTemplateExplanation(context: ExplanationRequestContext): BiText[] {
  const { animal, solution, feeds } = context;
  const lines: BiText[] = [];
  lines.push(
    t('template_animal', {
      species: t(animal.species === 'cow' ? 'label_cow' : 'label_buffalo'),
      weight: formatKg(animal.bodyWeightKg, 0),
      milk: formatLitres(animal.milkYieldLitersPerDay, naturalDecimals(animal.milkYieldLitersPerDay)),
      fat: formatPct(animal.milkFatPct, 1),
    }),
  );
  lines.push(
    t('template_supported', {
      budget: formatInr(animal.budgetInrPerDay),
      milk: litres1(solution.supportedMilkLPerDay),
      cap: formatLitres(solution.milkCapLPerDay, 2),
    }),
  );
  lines.push(t('template_verdict', { verdict: verdictText(solution.verdict, animal.milkYieldLitersPerDay, solution.supportedMilkLPerDay) }));
  for (const line of solution.feeds) {
    const feed = feeds.find((f) => f.id === line.feedId);
    if (!feed) continue;
    lines.push(
      t('template_feed_line', { feed: feedNameBi(feed), kg: formatKg(line.kgAsFed), cost: formatInr(line.costInr) }),
    );
  }
  lines.push(t('template_total', { cost: formatInr(solution.totalCostInr) }));
  lines.push(
    t('template_coverage', {
      cp: formatPct(solution.coveragePct.CP, 0),
      me: formatPct(solution.coveragePct.ME, 0),
      ca: formatPct(solution.coveragePct.Ca, 0),
      p: formatPct(solution.coveragePct.P, 0),
      dm: formatPct(solution.coveragePct.DM, 0),
    }),
  );
  if (solution.savingsInr !== null && solution.savingsPct !== null && solution.savingsInr > 0) {
    lines.push(
      t('template_savings', {
        amount: formatInr(solution.savingsInr),
        pct: formatPct(solution.savingsPct, 1),
      }),
    );
  }
  lines.push(t('template_source'));
  return lines;
}

/** Numeric tokens in an English explanation, as the verifier will count them. */
export function countNumericTokens(text: string): number {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).length;
}
