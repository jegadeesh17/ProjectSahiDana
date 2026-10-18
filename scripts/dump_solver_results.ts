// Runs the browser TypeScript solver and explanation verifier on eval/test_animals.json
// and writes eval/out/browser_results.json for the M3 SciPy cross-check (docs/ARCHITECTURE.md).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import feedsV1 from '../src/data/feeds.v1.json';
import { solveHerd, verifyHerdSolution } from '../src/domain/herdSolver';
import { buildCandidates } from '../src/domain/rationPlan';
import { computeRequirements, solveRation, verifyRationSolution } from '../src/domain/solver';
import type {
  AnimalProfile,
  BindingConstraint,
  CapBasis,
  ExplanationRequestContext,
  FeedItem,
  HerdAnimal,
  HerdSolveOutcome,
  HomeFeed,
  RationSolveOutcome,
  SelectedFeedInput,
  Verdict,
} from '../src/domain/types';
import {
  buildTemplateExplanation,
  collectAuthorizedNumbers,
  verifyExplanationNumbers,
} from '../src/domain/verifier';

interface BenchmarkExpected {
  status: 'optimal' | 'budget_below_maintenance' | 'infeasible';
  capBasis?: CapBasis;
  verdictKind?: Verdict['kind'];
  bindingConstraint?: BindingConstraint;
  stage2AtTFeasible?: boolean;
  limitingNutrientsInclude?: string[];
  hasFixFeed?: boolean;
}

