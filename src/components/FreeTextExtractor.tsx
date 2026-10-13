import { useEffect, useId, useRef, useState } from 'react';
import type { ExtractionResponse, FeedItem, LlmErrorCode } from '../domain/types';
import { LLM_ERROR_STRING, LlmError } from '../domain/types';
import { Bi } from '../i18n/Bi';
import { useLang } from '../i18n/LanguageProvider';
import { feedLabel } from '../i18n/feedLabel';
import { bi } from '../i18n/strings';
import { rationService } from '../services/rationService';
import { FeedName } from './FeedName';
import { StatusPill } from './StatusPill';

export type UnmatchedResolution = null | { kind: 'map'; feedId: string } | { kind: 'drop' };

export interface PrefillState {
  response: ExtractionResponse;
  unmatched: { name: string; resolution: UnmatchedResolution }[];
}

interface FreeTextExtractorProps {
  online: boolean;
  library: FeedItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  text: string;
  onTextChange: (text: string) => void;
  prefill: PrefillState | null;
  onExtracted: (response: ExtractionResponse) => void;
  onPrefillChange: (next: PrefillState) => void;
  onConfirm: () => void;
  onDiscard: () => void;
}

const MAX_CHARS = 1000;



type Status = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; code: LlmErrorCode };

/** Privacy notice, free-text box, loading/error states and the confirm step with unmatched feeds (E4, E5). */
export function FreeTextExtractor({
  online,
  library,
  open,
  onOpenChange,
  text,
  onTextChange,
  prefill,
  onExtracted,
  onPrefillChange,
  onConfirm,
  onDiscard,
}: FreeTextExtractorProps) {
  const uid = useId();
  const { lang } = useLang();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [touched, setTouched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const trimmed = text.trim();
  const textError = trimmed === '' ? 'error_text_required' : text.length > MAX_CHARS ? 'error_text_too_long' : null;
  const blocked = !online;

  async function run() {
    setTouched(true);
    if (textError !== null || blocked) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus({ kind: 'loading' });
    try {
      const response = await rationService.extractFromText(text, { signal: controller.signal });
      setStatus({ kind: 'idle' });
      onExtracted(response);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setStatus({ kind: 'error', code: err instanceof LlmError ? err.code : 'UPSTREAM_ERROR' });
    }
  }

  const unresolved = prefill ? prefill.unmatched.filter((u) => u.resolution === null).length : 0;
  const mappedIds = new Set(
    prefill?.unmatched.flatMap((u) => (u.resolution?.kind === 'map' ? [u.resolution.feedId] : [])) ?? [],
  );
  const matchedIds = new Set(prefill?.response.matchedFeeds.map((m) => m.feedId) ?? []);
  const byId = new Map(library.map((f) => [f.id, f]));

  return (
    <section className="block extractor" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`} className="block-head-plain">
        <button
          type="button"
          className="disclosure"
          aria-expanded={open}
          aria-controls={`${uid}-panel`}
          onClick={() => onOpenChange(!open)}
        >
          <Bi id="label_describe" />
          {blocked ? (
            <span className="tag tag-offline">
              <Bi id="notice_needs_internet" />
            </span>
          ) : (
            <span className="chev" data-open={open} aria-hidden="true" />
          )}
        </button>
      </h2>

      {open && (
        <div id={`${uid}-panel`} className="extractor-body">
          <p className="notice" id={`${uid}-privacy`}>
            <Bi id="notice_openrouter" />
          </p>

          <div className="field">
            <label htmlFor={`${uid}-text`} className="field-label">
              <Bi id="label_describe" />
            </label>
            <textarea
              id={`${uid}-text`}
              className="input textarea"
              rows={3}
              value={text}
              maxLength={MAX_CHARS + 200}
              placeholder={bi('hint_freetext')}
              data-lang-exempt="user-text"
              aria-invalid={touched && textError !== null ? true : undefined}
              aria-describedby={`${uid}-privacy${touched && textError ? ` ${uid}-err` : ''}`}
              onChange={(e) => onTextChange(e.target.value)}
              onBlur={() => setTouched(true)}
            />
            {touched && textError && (
              <p id={`${uid}-err`} className="field-error" role="alert">
                <Bi id={textError} params={{ max: MAX_CHARS }} />
              </p>
            )}
          </div>

          <div className="action-row">
            <button type="button" className="btn" disabled={blocked || status.kind === 'loading'} onClick={run} aria-describedby={blocked ? `${uid}-offline` : undefined}>
              <Bi id="action_fill_from_description" />
            </button>
            {blocked && (
              <span id={`${uid}-offline`} className="tag tag-offline">
                <Bi id="notice_needs_internet" />
              </span>
            )}
          </div>

          {status.kind === 'loading' && (
            <div className="skeleton-group" role="status" aria-live="polite">
              <p className="state-line">
                <Bi id="state_extracting" />
              </p>
              <span className="skel skel-w80" />
              <span className="skel skel-w60" />
              <span className="skel skel-w70" />
            </div>
          )}

          {status.kind === 'error' && (
            <div className="alert" role="alert">
              <p>
                <Bi id={LLM_ERROR_STRING[status.code]} />
              </p>
              <button type="button" className="btn btn-sm" onClick={run} disabled={blocked}>
                <Bi id="action_try_again" />
              </button>
            </div>
          )}
        </div>
      )}

      {prefill && (
        <div className="review" role="region" aria-label={bi('label_review_prefill')}>
          <div className="review-head">
            <h3 className="review-title">
              <Bi id="label_review_prefill" />
            </h3>
            <StatusPill id="stamp_unconfirmed" tone="warn" />
          </div>
          <p>
            <Bi id="notice_prefill_unconfirmed" />
          </p>

          {prefill.response.matchedFeeds.length > 0 && (
            <div className="review-group">
              <p className="review-sub">
                <Bi id="label_prefill_feeds" />
              </p>
              <ul className="review-list">
                {prefill.response.matchedFeeds.map((m) => {
                  const feed = byId.get(m.feedId);
                  return feed ? (
                    <li key={m.feedId}>
                      <FeedName feed={feed} />
                    </li>
                  ) : null;
                })}
              </ul>
            </div>
          )}

          {prefill.unmatched.length > 0 && (
            <div className="review-group" data-testid="unmatched">
              <p className="review-sub">
                <Bi id="label_unmatched_feeds" />
              </p>
              <p className="notice">
                <Bi id="notice_unmatched" />
              </p>
              <ul className="review-list">
                {prefill.unmatched.map((u, idx) => {
                  const selectId = `${uid}-map-${idx}`;
                  const choices = library.filter((f) => !matchedIds.has(f.id) && (!mappedIds.has(f.id) || (u.resolution?.kind === 'map' && u.resolution.feedId === f.id)));
                  const setResolution = (resolution: UnmatchedResolution) =>
                    onPrefillChange({
                      ...prefill,
                      unmatched: prefill.unmatched.map((x, i) => (i === idx ? { ...x, resolution } : x)),
                    });
                  return (
                    <li key={u.name} className="unmatched-row" data-resolved={u.resolution !== null ? 'true' : undefined}>
                      <p className="unmatched-name" lang="en" data-lang-exempt="user-text">
                        “{u.name}”
                      </p>
                      {u.resolution?.kind === 'drop' ? (
                        <div className="action-row">
                          <span className="tag">
                            <Bi id="state_dropped" />
                          </span>
                          <button type="button" className="btn btn-sm btn-quiet" onClick={() => setResolution(null)}>
                            <Bi id="action_undo" />
                          </button>
                        </div>
                      ) : (
                        <div className="action-row">
                          <div className="field field-grow">
                            <label htmlFor={selectId} className="field-label">
                              <Bi id="label_map_to" />
                            </label>
                            <select
                              id={selectId}
                              className="input"
                              value={u.resolution?.kind === 'map' ? u.resolution.feedId : ''}
                              onChange={(e) => setResolution(e.target.value === '' ? null : { kind: 'map', feedId: e.target.value })}
                            >
                              <option value="">{bi('option_choose_feed')}</option>
                              {choices.map((f) => (
                                <option
                                  key={f.id}
                                  value={f.id}
                                  data-lang-exempt={lang === 'hi' && f.localNameDeva === null ? 'feed-no-deva' : undefined}
                                >
                                  {feedLabel(f, lang)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <button type="button" className="btn btn-sm" onClick={() => setResolution({ kind: 'drop' })}>
                            <Bi id="action_drop" />
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="action-row action-row-wrap">
            <button type="button" className="btn btn-green" disabled={unresolved > 0} onClick={onConfirm} aria-describedby={unresolved > 0 ? `${uid}-resolve` : undefined}>
              <Bi id="action_confirm_prefill" />
            </button>
            <button type="button" className="btn btn-quiet" onClick={onDiscard}>
              <Bi id="action_discard_prefill" />
            </button>
          </div>
          {unresolved > 0 && (
            <p id={`${uid}-resolve`} className="field-hint">
              <Bi id="notice_resolve_unmatched" />
            </p>
          )}
        </div>
      )}
    </section>
  );
}
