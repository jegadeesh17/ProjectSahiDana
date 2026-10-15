import { forwardRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, Copy, WifiOff } from 'lucide-react';
import requirementsV1 from '../data/requirements.v1.json';
import {
  auditFeedCost,
  auditFeedKg,
  auditRoughageMin,
  auditRoughageShare,
  auditSavings,
  auditTodayCost,
  auditTotalCost,
  auditTotalKg,
} from '../domain/audit';
import {
  auditBreedCap,
  auditMaintenance,
  auditSeason,
  auditSupportedMilk,
  auditUnderBudget,
  bindingName,
  feedLimitNames,
} from '../domain/auditMilk';
import { inSeason } from '../domain/feedGroups';
import { currentMonth } from '../i18n/months';
import { breedById, BREEDS, CAP_BASIS_STRING } from '../domain/breeds';
import type { AnimalProfile, BreedStandard, FeedItem, RationSolution, RationSolveOutcome, RequirementResult } from '../domain/types';
import { auditUserInput } from '../domain/audit';
import { formatDateShort, formatInr, formatLitres, formatNumber, formatPct } from '../i18n/format';
import { Bi, BiRich } from '../i18n/Bi';
import type { BiText, StringId } from '../i18n/strings';
import { t } from '../i18n/strings';
import { litres1 } from '../domain/verdict';
import { getRationAdapterMode } from '../services/rationService';
import { AnimalLine } from './AnimalLine';
import { BudgetShortfallAlert } from './BudgetShortfallAlert';
import type { ExplainState } from './ExplanationCard';
import { ExplanationCard } from './ExplanationCard';
import { FeedChip, FeedName } from './FeedName';
import { Fig } from './Fig';
import { InfeasibilityAlert } from './InfeasibilityAlert';
import { NutrientCoverageBars } from './NutrientCoverageBars';
import { StatusPill } from './StatusPill';
import { SupportsHeadline, VerdictCard } from './VerdictCard';
import { useAudit } from './AuditDrawer';
import { Button } from './ui/button';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from './ui/accordion';
import { BuyLadder } from './BuyLadder';
import { BudgetIncreasePrompt } from './BudgetIncreasePrompt';
import type { RationPlan } from '../domain/rationPlan';

type Profile = Omit<AnimalProfile, 'isConfirmed'>;

interface Props {
  profile: Profile | null;
  requirement: RequirementResult | null;
  outcome: RationSolveOutcome | null;
  plan?: RationPlan | null;
  library: FeedItem[];
  breeds?: BreedStandard[];
  online: boolean;
  explain: ExplainState;
  nextStep: StringId;
  onExplain: () => void;
  onCopy: () => void;
  onAddFeed: (feedId: string) => void;
}

function StatusLine({ outcome }: { outcome: RationSolveOutcome | null }) {
  let text = t('status_line_idle');
  let state = 'idle';
  if (outcome?.status === 'optimal') {
    const mins = (['CP', 'ME', 'Ca', 'P'] as const).filter((n) => outcome.coveragePct[n] >= 100 - 1e-6).length;
    const met = mins + (outcome.coveragePct.DM <= 100 + 1e-6 ? 1 : 0);
    text = t('status_line_optimal', { met, total: 5, date: formatDateShort(outcome.solvedOn) });
    state = 'optimal';
  } else if (outcome?.status === 'infeasible') {
    text = t('status_line_infeasible', {
      n: Math.max(1, outcome.limitingNutrients.length),
      date: formatDateShort(outcome.checkedOn),
    });
    state = 'infeasible';
  } else if (outcome?.status === 'budget_below_maintenance') {
    text = t('status_line_budget_low', { date: formatDateShort(outcome.checkedOn) });
    state = 'shortfall';
  }
  return (
    <p className="statusline" data-state={state} data-testid="status-line">
      <Bi text={text} />
    </p>
  );
}

/** Kilograms: two decimals, three below 0.1 kg so a pinch of mineral mix does not read as 0.00. */
const kgDecimals = (kg: number): 2 | 3 => (kg < 0.1 ? 3 : 2);

function DetailRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Behind "Show details": how the numbers came about, then the nutrient bars. Every figure still opens its working. */
function Details({
  solution,
  profile,
  requirement,
  library,
  breeds = BREEDS,
}: {
  solution: RationSolution;
  profile: Profile;
  requirement: RequirementResult;
  library: FeedItem[];
  breeds?: BreedStandard[];
}) {
  const byId = new Map(library.map((f) => [f.id, f]));
  const breed = breedById(profile.breedId, breeds);
  const savings = auditSavings(solution);
  const today = auditTodayCost(solution);
  const limits: BiText[] = [bindingName(solution.bindingConstraint), ...feedLimitNames(solution, byId)];
  const limitedBy = limits.reduce((a, b) => ({ hi: `${a.hi}, ${b.hi}`, en: `${a.en}, ${b.en}` }));
  const dry = solution.verdict.kind === 'dry_animal';
  return (
    <div className="details" id="result-details">
      <dl className="detail-list">
        {!dry && (
          <>
            <DetailRow label={<Bi id="label_stage1" />}>
              <Fig audit={auditSupportedMilk(solution, byId)}>{litres1(solution.supportedMilkLPerDay)}</Fig>
              <span className="detail-note">
                <Bi id="label_limited_by" />: <Bi text={limitedBy} />
              </span>
            </DetailRow>
            {breed && (
              <DetailRow label={<Bi id="label_cap_and_basis" />}>
                <Fig audit={auditBreedCap(breed, profile.milkYieldLitersPerDay)}>{formatLitres(solution.effectiveCapLPerDay, 2)}</Fig>
                <span className="detail-note">
                  <Bi id={CAP_BASIS_STRING[breed.capBasis]} />
                </span>
              </DetailRow>
            )}
          </>
        )}
        <DetailRow label={<Bi id="label_stage2" />}>
          <Fig audit={auditTotalCost(solution)}>{formatInr(solution.totalCostInr)}</Fig>
        </DetailRow>
        <DetailRow label={<Bi id="label_maintenance_cost" />}>
          <Fig audit={auditMaintenance(solution.maintenanceCostInrPerDay, solution.sourceKey)}>
            {formatInr(solution.maintenanceCostInrPerDay)}
          </Fig>
        </DetailRow>
        <DetailRow label={<Bi id="label_budget_used" />}>
          <Fig audit={auditUserInput('in-budget', t('label_budget'), formatInr(solution.budgetInrPerDay), solution.budgetInrPerDay)}>
            {formatInr(solution.budgetInrPerDay)}
          </Fig>
        </DetailRow>
        <DetailRow label={<Bi id="label_roughage_row" />}>
          <Fig audit={auditRoughageShare(solution, library)}>{formatPct(solution.roughageSharePct, 0)}</Fig>
          <span className="detail-note">
            <BiRich
              id="label_roughage_min"
              nodes={{
                min: (
                  <Fig inline audit={auditRoughageMin(solution.roughageMinSharePct)}>
                    {formatPct(solution.roughageMinSharePct, 0)}
                  </Fig>
                ),
              }}
            />
            {' · '}
            <span lang="en" data-lang-exempt="citation">
              {requirementsV1.roughageMinShareOfDm.citation.doc} ({requirementsV1.roughageMinShareOfDm.citation.page})
            </span>
          </span>
        </DetailRow>
        {today && savings && solution.savingsInr !== null && (
          <DetailRow label={<Bi id="label_today_cost" />}>
            <Fig audit={today}>{formatInr(solution.currentCostInr ?? 0)}</Fig>
          </DetailRow>
        )}
      </dl>
      <NutrientCoverageBars requirement={requirement} solution={solution} feeds={library} />
    </div>
  );
}

