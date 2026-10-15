import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { auditPrefillFat, auditPrefillWeight, labelBi } from '../domain/auditHerd';
import { breedById, breedLabel, breedPrefill, breedsFor, isNonDescript } from '../domain/breeds';
import type { AnimalLabel, BreedStandard, HerdAnimalProfile } from '../domain/types';
import type { AnimalCardDraft, AnimalField, FieldError } from '../domain/validation';
import { RANGES, validateAnimalCard } from '../domain/validation';
import { formatNumber, toLatinDigits } from '../i18n/format';
import { Bi } from '../i18n/Bi';
import { useLang } from '../i18n/LanguageProvider';
import { bi, t } from '../i18n/strings';
import type { StringId } from '../i18n/strings';
import { Fig } from './Fig';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface Props {
  draft: AnimalCardDraft;
  breeds: BreedStandard[];
  /** The animal being edited; null while the card adds a new one. Its species is fixed so a label never names the wrong species. */
  editing: AnimalLabel | null;
  onChange: (next: AnimalCardDraft) => void;
  onSubmit: (profile: HerdAnimalProfile, draft: AnimalCardDraft) => void;
  onCancel: () => void;
}

/** Applies a breed pick: only fields the user has not typed in take the breed's cited value (AC-C4-1.5). */
function withBreed(draft: AnimalCardDraft, breedId: string, breeds: BreedStandard[]): AnimalCardDraft {
  const breed = breedById(breedId, breeds);
  const pf = breed ? breedPrefill(breed) : null;
  return {
    ...draft,
    breedId,
    weight: draft.weightTyped ? draft.weight : pf?.weightKg != null ? String(pf.weightKg) : '',
    fat: draft.fatTyped ? draft.fat : pf?.fatPct != null ? String(pf.fatPct) : '',
  };
}

interface NumberFieldProps {
  field: Exclude<AnimalField, 'species' | 'breed' | 'budget'>;
  labelId: StringId | 'c4_label_milk';
  unit: string;
  hint: ReactNode;
  value: string;
  error: FieldError | undefined;
  showError: boolean;
  prefilled: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
}

