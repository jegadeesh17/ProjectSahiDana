// Adapter factory and singleton. Components import `rationService` and never a concrete adapter.
import type { BreedStandard, FeedItem, RationAppAdapter } from '../domain/types';
import { LIVE_BREEDS, LIVE_FEEDS, liveAdapter } from './liveAdapter';
import { FEEDS as PROTOTYPE_FEEDS, PROTOTYPE_BREEDS, mockAdapter, mockControls } from './mockAdapter';

export type RationAdapterMode = 'mock' | 'live';

let modeOverride: RationAdapterMode | 'env' = 'env';

function isEnvLive(): boolean {
  const viteVal = import.meta.env.VITE_USE_MOCK_ADAPTER;
  const procVal =
    typeof process !== 'undefined' && typeof process.env !== 'undefined'
      ? process.env.VITE_USE_MOCK_ADAPTER
      : undefined;
  return viteVal === 'false' || procVal === 'false';
}

export function getRationAdapterMode(): RationAdapterMode {
  if (modeOverride !== 'env') return modeOverride;
  return isEnvLive() ? 'live' : 'mock';
}

export function setRationAdapterMode(mode: RationAdapterMode | 'env'): void {
  modeOverride = mode;
}

export function selectAdapter(useMock: boolean = getRationAdapterMode() === 'mock'): RationAppAdapter {
  return useMock ? mockAdapter : liveAdapter;
}

export function getInitialFeeds(): FeedItem[] {
  return getRationAdapterMode() === 'live' ? LIVE_FEEDS : PROTOTYPE_FEEDS;
}

export function getInitialBreeds(): BreedStandard[] {
  return getRationAdapterMode() === 'live' ? LIVE_BREEDS : PROTOTYPE_BREEDS;
}

export const ADAPTERS = {
  mock: mockAdapter,
  live: liveAdapter,
} as const;

export const rationService: RationAppAdapter = {
  getFeedLibrary: () => selectAdapter().getFeedLibrary(),
  getBreedLibrary: () => selectAdapter().getBreedLibrary(),
  computeRequirements: (animal) => selectAdapter().computeRequirements(animal),
  solveRation: (animal, selectedFeeds) => selectAdapter().solveRation(animal, selectedFeeds),
  extractFromText: (freeText, options) => selectAdapter().extractFromText(freeText, options),
  explainRation: (context, options) => selectAdapter().explainRation(context, options),
};

export { LIVE_BREEDS, LIVE_FEEDS, PROTOTYPE_BREEDS, PROTOTYPE_FEEDS, liveAdapter, mockAdapter, mockControls };

