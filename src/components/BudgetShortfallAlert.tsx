import { auditRaiseToMaintenance, auditShortfall } from '../domain/auditMilk';
import { feedNameBi } from '../domain/feedNames';
import { roundUpInr } from '../domain/rationPlan';
import type { BudgetShortfallReport, FeedItem } from '../domain/types';
import { formatInr, formatInrPerKg } from '../i18n/format';
import { Bi, BiRich } from '../i18n/Bi';
import { Fig } from './Fig';
import { FeedChip, FeedName } from './FeedName';
import { StatusPill } from './StatusPill';
import { Button } from './ui/button';

interface Props {
  report: BudgetShortfallReport;
  library: FeedItem[];
  onAddFeed: (feedId: string) => void;
}

/** AC-E7.1, AC-C3-2.14: the feeds can meet maintenance, but not within this budget. No ration and no milk figure. */
export function BudgetShortfallAlert({ report, library, onAddFeed }: Props) {
  const fix = report.fixFeedId ? library.find((f) => f.id === report.fixFeedId) : undefined;
  const extraInrPerDay = roundUpInr(report.verdict.maintenanceCostInrPerDay - report.verdict.budgetInrPerDay);

  return (
    <div className="infeasible shortfall" role="alert" data-state="shortfall">
      <div className="infeasible-head">
        <StatusPill id="stamp_budget_low" tone="warn" size="lg" />
        <h3 className="infeasible-title">
          <BiRich
            id="verdict_shortfall"
            nodes={{
              m: (
                <Fig inline audit={auditShortfall(report)}>
                  {formatInr(report.verdict.maintenanceCostInrPerDay)}
                </Fig>
              ),
            }}
          />
        </h3>
      </div>
      <p>
        <Bi id="notice_shortfall_body" />
      </p>
      <p className="shortfall-raise" data-testid="shortfall-raise">
        <BiRich
          id="notice_raise_budget_by"
          nodes={{
            amount: (
              <Fig inline audit={auditRaiseToMaintenance(report, extraInrPerDay)}>
                {formatInr(extraInrPerDay)}
              </Fig>
            ),
          }}
        />
      </p>
      <div className="inf-group">
        {fix && fix.defaultPriceInrPerKgAsFed !== null && report.maintenanceWithFixInrPerDay !== null ? (
          <>
            <h4 className="inf-sub">
              <Bi id="label_cheaper_feed" />
            </h4>
            <ul className="suggest">
              <li className="suggest-row">
                <FeedChip feed={fix} />
                <span className="suggest-name">
                  <FeedName feed={fix} />
                  <span className="suggest-why">
                    <Bi
                      id="notice_shortfall_fix"
                      params={{
                        feed: feedNameBi(fix),
                        price: formatInrPerKg(fix.defaultPriceInrPerKgAsFed),
                        cost: formatInr(report.maintenanceWithFixInrPerDay),
                      }}
                    />
                  </span>
                </span>
                <Button size="sm" onClick={() => onAddFeed(fix.id)}>
                  <Bi id="action_add_feed" />
                </Button>
              </li>
            </ul>
          </>
        ) : (
          <p className="notice">
            <Bi id="notice_shortfall_nofix" />
          </p>
        )}
      </div>
    </div>
  );
}