interface BenchmarkAnimalEntry {
  id: string;
  description: string;
  animal: AnimalProfile;
  selectedFeeds: SelectedFeedInput[];
  expected: BenchmarkExpected;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const INPUT_PATH = path.join(ROOT_DIR, 'eval', 'test_animals.json');
const OUT_DIR = path.join(ROOT_DIR, 'eval', 'out');
const OUT_PATH = path.join(OUT_DIR, 'browser_results.json');

const allFeeds = feedsV1 as unknown as FeedItem[];

function main(): void {
  const rawJson = fs.readFileSync(INPUT_PATH, 'utf-8');
  const entries = JSON.parse(rawJson) as BenchmarkAnimalEntry[];

  if (!Array.isArray(entries) || entries.length < 15) {
    throw new Error(`Expected at least 15 benchmark animals in ${INPUT_PATH}, found ${entries.length}`);
  }

  const results = [];
  let optimalCount = 0;
  let belowMaintenanceCount = 0;
  let infeasibleCount = 0;
  let constraintsSatisfiedCount = 0;
  let unverifiedNumbersPassed = 0;
  let totalVerifiedTokensEn = 0;
  let totalVerifiedTokensHi = 0;
  const costSavingsPctList: number[] = [];

  for (const entry of entries) {
    const reqResult = computeRequirements(entry.animal);
    const outcome: RationSolveOutcome = solveRation(entry.animal, entry.selectedFeeds);

    let stage2CostAtYStarInrPerDay: number | null = null;
    let stage2CostAtSInrPerDay: number | null = null;
    let costAtCapInrPerDay: number | null = null;
    let constraintsVerified = false;
    let verificationRecord: {
      authorizedCount: number;
      enText: string;
      hiText: string;
      enVerified: boolean;
      hiVerified: boolean;
      enVerifiedCount: number;
      hiVerifiedCount: number;
      enFlaggedNumbers: string[];
      hiFlaggedNumbers: string[];
      untracedProbeRejected: boolean;
      devanagariProbeRejected: boolean;
    } | null = null;

    if (outcome.status === 'optimal') {
      optimalCount += 1;
      verifyRationSolution(outcome, entry.animal, entry.selectedFeeds, allFeeds);
      constraintsVerified = true;
      constraintsSatisfiedCount += 1;

      stage2CostAtSInrPerDay = outcome.totalCostInr;
      costAtCapInrPerDay = outcome.costAtCapInrPerDay;
      const yStar = outcome.supportedMilkExactLPerDay ?? outcome.supportedMilkLPerDay;
      if (entry.animal.milkYieldLitersPerDay <= 0) {
        stage2CostAtYStarInrPerDay = outcome.maintenanceCostInrPerDay;
      } else {
        const probeAtYStar = solveRation(
          { ...entry.animal, milkYieldLitersPerDay: yStar },
          entry.selectedFeeds,
        );
        stage2CostAtYStarInrPerDay =
          probeAtYStar.status === 'optimal'
            ? (probeAtYStar.costAtTodayMilkInrPerDay ?? outcome.totalCostInr)
            : outcome.totalCostInr;
      }

      if (outcome.savingsPct !== null && outcome.savingsPct > 0) {
        costSavingsPctList.push(outcome.savingsPct);
      } else if (
        (outcome.verdict.kind === 'at_breed_level' || outcome.verdict.kind === 'above_breed_level') &&
        outcome.verdict.savingInrPerDay !== null &&
        outcome.referenceCostInrPerDay &&
        outcome.referenceCostInrPerDay > 0
      ) {
        costSavingsPctList.push((outcome.verdict.savingInrPerDay / outcome.referenceCostInrPerDay) * 100);
      }

      const context: ExplanationRequestContext = {
        animal: entry.animal,
        requirement: reqResult,
        solution: outcome,
        feeds: allFeeds,
      };
      const authorized = collectAuthorizedNumbers(context);
      const templateLines = buildTemplateExplanation(context);
      const enText = templateLines.map((l) => l.en).join(' ');
      const hiText = templateLines.map((l) => l.hi).join(' ');

      const verifyEn = verifyExplanationNumbers(enText, authorized);
      const verifyHi = verifyExplanationNumbers(hiText, authorized, { allowDevanagari: true });

      if (!verifyEn.ok || verifyEn.flaggedNumbers.length > 0) {
        unverifiedNumbersPassed += verifyEn.flaggedNumbers.length || 1;
      }
      if (!verifyHi.ok || verifyHi.flaggedNumbers.length > 0) {
        unverifiedNumbersPassed += verifyHi.flaggedNumbers.length || 1;
      }

      // Negative control probes: an untraced number or Devanagari in English LLM output MUST be rejected
      const untracedProbe = verifyExplanationNumbers(`${enText} Extra fabricated figure 98765.43.`, authorized);
      const devanagariProbe = verifyExplanationNumbers(`${enText} हिंदी वाक्य`, authorized);
      if (untracedProbe.ok || devanagariProbe.ok) {
        unverifiedNumbersPassed += 1;
      }

      totalVerifiedTokensEn += verifyEn.verifiedCount;
      totalVerifiedTokensHi += verifyHi.verifiedCount;

      verificationRecord = {
        authorizedCount: authorized.length,
        enText,
        hiText,
        enVerified: verifyEn.ok,
        hiVerified: verifyHi.ok,
        enVerifiedCount: verifyEn.verifiedCount,
        hiVerifiedCount: verifyHi.verifiedCount,
        enFlaggedNumbers: verifyEn.flaggedNumbers,
        hiFlaggedNumbers: verifyHi.flaggedNumbers,
        untracedProbeRejected: !untracedProbe.ok && untracedProbe.flaggedNumbers.includes('98765.43'),
        devanagariProbeRejected: !devanagariProbe.ok && devanagariProbe.reason === 'devanagari',
      };
    } else if (outcome.status === 'budget_below_maintenance') {
      belowMaintenanceCount += 1;
      if (entry.expected.hasFixFeed !== undefined) {
        const actualHasFix = outcome.fixFeedId !== null;
        if (actualHasFix !== entry.expected.hasFixFeed) {
          throw new Error(
            `${entry.id}: expected hasFixFeed=${entry.expected.hasFixFeed}, got fixFeedId=${outcome.fixFeedId}`,
          );
        }
      }
    } else {
      infeasibleCount += 1;
      if (entry.expected.limitingNutrientsInclude) {
        const actualLim = outcome.limitingNutrients.map((l) => l.nutrient);
        for (const reqLim of entry.expected.limitingNutrientsInclude) {
          if (!actualLim.includes(reqLim as never)) {
            throw new Error(
              `${entry.id}: expected limitingNutrients to include ${reqLim}, got [${actualLim.join(', ')}]`,
            );
          }
        }
      }
    }

    if (outcome.status !== entry.expected.status) {
      throw new Error(`${entry.id}: expected status ${entry.expected.status}, got ${outcome.status}`);
    }
    if (outcome.status === 'optimal') {
      if (entry.expected.capBasis && outcome.capBasis !== entry.expected.capBasis) {
        throw new Error(`${entry.id}: expected capBasis ${entry.expected.capBasis}, got ${outcome.capBasis}`);
      }
      if (entry.expected.verdictKind && outcome.verdict.kind !== entry.expected.verdictKind) {
        throw new Error(
          `${entry.id}: expected verdictKind ${entry.expected.verdictKind}, got ${outcome.verdict.kind}`,
        );
      }
      if (
        entry.expected.bindingConstraint &&
        outcome.bindingConstraint !== entry.expected.bindingConstraint
      ) {
        throw new Error(
          `${entry.id}: expected bindingConstraint ${entry.expected.bindingConstraint}, got ${outcome.bindingConstraint}`,
        );
      }
      if (entry.expected.stage2AtTFeasible !== undefined) {
        const actualFeas = outcome.costAtTodayMilkInrPerDay !== null;
        if (actualFeas !== entry.expected.stage2AtTFeasible) {
          throw new Error(
            `${entry.id}: expected stage2AtTFeasible=${entry.expected.stage2AtTFeasible}, got costAtTodayMilkInrPerDay=${outcome.costAtTodayMilkInrPerDay}`,
          );
        }
      }
    }

    results.push({
      id: entry.id,
      description: entry.description,
      animal: entry.animal,
      selectedFeeds: entry.selectedFeeds,
      expected: entry.expected,
      requirementsAtT: reqResult.requirements,
      requirementModel: reqResult.model
        ? {
            CP: reqResult.model.CP,
            ME: reqResult.model.ME,
            Ca: reqResult.model.Ca,
            P: reqResult.model.P,
            dmMax: reqResult.model.dmMax,
            dmi: reqResult.model.dmi,
            roughageMinShare: reqResult.model.roughage.minShareOfDm,
            fatPctUsed: reqResult.model.fatPctUsed,
          }
        : null,
      stage2CostAtYStarInrPerDay,
      stage2CostAtSInrPerDay,
      costAtCapInrPerDay,
      constraintsVerified,
      outcome,
      verification: verificationRecord,
    });
  }

  const constraintSatisfactionPct =
    optimalCount > 0 ? (constraintsSatisfiedCount / optimalCount) * 100 : 100;
  const meanCostSavedPct =
    costSavingsPctList.length > 0
      ? costSavingsPctList.reduce((acc, v) => acc + v, 0) / costSavingsPctList.length
      : 0;

  const output = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalAnimals: entries.length,
      optimalCount,
      belowMaintenanceCount,
      infeasibleCount,
      constraintSatisfactionPct,
      costSavingCasesCount: costSavingsPctList.length,
      meanCostSavedPct: Number(meanCostSavedPct.toFixed(2)),
      unverifiedNumbersPassed,
      totalVerifiedTokensEn,
      totalVerifiedTokensHi,
    },
    results,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf-8');
  console.log(
    `Wrote ${OUT_PATH} (${entries.length} animals: ${optimalCount} optimal, ${belowMaintenanceCount} below_maintenance, ${infeasibleCount} infeasible; constraintSatisfaction=${constraintSatisfactionPct.toFixed(1)}%, meanCostSaved=${meanCostSavedPct.toFixed(2)}%, unverifiedPassed=${unverifiedNumbersPassed})`,
  );
}

