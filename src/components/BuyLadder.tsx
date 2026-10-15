import type { AnimalProfile, FeedItem, RationSolution } from '../domain/types';
import type { RationPlan } from '../domain/rationPlan';
import { auditRung } from '../domain/auditMilk';
import { formatInr } from '../i18n/format';
import { Bi } from '../i18n/Bi';
import { FeedName } from './FeedName';
import { Fig } from './Fig';
import { litres1 } from '../domain/verdict';

interface BuyLadderProps {
  plan: RationPlan;
  profile: AnimalProfile | Omit<AnimalProfile, 'isConfirmed'>;
  library: FeedItem[];
  ownedFeedIds?: string[];
}

export function BuyLadder({ plan, profile, library, ownedFeedIds }: BuyLadderProps) {
  const byId = new Map(library.map((f) => [f.id, f]));
  const dry = profile.milkYieldLitersPerDay === 0;
  const hasOwned = plan.ownedOnly !== null;
  const hasRungs = plan.rungs.length > 0;

  // If there are no owned feeds and no buy rungs, nothing to render
  if (!hasOwned && !hasRungs) return null;

  const resolvedOwnedIds =
    ownedFeedIds ??
    (hasRungs && plan.rungs[0].prefixFeedIds.length > plan.rungs[0].addedFeedIds.length
      ? plan.rungs[0].prefixFeedIds.slice(0, plan.rungs[0].prefixFeedIds.length - plan.rungs[0].addedFeedIds.length)
      : plan.candidates.filter((c) => !plan.buyFeedIds.includes(c.feedId)).map((c) => c.feedId));

  // Check if rung 0 shows more milk than rung 1 (AC-C3-2.8)
  const rung0Optimal = plan.ownedOnly?.status === 'optimal';
  const rung0Solution = rung0Optimal ? (plan.ownedOnly as RationSolution) : null;
  const rung0Milk = rung0Solution
    ? (rung0Solution.supportedMilkExactLPerDay ?? rung0Solution.supportedMilkLPerDay)
    : 0;
  const rung1Optimal = hasRungs && plan.rungs[0].outcome.status === 'optimal';
  const rung1Solution = rung1Optimal ? (plan.rungs[0].outcome as RationSolution) : null;
  const rung1Milk = rung1Solution
    ? (rung1Solution.supportedMilkExactLPerDay ?? rung1Solution.supportedMilkLPerDay)
    : 0;
  const showBasicsNote = !dry && rung0Optimal && hasRungs && rung0Milk > rung1Milk + 1e-6;

  return (
    <div className="buy-ladder" data-testid="buy-ladder">
      <h3 className="ladder-title">
        <Bi id="ladder_title" />
      </h3>

      <div className="ladder-list">
        {hasOwned && (
          <div className="ladder-rung" data-rung="0">
            <div className="rung-info">
              <span className="rung-title">
                <Bi id={rung0Optimal ? 'ladder_rung_0' : 'ladder_rung_0_unbalanced'} />
              </span>
            </div>
            {rung0Solution ? (
              <div className="rung-figures">
                {!dry && (
                  <span className="rung-milk num">
                    <Fig audit={auditRung(rung0Solution, resolvedOwnedIds, 'milk', byId)}>
                      {litres1(rung0Solution.supportedMilkLPerDay)}
                    </Fig>
                  </span>
                )}
                <span className="rung-cost num">
                  <Fig audit={auditRung(rung0Solution, resolvedOwnedIds, 'cost', byId)}>
                    {formatInr(rung0Solution.totalCostInr)}
                  </Fig>
                </span>
              </div>
            ) : null}
          </div>
        )}

        {showBasicsNote && (
          <p className="ladder-note" data-testid="ladder-note-basics">
            <Bi id="ladder_rung_0_note" />
          </p>
        )}

        {plan.rungs.map((rung, idx) => {
          const rungNum = idx + 1;
          const isOptimal = rung.outcome.status === 'optimal';
          const rungSolution = isOptimal ? (rung.outcome as RationSolution) : null;
          return (
            <div
              key={rung.prefixFeedIds.join('-')}
              className="ladder-rung"
              data-rung={rungNum}
            >
              <div className="rung-info">
                <span className="rung-badge">
                  <Bi id="ladder_rung_step" params={{ n: rungNum }} />
                </span>
                <span className="rung-feeds">
                  {rung.addedFeedIds.map((feedId, fIdx) => {
                    const feed = byId.get(feedId);
                    if (!feed) return null;
                    return (
                      <span key={feedId} className="rung-feed-name">
                        {fIdx > 0 && ', '}
                        <FeedName feed={feed} />
                      </span>
                    );
                  })}
                </span>
              </div>
              {rungSolution && (
                <div className="rung-figures">
                  {!dry && (
                    <span className="rung-milk num">
                      <Fig audit={auditRung(rungSolution, rung.prefixFeedIds, 'milk', byId)}>
                        {litres1(rungSolution.supportedMilkLPerDay)}
                      </Fig>
                    </span>
                  )}
                  <span className="rung-cost num">
                    <Fig audit={auditRung(rungSolution, rung.prefixFeedIds, 'cost', byId)}>
                      {formatInr(rungSolution.totalCostInr)}
                    </Fig>
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
