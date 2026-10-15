import { useId, useState } from 'react';
import { MAX_ANIMALS } from '../domain/herdPlan';
import type { BreedStandard, HerdAnimal, HerdAnimalProfile } from '../domain/types';
import type { AnimalCardDraft } from '../domain/validation';
import { validateBudget } from '../domain/validation';
import { toLatinDigits } from '../i18n/format';
import { Bi } from '../i18n/Bi';
import type { StringIdC4 } from '../i18n/strings';
import type { StringId } from '../i18n/strings';
import { HERD_EXAMPLE_IDS } from '../services/planHerdPrototypeMock';
import type { HerdExampleId } from '../services/planHerdPrototypeMock';
import { AnimalCardForm } from './AnimalCardForm';
import { AnimalList } from './AnimalList';
import { StepBar } from './StepNav';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface Props {
  animals: HerdAnimal[];
  breeds: BreedStandard[];
  editingKey: string | null;
  draft: AnimalCardDraft;
  onDraftChange: (next: AnimalCardDraft) => void;
  onSubmitCard: (profile: HerdAnimalProfile, draft: AnimalCardDraft) => void;
  onCancelEdit: () => void;
  onEdit: (key: string) => void;
  onRemove: (key: string) => void;
  herdBudget: string;
  onBudgetChange: (text: string) => void;
  onNext: () => void;
  onExample: (id: HerdExampleId) => void;
  /** Examples are fixtures that load as a separate chunk; the buttons wait for it. */
  examplesReady: boolean;
}

const EXAMPLE_TEXT: Record<HerdExampleId, { name: StringIdC4 | StringId; note: StringIdC4 | StringId }> = {
  cow_buffalo: { name: 'c4_example_cow_buffalo', note: 'note_demo_solved' },
  straw_only: { name: 'action_demo_straw', note: 'note_demo_needs_buy' },
  tight_budget: { name: 'action_demo_tight_budget', note: 'note_demo_tight_budget' },
};

/** One budget for the whole herd, in rupees per day, spent only on buying feed (AC-C4-1.7). */
function HerdBudgetField({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const uid = useId();
  const [touched, setTouched] = useState(false);
  const { error } = validateBudget(value);
  // A blank field is explained by the line above Next; only a typed value that is not a positive number is an error.
  const invalid = touched && value.trim() !== '' && error !== undefined;
  return (
    <section className="block c4-budget" aria-labelledby={`${uid}-q`}>
      <div className="field">
        <label id={`${uid}-q`} htmlFor={`${uid}-input`} className="c4-budget-q">
          <Bi id="c4_budget_label" />
        </label>
        <div className="input-wrap input-wrap-wide">
          <Input
            id={`${uid}-input`}
            className="num"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            aria-invalid={invalid || undefined}
            aria-describedby={`${uid}-hint${invalid ? ` ${uid}-err` : ''}`}
            onChange={(e) => onChange(toLatinDigits(e.target.value))}
            onBlur={() => setTouched(true)}
          />
          <span className="input-unit input-unit-wide" aria-hidden="true">
            <Bi id="unit_inr_per_day" />
          </span>
        </div>
        <p id={`${uid}-hint`} className="field-hint">
          <Bi id="c4_budget_hint" />
        </p>
        {invalid && error && (
          <p id={`${uid}-err`} className="field-error" role="alert">
            <Bi id={error.id} params={error.params} />
          </p>
        )}
      </div>
    </section>
  );
}

/** Screen 1, "Your animals": the list, the add card, one herd budget, Next, and the examples. */
export function AnimalsScreen(props: Props) {
  const { animals, breeds, editingKey, draft, herdBudget } = props;
  const reasonId = useId();
  const budgetOk = validateBudget(herdBudget).value !== null;
  const canNext = animals.length > 0 && budgetOk;
  const editing = animals.find((a) => a.key === editingKey) ?? null;
  const cardOpen = animals.length < MAX_ANIMALS || editing !== null;

  const reasons = [
    ...(animals.length === 0 ? [<Bi key="a" id="c4_gate_add_animal" />] : []),
    ...(!budgetOk ? [<Bi key="b" id="c4_gate_budget" />] : []),
  ];

  return (
    <>
      <AnimalList animals={animals} breeds={breeds} editingKey={editingKey} onEdit={props.onEdit} onRemove={props.onRemove} />

      {cardOpen && (
        <AnimalCardForm
          key={editingKey ?? 'new'}
          draft={draft}
          breeds={breeds}
          editing={editing?.label ?? null}
          onChange={props.onDraftChange}
          onSubmit={props.onSubmitCard}
          onCancel={props.onCancelEdit}
        />
      )}

      <HerdBudgetField value={herdBudget} onChange={props.onBudgetChange} />

      <StepBar
        reasonId={reasonId}
        primary={<Bi id="c4_action_next" />}
        onPrimary={props.onNext}
        primaryDisabled={!canNext}
        reasons={reasons}
      />

      <section className="c4-examples" aria-labelledby="c4-examples-h" data-c4="examples">
        <h2 id="c4-examples-h" className="presets-title">
          <Bi id="label_try_example" />
        </h2>
        <p className="field-hint">
          <Bi id="c4_examples_hint" />
        </p>
        <div className="c4-examples-list">
          {HERD_EXAMPLE_IDS.map((id) => (
            <Button key={id} variant="preset" disabled={!props.examplesReady} onClick={() => props.onExample(id)} data-example={id}>
              <span className="preset-name">
                <Bi id={EXAMPLE_TEXT[id].name} />
              </span>
              <span className="preset-note">
                <Bi id={EXAMPLE_TEXT[id].note} />
              </span>
            </Button>
          ))}
        </div>
      </section>
    </>
  );
}