function SolvedBody({
  solution,
  profile,
  requirement,
  plan = null,
  library,
  breeds = BREEDS,
}: {
  solution: RationSolution;
  profile: Profile;
  requirement: RequirementResult;
  plan?: RationPlan | null;
  library: FeedItem[];
  breeds?: BreedStandard[];
}) {
  const [details, setDetails] = useState(false);
  const { open } = useAudit();
  const thisMonth = currentMonth();
  const byId = new Map(library.map((f) => [f.id, f]));
  const breed = breedById(profile.breedId, breeds);
  const dry = solution.verdict.kind === 'dry_animal';
  const under = solution.budgetInrPerDay - solution.totalCostInr;
  const atBudget = under <= 0.005;
  const savings = auditSavings(solution);
  const saved = solution.savingsInr !== null && solution.savingsInr >= 0;

  return (
    <div className="solved" key={`solved-${solution.totalCostInr}-${solution.supportedMilkLPerDay}`}>
      {breed && !dry && <SupportsHeadline solution={solution} profile={profile} breed={breed} library={library} />}
      {breed && <VerdictCard solution={solution} profile={profile} breed={breed} library={library} />}

      <BudgetIncreasePrompt
        increase={plan?.budgetIncrease ?? null}
        solution={solution}
        breed={breed}
        todayMilk={profile.milkYieldLitersPerDay}
      />

      {(!solution.feeds.some((f) => f.feedId === 'mineral_mix' && f.kgAsFed > 0) ||
        !solution.feeds.some((f) => f.feedId === 'common_salt' && f.kgAsFed > 0)) && (
        <div className="banner banner-warn my-2 p-3 rounded-lg border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20" data-testid="mineral-advisory-warning">
          <p className="font-semibold text-xs text-amber-800 dark:text-amber-200">
            <Bi id="warning_mineral_missing_title" />
          </p>
          <p className="text-xs text-amber-700/90 dark:text-amber-300/80 mt-1">
            <Bi id="warning_mineral_missing_body" />
          </p>
        </div>
      )}

      <div className="ration" data-testid="mrp">
        <h3 className="ration-title">
          <Bi id="label_ration" />
        </h3>
        <table className="ration-table">
          <caption className="sr-only">
            <Bi id="label_ration_analysis" />
          </caption>
          <thead>
            <tr>
              <th scope="col">
                <Bi id="label_feed" />
              </th>
              <th scope="col" className="r">
                <Bi id="label_col_kg" />
              </th>
              <th scope="col" className="r">
                <Bi id="label_col_cost" />
              </th>
            </tr>
          </thead>
          <tbody>
            {solution.feeds.map((line) => {
              const feed = byId.get(line.feedId);
              if (!feed) return null;
              const isBuy = plan ? plan.buyFeedIds.includes(line.feedId) : false;
              return (
                <tr key={line.feedId} data-feed={line.feedId}>
                  <th scope="row">
                    <span className="rowname flex items-center gap-1.5 flex-wrap">
                      <FeedChip feed={feed} />
                      <FeedName feed={feed} />
                      {line.kgAsFed > 0 && (
                        isBuy ? (
                          <span className="tag tag-buy" data-tag="buy">
                            <Bi id="tag_buy" />
                          </span>
                        ) : (
                          <span className="tag tag-you-have" data-tag="you-have">
                            <Bi id="tag_you_have" />
                          </span>
                        )
                      )}
                      {!inSeason(feed, thisMonth) && (
                        <button
                          type="button"
                          className="pill pill-warn pill-btn ml-1"
                          data-season="out"
                          aria-haspopup="dialog"
                          onClick={() => open(auditSeason(feed))}
                        >
                          <Bi id="state_out_of_season" />
                        </button>
                      )}
                    </span>
                  </th>
                  <td className="r">
                    <Fig
                      audit={auditFeedKg(feed, line.kgAsFed, line.atCap, solution)}
                      data-lang-exempt={feed.localNameDeva === null ? 'feed-no-deva' : undefined}
                    >
                      {formatNumber(line.kgAsFed, kgDecimals(line.kgAsFed))}
                    </Fig>
                  </td>
                  <td className="r">
                    <Fig
                      audit={auditFeedCost(feed, line.kgAsFed, line.priceInrPerKg, line.costInr, solution)}
                      data-lang-exempt={feed.localNameDeva === null ? 'feed-no-deva' : undefined}
                    >
                      {formatNumber(line.costInr, 2)}
                    </Fig>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">
                <Bi id="label_total" />
              </th>
              <td className="r">
                <Fig audit={auditTotalKg(solution)}>{formatNumber(solution.totalKgAsFed, 2)}</Fig>
              </td>
              <td className="r">
                <Fig audit={auditTotalCost(solution)}>{formatNumber(solution.totalCostInr, 2)}</Fig>
              </td>
            </tr>
          </tfoot>
        </table>

        <ul className="cost-notes">
          <li data-testid="cost-budget">
            {atBudget ? (
              <BiRich id="cost_at_budget" nodes={{ budget: <span className="num">{formatInr(solution.budgetInrPerDay)}</span> }} />
            ) : (
              <BiRich
                id="cost_under_budget"
                nodes={{
                  amount: (
                    <Fig inline audit={auditUnderBudget(solution)}>
                      {formatInr(under)}
                    </Fig>
                  ),
                  budget: <span className="num">{formatInr(solution.budgetInrPerDay)}</span>,
                }}
              />
            )}
          </li>
          {savings && solution.savingsInr !== null && solution.currentCostInr !== null && (
            <li data-tone={saved ? 'good' : 'warn'} data-testid="cost-today">
              <BiRich
                id={saved ? 'cost_vs_today_less' : 'cost_vs_today_more'}
                nodes={{
                  amount: (
                    <Fig inline audit={savings}>
                      {formatInr(Math.abs(solution.savingsInr))}
                    </Fig>
                  ),
                  pct: <span className="num">{formatPct(Math.abs(solution.savingsPct ?? 0), 1)}</span>,
                  today: <span className="num">{formatInr(solution.currentCostInr)}</span>,
                }}
              />
            </li>
          )}
        </ul>

        {plan && plan.notNeededFeedIds.length > 0 && (
          <p className="not-needed" data-testid="not-needed">
            <strong className="not-needed-label">
              <Bi id="label_not_needed" />
            </strong>{' '}
            {plan.notNeededFeedIds.map((id, idx) => {
              const feed = byId.get(id);
              if (!feed) return null;
              return (
                <span key={id} className="not-needed-feed">
                  {idx > 0 && ', '}
                  <FeedName feed={feed} />
                </span>
              );
            })}
          </p>
        )}
      </div>

      {plan && (
        <BuyLadder plan={plan} profile={profile} library={library} ownedFeedIds={plan.ownedFeedIds} />
      )}

      <Accordion
        type="single"
        collapsible
        value={details ? 'details' : ''}
        onValueChange={(val) => setDetails(val === 'details')}
      >
        <AccordionItem value="details">
          <AccordionTrigger
            className="btn btn-quiet details-toggle"
            aria-controls="result-details"
          >
            <ChevronDown size={18} strokeWidth={2} aria-hidden="true" />
            <Bi id={details ? 'action_hide_details' : 'action_show_details'} />
          </AccordionTrigger>
          <AccordionContent>
            <Details solution={solution} profile={profile} requirement={requirement} library={library} breeds={breeds} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

export const RationResultsPanel = forwardRef<HTMLElement, Props>(function RationResultsPanel(
  { profile, requirement, outcome, plan = null, library, breeds = BREEDS, online, explain, nextStep, onExplain, onCopy, onAddFeed },
  ref,
) {
  const solved = outcome?.status === 'optimal' ? outcome : null;
  let body: ReactNode;
  let state = 'idle';
  if (solved && requirement && profile) {
    state = 'solved';
    body = <SolvedBody solution={solved} profile={profile} requirement={requirement} plan={plan} library={library} breeds={breeds} />;
  } else if (outcome?.status === 'infeasible' && requirement) {
    state = 'infeasible';
    body = <InfeasibilityAlert report={outcome} requirement={requirement} library={library} onAddFeed={onAddFeed} />;
  } else if (outcome?.status === 'budget_below_maintenance') {
    state = 'shortfall';
    body = <BudgetShortfallAlert report={outcome} library={library} onAddFeed={onAddFeed} />;
  } else {
    body = (
      <div className="idle">
        <p className="idle-title">
          <Bi id="state_idle_title" />
        </p>
        <p>
          <Bi id="notice_idle_body" />
        </p>
        <p className="idle-next">
          <Bi id={nextStep} />
        </p>
        {requirement && (
          <>
            <p className="idle-sub">
              <Bi id="label_requirement_only" />
            </p>
            <NutrientCoverageBars requirement={requirement} solution={null} feeds={library} />
          </>
        )}
      </div>
    );
  }

  return (
    <section ref={ref} id="analysis" tabIndex={-1} className="frame" data-state={state} aria-labelledby="analysis-h">
      <header className="frame-band">
        <h2 id="analysis-h" className="frame-title">
          <Bi id="label_ration_analysis" />
        </h2>
      </header>
      <div className="frame-sub">
        <AnimalLine profile={profile} />
        {solved && <StatusPill id="stamp_balanced" tone="ok" />}
        {(solved || outcome?.status === 'infeasible' || outcome?.status === 'budget_below_maintenance') && (
          <p className="frame-hint">
            <Bi id="hint_tap_figure" />
          </p>
        )}
      </div>
      <div className="frame-body">{body}</div>
      <StatusLine outcome={outcome} />
      {solved && (
        <>
          <div className="frame-actions">
            <div className="action-cell">
              <Button
                onClick={onExplain}
                disabled={!online || explain.kind === 'loading'}
                aria-describedby={!online ? 'explain-offline' : undefined}
              >
                <Bi id="action_explain" />
              </Button>
              {!online && (
                <span id="explain-offline" className="tag tag-offline">
                  <WifiOff size={18} strokeWidth={2} aria-hidden="true" />
                  <Bi id="notice_needs_internet" />
                </span>
              )}
            </div>
            <div className="action-cell">
              <Button onClick={onCopy}>
                <Copy size={18} strokeWidth={2} aria-hidden="true" />
                <Bi id="action_copy_summary" />
              </Button>
            </div>
          </div>
          <ExplanationCard state={explain} />
        </>
      )}
      {getRationAdapterMode() === 'mock' && (
        <p className="frame-foot">
          <Bi id="notice_prototype_fixture" />
        </p>
      )}
    </section>
  );
});
