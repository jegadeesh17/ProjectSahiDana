import { useMemo } from 'react';
import { auditPromptX, auditPromptY, auditShortfallX } from '../domain/auditHerd';
import { breedById } from '../domain/breeds';
import { displayAmount, isShownAmount, roundInrWhole } from '../domain/format';
import type { AnimalLabel, BreedStandard, FeedItem, HerdPlan } from '../domain/types';
import { formatAmount, formatInrWhole, formatNumber } from '../i18n/format';
import { feedLabel } from '../i18n/feedLabel';
import { Bi, BiRich } from '../i18n/Bi';
import { getActiveLang } from '../i18n/lang';
import { bi } from '../i18n/strings';
import { AnimalPlanCard } from './AnimalPlanCard';
import { FeedName } from './FeedName';
import { Fig } from './Fig';
import { ShoppingList } from './ShoppingList';

interface Props {
  plan: HerdPlan;
  library: FeedItem[];
  breeds: BreedStandard[];
  /** The plan comes from the nearest example, not from this exact herd (prototype only). */
  nearest: boolean;
  onRemoveAnimal: (key: string) => void;
}

/** Screen 3, "Your plan": what to buy, what to give each animal, what is not needed, and the budget prompt. */
export function HerdPlanView({ plan, library, breeds, nearest, onRemoveAnimal }: Props) {
  const byId = useMemo(() => new Map(library.map((f) => [f.id, f])), [library]);
  const labels = useMemo(() => new Map<string, AnimalLabel>(plan.animals.map((a) => [a.key, a.label])), [plan.animals]);

  const notice = (
    <p className="c4-notice" role="note" data-c4="prototype-notice">
      <Bi id="notice_prototype_fixture" />
      {nearest && (
        <>
          {' '}
          <Bi id="c4_notice_nearest" />
        </>
      )}
    </p>
  );

  if (plan.status === 'below_maintenance') {
    const s = plan.shortfall;
    return (
      <>
        {notice}
        <section className="c4-card c4-prompt-card" data-c4="shortfall">
          <p className="c4-prompt-text">
            <BiRich
              id="c4_prompt_short"
              nodes={{
                x: (
                  <Fig inline audit={auditShortfallX(s)}>
                    {formatInrWhole(s.extraInrPerDay)}
                  </Fig>
                ),
              }}
            />
          </p>
        </section>
      </>
    );
  }

  if (plan.status === 'infeasible') {
    return (
      <>
        {notice}
        <section className="c4-card c4-prompt-card" role="alert" data-c4="infeasible">
          <p className="c4-prompt-text">
            <Bi id="c4_infeasible" />
          </p>
        </section>
      </>
    );
  }

  const limits = plan.best.limits;
  const prompt = plan.budgetPrompt;
  return (
    <>
      {notice}

      <ShoppingList shopping={plan.shopping} budgetInrPerDay={plan.budgetInrPerDay} byId={byId} labels={labels} />

      <section className="c4-cards" aria-labelledby="c4-cards-h" data-c4="cards">
        <h2 id="c4-cards-h" className="c4-section-title c4-section-title-plain">
          <Bi id="c4_cards_title" />
        </h2>
        {plan.perAnimal.map((sol) => {
          const animal = plan.animals.find((a) => a.key === sol.key);
          if (!animal) return null;
          return (
            <AnimalPlanCard
              key={sol.key}
              animal={animal}
              sol={sol}
              shareT={plan.best.shareT}
              limits={limits}
              breed={breedById(animal.profile.breedId, breeds)}
              byId={byId}
              canRemove={plan.animals.length >= 2}
              onRemove={() => onRemoveAnimal(sol.key)}
            />
          );
        })}
      </section>

      {plan.notNeeded.length > 0 && (
        <section className="c4-card c4-not-needed" aria-labelledby="c4-nn-h" data-c4="not-needed">
          <h2 id="c4-nn-h" className="c4-section-title">
            <Bi id="c4_not_needed_title" />
          </h2>
          <p className="c4-not-needed-names">
            {plan.notNeeded.map((id, idx) => {
              const feed = byId.get(id);
              if (!feed) return null;
              return (
                <span key={id}>
                  {idx > 0 && ', '}
                  <FeedName feed={feed} />
                </span>
              );
            })}
          </p>
          <p className="field-hint">
            <Bi id="c4_not_needed_hint" />
          </p>
        </section>
      )}

      {prompt && (
        <aside className="c4-card c4-prompt-card" aria-label={bi('c4_prompt_add', { x: formatInrWhole(prompt.extraInrPerDay), y: formatNumber(prompt.targetMilkL, 1) })} data-c4="budget-prompt">
          <p className="c4-prompt-text">
            <BiRich
              id="c4_prompt_add"
              nodes={{
                x: (
                  <Fig inline audit={auditPromptX(prompt)}>
                    {formatInrWhole(prompt.extraInrPerDay)}
                  </Fig>
                ),
                y: (
                  <Fig inline audit={auditPromptY(prompt, labels)}>
                    {formatNumber(prompt.targetMilkL, 1)}
                  </Fig>
                ),
              }}
            />
          </p>
        </aside>
      )}
    </>
  );
}

