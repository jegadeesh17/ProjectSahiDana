import { forwardRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  auditFeedCost,
  auditFeedKg,
  auditRoughageShare,
  auditSavings,
  auditTodayCost,
  auditTotalCost,
  auditTotalKg,
} from '../domain/audit';
import {
  auditBreedCap,
  auditMaintenance,
  auditSupportedMilk,
  auditUnderBudget,
  bindingName,
  feedLimitNames,
} from '../domain/auditMilk';
import { breedById, CAP_BASIS_STRING } from '../domain/breeds';
import type { AnimalProfile, FeedItem, RationSolution, RationSolveOutcome, RequirementResult } from '../domain/types';
import { auditUserInput } from '../domain/audit';
import { formatDateShort, formatInr, formatLitres, formatNumber, formatPct } from '../i18n/format';
import { Bi, BiRich } from '../i18n/Bi';
import type { BiText, StringId } from '../i18n/strings';
import { t } from '../i18n/strings';
import { litres1 } from '../domain/verdict';
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

type Profile = Omit<AnimalProfile, 'isConfirmed'>;

interface Props {
  profile: Profile | null;
  requirement: RequirementResult | null;
  outcome: RationSolveOutcome | null;
  library: FeedItem[];
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
}: {
  solution: RationSolution;
  profile: Profile;
  requirement: RequirementResult;
  library: FeedItem[];
}) {
  const byId = new Map(library.map((f) => [f.id, f]));
  const breed = breedById(profile.breedId);
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
            <Bi id="label_roughage_min" params={{ min: formatPct(solution.roughageMinSharePct, 0) }} />
            {' · '}
            <Bi id="audit_roughage_fixture" />
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
  library,
}: {
  solution: RationSolution;
  profile: Profile;
  requirement: RequirementResult;
  library: FeedItem[];
}) {
  const [details, setDetails] = useState(false);
  const byId = new Map(library.map((f) => [f.id, f]));
  const breed = breedById(profile.breedId);
  const dry = solution.verdict.kind === 'dry_animal';
  // These two verdicts open with "This budget supports ..." themselves, so the headline would say it twice.
  const verdictLeads = solution.verdict.kind === 'below_today' || solution.verdict.kind === 'same_as_today';
  const under = solution.budgetInrPerDay - solution.totalCostInr;
  const atBudget = under <= 0.005;
  const savings = auditSavings(solution);
  const saved = solution.savingsInr !== null && solution.savingsInr >= 0;

  return (
    <div className="solved" key={`solved-${solution.totalCostInr}-${solution.supportedMilkLPerDay}`}>
      {breed && !dry && !verdictLeads && <SupportsHeadline solution={solution} profile={profile} breed={breed} library={library} />}
      {breed && <VerdictCard solution={solution} profile={profile} breed={breed} library={library} />}

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
              return (
                <tr key={line.feedId} data-feed={line.feedId}>
                  <th scope="row">
                    <span className="rowname">
                      <FeedChip feed={feed} />
                      <FeedName feed={feed} />
                    </span>
                  </th>
                  <td className="r">
                    <Fig audit={auditFeedKg(feed, line.kgAsFed, line.atCap, solution)}>
                      {formatNumber(line.kgAsFed, kgDecimals(line.kgAsFed))}
                    </Fig>
                  </td>
                  <td className="r">
                    <Fig audit={auditFeedCost(feed, line.kgAsFed, line.priceInrPerKg, line.costInr, solution)}>
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
      </div>

      <button
        type="button"
        className="btn btn-quiet details-toggle"
        aria-expanded={details}
        aria-controls="result-details"
        onClick={() => setDetails(!details)}
      >
        <Bi id={details ? 'action_hide_details' : 'action_show_details'} />
      </button>
      {details && <Details solution={solution} profile={profile} requirement={requirement} library={library} />}
    </div>
  );
}

export const RationResultsPanel = forwardRef<HTMLElement, Props>(function RationResultsPanel(
  { profile, requirement, outcome, library, online, explain, nextStep, onExplain, onCopy, onAddFeed },
  ref,
) {
  const solved = outcome?.status === 'optimal' ? outcome : null;
  let body: ReactNode;
  let state = 'idle';
  if (solved && requirement && profile) {
    state = 'solved';
    body = <SolvedBody solution={solved} profile={profile} requirement={requirement} library={library} />;
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
              <button
                type="button"
                className="btn"
                onClick={onExplain}
                disabled={!online || explain.kind === 'loading'}
                aria-describedby={!online ? 'explain-offline' : undefined}
              >
                <Bi id="action_explain" />
              </button>
              {!online && (
                <span id="explain-offline" className="tag tag-offline">
                  <Bi id="notice_needs_internet" />
                </span>
              )}
            </div>
            <div className="action-cell">
              <button type="button" className="btn" onClick={onCopy}>
                <Bi id="action_copy_summary" />
              </button>
            </div>
          </div>
          <ExplanationCard state={explain} />
        </>
      )}
      <p className="frame-foot">
        <Bi id="notice_prototype_fixture" />
      </p>
    </section>
  );
});
