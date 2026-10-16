// The 1-tap demo presets (prototype only). Strings stay as typed form values.
// Every verdict case of SPEC AC-5.6 to AC-5.11 and AC-E7.1 has a preset, so a reviewer can reach it in one tap.
import type { StringId } from '../i18n/strings';
import { getRationAdapterMode } from '../services/rationService';
import type { HerdAnimal, HomeFeed } from './types';
import type { AnimalDraft, FeedDraft } from './validation';

export interface Preset {
  animal: AnimalDraft;
  feeds: FeedDraft[];
}

export type DemoKey =
  | 'gain'
  | 'at_level'
  | 'below_cost'
  | 'below_no'
  | 'same'
  | 'shortfall'
  | 'infeasible'
  | 'nondescript'
  | 'kankrej'
  | 'above'
  | 'roughage'
  | 'dry';

const animal = (
  species: 'cow' | 'buffalo',
  breedId: string,
  weight: string,
  milk: string,
  fat: string,
  budget = '',
): AnimalDraft => ({ species, breedId, weight, milk, fat, budget, budgetEdited: budget !== '' });

const feed = (feedId: string, price: string, cap: string, current = ''): FeedDraft => ({ feedId, price, cap, current });

/** Five feeds, no ration entered yet: used by the budget-driven demos. */
const MURRAH_FEEDS: FeedDraft[] = [
  feed('wheat_straw', '6', '8'),
  feed('maize_green', '2.5', '25'),
  feed('mustard_cake', '33', '3'),
  feed('bajra_grain', '24', '4'),
  feed('mineral_mix', '70', '0.15'),
  feed('common_salt', '8', '0.1'),
];

/** Gain: the budget defaults to today's ration cost (₹251.20/day), and the cheaper balanced ration (₹214.51/day) saves 14.6% and supports +0.8 L more milk. */
export const PRESET_BUFFALO: Preset = {
  animal: animal('buffalo', 'murrah', '450', '8.8', '6.5'),
  feeds: [
    feed('wheat_straw', '6', '8', '4.5'),
    feed('maize_green', '2.5', '40', '20'),
    feed('bajra_grain', '24', '6', '2.7'),
    feed('wheat_bran', '20', '5', '1.8'),
    feed('mustard_cake', '33', '3', '2.0'),
    feed('mineral_mix', '70', '0.15', '0.1'),
    feed('common_salt', '8', '0.1', '0.05'),
  ],
};

/** Today's 9.64 L equals the Murrah peak of 9.64 L: already at the breed level, and a cheaper ration is shown. */
const PRESET_AT_LEVEL: Preset = {
  animal: animal('buffalo', 'murrah', '450', '9.64', '6.5'),
  feeds: [
    feed('wheat_straw', '6', '8', '3'),
    feed('maize_green', '2.5', '40', '20'),
    feed('bajra_grain', '24', '6', '3.5'),
    feed('wheat_bran', '20', '5', '3'),
    feed('mustard_cake', '33', '3', '1.5'),
    feed('mineral_mix', '70', '0.15', '0.1'),
    feed('common_salt', '8', '0.1', '0.05'),
  ],
};

/** OQ15: 10 L is above the Murrah peak of 9.64 L, so 10 L is the cap used, and the budget keeps it. */
const PRESET_ABOVE: Preset = {
  animal: animal('buffalo', 'murrah', '450', '10', '6.5'),
  feeds: [
    feed('wheat_straw', '6', '8', '3'),
    feed('maize_green', '2.5', '40', '20'),
    feed('bajra_grain', '24', '6', '3.5'),
    feed('wheat_bran', '20', '5', '3'),
    feed('mustard_cake', '33', '3', '1.5'),
    feed('mineral_mix', '70', '0.15', '0.1'),
    feed('common_salt', '8', '0.1', '0.05'),
  ],
};

/** Only concentrates: the roughage minimum cannot be met, so the result is infeasible and a roughage feed is suggested. */
const PRESET_ROUGHAGE: Preset = {
  animal: animal('buffalo', 'murrah', '450', '6', '6.5', '200'),
  feeds: [feed('mustard_cake', '33', ''), feed('bajra_grain', '24', ''), feed('wheat_bran', '20', ''), feed('mineral_mix', '70', '0.15')],
};

/** A dry animal: milk 0, no fat percent needed. The cheapest maintenance ration. */
const PRESET_DRY: Preset = {
  animal: animal('buffalo', 'murrah', '450', '0', '', '120'),
  feeds: [feed('wheat_straw', '6', ''), feed('maize_green', '2.5', '25'), feed('mustard_cake', '33', '3'), feed('mineral_mix', '70', '0.15')],
};

