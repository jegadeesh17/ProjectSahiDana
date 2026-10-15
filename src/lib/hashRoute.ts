// Three screens on three hash addresses, with no router dependency (docs/ARCHITECTURE.md, "Hash navigation").
// `go` pushes a history entry, so the phone's Back button walks #/result, #/feeds, #/animals.
import { useCallback, useEffect, useState } from 'react';

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

interface HistoryMark {
  c4i: number;
}

/** How many entries the app has pushed on top of the first one (0 on the entry the page opened with). */
function depthOf(state: unknown): number {
  return typeof state === 'object' && state !== null && typeof (state as HistoryMark).c4i === 'number' ? (state as HistoryMark).c4i : 0;
}

/**
 * The current screen from the URL hash, a `go` that changes it, and a `back` that behaves like the phone's Back
 * button when the app pushed the current entry, and otherwise steps to the previous screen without leaving the app.
 */
export function useHashStep(): [Step, (step: Step, options?: GoOptions) => void, (fallback: Step) => void] {
  const [step, setStep] = useState<Step>(() => parseHash(window.location.hash) ?? 'animals');

  useEffect(() => {
    // Normalise the first entry: no hash, '#/' or an unknown hash is shown as #/animals.
    const parsed = parseHash(window.location.hash);
    if (parsed === null) window.history.replaceState({ c4i: 0 }, '', hashFor('animals'));
    else if (depthOf(window.history.state) === 0) window.history.replaceState({ c4i: 0 }, '', hashFor(parsed));
    const onPop = () => setStep(parseHash(window.location.hash) ?? 'animals');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = useCallback((next: Step, options?: GoOptions) => {
    if (options?.replace) window.history.replaceState({ c4i: depthOf(window.history.state) }, '', hashFor(next));
    else window.history.pushState({ c4i: depthOf(window.history.state) + 1 }, '', hashFor(next));
    setStep(next);
  }, []);

  const back = useCallback(
    (fallback: Step) => {
      if (depthOf(window.history.state) > 0) window.history.back();
      else go(fallback, { replace: true });
    },
    [go],
  );

  return [step, go, back];
}
