// Adapter factory and singleton. Components import `rationService` and never a concrete adapter.
import type { RationAppAdapter } from '../domain/types';
import { mockAdapter, mockControls } from './mockAdapter';

// Prototype default: the mock adapter. VITE_USE_MOCK_ADAPTER=false selects the live adapter,
// which does not exist until M1 (browser LP solver) and M2 (/api/llm).
const useMock = import.meta.env.VITE_USE_MOCK_ADAPTER !== 'false';

if (!useMock) {
  throw new Error('VITE_USE_MOCK_ADAPTER=false needs src/services/liveAdapter.ts, which arrives in M1.');
}

export const rationService: RationAppAdapter = mockAdapter;
export { mockControls };
export { FEEDS as PROTOTYPE_FEEDS, PROTOTYPE_BREEDS } from './mockAdapter';
