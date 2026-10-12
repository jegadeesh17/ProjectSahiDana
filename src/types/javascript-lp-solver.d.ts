declare module 'javascript-lp-solver' {
  export interface LpConstraintBound {
    min?: number;
    max?: number;
    equal?: number;
  }

  export type LpVariableCoefficients = Record<string, number>;

  export interface LpModel {
    optimize: string;
    opType: 'max' | 'min';
    constraints: Record<string, LpConstraintBound>;
    variables: Record<string, LpVariableCoefficients>;
    ints?: Record<string, number | boolean>;
    binaries?: Record<string, number | boolean>;
    unrestricted?: Record<string, number | boolean>;
  }

  export interface LpSolution {
    feasible: boolean;
    bounded?: boolean;
    result: number;
    isIntegral?: boolean;
    [variable: string]: number | boolean | undefined;
  }

  export interface LpSolver {
    Solve(model: LpModel, precision?: number, full?: boolean, validate?: boolean): LpSolution;
    ReformatLP(model: string | string[]): LpModel;
    MultiObjective(model: LpModel): LpSolution;
  }

  const Solver: LpSolver;
  export default Solver;
  export const Solve: LpSolver['Solve'];
  export const ReformatLP: LpSolver['ReformatLP'];
  export const MultiObjective: LpSolver['MultiObjective'];
}

declare module '*compile_data.mjs' {
  export const VALID_VERTICALS: Set<string>;
  export const VALID_RELIABILITIES: Set<string>;
  export const VALID_PROVENANCES: Set<string>;
  export const VALID_SPECIES: Set<string>;

  export function normalizeNfc(value: unknown): string;
  export function deepNormalizeNfc<T>(value: T): T;
  export function parseCsv(csvText: string, sourceLabel?: string): Record<string, string>[];
  export function parseAvailableMonths(raw: string, context?: string): number[];
  export function compileFeedRow(rawRow: Record<string, string>, rowIndex?: number, warnings?: string[]): Record<string, any>;
  export function compileFeeds(input: string | Record<string, string>[], warnings?: string[]): Record<string, any>[];
  export function computeBreedCap(
    input: Record<string, unknown>,
    context?: string,
  ): { capBasis: string; milkCapLPerDay: number };
  export function compileBreedRow(rawRow: Record<string, string>, rowIndex?: number, warnings?: string[]): Record<string, any>;
  export function compileBreeds(input: string | Record<string, string>[], warnings?: string[]): Record<string, any>[];
  export function compileRequirements(input: string | Record<string, any>, warnings?: string[]): Record<string, any>;
  export function compileDataFiles(options?: {
    feedsCsvPath?: string;
    breedsCsvPath?: string;
    requirementsJsonPath?: string;
    feedsOutPath?: string;
    breedsOutPath?: string;
    requirementsOutPath?: string;
    logger?: { warn: (msg: string) => void };
  }): {
    feeds: Record<string, any>[];
    breeds: Record<string, any>[];
    requirements: Record<string, any>;
    warnings: string[];
  };
}

