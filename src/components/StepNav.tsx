import type { ReactNode } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { STEPS } from '../lib/hashRoute';
import type { Step } from '../lib/hashRoute';
import { Bi } from '../i18n/Bi';
import { bi } from '../i18n/strings';
import type { StringIdC4 } from '../i18n/strings';
import { Button } from './ui/button';

const SHORT: Record<Step, StringIdC4> = {
  animals: 'c4_step_animals_short',
  feeds: 'c4_step_feeds_short',
  result: 'c4_step_result_short',
};

/** 1 – 2 – 3 with the current step marked by shape and weight as well as colour. */
export function StepIndicator({ step }: { step: Step }) {
  const current = STEPS.indexOf(step);
  return (
    <nav aria-label={bi('c4_steps_label')}>
      <ol className="c4-steps">
        {STEPS.map((s, i) => {
          const state = i < current ? 'done' : i === current ? 'current' : 'todo';
          return (
            <li key={s} className="c4-step" data-state={state} aria-current={i === current ? 'step' : undefined}>
              <span className="c4-step-dot" aria-hidden="true">
                {state === 'done' ? <Check size={16} strokeWidth={3} /> : i + 1}
              </span>
              <span className="c4-step-name">
                <Bi id={SHORT[s]} />
              </span>
              <span className="sr-only">
                <Bi id="c4_step_count" params={{ n: i + 1 }} />
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

interface StepBarProps {
  /** Goes to the previous screen. Absent on screen 1. */
  onBack?: () => void;
  primary: ReactNode;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  /** Why the primary action is disabled, one line each. Shown above the buttons. */
  reasons?: ReactNode[];
  /** Id of the reason block, so the disabled button can point at it. */
  reasonId: string;
}

/** The sticky bottom bar: Back (secondary) and the one primary action of the screen. */
export function StepBar({ onBack, primary, onPrimary, primaryDisabled = false, reasons = [], reasonId }: StepBarProps) {
  const showReasons = primaryDisabled && reasons.length > 0;
  return (
    <div className="c4-bar">
      {showReasons && (
        <ul className="c4-bar-reason" id={reasonId}>
          {reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      <div className="c4-bar-row">
        {onBack && (
          <Button className="c4-bar-back" onClick={onBack}>
            <ArrowLeft size={18} strokeWidth={2.25} aria-hidden="true" />
            <Bi id="c4_action_back" />
          </Button>
        )}
        <Button
          variant="primary"
          className="c4-bar-primary"
          disabled={primaryDisabled}
          onClick={onPrimary}
          aria-describedby={showReasons ? reasonId : undefined}
        >
          {primary}
        </Button>
      </div>
    </div>
  );
}
