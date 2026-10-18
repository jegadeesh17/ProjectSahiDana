import type {
  AnimalProfile,
  BreedStandard,
  FeedItem,
  HerdAnimal,
  HerdPlan,
  HomeFeed,
  RationAppAdapter,
  SelectedFeedInput,
} from '../domain/types';
import { planRation } from '../domain/rationPlan';
import type { RationPlan } from '../domain/rationPlan';
import { planHerd } from '../domain/herdPlan';
import { currentMonth } from '../i18n/months';
import { LIVE_BREEDS, LIVE_FEEDS, liveAdapter } from './liveAdapter';
import { FEEDS as PROTOTYPE_FEEDS, PROTOTYPE_BREEDS, mockAdapter, mockControls } from './mockAdapter';

export type RationAdapterMode = 'mock' | 'live';

let modeOverride: RationAdapterMode | 'env' = 'env';

function isEnvMock(): boolean {
  const viteVal = import.meta.env.VITE_USE_MOCK_ADAPTER;
  const procVal =
    typeof process !== 'undefined' && typeof process.env !== 'undefined'
      ? process.env.VITE_USE_MOCK_ADAPTER
      : undefined;
  const raw = viteVal ?? procVal ?? 'false';
  return String(raw).trim().toLowerCase() === 'true';
}

export function getRationAdapterMode(): RationAdapterMode {
  if (modeOverride !== 'env') return modeOverride;
  return isEnvMock() ? 'mock' : 'live';
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

export interface RationService extends RationAppAdapter {
  planRation(profile: AnimalProfile, owned: SelectedFeedInput[]): RationPlan;
  planHerd(animals: HerdAnimal[], homeFeeds: HomeFeed[], budgetInrPerDay: number): HerdPlan;
}

export const rationService: RationService = {
  getFeedLibrary: () => selectAdapter().getFeedLibrary(),
  getBreedLibrary: () => selectAdapter().getBreedLibrary(),
  computeRequirements: (animal) => selectAdapter().computeRequirements(animal),
  solveRation: (animal, selectedFeeds) => selectAdapter().solveRation(animal, selectedFeeds),
  extractFromText: (freeText, options) => selectAdapter().extractFromText(freeText, options),
  explainRation: (context, options) => selectAdapter().explainRation(context, options),
  planRation: (profile, owned) =>
    planRation(profile, owned, getInitialFeeds(), currentMonth(), (p, f) => selectAdapter().solveRation(p, f)),
  planHerd: (animals, homeFeeds, budgetInrPerDay) => {
    const now = new Date();
    const month = currentMonth(now);
    const planDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return planHerd(
      animals,
      homeFeeds,
      budgetInrPerDay,
      getInitialFeeds(),
      getInitialBreeds(),
      month,
      planDate,
    );
  },
};

export { LIVE_BREEDS, LIVE_FEEDS, PROTOTYPE_BREEDS, PROTOTYPE_FEEDS, liveAdapter, mockAdapter, mockControls };

