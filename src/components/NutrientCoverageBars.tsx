import { auditCoverage, auditRequirement, auditSupplied } from '../domain/audit';
import { NUTRIENT_STRING_ID } from '../domain/feedNames';
import { formatNutrient, REQ_FIELD } from '../domain/nutrition';
import type { FeedItem, NutrientKey, RationSolution, RequirementResult } from '../domain/types';
import { NUTRIENT_KEYS } from '../domain/types';
import { formatPct } from '../i18n/format';
import { Bi } from '../i18n/Bi';
import { Fig } from './Fig';
import { StatusPill } from './StatusPill';

interface Props {
  requirement: RequirementResult;
  solution: RationSolution | null;
  feeds: FeedItem[];
}

/** The bar's scale runs 0 to 120% so the 100% mark sits inside the track; the fill grows once when the result appears. */
const SCALE_MAX = 120;

export function NutrientCoverageBars({ requirement, solution, feeds }: Props) {
  return (
    <ul className="nutrients">
      {NUTRIENT_KEYS.map((n: NutrientKey) => {
        const isDm = n === 'DM';
        const required = requirement.requirements[REQ_FIELD[n]];
        const coverage = solution ? solution.coveragePct[n] : null;
        const fill = coverage === null ? 0 : Math.min(coverage, SCALE_MAX) / SCALE_MAX;
        // Dry matter is a ceiling; the other four are minimums.
        const met = coverage === null ? null : isDm ? coverage <= 100 + 1e-6 : coverage >= 100 - 1e-6;
        return (
          <li key={n} className="nutrient" data-nutrient={n}>
            <div className="nutrient-head">
              <span className="nutrient-name">
                <span className="nutrient-abbr">{n}</span>
                <Bi id={NUTRIENT_STRING_ID[n]} />
              </span>
              <span className="nutrient-pct">
                {solution && coverage !== null ? (
                  <Fig audit={auditCoverage(n, solution, requirement)}>{formatPct(coverage, 0)}</Fig>
                ) : (
                  <span className="num muted">—</span>
                )}
              </span>
            </div>
            <div
              className="bar"
              data-met={met === null ? undefined : String(met)}
              role="meter"
              aria-valuemin={0}
              aria-valuemax={SCALE_MAX}
              aria-valuenow={coverage === null ? 0 : Math.round(Math.min(coverage, SCALE_MAX))}
              aria-label={`${n}: ${coverage === null ? '—' : formatPct(coverage, 0)}`}
            >
              <span className={`bar-fill${isDm ? ' bar-fill-limit' : ''}`} style={{ width: `${fill * 100}%` }} />
              <span className="bar-mark" style={{ left: `${(100 / SCALE_MAX) * 100}%` }} aria-hidden="true" />
            </div>
            <dl className="nutrient-figs">
              <div>
                <dt>
                  <Bi id={isDm ? 'label_limit' : 'label_required'} />
                </dt>
                <dd>
                  <Fig audit={auditRequirement(n, requirement)}>{formatNutrient(n, required)}</Fig>
                </dd>
              </div>
              <div>
                <dt>
                  <Bi id={isDm ? 'label_used' : 'label_supplied'} />
                </dt>
                <dd>
                  {solution ? (
                    <Fig audit={auditSupplied(n, solution, feeds, requirement)}>{formatNutrient(n, solution.supplied[REQ_FIELD[n]])}</Fig>
                  ) : (
                    <span className="num muted">—</span>
                  )}
                </dd>
              </div>
              {met !== null && (
                <div className="nutrient-state">
                  <StatusPill id={met ? (isDm ? 'state_within_limit' : 'state_met') : isDm ? 'label_over_limit' : 'state_short'} tone={met ? 'ok' : 'warn'} />
                </div>
              )}
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
