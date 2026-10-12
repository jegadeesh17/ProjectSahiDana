import { useId, useMemo, useState } from 'react';
import { auditFeedPrice } from '../domain/audit';
import { auditSeason } from '../domain/auditMilk';
import { searchFeeds } from '../domain/feedSearch';
import { groupFeeds, inSeason, RELIABILITY_STRING, VERTICAL_STRING } from '../domain/feedGroups';
import type { FeedItem } from '../domain/types';
import type { FeedDraft, FeedField, FieldError } from '../domain/validation';
import { validateFeed } from '../domain/validation';
import { formatDateShort, formatInrPerKg, formatKg, parseDecimal, toLatinDigits } from '../i18n/format';
import { Bi } from '../i18n/Bi';
import { feedLabel } from '../i18n/feedLabel';
import { useLang } from '../i18n/LanguageProvider';
import { currentMonth, monthName } from '../i18n/months';
import { bi } from '../i18n/strings';
import type { StringId } from '../i18n/strings';
import { useAudit } from './AuditDrawer';
import { FeedChip, FeedName } from './FeedName';

interface FeedSelectorProps {
  library: FeedItem[];
  drafts: FeedDraft[];
  /** Phones show chips with prices when the editor is collapsed. */
  collapsed: boolean;
  prefilled: boolean;
  /** 1 to 12. Defaults to the device's month (AC-3.4). */
  initialMonth?: number;
  onChange: (next: FeedDraft[]) => void;
  onAdd: (feedId: string) => void;
  onRemove: (feedId: string) => void;
  onOpen: () => void;
  onCollapse: () => void;
}

interface RowFieldProps {
  id: string;
  labelId: StringId;
  value: string;
  error: FieldError | undefined;
  optional?: boolean;
  onChange: (v: string) => void;
  onBlur: () => void;
}

function RowField({ id, labelId, value, error, optional, onChange, onBlur }: RowFieldProps) {
  return (
    <div className="field field-tight">
      <label htmlFor={id} className="field-label">
        <Bi id={labelId} />
      </label>
      <input
        id={id}
        className="input num"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        placeholder={optional ? '—' : undefined}
        onChange={(e) => onChange(toLatinDigits(e.target.value))}
        onBlur={onBlur}
      />
    </div>
  );
}

/** "In season" pill, or a tappable "Out of season" pill that opens the months and the source's note (AC-3.4, AC-3.5). */
function SeasonMark({ feed, month, quiet = false }: { feed: FeedItem; month: number; quiet?: boolean }) {
  const { open } = useAudit();
  if (inSeason(feed, month)) {
    return (
      <span className={quiet ? 'season-in' : 'pill pill-ok'} data-season="in">
        <Bi id="state_in_season" />
      </span>
    );
  }
  return (
    <button type="button" className="pill pill-warn pill-btn" data-season="out" aria-haspopup="dialog" onClick={() => open(auditSeason(feed))}>
      <Bi id="state_out_of_season" />
    </button>
  );
}

