import { LLM_ERROR_STRING } from '../domain/types';
import type { VerifiedExplanationResult } from '../domain/types';
import { Bi } from '../i18n/Bi';
import { t } from '../i18n/strings';
import { StatusPill } from './StatusPill';

export type ExplainState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; result: VerifiedExplanationResult };

/** E6 and AC-L1.5: verified text with a bilingual badge, or the fixed bilingual template. */
export function ExplanationCard({ state }: { state: ExplainState }) {
  if (state.kind === 'idle') return null;

  if (state.kind === 'loading') {
    return (
      <section className="explain" aria-busy="true" data-state="explain-loading">
        <p className="state-line" role="status">
          <Bi id="state_explaining" />
        </p>
        <span className="skel skel-w90" />
        <span className="skel skel-w80" />
        <span className="skel skel-w60" />
      </section>
    );
  }

  const { result } = state;
  const flagged = result.flaggedNumbers.join(', ');

  if (result.status === 'verified') {
    return (
      <section className="explain" data-state="explain-verified" aria-labelledby="explain-h">
        <div className="explain-head">
          <h3 id="explain-h" className="explain-title">
            <Bi id="label_explanation" />
          </h3>
          <StatusPill id="stamp_verified" tone="ok" />
        </div>
        {result.flaggedNumbers.length > 0 && (
          <p className="alert alert-note" data-testid="flagged-notice">
            <Bi id="notice_explain_flagged" params={{ numbers: flagged }} />
          </p>
        )}
        <p className="explain-text" lang="en" data-lang-exempt="llm-explanation">
          {result.explanationText}
        </p>
        <p className="badge" data-testid="badge">
          <Bi id={result.badge.id} params={result.badge.params} />
        </p>
        <p className="muted explain-lang">
          <Bi id="label_english_only" />
        </p>
      </section>
    );
  }

  return (
    <section className="explain" data-state="explain-fallback" aria-labelledby="explain-h">
      <div className="explain-head">
        <h3 id="explain-h" className="explain-title">
          <Bi id="label_explanation" />
        </h3>
        <StatusPill id="stamp_template" tone="neutral" />
      </div>
      <div className="alert alert-note" data-testid="fallback-notice">
        {result.reason === 'untraced_numbers' && result.flaggedNumbers.length > 0 ? (
          <p>
            <Bi id="notice_explain_untraced" params={{ numbers: flagged }} />
          </p>
        ) : (
          <>
            <p>
              <Bi id="notice_explain_unavailable" />
            </p>
            {result.errorCode && (
              <p>
                <Bi text={t(LLM_ERROR_STRING[result.errorCode])} />
              </p>
            )}
          </>
        )}
      </div>
      <ul className="template">
        {result.template.map((line, i) => (
          <li key={i}>
            <Bi text={line} />
          </li>
        ))}
      </ul>
      <p className="badge" data-testid="badge">
        <Bi id={result.badge.id} />
      </p>
    </section>
  );
}
