import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuditMeta } from '../domain/types';
import { Bi } from '../i18n/Bi';
import type { BiText, StringId } from '../i18n/strings';

interface AuditContextValue {
  open: (meta: AuditMeta) => void;
}

const AuditContext = createContext<AuditContextValue>({ open: () => undefined });

export function useAudit(): AuditContextValue {
  return useContext(AuditContext);
}

/** Owns the open/closed state of the fine-print sheet and restores focus to the tapped figure on close. */
export function AuditProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<AuditMeta | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const prevMeta = useRef<AuditMeta | null>(null);

  const open = useCallback((next: AuditMeta) => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setMeta(next);
  }, []);

  const close = useCallback(() => {
    setMeta(null);
    returnFocus.current?.focus();
  }, []);

  useEffect(() => {
    if (prevMeta.current && !meta && returnFocus.current?.isConnected) {
      returnFocus.current.focus();
    }
    prevMeta.current = meta;
  }, [meta]);

  const value = useMemo(() => ({ open }), [open]);
  return (
    <AuditContext.Provider value={value}>
      {children}
      {meta && <FinePrintSheet meta={meta} onClose={close} />}
    </AuditContext.Provider>
  );
}

function Tick({ on }: { on: boolean }) {
  return (
    <span className="tick" data-on={on} aria-hidden="true">
      {on && (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
          <path d="M3.5 8.5 L6.5 11.5 L12.5 4.5" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

function Row({ labelId, text, children }: { labelId?: StringId; text?: BiText; children: ReactNode }) {
  return (
    <div className="fp-row">
      <dt>{text ? <Bi text={text} /> : <Bi id={labelId as StringId} />}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const ORIGIN_STRING = {
  cited_source: 'audit_origin_cited',
  solver_output: 'audit_origin_solver',
  user_input: 'audit_origin_input',
  prototype_fixture: 'audit_roughage_fixture',
} as const;

/** The fine-print sheet: a rounded bottom sheet that slides up from the bottom, 220ms. */
function FinePrintSheet({ meta, onClose }: { meta: AuditMeta; onClose: () => void }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !sheetRef.current) return;
      const focusables = sheetRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isFixture = meta.sourceKey?.startsWith('PROTO') ?? false;

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={sheetRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fp-title"
        data-audit-id={meta.id}
      >
        <div className="fp-head">
          <h2 id="fp-title" className="fp-title">
            <Bi id="audit_title" />
          </h2>
          <button ref={closeRef} type="button" className="btn btn-sm" onClick={onClose}>
            <Bi id="action_close" />
          </button>
        </div>

        <div className="fp-value">
          <p className="fp-label">
            <Bi text={meta.label} />
          </p>
          <p className="fp-figure num">{meta.formattedValue}</p>
        </div>

        <dl className="fp-list">
          <Row labelId="audit_origin">
            <Bi id={ORIGIN_STRING[meta.originType]} />
          </Row>

          {meta.citation && (
            <>
              <Row labelId="audit_source">
                <span lang="en" data-lang-exempt="citation">{meta.citation.doc}</span>
              </Row>
              <Row labelId="audit_table">
                <span lang="en" data-lang-exempt="citation">{meta.citation.table}</span>
              </Row>
              <Row labelId="audit_page">
                <span lang="en" data-lang-exempt="citation">{meta.citation.page}</span>
              </Row>
              {meta.citation.formula && (
                <Row labelId="audit_formula">
                  <span className="fp-math num" data-lang-exempt="citation">{meta.citation.formula}</span>
                </Row>
              )}
              <Row labelId="audit_status">
                <Bi id={meta.citation.provenanceStatus === 'cited' ? 'label_cited' : 'label_team_asserted'} />
                {/* Pending only for a cited figure: when the sheet shows the user's own value, the feed's expert check does not apply. */}
                {meta.citation.verifiedOn === null && meta.originType !== 'user_input' && (
                  <span className="detail-note" data-testid="expert-pending">
                    {' · '}
                    <Bi id="audit_expert_pending" />
                  </span>
                )}
              </Row>
            </>
          )}

          {meta.extraRows?.map((row, i) => (
            <Row key={i} text={row.label}>
              {typeof row.value === 'string' ? <span lang="en" data-lang-exempt="citation">{row.value}</span> : <Bi text={row.value} />}
            </Row>
          ))}

          {meta.notes && meta.notes.length > 0 && (
            <Row labelId="audit_notes">
              <ul className="fp-notes">
                {meta.notes.map((note, i) => (
                  <li key={i}>
                    <Bi text={note} />
                  </li>
                ))}
              </ul>
            </Row>
          )}

          {meta.solverConstraint && (
            <>
              <Row labelId="audit_role">
                <Bi text={meta.solverConstraint.role} />
              </Row>
              <Row labelId="audit_constraint">
                <Bi text={meta.solverConstraint.activeConstraint} />
              </Row>
              <Row labelId="audit_breakdown">
                <span className="fp-math num" data-lang-exempt="formula">{meta.solverConstraint.breakdown}</span>
              </Row>
            </>
          )}

          {meta.originType === 'user_input' && (
            <div className="fp-row">
              <dd className="fp-wide">
                <Bi id="audit_user_input" />
              </dd>
            </div>
          )}

          {meta.binding !== undefined && (
            <div className="fp-row fp-binding">
              <dt>
                <Bi id="audit_binding" />
              </dt>
              <dd className="fp-tickrow">
                <Tick on={meta.binding} />
                <Bi id={meta.binding ? 'audit_binding_yes' : 'audit_binding_no'} />
              </dd>
            </div>
          )}

          {meta.sourceKey && (
            <Row labelId="audit_fixture_key">
              <span className="fp-math num" data-lang-exempt="source-key">{meta.sourceKey}</span>
            </Row>
          )}
        </dl>

        {isFixture && (
          <p className="fp-note">
            <Bi id="audit_fixture_note" />
          </p>
        )}
      </div>
    </>
  );
}
