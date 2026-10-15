// Shared domain types (docs/ARCHITECTURE.md, "Data models" and "Client-Side Adapter Interface").
import type { BiText, StringId } from '../i18n/strings';

export type Species = 'cow' | 'buffalo';

export interface AnimalProfile {
  species: Species;
  /** id of a BreedStandard of this species ("Non-descript" rows included). */
  breedId: string;
  bodyWeightKg: number;
  milkYieldLitersPerDay: number;
  milkFatPct: number;
  /** Daily feed budget in rupees per day. Defaults to today's ration cost (see validation.ts). */
  budgetInrPerDay: number;
  /** false while the values come from LLM extraction and the user has not confirmed them. */
  isConfirmed: boolean;
}

/** The three verticals of the Track 6 card, plus Mineral. The picker shows the groups in this order. */
export type FeedVertical = 'indigenous_forage' | 'crop_residue' | 'agro_byproduct' | 'mineral';
export const FEED_VERTICALS: readonly FeedVertical[] = ['indigenous_forage', 'crop_residue', 'agro_byproduct', 'mineral'];

/** mandi = data.gov.in, trade_report = SEA/NCDEX/news, listing = IndiaMART/TradeIndia (shown as 'indicative'). */
export type PriceReliability = 'mandi' | 'trade_report' | 'listing' | 'team_estimate';

export interface FeedItem {
  id: string;
  englishName: string;
  localNameLatn: string | null;
  localNameLatnCitation: string | null;
  localNameDeva: string | null;
  localNameDevaProvenance: 'cited' | 'team-asserted' | null;
  vertical: FeedVertical;
  dmPct: number;
  cpPctDm: number;
  meMcalPerKgDm: number;
  caGramsPerKgDm: number;
  pGramsPerKgDm: number;
  derivedTdnPctDm: number;
  sourceDoc: string;
  sourceTable: string;
  sourcePage: string;
  dmSourceCitation: string;
  provenanceStatus: 'cited' | 'derived' | 'team-asserted';
  nutrientNote?: string | null;
  defaultPriceInrPerKgAsFed: number | null;
  priceSource: string | null;
  priceSourceUrl?: string | null;
  /** YYYY-MM-DD. A month-only source uses the first of the month and says so in priceNote. */
  priceDate: string | null;
  priceReliability: PriceReliability | null;
  /** Range, caveat, or the stated reason for a team estimate. */
  priceNote: BiText | null;
  /** Months (1 to 12) in which the feed is available near Jaipur. */
  availableMonths: number[];
  /** Source note about the season, in both languages; shown in the audit sheet. */
  seasonNote: BiText;
  seasonCitation?: string;
  seasonProvenance?: 'cited' | 'team-asserted';
  /** YYYY-MM-DD of the human expert check; null = expert check pending. */
  verifiedOn: string | null;
  /** Prototype only: marks every fixture value so nobody mistakes it for the cited library (M1). */
  sourceKey?: string;
  isPrototypeFixture?: boolean;
}

/** How the milk cap was derived (SPEC shared definitions). */
export type CapBasis = 'cited_peak' | 'range_top' | 'breed_average' | 'breed_average_calc' | 'dahd_average';

export interface BreedCitation {
  doc: string;
  table: string;
  page: string;
  url?: string | null;
  year?: string | null;
}