interface BenchmarkHerdAnimal {
  key: string;
  species: 'cow' | 'buffalo';
  breedId: string;
  bodyWeightKg: number;
  milkYieldLitersPerDay: number;
  milkFatPct: number;
}

interface BenchmarkHerdExpected {
  status: 'optimal' | 'below_maintenance' | 'infeasible';
  limitKind?: string;
}

interface BenchmarkHerdEntry {
  id: string;
  description: string;
  month: number;
  budgetInrPerDay: number;
  animals: BenchmarkHerdAnimal[];
  homeFeeds: HomeFeed[];
  buyFeedIds: string[] | null;
  expected: BenchmarkHerdExpected;
}

const HERD_INPUT_PATH = path.join(ROOT_DIR, 'eval', 'test_herd_animals.json');
const HERD_OUT_PATH = path.join(OUT_DIR, 'browser_herd_results.json');

function dumpHerdCases(): void {
  if (!fs.existsSync(HERD_INPUT_PATH)) {
    return;
  }
  const rawJson = fs.readFileSync(HERD_INPUT_PATH, 'utf-8');
  const entries = JSON.parse(rawJson) as BenchmarkHerdEntry[];

  const results = [];
  let optimalCount = 0;
  let belowMaintenanceCount = 0;
  let infeasibleCount = 0;

  for (const entry of entries) {
    const herdAnimals: HerdAnimal[] = entry.animals.map((a, idx) => ({
      key: a.key,
      label: { species: a.species, n: idx + 1 },
      profile: {
        species: a.species,
        breedId: a.breedId,
        bodyWeightKg: a.bodyWeightKg,
        milkYieldLitersPerDay: a.milkYieldLitersPerDay,
        milkFatPct: a.milkFatPct,
      },
      weightSource: 'typed',
      fatSource: 'typed',
      isConfirmed: true,
    }));

    let buySet: SelectedFeedInput[];
    if (entry.buyFeedIds === null || entry.buyFeedIds === undefined) {
      buySet = buildCandidates([], allFeeds, entry.month);
    } else {
      buySet = [];
      for (const fid of entry.buyFeedIds) {
        const feed = allFeeds.find((f) => f.id === fid);
        if (!feed) {
          throw new Error(`Feed not found: ${fid}`);
        }
        if (feed.defaultPriceInrPerKgAsFed === null) {
          throw new Error(`Feed ${fid} has no default price`);
        }
        buySet.push({
          feedId: feed.id,
          priceInrPerKgAsFed: feed.defaultPriceInrPerKgAsFed,
          maxKgAsFedPerDay: null,
          currentKgAsFedPerDay: null,
        });
      }
    }

    const outcome: HerdSolveOutcome = solveHerd(
      herdAnimals,
      buySet,
      entry.homeFeeds,
      entry.budgetInrPerDay,
      allFeeds,
    );

    if (outcome.status !== entry.expected.status) {
      throw new Error(
        `${entry.id}: expected status ${entry.expected.status}, got ${outcome.status}`,
      );
    }

    let shareT: number | null = null;
    const milkLPerDay: Record<string, number> = {};
    const milkTargetLPerDay: Record<string, number> = {};
    let purchaseCostInrPerDay: number | null = null;
    let maintenanceCostInrPerDay: number | null = null;
    let costAtTargetInrPerDay: number | null = null;
    const animalLines: { key: string; feeds: any[] }[] = [];
    let homeUse: any[] = [];
    let limits: any[] = [];
    let stage2Path: string | null = null;
    let stage3Applied: boolean | null = null;
    let totalHomeKg: number | null = null;

    if (outcome.status === 'optimal') {
      optimalCount += 1;
      verifyHerdSolution(outcome, herdAnimals, buySet, entry.homeFeeds, allFeeds);

      if (entry.expected.limitKind) {
        const primaryLimit = outcome.limits[0]?.kind;
        if (primaryLimit !== entry.expected.limitKind) {
          throw new Error(
            `${entry.id}: expected limitKind ${entry.expected.limitKind}, got ${primaryLimit}`,
          );
        }
      }

      shareT = outcome.shareT;
      purchaseCostInrPerDay = outcome.purchaseCostInrPerDay;
      maintenanceCostInrPerDay = outcome.maintenanceCostInrPerDay;
      costAtTargetInrPerDay = outcome.costAtTargetInrPerDay;
      stage2Path = outcome.stage2Path;
      stage3Applied = outcome.stage3Applied;
      homeUse = outcome.homeUse;
      limits = outcome.limits;

      let computedHomeKg = 0;
      for (const a of outcome.animals) {
        milkLPerDay[a.key] = a.milkLPerDay;
        milkTargetLPerDay[a.key] = a.milkTargetLPerDay;
        animalLines.push({
          key: a.key,
          feeds: a.solution.feeds,
        });
        for (const line of a.solution.feeds) {
          if (line.source === 'home') {
            computedHomeKg += line.kgAsFed;
          }
        }
      }
      totalHomeKg = computedHomeKg;
    } else if (outcome.status === 'below_maintenance') {
      belowMaintenanceCount += 1;
      maintenanceCostInrPerDay = outcome.maintenanceCostInrPerDay;
    } else if (outcome.status === 'infeasible') {
      infeasibleCount += 1;
    }

    results.push({
      id: entry.id,
      description: entry.description,
      month: entry.month,
      budgetInrPerDay: entry.budgetInrPerDay,
      animals: entry.animals,
      homeFeeds: entry.homeFeeds,
      buyFeedIds: entry.buyFeedIds,
      buySet,
      expected: entry.expected,
      outcome,
      shareT,
      milkLPerDay,
      milkTargetLPerDay,
      purchaseCostInrPerDay,
      maintenanceCostInrPerDay,
      costAtTargetInrPerDay,
      animalLines,
      homeUse,
      limits,
      stage2Path,
      stage3Applied,
      totalHomeKg,
    });
  }

  const output = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalHerds: entries.length,
      optimalCount,
      belowMaintenanceCount,
      infeasibleCount,
    },
    results,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(HERD_OUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf-8');
  console.log(
    `Wrote ${HERD_OUT_PATH} (${entries.length} herds: ${optimalCount} optimal, ${belowMaintenanceCount} below_maintenance, ${infeasibleCount} infeasible)`,
  );
}

main();
dumpHerdCases();
