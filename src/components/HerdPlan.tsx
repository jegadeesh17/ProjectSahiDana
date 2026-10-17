import { useMemo } from 'react';
import { auditPromptX, auditPromptY, auditSeasonSet, auditShortfallX } from '../domain/auditHerd';
import { breedById } from '../domain/breeds';
import type { AnimalLabel, BreedStandard, FeedItem, HerdPlan } from '../domain/types';
import { formatInrWhole, formatNumber } from '../i18n/format';
import { Bi, BiRich } from '../i18n/Bi';
import { useLang } from '../i18n/LanguageProvider';
import { monthName } from '../i18n/months';
import { bi } from '../i18n/strings';
import { buildHerdSummary } from '../domain/summary';
import { AnimalPlanCard } from './AnimalPlanCard';
import { FeedName } from './FeedName';
import { Fig } from './Fig';
import { ShoppingList } from './ShoppingList';

interface Props {
  plan: HerdPlan;
  library: FeedItem[];
  breeds: BreedStandard[];
  onRemoveAnimal: (key: string) => void;
  onEditAnimal?: (key: string) => void;
  onAddHomeFeed?: (feedId: string) => void;
  onAddBudget?: (deltaInr: number) => void;
}

/** Screen 3, "Your plan": season line, what to buy, what to give each animal, what is not needed, and the budget prompt. */
export function HerdPlanView({ plan, library, breeds, onRemoveAnimal, onAddBudget }: Props) {
  const { lang } = useLang();
  const byId = useMemo(() => new Map(library.map((f) => [f.id, f])), [library]);
  const labels = useMemo(() => new Map<string, AnimalLabel>(plan.animals.map((a) => [a.key, a.label])), [plan.animals]);

  const day = parseInt(plan.planDate.split('-')[2] ?? '1', 10);
  const dateStr = `${day} ${monthName(plan.month, lang)}`;
  const seasonLine = (
    <p className="c4-season-line" data-c4="season-line">
      <BiRich
        id="c4_season_line"
        nodes={{
          date: (
            <Fig inline audit={auditSeasonSet(plan, library)}>
              {dateStr}
            </Fig>
          ),
        }}
      />
    </p>
  );

  if (plan.status === 'below_maintenance') {
    const s = plan.shortfall;
    return (
      <>
        {seasonLine}
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
        {seasonLine}
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
      {seasonLine}

      <ShoppingList
        shopping={plan.shopping}
        budgetInrPerDay={plan.budgetInrPerDay}
        byId={byId}
        labels={labels}
        isDryHerd={plan.perAnimal.length > 0 && plan.perAnimal.every((a) => a.milkTargetLPerDay === 0)}
        expansions={plan.expansionItems}
        onAddBudget={onAddBudget}
      />

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
  return buildHerdSummary(plan, library);
}