/** One row of the breed table (DATA_SOURCES section 5). Sources give milk in kg; the app treats 1 kg as about 1 L. */
export interface BreedStandard {
  id: string;
  species: Species;
  englishName: string;
  localNameLatn: string | null;
  localNameDeva: string | null;
  localNameDevaProvenance?: 'cited' | 'team-asserted' | null;
  isNonDescript?: boolean;
  femaleBodyWeightKg: number | null;
  bodyWeightCitation?: BreedCitation | null;
  /** Cited lactation yield in kg per lactation; null when only a range is cited. */
  lactationYieldKg: number | null;
  lactationYieldLowKg: number | null;
  lactationYieldHighKg: number | null;
  /** Cited lactation length in days (the longer end when a range is cited). */
  lactationLengthDays: number | null;
  /** The shorter end when the length is a range (crossbreds); null otherwise. */
  lactationLengthMinDays: number | null;
  avgDailyYieldKg: number | null;
  /** Cited fat percent (the low end of a range); null when the sources give none. */
  fatPct: number | null;
  fatPctLow?: number | null;
  /** The high end when a range is cited; null for a single value or no value. */
  fatPctHigh: number | null;
  /** Cited peak daily yield in kg; null when no peak is cited. When set it is the cap. */
  peakDailyYieldKg: number | null;
  peakCitation?: BreedCitation | null;
  /** States the range when the peak is the upper value of one; null otherwise. */
  peakNote: BiText | null;
  capBasis: CapBasis;
  milkCapLPerDay: number;
  yieldCitation?: BreedCitation;
  yieldFigureYear?: string | null;
  fatCitation?: BreedCitation | null;
  sourceDoc: string;
  sourceTable: string;
  sourcePage: string;
  sourceNote: string;
  provenanceStatus: 'cited' | 'team-asserted';
  /** YYYY-MM-DD of the human expert check; null = expert check pending. */
  verifiedOn: string | null;
  /** Prototype only: PROTO-BREED-* */
  sourceKey?: string;
  verificationStatus?: string;
}

export interface SelectedFeedInput {
  feedId: string;
  priceInrPerKgAsFed: number;
  maxKgAsFedPerDay: number | null;
  currentKgAsFedPerDay: number | null;
}

export type NutrientKey = 'DM' | 'CP' | 'ME' | 'Ca' | 'P';
export const NUTRIENT_KEYS: readonly NutrientKey[] = ['DM', 'CP', 'ME', 'Ca', 'P'];

export interface NutrientVector {
  /** Dry matter intake capacity ceiling, kg DM/day. */
  dmKgPerDay: number;
  cpGramsPerDay: number;
  meMcalPerDay: number;
  caGramsPerDay: number;
  pGramsPerDay: number;
}

export interface AuditCitation {
  sourceDoc: string;
  sourceTable: string;
  sourcePage: string;
  formulaDisplay: string;
  maintenancePart: number;
  lactationPart: number;
  provenanceStatus: 'cited' | 'team-asserted';
  /** YYYY-MM-DD of the human expert check; null = pending human expert verification. */
  verifiedOn: string | null;
  sourceKey: string;
}

export interface LinearTerm {
  maintenance: number;
  perLitre: number;
}

export interface RequirementModel {
  CP: LinearTerm;
  ME: LinearTerm;
  Ca: LinearTerm;
  P: LinearTerm;
  dmMax: LinearTerm;
  dmi: {
    weekOfLactation: 20;
    lagFactor: number;
    bw075: number;
    fcmPerLitre: number;
  };
  roughage: {
    minShareOfDm: number;
    citation: AuditCitation;
  };
  mineralSupplement?: {
    mineralMixMinKgPerDay: { lactating: number; dry: number };
    saltMinKgPerDay: { lactating: number; dry: number };
  };
  calciumMax?: {
    value: number;
    maxGramsPerKgDm?: number;
  };
  fatPctUsed: number;
  citations: Record<NutrientKey, AuditCitation>;
}

export interface RequirementResult {
  model?: RequirementModel;
  atMilkLPerDay?: number;
  requirements: NutrientVector;
  citations: Record<NutrientKey, AuditCitation>;
}

export interface RationFeedLine {
  feedId: string;
  kgAsFed: number;
  dmKg: number;
  costInr: number;
  priceInrPerKg: number;
  /** true when the amount sits on the user's max kg/day cap */
  atCap: boolean;
  /** Change 4, set only by the herd solver: 'home' for h_{i,f} (price 0, cost 0), 'buy' for b_{i,f}. */
  source?: 'home' | 'buy';
}

/** What limits the supported milk. When several are tight the first in this order is named (OQ6). */
/** Something that can stop a ration: a nutrient, or the minimum roughage share of dry matter. */
export type LimitingKey = NutrientKey | 'roughage';
export type LimitingConstraint = LimitingKey;

export type BindingConstraint = 'budget' | 'breed_cap' | 'intake' | 'roughage' | 'CP' | 'ME' | 'Ca' | 'P';

export const BINDING_ORDER: readonly BindingConstraint[] = [
  'budget',
  'breed_cap',
  'intake',
  'roughage',
  'CP',
  'ME',
  'Ca',
  'P',
] as const;

