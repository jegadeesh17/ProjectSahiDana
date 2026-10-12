// Input validation for the animal form, the budget and the selected-feed rows (SPEC E1, AC-4.2, AC-4.3).
import { parseDecimal } from '../i18n/format';
import type { BiParams, StringId } from '../i18n/strings';
import { breedById } from './breeds';
import type { AnimalProfile, SelectedFeedInput, Species } from './types';

export const RANGES = {
  weight: { min: 150, max: 800 },
  milk: { min: 0, max: 40 },
  fat: { min: 2.5, max: 10 },
} as const;

export const DEFAULT_FAT: Record<Species, number> = { cow: 4, buffalo: 6 };

export interface AnimalDraft {
  species: '' | Species;
  breedId: string;
  weight: string;
  milk: string;
  fat: string;
  /** What the user typed. Ignored until budgetEdited is true. */
  budget: string;
  /** true once the user has typed in the budget; later changes to today's ration no longer overwrite it (AC-4.2). */
  budgetEdited: boolean;
}

export interface FieldError {
  id: StringId;
  params?: BiParams;
}

export type AnimalField = 'species' | 'breed' | 'weight' | 'milk' | 'fat' | 'budget';
export type AnimalErrors = Partial<Record<AnimalField, FieldError>>;

export const EMPTY_ANIMAL: AnimalDraft = {
  species: '',
  breedId: '',
  weight: '',
  milk: '',
  fat: '',
  budget: '',
  budgetEdited: false,
};

function rangeError(
  raw: string,
  value: number,
  range: { min: number; max: number },
  id: StringId,
): FieldError | undefined {
  if (raw.trim() === '' || Number.isNaN(value)) return { id: 'error_number_required' };
  if (value < range.min || value > range.max) return { id, params: { min: range.min, max: range.max } };
  return undefined;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The text the budget field shows: the user's own value once edited, else today's cost when there is one (AC-4.2). */
export function budgetFieldText(draft: AnimalDraft, todayCostInr: number | null): string {
  if (draft.budgetEdited) return draft.budget;
  if (todayCostInr !== null && todayCostInr > 0) return String(round2(todayCostInr));
  return draft.budget;
}

/** true while the field shows today's cost rather than something the user typed. */
export function budgetIsDefault(draft: AnimalDraft, todayCostInr: number | null): boolean {
  return !draft.budgetEdited && todayCostInr !== null && todayCostInr > 0;
}

export function validateBudget(raw: string): { value: number | null; error?: FieldError } {
  if (raw.trim() === '') return { value: null, error: { id: 'error_budget_required' } };
  const value = parseDecimal(raw);
  if (Number.isNaN(value) || value <= 0) return { value: null, error: { id: 'error_budget_invalid' } };
  return { value };
}

export function validateAnimal(
  draft: AnimalDraft,
  todayCostInr: number | null = null,
): {
  errors: AnimalErrors;
  profile: Omit<AnimalProfile, 'isConfirmed'> | null;
} {
  const errors: AnimalErrors = {};
  if (draft.species === '') errors.species = { id: 'error_species_required' };

  const breed = draft.breedId === '' ? undefined : breedById(draft.breedId);
  if (!breed || (draft.species !== '' && breed.species !== draft.species)) errors.breed = { id: 'error_breed_required' };

  const weight = parseDecimal(draft.weight);
  const milk = parseDecimal(draft.milk);
  const weightError = rangeError(draft.weight, weight, RANGES.weight, 'error_weight_range');
  const milkError = rangeError(draft.milk, milk, RANGES.milk, 'error_milk_range');
  if (weightError) errors.weight = weightError;
  if (milkError) errors.milk = milkError;

  // A dry animal (0 L) does not need a fat percentage; the species default is used (SPEC open question 1).
  const fatBlank = draft.fat.trim() === '';
  let fat = parseDecimal(draft.fat);
  if (fatBlank && milk === 0 && draft.species !== '') fat = DEFAULT_FAT[draft.species];
  else {
    const fatError = rangeError(draft.fat, fat, RANGES.fat, 'error_fat_range');
    if (fatError) errors.fat = fatError;
  }

  const budget = validateBudget(budgetFieldText(draft, todayCostInr));
  if (budget.error) errors.budget = budget.error;

  if (Object.keys(errors).length > 0 || draft.species === '' || !breed || budget.value === null) return { errors, profile: null };
  return {
    errors,
    profile: {
      species: draft.species,
      breedId: breed.id,
      bodyWeightKg: weight,
      milkYieldLitersPerDay: milk,
      milkFatPct: fat,
      budgetInrPerDay: budget.value,
    },
  };
}

export interface FeedDraft {
  feedId: string;
  price: string;
  cap: string;
  current: string;
}

export type FeedField = 'price' | 'cap' | 'current';
export type FeedErrors = Partial<Record<FeedField, FieldError>>;

function nonNegative(raw: string, required: boolean): { value: number | null; error?: FieldError } {
  if (raw.trim() === '') {
    return required ? { value: null, error: { id: 'error_price_invalid' } } : { value: null };
  }
  const value = parseDecimal(raw);
  if (Number.isNaN(value) || value < 0) {
    return { value: null, error: { id: required ? 'error_price_invalid' : 'error_qty_invalid' } };
  }
  return { value };
}

export function validateFeed(draft: FeedDraft): { errors: FeedErrors; input: SelectedFeedInput | null } {
  const errors: FeedErrors = {};
  const price = nonNegative(draft.price, true);
  const cap = nonNegative(draft.cap, false);
  const current = nonNegative(draft.current, false);
  if (price.error) errors.price = price.error;
  if (cap.error) errors.cap = cap.error;
  if (current.error) errors.current = current.error;
  if (Object.keys(errors).length > 0 || price.value === null) return { errors, input: null };
  return {
    errors,
    input: {
      feedId: draft.feedId,
      priceInrPerKgAsFed: price.value,
      maxKgAsFedPerDay: cap.value,
      currentKgAsFedPerDay: current.value,
    },
  };
}

/** Today's cost in rupees per day: the sum of kg/day times price over the rows that have both (AC-4.1). Null when none do. */
export function todayCostInr(drafts: FeedDraft[]): number | null {
  let total = 0;
  let any = false;
  for (const d of drafts) {
    const kg = parseDecimal(d.current);
    const price = parseDecimal(d.price);
    if (Number.isNaN(kg) || Number.isNaN(price) || kg <= 0 || price < 0) continue;
    total += kg * price;
    any = true;
  }
  return any ? total : null;
}