/** A low budget supports less than today's 6.5 L; keeping 6.5 L needs more rupees per day. */
const PRESET_BELOW_COST: Preset = {
  animal: animal('buffalo', 'murrah', '450', '6.5', '6.5', '95'),
  feeds: MURRAH_FEEDS,
};

/** These feeds cannot reach 6 L at all (no protein source), so the verdict names the limiting nutrient. */
const PRESET_BELOW_NO: Preset = {
  animal: animal('buffalo', 'murrah', '450', '6', '6.5', '400'),
  feeds: [feed('wheat_straw', '6', ''), feed('maize_green', '2.5', '25'), feed('bajra_grain', '24', '3'), feed('mineral_mix', '70', '0.15')],
};

/** The budget is what 5 L costs, so the budget supports the same 5.0 L as today. */
const PRESET_SAME: Preset = {
  get animal(): AnimalDraft {
    const isLive = getRationAdapterMode() === 'live';
    return animal('buffalo', 'murrah', '450', '5', '6.5', isLive ? '144.64' : '136.01');
  },
  feeds: MURRAH_FEEDS,
};

/** ₹60 is below the cost of merely maintaining the animal with these dry/concentrate feeds; adding green forage fixes it. */
const PRESET_SHORTFALL: Preset = {
  animal: animal('buffalo', 'murrah', '450', '5', '6.5', '60'),
  feeds: [
    feed('wheat_straw', '6', '8'),
    feed('mustard_cake', '33', '3'),
    feed('bajra_grain', '24', '4'),
    feed('mineral_mix', '70', '0.15'),
  ],
};

/** E2: straw alone cannot meet protein or phosphorus, whatever the budget. */
export const PRESET_STRAW: Preset = {
  animal: animal('cow', 'hf_crossbred', '400', '12', '4', '100'),
  feeds: [feed('wheat_straw', '6', '')],
};

/** Tight budget: budget of ₹150 with Murrah buffalo triggers the budget increase prompt (AC-C3-2.12, AC-C3-2.15). */
export const PRESET_TIGHT_BUDGET: Preset = {
  animal: animal('buffalo', 'murrah', '450', '8.8', '6.5', '150'),
  feeds: [],
};

/** Non-descript cow: the benchmark is the DAHD national average and the breed fat is "not cited". Berseem is out of season in October. */
const PRESET_NONDESCRIPT: Preset = {
  animal: animal('cow', 'nondescript_cow', '350', '2', '4'),
  feeds: [
    feed('wheat_straw', '6', '6', '5'),
    feed('jowar_green', '2.5', '20', '10'),
    feed('berseem', '2.5', '15', '4'),
    feed('wheat_bran', '20', '3', '1.5'),
    feed('mustard_cake', '33', '2', '0.5'),
  ],
};

/** Kankrej: no cited fat percent, and a cap from the cited yield divided by the lactation length. */
const PRESET_KANKREJ: Preset = {
  animal: animal('cow', 'kankrej', '400', '4', '4.2'),
  feeds: [
    feed('wheat_straw', '6', '6', '5'),
    feed('jowar_green', '2.5', '20', '12'),
    feed('cottonseed_cake', '38', '2.5', '1.5'),
    feed('wheat_bran', '20', '3', '2'),
  ],
};

export interface DemoCase {
  key: DemoKey;
  labelId: StringId;
  preset: Preset;
}

/** The "Prototype states" strip lists these, in this order. */
export const DEMO_CASES: DemoCase[] = [
  { key: 'gain', labelId: 'demo_gain', preset: PRESET_BUFFALO },
  { key: 'at_level', labelId: 'demo_at_level', preset: PRESET_AT_LEVEL },
  { key: 'below_cost', labelId: 'demo_below_cost', preset: PRESET_BELOW_COST },
  { key: 'below_no', labelId: 'demo_below_no', preset: PRESET_BELOW_NO },
  { key: 'same', labelId: 'demo_same', preset: PRESET_SAME },
  { key: 'shortfall', labelId: 'demo_shortfall', preset: PRESET_SHORTFALL },
  { key: 'infeasible', labelId: 'demo_infeasible', preset: PRESET_STRAW },
  { key: 'nondescript', labelId: 'demo_nondescript', preset: PRESET_NONDESCRIPT },
  { key: 'kankrej', labelId: 'demo_kankrej', preset: PRESET_KANKREJ },
  { key: 'above', labelId: 'demo_above', preset: PRESET_ABOVE },
  { key: 'roughage', labelId: 'demo_roughage', preset: PRESET_ROUGHAGE },
  { key: 'dry', labelId: 'demo_dry', preset: PRESET_DRY },
];

// -------------------------------------------------------------------------------------------------
// C4-M2 Herd Examples (SPEC AC-C4-2.11)
// -------------------------------------------------------------------------------------------------

