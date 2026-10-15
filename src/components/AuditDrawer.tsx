import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, X, BookOpen } from 'lucide-react';
import type { AuditMeta } from '../domain/types';
import { Bi } from '../i18n/Bi';
import type { BiText, StringId } from '../i18n/strings';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Drawer, DrawerOverlay, DrawerContent, DrawerTitle } from './ui/drawer';

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
      {on && <Check size={16} strokeWidth={2.5} aria-hidden="true" />}
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
  const closeRef = useRef<HTMLButtonElement>(null);
  const isFixture = meta.sourceKey?.startsWith('PROTO') ?? false;

  return (
    <Drawer open onOpenChange={(o) => !o && onClose()}>
      <DrawerOverlay />
      <DrawerContent
        data-audit-id={meta.id}
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          closeRef.current?.focus();
        }}
      >
        <div className="fp-head">
          <DrawerTitle className="fp-title" id="fp-title">
            <Bi id="audit_title" />
          </DrawerTitle>
          <Button ref={closeRef} size="sm" onClick={onClose}>
            <X size={16} strokeWidth={2} aria-hidden="true" />
            <Bi id="action_close" />
          </Button>
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
                <span lang="en" data-lang-exempt="citation" className="inline-flex items-center gap-1.5">
                  <BookOpen size={18} strokeWidth={2} aria-hidden="true" />
                  {meta.citation.doc}
                </span>
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
                  <>
                    {' · '}
                    <Badge variant="warn" data-testid="expert-pending">
                      <Bi id="audit_expert_pending" />
                    </Badge>
                  </>
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
      </DrawerContent>
    </Drawer>
  );
}