/** The plain text copied by "Copy summary", in the active language and the main-view units. */
export function buildPlanSummary(plan: HerdPlan, library: FeedItem[]): string {
  const lang = getActiveLang();
  const byId = new Map(library.map((f) => [f.id, f]));
  const name = (id: string) => (byId.has(id) ? feedLabel(byId.get(id)!, lang) : id);
  const rupees = (v: number) => formatInrWhole(roundInrWhole(v));
  const lines: string[] = [`SahiDana · ${bi('c4_summary_title')}`];

  if (plan.status === 'below_maintenance') {
    lines.push(bi('c4_prompt_short', { x: formatInrWhole(plan.shortfall.extraInrPerDay) }));
  } else if (plan.status === 'infeasible') {
    lines.push(bi('c4_infeasible'));
  } else {
    const { shopping } = plan;
    lines.push('', bi('c4_shop_title'));
    if (shopping.buyFirst.length === 0 && shopping.later.length === 0) lines.push(bi('c4_shop_none'));
    else {
      lines.push(bi('c4_shop_first'));
      for (const l of shopping.buyFirst) {
        if (isShownAmount(l.kgPerDay)) lines.push(`- ${name(l.feedId)} ${formatAmount(displayAmount(l.feedId, l.kgPerDay))} (${rupees(l.costInrPerDay)})`);
      }
      if (shopping.later.length > 0) lines.push(bi('c4_shop_later'));
      for (const s of shopping.later) {
        const gain = s.deltaMilkL > 0 ? bi('c4_shop_gain', { l: formatNumber(s.deltaMilkL, 1) }) : bi('c4_shop_same');
        lines.push(`- ${name(s.line.feedId)} ${formatAmount(displayAmount(s.line.feedId, s.line.kgPerDay))} (${rupees(s.line.costInrPerDay)}) ${gain}`);
      }
      lines.push(bi('c4_shop_total', { a: rupees(shopping.totalInr), b: rupees(plan.budgetInrPerDay) }));
    }

    lines.push('', bi('c4_cards_title'));
    for (const sol of plan.perAnimal) {
      const animal = plan.animals.find((a) => a.key === sol.key);
      if (!animal) continue;
      const label = bi(animal.label.species === 'cow' ? 'label_cow_n' : 'label_buffalo_n', { n: animal.label.n });
      const feedsText = sol.solution.feeds
        .filter((l) => isShownAmount(l.kgAsFed))
        .map((l) => `${name(l.feedId)} ${formatAmount(displayAmount(l.feedId, l.kgAsFed))} (${l.source === 'home' ? bi('c4_tag_home') : bi('tag_buy')})`)
        .join(' · ');
      const tail = sol.milkTargetLPerDay === 0 ? bi('c4_card_dry') : bi('c4_card_enough', { l: formatNumber(sol.milkLPerDay, 1) });
      lines.push(`${label}: ${feedsText} — ${tail}`);
    }

    if (plan.notNeeded.length > 0) lines.push('', `${bi('c4_not_needed_title')}: ${plan.notNeeded.map(name).join(', ')}`);
    if (plan.budgetPrompt) {
      lines.push('', bi('c4_prompt_add', { x: formatInrWhole(plan.budgetPrompt.extraInrPerDay), y: formatNumber(plan.budgetPrompt.targetMilkL, 1) }));
    }
  }
  lines.push('', bi('notice_prototype_fixture'));
  return lines.join('\n');
}