export type HerdExampleId = 'cow_buffalo' | 'straw_only' | 'tight_budget';
export const HERD_EXAMPLE_IDS: readonly HerdExampleId[] = ['cow_buffalo', 'straw_only', 'tight_budget'];

export interface HerdExample {
  id: HerdExampleId;
  title: string;
  animals: HerdAnimal[];
  homeFeeds: HomeFeed[];
  budget: number;
  budgetInrPerDay: number;
  animal?: HerdAnimal;
}

/** 1. 'Cow + Buffalo' (cow_buffalo): feasible plan for both animals (AC-C4-2.11) */
export const HERD_EXAMPLE_COW_BUFFALO: HerdExample = {
  id: 'cow_buffalo',
  title: 'Cow + Buffalo',
  animals: [
    {
      key: 'a1',
      label: { species: 'cow', n: 1 },
      profile: {
        species: 'cow',
        breedId: 'rathi',
        bodyWeightKg: 295,
        milkYieldLitersPerDay: 6,
        milkFatPct: 3.85,
      },
      weightSource: 'breed',
      fatSource: 'breed_midpoint',
      isConfirmed: true,
    },
    {
      key: 'a2',
      label: { species: 'buffalo', n: 1 },
      profile: {
        species: 'buffalo',
        breedId: 'murrah',
        bodyWeightKg: 516,
        milkYieldLitersPerDay: 8,
        milkFatPct: 7.34,
      },
      weightSource: 'breed',
      fatSource: 'breed',
      isConfirmed: true,
    },
  ],
  homeFeeds: [{ feedId: 'wheat_straw', kgPerDay: 10 }],
  budget: 400,
  budgetInrPerDay: 400,
  get animal() {
    return this.animals[0];
  },
};

/** 2. 'Straw only' (straw_only): home wheat straw with a 'What to buy' list of at least one line (AC-C4-2.11) */
export const HERD_EXAMPLE_STRAW_ONLY: HerdExample = {
  id: 'straw_only',
  title: 'Straw only',
  animals: [
    {
      key: 'a1',
      label: { species: 'cow', n: 1 },
      profile: {
        species: 'cow',
        breedId: 'hariana',
        bodyWeightKg: 325,
        milkYieldLitersPerDay: 5,
        milkFatPct: 4.5,
      },
      weightSource: 'breed',
      fatSource: 'breed',
      isConfirmed: true,
    },
    {
      key: 'a2',
      label: { species: 'cow', n: 2 },
      profile: {
        species: 'cow',
        breedId: 'nondescript_cow',
        bodyWeightKg: 280,
        milkYieldLitersPerDay: 3,
        milkFatPct: 4.2,
      },
      weightSource: 'typed',
      fatSource: 'typed',
      isConfirmed: true,
    },
  ],
  homeFeeds: [{ feedId: 'wheat_straw', kgPerDay: 12 }],
  budget: 250,
  budgetInrPerDay: 250,
  get animal() {
    return this.animals[0];
  },
};

/** 3. 'Tight budget' (tight_budget): shows 'Add ₹X/day to reach Y L' budget prompt (AC-C4-2.11) */
export const HERD_EXAMPLE_TIGHT_BUDGET: HerdExample = {
  id: 'tight_budget',
  title: 'Tight budget',
  animals: [
    {
      key: 'a1',
      label: { species: 'cow', n: 1 },
      profile: {
        species: 'cow',
        breedId: 'sahiwal',
        bodyWeightKg: 298,
        milkYieldLitersPerDay: 10,
        milkFatPct: 4.93,
      },
      weightSource: 'breed',
      fatSource: 'breed',
      isConfirmed: true,
    },
    {
      key: 'a2',
      label: { species: 'buffalo', n: 1 },
      profile: {
        species: 'buffalo',
        breedId: 'murrah',
        bodyWeightKg: 516,
        milkYieldLitersPerDay: 8,
        milkFatPct: 7.34,
      },
      weightSource: 'breed',
      fatSource: 'breed',
      isConfirmed: true,
    },
  ],
  homeFeeds: [{ feedId: 'wheat_straw', kgPerDay: 8 }],
  budget: 200,
  budgetInrPerDay: 200,
  get animal() {
    return this.animals[0];
  },
};

export const HERD_EXAMPLES: Record<HerdExampleId, HerdExample> = {
  cow_buffalo: HERD_EXAMPLE_COW_BUFFALO,
  straw_only: HERD_EXAMPLE_STRAW_ONLY,
  tight_budget: HERD_EXAMPLE_TIGHT_BUDGET,
};

export const HERD_PRESETS = HERD_EXAMPLES;
export const M2_EXAMPLES = HERD_EXAMPLES;
