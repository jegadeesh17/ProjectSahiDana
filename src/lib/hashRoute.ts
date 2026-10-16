// Three screens on three hash addresses, with no router dependency (docs/ARCHITECTURE.md, "Hash navigation").
// `go` pushes a history entry, so the phone's Back button walks #/result, #/feeds, #/animals.
import { useCallback, useEffect, useRef, useState } from 'react';

export type Step = 'animals' | 'feeds' | 'result';
export const STEPS: readonly Step[] = ['animals', 'feeds', 'result'];

/** '#/feeds' becomes 'feeds'. An empty hash, '#/' or an unknown hash becomes null. */
export function parseHash(hash: string): Step | null {
  const m = /^#\/(animals|feeds|result)\/?$/.exec(hash);
  return m ? (m[1] as Step) : null;
}

export function hashFor(step: Step): string {
  return `#/${step}`;
}

export interface GoOptions {
  /** Replace the current history entry instead of adding one (guards and redirects). */
  replace?: boolean;
}

export interface HashGuardContext {
  hasAnimals: boolean;
  hasBudget: boolean;
  hasPlan: boolean;
  calculating?: boolean;
}

/**
 * Resolves redirect target based on C4 navigation guards:
 * - #/feeds or #/result without at least one animal and a valid budget -> 'animals' (AC-C4-1.1, AC-C4-E1)
 * - #/result with plan === null (and not calculating) -> 'feeds' (AC-C4-1.1, AC-C4-E1)
 */
export function guardStep(step: Step, context: HashGuardContext): Step {
  if ((step === 'feeds' || step === 'result') && (!context.hasAnimals || !context.hasBudget)) {
    return 'animals';
  }
  if (step === 'result' && !context.hasPlan && !context.calculating) {
    return 'feeds';
  }
  return step;
}

interface HistoryMark {
  c4i: number;
  drawerOpen?: boolean;
}

/** How many entries the app has pushed on top of the first one (0 on the entry the page opened with). */
function depthOf(state: unknown): number {
  return typeof state === 'object' && state !== null && typeof (state as HistoryMark).c4i === 'number'
    ? (state as HistoryMark).c4i
    : 0;
}

/**
 * The current screen from the URL hash, a `go` that changes it, and a `back` that behaves like the phone's Back
 * button when the app pushed the current entry, and otherwise steps to the previous screen without leaving the app.
 * If `guards` are provided, redirects violating routes per AC-C4-1.1 and AC-C4-E1.
 */
export function useHashStep(
  guards?: HashGuardContext,
): [Step, (step: Step, options?: GoOptions) => void, (fallback: Step) => void] {
  const [step, setStep] = useState<Step>(() => parseHash(window.location.hash) ?? 'animals');

  useEffect(() => {
    // Normalise the first entry: no hash, '#/' or an unknown hash is shown as #/animals.
    const parsed = parseHash(window.location.hash);
    if (parsed === null) window.history.replaceState({ c4i: 0 }, '', hashFor('animals'));
    else if (depthOf(window.history.state) === 0) window.history.replaceState({ c4i: 0 }, '', hashFor(parsed));

    const onPop = () => {
      const next = parseHash(window.location.hash) ?? 'animals';
      setStep(next);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = useCallback((next: Step, options?: GoOptions) => {
    if (options?.replace) {
      window.history.replaceState({ c4i: depthOf(window.history.state) }, '', hashFor(next));
    } else {
      window.history.pushState({ c4i: depthOf(window.history.state) + 1 }, '', hashFor(next));
    }
    setStep(next);
  }, []);

  const back = useCallback(
    (fallback: Step) => {
      if (depthOf(window.history.state) > 0) window.history.back();
      else go(fallback, { replace: true });
    },
    [go],
  );

  useEffect(() => {
    if (!guards) return;
    const guarded = guardStep(step, guards);
    if (guarded !== step) {
      go(guarded, { replace: true });
    }
  }, [step, guards?.hasAnimals, guards?.hasBudget, guards?.hasPlan, guards?.calculating, go]);

  return [step, go, back];
}

/**
 * Drawer history listener (AC-C4-R5):
 * Allows the audit drawer to push a history entry keeping the current hash,
 * so the phone's Back button closes the drawer without changing the screen.
 */
export function useAuditDrawerHistory(isOpen: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    let pushed = false;
    let poppedByHistory = false;

    window.history.pushState({ ...window.history.state, drawerOpen: true }, '', window.location.hash);
    pushed = true;

    const onPop = () => {
      poppedByHistory = true;
      onCloseRef.current();
    };
    window.addEventListener('popstate', onPop);

    return () => {
      window.removeEventListener('popstate', onPop);
      if (pushed && !poppedByHistory) {
        window.history.back();
      }
    };
  }, [isOpen]);
}
