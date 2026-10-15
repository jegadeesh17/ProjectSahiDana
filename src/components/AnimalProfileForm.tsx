import { useId, useState } from 'react';
import { breedLabel, breedsFor } from '../domain/breeds';
import type { BreedStandard } from '../domain/types';
import type { AnimalErrors, AnimalDraft, AnimalField, FieldError } from '../domain/validation';
import { RANGES } from '../domain/validation';
import { formatNumber, parseDecimal, toLatinDigits } from '../i18n/format';
import { Bi } from '../i18n/Bi';
import { useLang } from '../i18n/LanguageProvider';
import { BreedBenchmark } from './BreedBenchmark';
import type { StringId } from '../i18n/strings';
import { bi } from '../i18n/strings';

interface AnimalProfileFormProps {
  draft: AnimalDraft;
  errors: AnimalErrors;
  breeds: BreedStandard[];
  onChange: (next: AnimalDraft) => void;
  /** Values filled by the AI and not yet confirmed. */
  prefilled: boolean;
}

interface NumberFieldProps {
  field: Exclude<AnimalField, 'species' | 'breed' | 'budget'>;
  labelId: StringId;
  unit: string;
  hint: string;
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
  const hintId = `${inputId}-hint`;
  const errId = `${inputId}-err`;
  const invalid = showError && error !== undefined;
  return (
    <div className="field">
      <label htmlFor={inputId} className="field-label">
        <Bi id={labelId} />
      </label>
      <div className="input-wrap">
        <input
          id={inputId}
          className="input num"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          data-prefilled={prefilled && value !== '' ? 'true' : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${hintId} ${errId}` : hintId}
          onChange={(e) => onChange(toLatinDigits(e.target.value))}
          onBlur={onBlur}
        />
        <span className="input-unit" aria-hidden="true">
          {unit}
        </span>
      </div>
      <p id={hintId} className="field-hint num">
        {hint}
      </p>
    </div>
  );
}

/** Species, body weight, milk yield and fat percent with inline validation on blur (E1). */
export function AnimalProfileForm({ draft, errors, breeds, onChange, prefilled }: AnimalProfileFormProps) {
  const { lang } = useLang();
  const [touched, setTouched] = useState<Partial<Record<AnimalField, boolean>>>({});
  const touch = (f: AnimalField) => setTouched((prev) => ({ ...prev, [f]: true }));
  const anyNumberTouched = Boolean(touched.weight || touched.milk || touched.fat);
  const show = (f: AnimalField) =>
    f === 'species' || f === 'breed' ? Boolean(touched[f] || anyNumberTouched) : Boolean(touched[f]);

  const range = (r: { min: number; max: number }, unit: string) =>
    `${formatNumber(r.min, r.min % 1 === 0 ? 0 : 1)}–${formatNumber(r.max, r.max % 1 === 0 ? 0 : 1)} ${unit}`;

  const errorList = (['species', 'breed', 'weight', 'milk', 'fat'] as const).filter((f) => show(f) && errors[f]);
  const errId = useId();
  const breedId = useId();
  const options = draft.species === '' ? [] : breedsFor(draft.species, breeds);
  const chosen = options.find((b) => b.id === draft.breedId);
  const todayMilk = parseDecimal(draft.milk);

  return (
    <fieldset className="block" aria-describedby={errorList.length > 0 ? errId : undefined}>
      <legend className="block-title">
        <Bi id={draft.species === 'cow' ? 'label_animal_cow' : draft.species === 'buffalo' ? 'label_animal_buffalo' : 'label_animal'} />
      </legend>

      <div className="field">
        <span className="field-label" id={`${errId}-species`}>
          <Bi id="label_species" />
        </span>
        <div className="seg" role="group" aria-labelledby={`${errId}-species`}>
          {(['cow', 'buffalo'] as const).map((s) => (
            <button
              key={s}
              type="button"
              className="seg-btn"
              aria-pressed={draft.species === s}
              data-prefilled={prefilled && draft.species === s ? 'true' : undefined}
              onClick={() => {
                touch('species');
                onChange({ ...draft, species: s, breedId: draft.species === s ? draft.breedId : '' });
              }}
            >
              <Bi id={s === 'cow' ? 'label_cow' : 'label_buffalo'} />
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor={breedId} className="field-label">
          <Bi id="label_breed" />
        </label>
        <select
          id={breedId}
          className="input"
          value={chosen ? draft.breedId : ''}
          disabled={draft.species === ''}
          data-prefilled={prefilled && draft.breedId !== '' ? 'true' : undefined}
          aria-invalid={show('breed') && errors.breed ? true : undefined}
          aria-describedby={draft.species === '' ? `${breedId}-hint` : undefined}
          onChange={(e) => onChange({ ...draft, breedId: e.target.value })}
          onBlur={() => touch('breed')}
        >
          <option value="">{bi('option_choose_breed')}</option>
          {options.map((b) => (
            <option key={b.id} value={b.id}>
              {breedLabel(b, lang)}
            </option>
          ))}
        </select>
        {draft.species === '' && (
          <p id={`${breedId}-hint`} className="field-hint">
            <Bi id="hint_breed_first" />
          </p>
        )}
      </div>

      {chosen && <BreedBenchmark breed={chosen} todayMilk={Number.isNaN(todayMilk) ? null : todayMilk} />}

      <div className="grid grid-cols-3 gap-3">
        <NumberField
          field="weight"
          labelId="label_weight"
          unit="kg"
          hint={range(RANGES.weight, 'kg')}
          value={draft.weight}
          error={errors.weight}
          showError={show('weight')}
          prefilled={prefilled}
          onChange={(v) => onChange({ ...draft, weight: v })}
          onBlur={() => touch('weight')}
        />
        <NumberField
          field="milk"
          labelId="label_milk"
          unit="L"
          hint={range(RANGES.milk, 'L')}
          value={draft.milk}
          error={errors.milk}
          showError={show('milk')}
          prefilled={prefilled}
          onChange={(v) => onChange({ ...draft, milk: v })}
          onBlur={() => touch('milk')}
        />
        <NumberField
          field="fat"
          labelId="label_fat"
          unit="%"
          hint={range(RANGES.fat, '%')}
          value={draft.fat}
          error={errors.fat}
          showError={show('fat')}
          prefilled={prefilled}
          onChange={(v) => onChange({ ...draft, fat: v })}
          onBlur={() => touch('fat')}
        />
      </div>

      {errorList.length > 0 && (
        <ul id={errId} className="errors" role="alert">
          {errorList.map((f) => {
            const e = errors[f]!;
            return (
              <li key={f}>
                <Bi id={e.id} params={e.params} />
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}
