// Herd rules that need no solver. Prototype subset: the real plan rules (buy order, steps, prompts) arrive with the
// joint herd LP (docs/ARCHITECTURE.md, "C4 module map"); this file already holds the labelling rule they share.
import type { AnimalLabel, Species } from './types';

/** The most animals a herd can hold (SPEC AC-C4-E5). One constant so the limit is changed in one place. */
export const MAX_ANIMALS = 10;

export type LabelCounters = Record<Species, number>;

export const EMPTY_COUNTERS: LabelCounters = { cow: 0, buffalo: 0 };

/**
 * The next label for a species: the highest number used so far plus 1. Counters only ever go up, so a removed
 * animal's number is never reused and a label on screen 3 always means the same animal as on screen 1 (OQ-C4-3).
 */
export function nextAnimalLabel(counters: LabelCounters, species: Species): { label: AnimalLabel; counters: LabelCounters } {
  const n = counters[species] + 1;
  return { label: { species, n }, counters: { ...counters, [species]: n } };
}