function NumberField({ field, labelId, unit, hint, value, error, showError, prefilled, onChange, onBlur }: NumberFieldProps) {
  const uid = useId();
  const inputId = `${uid}-${field}`;
  const invalid = showError && error !== undefined;
  return (
    <div className="field">
      <label htmlFor={inputId} className="field-label">
        <Bi id={labelId} />
      </label>
      <div className="input-wrap">
        <Input
          id={inputId}
          className="num"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          data-prefilled={prefilled ? 'true' : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={`${inputId}-hint${invalid ? ` ${inputId}-err` : ''}`}
          onChange={(e) => onChange(toLatinDigits(e.target.value))}
          onBlur={onBlur}
        />
        <span className="input-unit" aria-hidden="true">
          {unit}
        </span>
      </div>
      <p id={`${inputId}-hint`} className="field-hint">
        {hint}
      </p>
      {invalid && error && (
        <p id={`${inputId}-err`} className="field-error" role="alert">
          <Bi id={error.id} params={error.params} />
        </p>
      )}
    </div>
  );
}

/** The add / edit card of screen 1: species, breed, today's milk, and weight and fat prefilled from the breed row. */
export function AnimalCardForm({ draft, breeds, editing, onChange, onSubmit, onCancel }: Props) {
  const { lang } = useLang();
  const uid = useId();
  const [touched, setTouched] = useState<Partial<Record<AnimalField, boolean>>>({});
  const touch = (f: AnimalField) => setTouched((prev) => ({ ...prev, [f]: true }));

  const { errors, profile } = validateAnimalCard(draft);
  const options = draft.species === '' ? [] : breedsFor(draft.species, breeds);
  const breed = options.find((b) => b.id === draft.breedId);
  const prefill = breed ? breedPrefill(breed) : null;

  const range = (r: { min: number; max: number }, unit: string) => `${formatNumber(r.min, r.min % 1 === 0 ? 0 : 1)}–${formatNumber(r.max, r.max % 1 === 0 ? 0 : 1)} ${unit}`;

  // The prefill hint names the source of the number; a typed number is labelled "your value".
  const sourceHint = (typed: boolean, value: string, cited: number | null, audit: ReactNode, extra?: string, rangeText?: string): ReactNode => {
    if (value.trim() === '') return rangeText;
    if (typed) return <Bi id="c4_hint_your_value" />;
    if (cited === null) return rangeText;
    return (
      <>
        {audit} · <Bi id="c4_hint_typical" />
        {extra ? <> · {extra}</> : null}
      </>
    );
  };

  const weightAudit = breed ? auditPrefillWeight(breed) : null;
  const fatAudit = breed ? auditPrefillFat(breed) : null;
  const weightHint = sourceHint(
    draft.weightTyped,
    draft.weight,
    prefill?.weightKg ?? null,
    <Fig inline audit={weightAudit}>
      {formatNumber(prefill?.weightKg ?? 0, 0)}&nbsp;kg
    </Fig>,
    undefined,
    range(RANGES.weight, 'kg'),
  );
  const fatHint = sourceHint(
    draft.fatTyped,
    draft.fat,
    prefill?.fatPct ?? null,
    <Fig inline audit={fatAudit}>
      {formatNumber(prefill?.fatPct ?? 0, 2)}%
    </Fig>,
    prefill?.fatIsMidpoint ? bi('c4_hint_midpoint') : undefined,
    range(RANGES.fat, '%'),
  );

  const show = (f: AnimalField) => Boolean(touched[f]);
  const visibleErrors = (['species', 'breed', 'milk', 'weight', 'fat'] as const).filter((f) => show(f) && errors[f]);
  // With nothing flagged yet, the disabled button still says what is missing, in the order the card is filled.
  const firstMissing = (['species', 'breed', 'milk', 'weight', 'fat'] as const).map((f) => errors[f]).find(Boolean);
  const reasonId = `${uid}-reason`;

  const submit = () => {
    if (profile) onSubmit(profile, draft);
  };

  return (
    <fieldset className="block c4-card-form" data-c4="animal-card">
      <legend className="block-title">
        {editing ? <Bi id="c4_card_edit_title" params={{ animal: labelBi(editing) }} /> : <Bi id="c4_card_add_title" />}
      </legend>

      <div className="field">
        <span className="field-label" id={`${uid}-species`}>
          <Bi id="label_species" />
        </span>
        <div className="c4-species" role="group" aria-labelledby={`${uid}-species`}>
          {(['cow', 'buffalo'] as const).map((s) => {
            const on = draft.species === s;
            return (
              <button
                key={s}
                type="button"
                className="c4-species-btn"
                aria-pressed={on}
                disabled={editing !== null && !on}
                onClick={() => {
                  touch('species');
                  if (draft.species === s) return;
                  onChange({
                    ...draft,
                    species: s,
                    breedId: '',
                    weight: draft.weightTyped ? draft.weight : '',
                    fat: draft.fatTyped ? draft.fat : '',
                  });
                }}
              >
                {on && <Check size={20} strokeWidth={3} aria-hidden="true" />}
                <Bi id={s === 'cow' ? 'label_cow' : 'label_buffalo'} />
              </button>
            );
          })}
        </div>
        {show('species') && errors.species && (
          <p className="field-error" role="alert">
            <Bi id={errors.species.id} params={errors.species.params} />
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor={`${uid}-breed`} className="field-label">
          <Bi id="label_breed" />
        </label>
        <select
          id={`${uid}-breed`}
          className="input"
          value={breed ? draft.breedId : ''}
          disabled={draft.species === ''}
          aria-invalid={show('breed') && errors.breed ? true : undefined}
          aria-describedby={draft.species === '' ? `${uid}-breed-hint` : undefined}
          onChange={(e) => onChange(withBreed(draft, e.target.value, breeds))}
          onBlur={() => touch('breed')}
        >
          <option value="">{bi('option_choose_breed')}</option>
          {options.map((b) => (
            <option key={b.id} value={b.id}>
              {isNonDescript(b) ? bi('c4_breed_desi') : breedLabel(b, lang)}
            </option>
          ))}
        </select>
        {draft.species === '' && (
          <p id={`${uid}-breed-hint`} className="field-hint">
            <Bi id="hint_breed_first" />
          </p>
        )}
        {show('breed') && errors.breed && (
          <p className="field-error" role="alert">
            <Bi id={errors.breed.id} params={errors.breed.params} />
          </p>
        )}
      </div>

      <NumberField
        field="milk"
        labelId="c4_label_milk"
        unit="L"
        hint={range(RANGES.milk, 'L')}
        value={draft.milk}
        error={errors.milk}
        showError={show('milk')}
        prefilled={false}
        onChange={(v) => onChange({ ...draft, milk: v })}
        onBlur={() => touch('milk')}
      />

      <div className="c4-pair">
        <NumberField
          field="weight"
          labelId="label_weight"
          unit="kg"
          hint={weightHint}
          value={draft.weight}
          error={errors.weight}
          showError={show('weight')}
          prefilled={prefill?.weightKg != null && !draft.weightTyped && draft.weight !== ''}
          onChange={(v) => onChange({ ...draft, weight: v, weightTyped: v.trim() !== '' })}
          onBlur={() => touch('weight')}
        />
        <NumberField
          field="fat"
          labelId="label_fat"
          unit="%"
          hint={fatHint}
          value={draft.fat}
          error={errors.fat}
          showError={show('fat')}
          prefilled={prefill?.fatPct != null && !draft.fatTyped && draft.fat !== ''}
          onChange={(v) => onChange({ ...draft, fat: v, fatTyped: v.trim() !== '' })}
          onBlur={() => touch('fat')}
        />
      </div>

      <div className="c4-card-actions">
        <Button variant="green" className="c4-card-add" disabled={!profile} onClick={submit} aria-describedby={!profile && visibleErrors.length === 0 && firstMissing ? reasonId : undefined}>
          <Bi id={editing ? 'c4_action_save' : 'c4_action_add_animal'} />
        </Button>
        {editing && (
          <Button onClick={onCancel}>
            <Bi id="c4_action_cancel" />
          </Button>
        )}
      </div>
      {!profile && visibleErrors.length === 0 && firstMissing && (
        <p id={reasonId} className="field-hint c4-card-reason">
          <Bi id="c4_card_reason" params={{ reason: t(firstMissing.id, firstMissing.params) }} />
        </p>
      )}
    </fieldset>
  );
}