/** Room-for-improvement verdict (AC-5.6, 5.7, 5.11, OQ14) and the budget-below-maintenance case (AC-E7.1). */
export type Verdict =
  | { kind: 'gain'; gainLPerDay: number }
  | { kind: 'at_breed_level'; savingInrPerDay: number | null }
  /** Today's milk is above the cited breed figure and the budget keeps it (OQ15). */
  | { kind: 'above_breed_level'; savingInrPerDay: number | null }
  | {
      kind: 'below_today';
      todayMilkLPerDay: number;
      /** B: stage-2 cost at today's milk; null when no ration from these feeds can support it. */
      keepCostInrPerDay: number | null;
      costToKeepTodayInrPerDay?: number | null;
      /** Named only when keepCostInrPerDay is null. */
      limitingNutrients: LimitingKey[];
      limitingAtToday?: LimitingKey[];
    }
  | { kind: 'same_as_today' }
  | { kind: 'dry_animal' }
  | { kind: 'budget_below_maintenance'; maintenanceCostInrPerDay: number; budgetInrPerDay: number };

export type SolvedVerdict = Exclude<Verdict, { kind: 'budget_below_maintenance' }>;

export interface FatComparison {
  todayFatPct: number;
  breedFatPct: number | null;
  breedFatPctLow?: number | null;
  breedFatPctHigh: number | null;
}

export interface RationSolution {
  status: 'optimal';
  breedId?: string;
  /** S: the most milk the selected feeds can support within the budget, never above the breed cap. Exact; display rounds to 0.1. */
  supportedMilkLPerDay: number;
  /** Y*: unrounded Stage 1 optimum milk in L/day (0 for a dry animal). */
  supportedMilkExactLPerDay?: number;
  /** The breed's cited cap. */
  milkCapLPerDay: number;
  capBasis?: CapBasis;
  /** The cap the solver used: the larger of the breed cap and today's milk (OQ15). */
  effectiveCapLPerDay: number;
  effectiveCapSource?: 'breed' | 'today_milk';
  /** The first tight constraint in the order budget, breed cap, intake, roughage, nutrient. */
  bindingConstraint: BindingConstraint;
  /** Every tight constraint (extension, for the full audit). */
  tightConstraints: BindingConstraint[];
  /** Feeds on their own max kg/day cap when that cap limits S (OQ6 "feed limit"; extension). */
  feedLimitIds: string[];
  verdict: SolvedVerdict;
  /** Stage 2 with milk fixed at today's milk and no budget limit; null when no ration can support it. */
  costAtTodayMilkInrPerDay: number | null;
  /** Cost in ₹/day of least-cost ration supporting effectiveCapLPerDay with no budget limit; null when infeasible or dry (ADR-0013). */
  costAtCapInrPerDay: number | null;
  /** Null when today's milk is 0 (AC-5.9 applies only above 0). */
  fatComparison: FatComparison | null;
  /** M: the cheapest ration cost at 0 L/day (extension, for the audit). */
  maintenanceCostInrPerDay: number;
  budgetInrPerDay: number;
  referenceCostInrPerDay?: number;
  underBudgetInr?: number;
  feeds: RationFeedLine[];
  totalKgAsFed: number;
  totalCostInr: number;
  requirementsAtS?: NutrientVector;
  supplied: NutrientVector;
  /** Percent of the requirement supplied; for DM it is the percent of the ceiling used. */
  coveragePct: Record<NutrientKey, number>;
  /** Constraints that are active at the optimum (within 1%). */
  bindingConstraints: NutrientKey[];
  /** Roughage (indigenous forage plus crop residue) as a share [0, 1] and percent [0, 100] of the ration's dry matter. */
  roughageMinShare?: number;
  roughageShareAchieved?: number;
  roughageSharePct: number;
  /** Minimum roughage share as a percent of total DM. */
  roughageMinSharePct: number;
  currentCostInr: number | null;
  savingsInr: number | null;
  savingsPct: number | null;
  solvedOn: string;
  sourceKey: string;
}

export interface FeedSuggestion {
  feedId: string;
  nutrients: LimitingKey[];
}

export interface LimitingNutrient {
  /** For 'roughage', required and maxSupply are percents of dry matter. */
  nutrient: LimitingKey;
  required: number;
  maxSupply: number;
}