export function FeedSelector({
  library,
  drafts,
  collapsed,
  prefilled,
  initialMonth,
  onChange,
  onAdd,
  onRemove,
  onOpen,
  onCollapse,
}: FeedSelectorProps) {
  const uid = useId();
  const { open } = useAudit();
  const { lang } = useLang();
  const [query, setQuery] = useState('');
  const [month, setMonth] = useState(initialMonth ?? currentMonth());
  const [details, setDetails] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const byId = useMemo(() => new Map(library.map((f) => [f.id, f])), [library]);
  const groups = useMemo(() => groupFeeds(searchFeeds(query, library)), [query, library]);
  const selectedIds = new Set(drafts.map((d) => d.feedId));

  const update = (feedId: string, patch: Partial<FeedDraft>) =>
    onChange(drafts.map((d) => (d.feedId === feedId ? { ...d, ...patch } : d)));
  const touch = (key: string) => setTouched((prev) => ({ ...prev, [key]: true }));

  return (
    <section className="block" aria-labelledby={`${uid}-h`}>
      <div className="block-head">
        <h2 id={`${uid}-h`} className="block-title">
          <Bi id="label_feeds" />
        </h2>
        <div className="block-head-actions">
          {!collapsed && drafts.length > 0 && (
            <button type="button" className="btn btn-sm btn-quiet" aria-pressed={details} onClick={() => setDetails(!details)}>
              <Bi id={details ? 'action_hide_details' : 'action_show_details'} />
            </button>
          )}
          {collapsed ? (
            <button type="button" className="btn btn-sm lg:hidden" onClick={onOpen}>
              <Bi id="action_edit_feeds" />
            </button>
          ) : (
            drafts.length > 0 && (
              <button type="button" className="btn btn-sm lg:hidden" onClick={onCollapse}>
                <Bi id="action_done" />
              </button>
            )
          )}
        </div>
      </div>

      {collapsed && drafts.length > 0 && (
        <ul className="chips lg:hidden" aria-label={bi('label_selected_feeds')}>
          {drafts.map((d) => {
            const feed = byId.get(d.feedId);
            if (!feed) return null;
            const price = parseDecimal(d.price);
            return (
              <li key={d.feedId}>
                <button type="button" className="feedchip" onClick={onOpen} data-prefilled={prefilled ? 'true' : undefined}>
                  <FeedChip feed={feed} />
                  <FeedName feed={feed} />
                  <span className="feedchip-price num">{Number.isNaN(price) ? '—' : formatInrPerKg(price)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className={`collapsible${collapsed ? ' is-collapsed' : ''}`}>
        {drafts.length === 0 ? (
          <p className="empty">
            <Bi id="state_no_feeds" />
          </p>
        ) : (
          <ul className="feedlist" aria-label={bi('label_selected_feeds')}>
            {drafts.map((d) => {
              const feed = byId.get(d.feedId);
              if (!feed) return null;
              const { errors } = validateFeed(d);
              const show = (f: FeedField) => (touched[`${d.feedId}-${f}`] ? errors[f] : undefined);
              const priceNum = parseDecimal(d.price);
              const capNum = parseDecimal(d.cap);
              const edited = !Number.isNaN(priceNum) && Math.abs(priceNum - feed.defaultPriceInrPerKgAsFed) > 1e-9;
              return (
                <li key={d.feedId} className="feedrow" data-prefilled={prefilled ? 'true' : undefined}>
                  <div className="feedrow-head">
                    <FeedChip feed={feed} />
                    <div className="feedrow-name">
                      <FeedName feed={feed} />
                    </div>
                    <SeasonMark feed={feed} month={month} />
                    <button type="button" className="btn btn-sm btn-quiet" onClick={() => onRemove(d.feedId)} aria-label={`${bi('action_remove_feed')}: ${feedLabel(feed, lang)}`}>
                      <Bi id="action_remove_feed" />
                    </button>
                  </div>
                  <div className={`grid gap-2 ${details ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    <RowField
                      id={`${uid}-${d.feedId}-price`}
                      labelId="label_price"
                      value={d.price}
                      error={show('price')}
                      onChange={(v) => update(d.feedId, { price: v })}
                      onBlur={() => touch(`${d.feedId}-price`)}
                    />
                    <RowField
                      id={`${uid}-${d.feedId}-cur`}
                      labelId="label_today_kg"
                      value={d.current}
                      error={show('current')}
                      optional
                      onChange={(v) => update(d.feedId, { current: v })}
                      onBlur={() => touch(`${d.feedId}-current`)}
                    />
                    {details && (
                      <RowField
                        id={`${uid}-${d.feedId}-cap`}
                        labelId="label_max_cap"
                        value={d.cap}
                        error={show('cap')}
                        optional
                        onChange={(v) => update(d.feedId, { cap: v })}
                        onBlur={() => touch(`${d.feedId}-cap`)}
                      />
                    )}
                  </div>
                  {(['price', 'cap', 'current'] as const).map((f) => {
                    const e = show(f);
                    return e ? (
                      <p key={f} id={`${uid}-${d.feedId}-${f === 'current' ? 'cur' : f}-err`} className="field-error" role="alert">
                        <Bi id={e.id} params={e.params} />
                      </p>
                    ) : null;
                  })}
                  {!details && !Number.isNaN(capNum) && d.cap.trim() !== '' && (
                    <p className="field-hint num">
                      <Bi id="label_max_set" params={{ kg: formatKg(capNum, 2) }} />
                    </p>
                  )}
                  <div className="feedrow-source">
                    <button
                      type="button"
                      className="linkbtn num"
                      onClick={() => open(auditFeedPrice(feed, Number.isNaN(priceNum) ? feed.defaultPriceInrPerKgAsFed : priceNum))}
                    >
                      {formatInrPerKg(feed.defaultPriceInrPerKgAsFed)} · {formatDateShort(feed.priceDate)} · <Bi id={RELIABILITY_STRING[feed.priceReliability]} /> ·{' '}
                      <Bi id="action_view_source" />
                    </button>
                    {edited && (
                      <span className="pill pill-neutral" data-pill="your-price">
                        <Bi id="label_your_price" />
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="library">
          <div className="library-controls">
            <div className="field field-grow">
              <label htmlFor={`${uid}-search`} className="field-label">
                <Bi id="label_feed_search" />
              </label>
              <input
                id={`${uid}-search`}
                className="input"
                type="search"
                autoComplete="off"
                value={query}
                placeholder={bi('hint_feed_search')}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={`${uid}-month`} className="field-label">
                <Bi id="label_month" />
              </label>
              <select id={`${uid}-month`} className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-describedby={`${uid}-month-hint`}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {monthName(m, lang)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p id={`${uid}-month-hint`} className="field-hint">
            <Bi id="hint_month" />
          </p>
          <p className="library-title">
            <Bi id="label_library" />
          </p>
          {groups.length === 0 ? (
            <p className="empty">
              <Bi id="state_no_results" />
            </p>
          ) : (
            <div className="libgroups">
              {groups.map((group) => (
                <section key={group.vertical} className="libgroup" aria-labelledby={`${uid}-g-${group.vertical}`} data-vertical={group.vertical}>
                  <h3 id={`${uid}-g-${group.vertical}`} className="libgroup-head">
                    <Bi id={VERTICAL_STRING[group.vertical]} />
                    <span className="libgroup-count">
                      <Bi id="count_in_group" params={{ n: group.feeds.length }} />
                    </span>
                  </h3>
                  <ul className="liblist">
                    {group.feeds.map((feed) => {
                      const added = selectedIds.has(feed.id);
                      return (
                        <li key={feed.id} className="librow" data-added={added ? 'true' : undefined}>
                          <FeedChip feed={feed} />
                          <div className="librow-main">
                            <span className="librow-name">
                              <FeedName feed={feed} />
                            </span>
                            <span className="librow-meta num">
                              {formatInrPerKg(feed.defaultPriceInrPerKgAsFed)} · <Bi id={RELIABILITY_STRING[feed.priceReliability]} />
                              {inSeason(feed, month) && (
                                <>
                                  {' · '}
                                  <SeasonMark feed={feed} month={month} quiet />
                                </>
                              )}
                            </span>
                          </div>
                          {!inSeason(feed, month) && <SeasonMark feed={feed} month={month} />}
                          <button
                            type="button"
                            className="btn btn-sm librow-act"
                            disabled={added}
                            onClick={() => onAdd(feed.id)}
                            aria-label={`${added ? bi('state_added') : bi('action_add_feed')}: ${feedLabel(feed, lang)}`}
                          >
                            <Bi id={added ? 'state_added' : 'action_add_feed'} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
