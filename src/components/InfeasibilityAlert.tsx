import { auditLimitingRequirement, auditMaxSupply } from '../domain/audit';
import { LIMIT_STRING_ID } from '../domain/feedNames';
import { formatLimit } from '../domain/nutrition';
import type { FeedItem, InfeasibilityReport, RequirementResult } from '../domain/types';
import { Bi } from '../i18n/Bi';
import { t } from '../i18n/strings';
import { Fig } from './Fig';
import { FeedChip, FeedName } from './FeedName';
import { StatusPill } from './StatusPill';
import { Button } from './ui/button';

interface Props {
  report: InfeasibilityReport;
  requirement: RequirementResult;
  library: FeedItem[];
  onAddFeed: (feedId: string) => void;
}

/** E2: names the limiting nutrient and a library feed that fixes it. Never shows a partial ration. */
export function InfeasibilityAlert({ report, requirement, library, onAddFeed }: Props) {
  const byId = new Map(library.map((f) => [f.id, f]));
  return (
    <div className="infeasible" role="alert" data-state="infeasible">
      <div className="infeasible-head">
        <StatusPill id="stamp_infeasible" tone="danger" size="lg" />
        <h3 className="infeasible-title">
          <Bi id="label_infeasible_title" />
        </h3>
      </div>
      <p>
        <Bi id="notice_infeasible_body" />
      </p>
      {report.dmConflict && report.limitingNutrients.length === 0 && (
        <p className="notice">
          <Bi id="notice_dm_conflict" />
        </p>
      )}

      {report.limitingNutrients.length > 0 && (
        <div className="inf-group">
          <h4 className="inf-sub">
            <Bi id="label_limiting" />
          </h4>
          <ul className="limiting">
            {report.limitingNutrients.map((item) => (
              <li key={item.nutrient} className="limiting-row" data-nutrient={item.nutrient}>
                <span className="nutrient-name">
                  {item.nutrient !== 'roughage' && <span className="nutrient-abbr">{item.nutrient}</span>}
                  <Bi id={LIMIT_STRING_ID[item.nutrient]} />
                </span>
                <dl className="nutrient-figs">
                  <div>
                    <dt>
                      <Bi id="label_need" />
                    </dt>
                    <dd>
                      <Fig audit={auditLimitingRequirement(item, requirement)}>{formatLimit(item.nutrient, item.required)}</Fig>
                    </dd>
                  </div>
                  <div>
                    <dt>
                      <Bi id="label_can_supply" />
                    </dt>
                    <dd>
                      <Fig audit={auditMaxSupply(item)}>{formatLimit(item.nutrient, item.maxSupply)}</Fig>
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.suggestedFeeds.length > 0 && (
        <div className="inf-group">
          <h4 className="inf-sub">
            <Bi id="label_suggested_feeds" />
          </h4>
          <ul className="suggest">
            {report.suggestedFeeds.map((s) => {
              const feed = byId.get(s.feedId);
              if (!feed) return null;
              return (
                <li key={s.feedId} className="suggest-row">
                  <FeedChip feed={feed} />
                  <span className="suggest-name">
                    <FeedName feed={feed} />
                    <span className="suggest-why">
                      {s.nutrients.includes('roughage') ? (
                        <Bi id="label_roughage_feed_why" />
                      ) : (
                        <Bi text={t('label_rich_in', { nutrients: s.nutrients.join(', ') })} />
                      )}
                    </span>
                  </span>
                  <Button size="sm" onClick={() => onAddFeed(s.feedId)}>
                    <Bi id="action_add_feed" />
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