export interface InfeasibilityReport {
  status: 'infeasible';
  limitingNutrients: LimitingNutrient[];
  /** true when no single nutrient is the cause but the needs conflict within the DM ceiling */
  dmConflict: boolean;
  suggestedFeeds: FeedSuggestion[];
  checkedOn: string;
  sourceKey: string;
}

/** AC-E7.1: the feeds can meet maintenance, but not within this budget. No ration and no supported milk. */
export interface BudgetShortfallReport {
  status: 'budget_below_maintenance';
  verdict: Extract<Verdict, { kind: 'budget_below_maintenance' }>;
  budgetInrPerDay?: number;
  /** An unselected library feed that, added at its default price, brings maintenance within the budget; null when none does. */
  fixFeedId: string | null;
  /** Maintenance cost with that feed added. */
  maintenanceWithFixInrPerDay: number | null;
  fixFeed?: { feedId: string; maintenanceCostInrPerDay: number } | null;
  checkedOn: string;
  sourceKey: string;
}

export type BudgetBelowMaintenanceReport = BudgetShortfallReport;

export type RationSolveOutcome = RationSolution | InfeasibilityReport | BudgetShortfallReport;

export interface ExtractedFeed {
  feedId: string;
  priceInrPerKgAsFed: number | null;
  maxKgAsFedPerDay: number | null;
}

export interface ExtractionResponse {
  action: 'extract';
  modelUsed: string;
  animal: {
    species: Species;
    bodyWeightKg: number;
    milkYieldLitersPerDay: number;
    milkFatPct: number;
  };
  matchedFeeds: ExtractedFeed[];
  /** A breed from the list for the extracted species, else null (AC-2.3). */
  breedId: string | null;
  /** A budget stated in the description, else null. */
  budgetInrPerDay: number | null;
  /** Names the AI heard that are not in the library. The AI never supplies nutrient values (AC-E5.1). */
  unmatchedFeeds: string[];
}

export interface ExplanationRequestContext {
  animal: AnimalProfile;
  requirement: RequirementResult;
  solution: RationSolution;
  feeds: FeedItem[];
}

export type LlmErrorCode = 'RATE_LIMITED' | 'UPSTREAM_ERROR' | 'TIMEOUT' | 'INVALID_REQUEST';

export class LlmError extends Error {
  readonly code: LlmErrorCode;
  constructor(code: LlmErrorCode) {
    super(code);
    this.name = 'LlmError';
    this.code = code;
  }
}

export const LLM_ERROR_STRING: Record<LlmErrorCode, StringId> = {
  RATE_LIMITED: 'error_llm_rate_limited',
  UPSTREAM_ERROR: 'error_llm_upstream',
  TIMEOUT: 'error_llm_timeout',
  INVALID_REQUEST: 'error_llm_invalid_request',
};

export type VerifiedExplanationResult =
  | {
      status: 'verified';
      explanationText: string;
      verifiedCount: number;
      badge: { id: 'badge_all_verified'; params: { n: number } };
      /** Numbers the first attempt contained that could not be traced; non-empty means one regeneration happened. */
      flaggedNumbers: string[];
      modelUsed: string;
    }
  | {
      status: 'deterministic_fallback';
      template: BiText[];
      badge: { id: 'badge_template_fallback' };
      reason: 'llm_error' | 'untraced_numbers';
      errorCode: LlmErrorCode | null;
      flaggedNumbers: string[];
    };

export interface AuditMeta {
  id: string;
  label: BiText;
  formattedValue: string;
  numericValue: number;
  originType: 'cited_source' | 'solver_output' | 'user_input' | 'prototype_fixture';
  citation: {
    doc: string;
    table: string;
    page: string;
    formula?: string;
    provenanceStatus: 'cited' | 'team-asserted';
    /** null = expert check pending (shows a line on the sheet). */
    verifiedOn: string | null;
  } | null;
  /** role and activeConstraint are BiText (not string) so the sheet stays bilingual; breakdown is language-neutral arithmetic. */
  solverConstraint: { role: BiText; activeConstraint: BiText; breakdown: string } | null;
  /** Tick-box on the fine-print sheet: true when this value is set by a binding constraint. */
  binding?: boolean;
  /** Prototype fixture key, shown on the sheet. */
  sourceKey?: string;
  /** Plain notes shown as one row, for example "1 kg of milk is about 1 L (assumption)". */
  notes?: BiText[];
  /** Extra labelled rows. A plain string is source data kept as given (a season or price note, shown with lang="en"). */
  extraRows?: { label: BiText; value: BiText | string }[];
}

