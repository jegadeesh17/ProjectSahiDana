// PROTOTYPE MOCK for Change 4. NOT the joint herd LP and NOT the cited library's numbers.
// `planHerdPrototypeMock` picks the nearest of three canned plans (src/data/herdPrototype.json, each in the HerdPlan
// shape and tagged PROTO-HERD-FIXTURE) and relabels it with the user's own animals. The real `planHerd`
// (docs/ARCHITECTURE.md, "C4 LP formulation") replaces this file without touching any screen.
import type { HerdAnimal, HerdAnimalSolution, HerdPlan, HomeFeed } from '../domain/types';

export type HerdExampleId = 'cow_buffalo' | 'straw_only' | 'tight_budget';
export const HERD_EXAMPLE_IDS: readonly HerdExampleId[] = ['cow_buffalo', 'straw_only', 'tight_budget'];

export interface HerdFixture {
  id: HerdExampleId;
  plan: Extract<HerdPlan, { status: 'optimal' }>;
}

/** The fixture file is large, so it is a separate chunk that only the ?c4 flow ever loads. */
export async function loadHerdFixtures(): Promise<HerdFixture[]> {
  const mod = await import('../data/herdPrototype.json');
  return (mod.default as unknown as { fixtures: HerdFixture[] }).fixtures;
}

export interface PrototypePlanResult {
  plan: Extract<HerdPlan, { status: 'optimal' }>;
  fixtureId: HerdExampleId;
  /** true when the inputs are exactly an example's, so the numbers belong to this herd. */
  exact: boolean;
}

const totalMilk = (animals: HerdAnimal[]) => animals.reduce((s, a) => s + a.profile.milkYieldLitersPerDay, 0);

function speciesMismatch(a: HerdAnimal[], b: HerdAnimal[]): number {
  const count = (list: HerdAnimal[], s: string) => list.filter((x) => x.profile.species === s).length;
  return Math.abs(count(a, 'cow') - count(b, 'cow')) + Math.abs(count(a, 'buffalo') - count(b, 'buffalo'));
}

function distance(fixture: HerdFixture, animals: HerdAnimal[], homeFeeds: HomeFeed[], budget: number): number {
  const f = fixture.plan;
  const homeIds = new Set(homeFeeds.map((h) => h.feedId));
  const fixHomeIds = new Set(f.homeFeeds.map((h) => h.feedId));
  const homeMiss = [...homeIds].filter((id) => !fixHomeIds.has(id)).length + [...fixHomeIds].filter((id) => !homeIds.has(id)).length;
  return (
    10 * Math.abs(animals.length - f.animals.length) +
    5 * speciesMismatch(animals, f.animals) +
    Math.abs(totalMilk(animals) - totalMilk(f.animals)) / 5 +
    3 * Math.abs(Math.log(Math.max(budget, 1) / Math.max(f.budgetInrPerDay, 1))) +
    homeMiss
  );
}

function sameInputs(fixture: HerdFixture, animals: HerdAnimal[], homeFeeds: HomeFeed[], budget: number): boolean {
  const f = fixture.plan;
  if (animals.length !== f.animals.length || homeFeeds.length !== f.homeFeeds.length || budget !== f.budgetInrPerDay) return false;
  const same = animals.every((a, i) => {
    const b = f.animals[i].profile;
    return (
      a.profile.species === b.species &&
      a.profile.breedId === b.breedId &&
      a.profile.bodyWeightKg === b.bodyWeightKg &&
      a.profile.milkYieldLitersPerDay === b.milkYieldLitersPerDay &&
      a.profile.milkFatPct === b.milkFatPct
    );
  });
  return same && f.homeFeeds.every((h) => homeFeeds.some((u) => u.feedId === h.feedId && u.kgPerDay === h.kgPerDay));
}

/**
 * The nearest canned plan, relabelled for the user's herd. A user animal takes the numbers of an unused fixture
 * animal of the same species, else of any other (cycling when the herd is bigger than the fixture).
 */
export function planHerdPrototypeMock(
  animals: HerdAnimal[],
  homeFeeds: HomeFeed[],
  budgetInrPerDay: number,
  fixtures: HerdFixture[],
): PrototypePlanResult {
  if (fixtures.length === 0) throw new Error('planHerdPrototypeMock: no fixtures loaded');
  const ranked = [...fixtures].sort((a, b) => distance(a, animals, homeFeeds, budgetInrPerDay) - distance(b, animals, homeFeeds, budgetInrPerDay));
  const fixture = ranked[0];
  const f = fixture.plan;
  const exact = sameInputs(fixture, animals, homeFeeds, budgetInrPerDay);

  const used = new Set<string>();
  const keyMap = new Map<string, string>(); // fixture animal key -> first user animal key that took its numbers
  const perAnimal: HerdAnimalSolution[] = animals.map((a, i) => {
    const pool = f.perAnimal;
    const fixAnimalOf = (sol: HerdAnimalSolution) => f.animals.find((x) => x.key === sol.key)!;
    const pick =
      pool.find((s) => !used.has(s.key) && fixAnimalOf(s).profile.species === a.profile.species) ??
      pool.find((s) => !used.has(s.key)) ??
      pool.find((s) => fixAnimalOf(s).profile.species === a.profile.species) ??
      pool[i % pool.length];
    used.add(pick.key);
    if (!keyMap.has(pick.key)) keyMap.set(pick.key, a.key);
    return { ...pick, key: a.key };
  });

  const shopLine = (line: (typeof f.shopping.buyFirst)[number]) => ({
    ...line,
    perAnimalKg: line.perAnimalKg.flatMap((p) => (keyMap.has(p.key) ? [{ key: keyMap.get(p.key)!, kg: p.kg }] : [])),
  });
  const usedHome = new Set(perAnimal.flatMap((p) => p.solution.feeds.filter((l) => l.source === 'home' && l.kgAsFed > 1e-6).map((l) => l.feedId)));

  const plan: PrototypePlanResult['plan'] = {
    ...f,
    animals,
    homeFeeds,
    budgetInrPerDay,
    perAnimal,
    best: { ...f.best, budgetInrPerDay, animals: perAnimal, buyTotals: f.best.buyTotals.map(shopLine) },
    shopping: {
      ...f.shopping,
      buyFirst: f.shopping.buyFirst.map(shopLine),
      later: f.shopping.later.map((l) => ({ ...l, line: shopLine(l.line) })),
    },
    notNeeded: homeFeeds.filter((h) => !usedHome.has(h.feedId)).map((h) => h.feedId),
  };
  return { plan, fixtureId: fixture.id, exact };
}
