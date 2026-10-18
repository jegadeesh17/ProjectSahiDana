import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { groupFeeds, VERTICAL_STRING } from '../domain/feedGroups';
import { searchFeeds } from '../domain/feedSearch';
import type { FeedItem } from '../domain/types';
import type { HomeFeedDraft } from '../domain/validation';
import { validateHomeFeed } from '../domain/validation';
import { toLatinDigits } from '../i18n/format';
import { Bi } from '../i18n/Bi';
import { feedLabel } from '../i18n/feedLabel';
import { useLang } from '../i18n/LanguageProvider';
import { bi } from '../i18n/strings';
import { FeedChip, FeedName } from './FeedName';
import { StepBar } from './StepNav';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface Props {
  library: FeedItem[];
  drafts: HomeFeedDraft[];
  onAdd: (feedId: string) => void;
  onKg: (feedId: string, text: string) => void;
  onRemove: (feedId: string) => void;
  onBack: () => void;
  onCalculate: () => void;
  calculating: boolean;
}

/** Screen 2, "Feed you already have": optional rows of kg per day for all animals, no price, season or month. */
export function HomeFeedsScreen({ library, drafts, onAdd, onKg, onRemove, onBack, onCalculate, calculating }: Props) {
  const uid = useId();
  const { lang } = useLang();
  const [query, setQuery] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const byId = useMemo(() => new Map(library.map((f) => [f.id, f])), [library]);
  const groups = useMemo(() => groupFeeds(searchFeeds(query, library)), [query, library]);
  const selected = new Set(drafts.map((d) => d.feedId));
  const anyInvalid = drafts.some((d) => validateHomeFeed(d).error !== undefined);

  // A new row appears above a long list; move focus to its kg field so the farmer sees it and can type.
  const justAdded = useRef<string | null>(null);
  const rowCount = drafts.length;
  useEffect(() => {
    if (justAdded.current === null) return;
    const el = document.getElementById(`${uid}-kg-${justAdded.current}`);
    justAdded.current = null;
    el?.focus();
  }, [rowCount, uid]);

  const add = (feedId: string) => {
    if (selected.has(feedId)) return;
    justAdded.current = feedId;
    onAdd(feedId);
  };

  return (
    <>
      <p className="c4-skip-note">
        <Bi id="c4_feeds_skip" />
      </p>

      <section className="block" aria-labelledby={`${uid}-rows-h`} data-c4="home-rows">
        <h2 id={`${uid}-rows-h`} className="block-title c4-block-title">
          <Bi id="c4_feeds_at_home" />
        </h2>
        {drafts.length === 0 ? (
          <p className="empty">
            <Bi id="c4_feeds_empty" />
          </p>
        ) : (
          <ul className="c4-home-rows">
            {drafts.map((d) => {
              const feed = byId.get(d.feedId);
              if (!feed) return null;
              const { error } = validateHomeFeed(d);
              const showError = error !== undefined && touched[d.feedId] === true;
              const inputId = `${uid}-kg-${d.feedId}`;
              return (
                <li key={d.feedId} className="c4-home-row" data-feed={d.feedId}>
                  <div className="c4-home-head">
                    <FeedChip feed={feed} />
                    <div className="c4-home-name">
                      <FeedName feed={feed} />
                    </div>
                    <Button
                      size="sm"
                      variant="quiet"
                      onClick={() => onRemove(d.feedId)}
                      aria-label={`${bi('c4_action_remove')}: ${feedLabel(feed, lang)}`}
                      data-lang-exempt={lang === 'hi' && feed.localNameDeva === null ? 'feed-no-deva' : undefined}
                    >
                      <Trash2 size={16} strokeWidth={2.25} aria-hidden="true" />
                      <Bi id="c4_action_remove" />
                    </Button>
                  </div>
                  <div className="field">
                    <label htmlFor={inputId} className="field-label">
                      <Bi id="c4_kg_label" />
                    </label>
                    <div className="input-wrap">
                      <Input
                        id={inputId}
                        className="num"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={d.kg}
                        aria-invalid={showError || undefined}
                        aria-describedby={showError ? `${inputId}-err` : undefined}
                        onChange={(e) => onKg(d.feedId, toLatinDigits(e.target.value))}
                        onBlur={() => setTouched((p) => ({ ...p, [d.feedId]: true }))}
                      />
                      <span className="input-unit" aria-hidden="true">
                        kg
                      </span>
                    </div>
                    {showError && (
                      <p id={`${inputId}-err`} className="field-error" role="alert">
                        <Bi id="c4_error_kg_positive" />
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="block" aria-labelledby={`${uid}-add-h`} data-c4="feed-picker">
        <h2 id={`${uid}-add-h`} className="block-title c4-block-title">
          <Bi id="c4_feeds_add_heading" />
        </h2>
        <div className="field">
          <label htmlFor={`${uid}-search`} className="field-label">
            <Bi id="label_feed_search" />
          </label>
          <Input
            id={`${uid}-search`}
            type="search"
            autoComplete="off"
            value={query}
            placeholder={bi('hint_feed_search')}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {groups.length === 0 ? (
          <p className="empty">
            <Bi id="state_no_results" />
          </p>
        ) : (
          <div className="c4-groups">
            {groups.map((group) => (
              <section key={group.vertical} aria-labelledby={`${uid}-g-${group.vertical}`} data-vertical={group.vertical}>
                <h3 id={`${uid}-g-${group.vertical}`} className="libgroup-head">
                  <Bi id={VERTICAL_STRING[group.vertical]} />
                  <span className="libgroup-count">
                    <Bi id="count_in_group" params={{ n: group.feeds.length }} />
                  </span>
                </h3>
                <ul className="c4-picklist">
                  {group.feeds.map((feed) => {
                    const added = selected.has(feed.id);
                    const local = lang === 'en' && feed.localNameLatn !== null && feed.localNameLatn !== feed.englishName ? feed.localNameLatn : null;
                    return (
                      <li key={feed.id}>
                        <button
                          type="button"
                          className="c4-pick"
                          disabled={added}
                          onClick={() => add(feed.id)}
                          aria-label={`${added ? bi('state_added') : bi('action_add_feed')}: ${feedLabel(feed, lang)}`}
                          data-lang-exempt={lang === 'hi' && feed.localNameDeva === null ? 'feed-no-deva' : undefined}
                        >
                          <FeedChip feed={feed} />
                          <span className="c4-pick-name">
                            <FeedName feed={feed} />
                            {local && (
                              <span className="c4-pick-local" lang="en">
                                {local}
                              </span>
                            )}
                          </span>
                          <span className="c4-pick-state" data-added={added ? 'true' : undefined} aria-hidden="true">
                            <Bi id={added ? 'state_added' : 'action_add_feed'} />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>

      <StepBar
        reasonId={`${uid}-reason`}
        onBack={onBack}
        primary={<Bi id={calculating ? 'c4_calculating' : 'action_balance_ration'} />}
        onPrimary={onCalculate}
        primaryDisabled={anyInvalid || calculating}
        reasons={anyInvalid ? [<Bi key="kg" id="c4_gate_kg" />] : []}
      />
    </>
  );
}