/** The one interface the UI talks to. mockAdapter (prototype) and liveAdapter (M1-M3) both implement it. */
export interface RationAppAdapter {
  getFeedLibrary(): Promise<FeedItem[]>;
  getBreedLibrary(): Promise<BreedStandard[]>;
  computeRequirements(animal: AnimalProfile): RequirementResult;
  solveRation(animal: AnimalProfile, selectedFeeds: SelectedFeedInput[]): RationSolveOutcome;
  extractFromText(freeText: string, options?: { signal?: AbortSignal }): Promise<ExtractionResponse>;
  explainRation(
    context: ExplanationRequestContext,
    options?: { signal?: AbortSignal },
  ): Promise<VerifiedExplanationResult>;
}

// ---- Change 4: herd and the 3-step flow (docs/ARCHITECTURE.md, "C4 data models"). Additive only. ----------------
// Prototype note: `src/data/herdPrototype.json` holds fixtures in the HerdPlan shape. The real joint herd LP
// (herdSolver.ts, herdPlan.ts) is not built yet; `sourceKey` therefore also allows 'PROTO-HERD-FIXTURE'.

/** "Cow 2" is { species: 'cow', n: 2 }; rendered with <Bi id="label_cow_n" params={{ n }} /> so it switches language (AC-C4-E7). */
export interface AnimalLabel {
  species: Species;
  n: number;
}

/** Where a weight or fat value came from: typed by the user (or the description helper), the breed row, the midpoint of a cited range, or the dry-animal species default (OQ1, never shown). */
export type InputSource = 'typed' | 'breed' | 'breed_midpoint' | 'species_default_dry';

export type HerdAnimalProfile = Omit<AnimalProfile, 'budgetInrPerDay' | 'isConfirmed'>;

export interface HerdAnimal {
  /** 'a1', 'a2', ... unique in the session, never reused, never contains '__'. Used as the LP variable prefix. */
  key: string;
  /** Stable; never renumbered after a removal (OQ-C4-3). */
  label: AnimalLabel;
  profile: HerdAnimalProfile;
  weightSource: 'typed' | 'breed';
  fatSource: InputSource;
  /** false while the values come from the description helper and the user has not tapped Add/Save (AC-2.3). */
  isConfirmed: boolean;
}

/** One screen-2 row: q_f, the herd total in kg/day as fed. kgPerDay > 0. At most one row per feedId. */
export interface HomeFeed {
  feedId: string;
  kgPerDay: number;
}

export interface HerdAnimalSolution {
  key: string;
  /** g_i = effCap_i = max(cap_i, T_i) when T_i > 0; 0 for a dry animal. */
  milkTargetLPerDay: number;
  /** Y_i = t* x g_i, unrounded. */
  milkExactLPerDay: number;
  /** S_i = floor(10 x Y_i + 1e-7) / 10. */
  milkLPerDay: number;
  /** This animal's part of the plan as a normal RationSolution; home and buy lines are separate (`source` set). */
  solution: RationSolution;
  /** computeRequirements at S_i, for Details. */
  requirementAtS: RequirementResult;
}

export type HerdLimit =
  | { kind: 'budget' }
  | { kind: 'milk_target' }
  | { kind: 'home_stock'; feedId: string }
  | { kind: 'animal'; key: string; constraint: 'intake' | 'roughage' | 'CP' | 'ME' | 'Ca' | 'P' };

export interface ShoppingLine {
  feedId: string;
  /** Sum over animals of b_{i,f} in F, exact. */
  kgPerDay: number;
  /** price x kgPerDay, exact. */
  costInrPerDay: number;
  /** Cited default price. */
  priceInrPerKg: number;
  /** For the audit; sums to kgPerDay within 1e-6 (AC-C4-2.5). */
  perAnimalKg: { key: string; kg: number }[];
}

