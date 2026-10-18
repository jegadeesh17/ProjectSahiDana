// Performance test for 10-animal worst case herd plan (Change 4, docs/ARCHITECTURE.md line 2202).
// Asserts that the worst case (10 animals, full in-season library, 3 home rows) takes planHerd <= 1.0 s in Node.
import { describe, expect, it } from 'vitest';
import feedsV1 from '../../src/data/feeds.v1.json';
import { BREEDS } from '../../src/domain/breeds';
import { MAX_ANIMALS, planHerd } from '../../src/domain/herdPlan';
import type { FeedItem, HerdAnimal, HomeFeed } from '../../src/domain/types';

const LIVE_FEEDS = feedsV1 as unknown as FeedItem[];

describe('herdPerf.slow (10-animal worst case benchmark)', () => {
  it(`solves a 10-animal worst case with full in-season library and 3 home feeds in <= 1.0 s in Node`, () => {
    expect(MAX_ANIMALS).toBe(10);

    const animals: HerdAnimal[] = [
      {
        key: 'a1',
        label: { species: 'cow', n: 1 },
        profile: {
          species: 'cow',
          breedId: 'sahiwal',
          bodyWeightKg: 350,
          milkYieldLitersPerDay: 10,
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
          breedId: 'gir',
          bodyWeightKg: 385,
          milkYieldLitersPerDay: 8,
          milkFatPct: 4.6,
        },
        weightSource: 'breed',
        fatSource: 'breed',
        isConfirmed: true,
      },
      {
        key: 'a3',
        label: { species: 'cow', n: 3 },
        profile: {
          species: 'cow',
          breedId: 'tharparkar',
          bodyWeightKg: 360,
          milkYieldLitersPerDay: 7,
          milkFatPct: 4.4,
        },
        weightSource: 'breed',
        fatSource: 'breed',
        isConfirmed: true,
      },
      {
        key: 'a4',
        label: { species: 'cow', n: 4 },
        profile: {
          species: 'cow',
          breedId: 'red_sindhi',
          bodyWeightKg: 320,
          milkYieldLitersPerDay: 6,
          milkFatPct: 4.8,
        },
        weightSource: 'breed',
        fatSource: 'breed',
        isConfirmed: true,
      },
      {
        key: 'a5',
        label: { species: 'cow', n: 5 },
        profile: {
          species: 'cow',
          breedId: 'hariana',
          bodyWeightKg: 340,
          milkYieldLitersPerDay: 5,
          milkFatPct: 4.3,
        },
        weightSource: 'breed',
        fatSource: 'breed',
        isConfirmed: true,
      },
      {
        key: 'a6',
        label: { species: 'buffalo', n: 1 },
        profile: {
          species: 'buffalo',
          breedId: 'murrah',
          bodyWeightKg: 500,
          milkYieldLitersPerDay: 10,
          milkFatPct: 7.2,
        },
        weightSource: 'breed',
        fatSource: 'breed',
        isConfirmed: true,
      },
      {
        key: 'a7',
        label: { species: 'buffalo', n: 2 },
        profile: {
          species: 'buffalo',
          breedId: 'mehsana',
          bodyWeightKg: 480,
          milkYieldLitersPerDay: 9,
          milkFatPct: 7.0,
        },
        weightSource: 'breed',
        fatSource: 'breed',
        isConfirmed: true,
      },
      {
        key: 'a8',
        label: { species: 'buffalo', n: 3 },
        profile: {
          species: 'buffalo',
          breedId: 'jafrabadi',
          bodyWeightKg: 550,
          milkYieldLitersPerDay: 11,
          milkFatPct: 7.5,
        },
        weightSource: 'breed',
        fatSource: 'breed',
        isConfirmed: true,
      },
      {
        key: 'a9',
        label: { species: 'buffalo', n: 4 },
        profile: {
          species: 'buffalo',
          breedId: 'surti',
          bodyWeightKg: 420,
          milkYieldLitersPerDay: 6,
          milkFatPct: 7.5,
        },
        weightSource: 'breed',
        fatSource: 'breed',
        isConfirmed: true,
      },
      {
        key: 'a10',
        label: { species: 'buffalo', n: 5 },
        profile: {
          species: 'buffalo',
          breedId: 'nili_ravi',
          bodyWeightKg: 500,
          milkYieldLitersPerDay: 8,
          milkFatPct: 6.8,
        },
        weightSource: 'breed',
        fatSource: 'breed',
        isConfirmed: true,
      },
    ];

    expect(animals.length).toBe(10);

    // 3 home rows
    const homeFeeds: HomeFeed[] = [
      { feedId: 'wheat_straw', kgPerDay: 50 },
      { feedId: 'berseem', kgPerDay: 100 },
      { feedId: 'mustard_cake', kgPerDay: 15 },
    ];

    const budget = 1800; // sufficient for 10 animals
    const month = 1; // January (Rabi winter season with full feed library)

    // Warmup solve to avoid JIT compilation bias
    planHerd(animals.slice(0, 2), homeFeeds, 400, LIVE_FEEDS, BREEDS, month);

    // Timed 10-animal worst case solve
    const t0 = performance.now();
    const plan = planHerd(animals, homeFeeds, budget, LIVE_FEEDS, BREEDS, month);
    const elapsedMs = performance.now() - t0;

    expect(plan.status).toBe('optimal');
    if (plan.status !== 'optimal') return;

    expect(plan.perAnimal.length).toBe(10);
    expect(plan.best.animals.length).toBe(10);
    expect(plan.buyOrder.length).toBeGreaterThan(0);
    expect(plan.shopping.buyFirst.length + plan.shopping.later.length).toBe(plan.buyOrder.length);
    expect(plan.lastStepMatchesBest).toBe(true);

    // Performance budget: <= 1.0 s (1000 ms) in Node per ARCHITECTURE.md line 2202 and AC-C4-2.1
    expect(elapsedMs).toBeLessThanOrEqual(1000);
  });
});
