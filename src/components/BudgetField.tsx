import { useId, useState } from 'react';
import { auditUserInput } from '../domain/audit';
import type { AnimalDraft, FieldError } from '../domain/validation';
import { budgetFieldText, budgetIsDefault, validateBudget } from '../domain/validation';
import { formatInr, toLatinDigits } from '../i18n/format';
import { Bi } from '../i18n/Bi';
import { t } from '../i18n/strings';
import { Fig } from './Fig';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';

interface Props {
  draft: AnimalDraft;
  /** Rupees per day from the "today" column of the feed rows; null when none is entered (AC-4.1). */
  todayCost: number | null;
  error: FieldError | undefined;
  prefilled: boolean;
  onChange: (text: string) => void;
  /** Goes back to following today's cost. */
  onUseToday: () => void;
}

/** The daily budget in rupees (AC-4.2, AC-4.3): follows today's ration cost until the user types their own. */
export function BudgetField({ draft, todayCost, error, prefilled, onChange, onUseToday }: Props) {
  const uid = useId();
  const [touched, setTouched] = useState(false);
  const text = budgetFieldText(draft, todayCost);
  const isDefault = budgetIsDefault(draft, todayCost);
  const invalid = touched && error !== undefined && validateBudget(text).error !== undefined;
  const hintId = `${uid}-hint`;
  const errId = `${uid}-err`;
  return (
    <section className="block" aria-labelledby={`${uid}-h`}>
      <div className="block-head">
        <h2 id={`${uid}-h`} className="block-title">
          <Bi id="label_budget" />
        </h2>
        {isDefault && (
          <Badge variant="neutral" data-pill="budget-default">
            <Bi id="label_budget_today_cost" />
          </Badge>
        )}
      </div>
      <div className="field">
        <label htmlFor={`${uid}-input`} className="field-label">
          <Bi id="label_budget" />
        </label>
        <div className="input-wrap input-wrap-wide">
          <Input
            id={`${uid}-input`}
            className="num"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={text}
            data-prefilled={prefilled && text !== '' ? 'true' : undefined}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${hintId} ${errId}` : hintId}
            onChange={(e) => onChange(toLatinDigits(e.target.value))}
            onBlur={() => setTouched(true)}
          />
          <span className="input-unit input-unit-wide" aria-hidden="true">
            <Bi id="unit_inr_per_day" />
          </span>
        </div>
        <p id={hintId} className="field-hint">
          <Bi id={todayCost === null && !draft.budgetEdited ? 'hint_budget_required' : 'hint_budget_default'} />
        </p>
        {invalid && error && (
          <p id={errId} className="field-error" role="alert">
            <Bi id={error.id} params={error.params} />
          </p>
        )}
      </div>
      {todayCost !== null && (
        <p className="budget-today">
          <span className="budget-today-line">
            <Bi id="label_budget_today_cost" />:{' '}
            <Fig inline audit={auditUserInput('in-today-cost', t('audit_label_today_cost'), formatInr(todayCost), todayCost)}>
              {formatInr(todayCost)}
            </Fig>
          </span>
          {draft.budgetEdited && (
            <Button size="sm" variant="quiet" onClick={onUseToday}>
              <Bi id="action_use_today_cost" />
            </Button>
          )}
        </p>
      )}
    </section>
  );
}