export interface HerdSolution {
  status: 'optimal';
  /** t* in [0, 1]; 0 when every animal is dry or Stage 1 is infeasible. */
  shareT: number;
  stage1Feasible: boolean;
  /** Herd purchase at Stage 2 at Y is >= Bd - relTol(Bd). */
  budgetTight: boolean;
  limits: HerdLimit[];
  /** M_H */
  maintenanceCostInrPerDay: number;
  /** costAtCap_H */
  costAtTargetInrPerDay: number | null;
  /** P(F) */
  purchaseCostInrPerDay: number;
  /** Bd */
  budgetInrPerDay: number;
  /** Screen-1 order. */
  animals: HerdAnimalSolution[];
  /** Herd totals of bought feeds with sum b > 1e-6. */
  buyTotals: ShoppingLine[];
  homeUse: { feedId: string; usedKgPerDay: number; stockKgPerDay: number; tight: boolean }[];
  stage2Path: 'direct' | 'retry_minus_0_1' | 'maintenance';
  stage3Applied: boolean | null;
  stage2PurchaseInrPerDay: number;
  solvedOn: string;
  /** 'PROTO-HERD-FIXTURE' marks the prototype fixtures (a widening of the architecture's literal). */
  sourceKey: 'SOLVER-HERD-LP-V1' | 'PROTO-HERD-FIXTURE';
}

export interface HerdInfeasible {
  status: 'infeasible';
  animals: { key: string; limitingNutrients: LimitingNutrient[]; dmConflict: boolean; suggestedFeeds: FeedSuggestion[] }[];
  jointConflict: boolean;
}

export interface HerdStep {
  /** Prefix length in Bu_H. */
  k: number;
  prefixFeedIds: string[];
  /** Bu_H[1..k1] for P1, else [Bu_H[k]]. */
  addedFeedIds: string[];
  shareT: number;
  /** Sum over animals of S_i(k). */
  totalMilkL: number;
  /** P at Stage 2 of prefix k (audit only, never on the main view). */
  purchaseCostInrPerDay: number;
}

export interface ShoppingList {
  /** Bu_H[1..k1], amounts from F. */
  buyFirst: ShoppingLine[];
  later: {
    /** Bu_H[k], amounts from F. */
    line: ShoppingLine;
    /** Delta L_k = sum S_i(k) - sum S_i(k - 1). */
    deltaMilkExactL: number;
    /** floor(10 x delta + 1e-7) / 10; 0 reads "same milk". */
    deltaMilkL: number;
    step: HerdStep;
    previous: HerdStep;
  }[];
  /** A = P(F), exact. */
  totalInr: number;
  /** P1; null when Bu_H is empty. */
  firstStep: HerdStep | null;
}

export interface HerdBudgetPrompt {
  /** X = roundUpInrWhole(costAtCap_H - Bd). */
  extraInrPerDay: number;
  /** Y = sum floor(10 g_i) / 10 over milking animals. */
  targetMilkL: number;
  perAnimalTargetL: { key: string; targetL: number }[];
  costAtTargetInrPerDay: number;
  budgetInrPerDay: number;
}

export interface HerdShortfallPrompt {
  /** X = roundUpInrWhole(M_H - Bd). */
  extraInrPerDay: number;
  maintenanceCostInrPerDay: number;
  budgetInrPerDay: number;
}

interface HerdPlanBase {
  animals: HerdAnimal[];
  homeFeeds: HomeFeed[];
  budgetInrPerDay: number;
  /** C, exactly as passed to the solver. */
  buySet: SelectedFeedInput[];
  /** Device month (ADR-0016). */
  month: number;
}

export type HerdPlan =
  | (HerdPlanBase & {
      status: 'optimal';
      /** F */
      best: HerdSolution;
      perAnimal: HerdAnimalSolution[];
      /** Bu_H */
      buyOrder: string[];
      shopping: ShoppingList;
      /** Home feedIds with sum h <= 1e-6 in F, in row order. */
      notNeeded: string[];
      budgetPrompt: HerdBudgetPrompt | null;
      shortfall: null;
      infeasible: null;
      lastStepMatchesBest: boolean;
    })
  | (HerdPlanBase & {
      status: 'below_maintenance';
      best: null;
      perAnimal: [];
      buyOrder: [];
      shopping: null;
      notNeeded: [];
      budgetPrompt: null;
      shortfall: HerdShortfallPrompt;
      infeasible: null;
    })
  | (HerdPlanBase & {
      status: 'infeasible';
      best: null;
      perAnimal: [];
      buyOrder: [];
      shopping: null;
      notNeeded: [];
      budgetPrompt: null;
      shortfall: null;
      infeasible: HerdInfeasible;
    });
