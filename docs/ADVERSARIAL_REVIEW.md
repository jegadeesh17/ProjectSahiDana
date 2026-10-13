# Adversarial Code Review

## Milestone M1 Review
Verdict: APPROVED
Test command: npm run test:full -> exit code 0

### Critical defects (must fix; any defect means REJECTED)
- None

### Recommendations (non-blocking)
- `src/i18n/strings.ts:364`: `audit_constraint_dm` still includes the legacy parenthetical `(and ≥ 85% of the limit)` / `(और सीमा का ≥ 85%)` in the constraint description copy, even though the 85% DM floor was removed from the live solver per `docs/ARCHITECTURE.md` (Prototype alignment #2). Update this copy during M3 polish.
- `src/components/RationResultsPanel.tsx:403`: The footer still renders `t(lang, 'notice_prototype_fixture')`. Consider updating or gating that notice when `VITE_USE_MOCK_ADAPTER` defaults to `'false'` in M2 (`M2-TASK-03`).
- `src/components/RationResultsPanel.tsx:52`: `breedById(profile.breedId)` looks up the breed directly from the static `BREEDS` export (`breeds.v1.json`) rather than from the `breeds` prop passed down from `App.tsx`. Both adapters currently share the same 16 breed IDs, so behavior is unaffected, but resolving from the `breeds` prop would keep the component strictly adapter-driven.

## Milestone M2 Review
Verdict: APPROVED
Test command: npm run test:full -> exit code 0

### Critical defects (must fix; any defect means REJECTED)
- None

### Recommendations (non-blocking)
- `src/services/liveAdapter.ts:507-514` & `src/components/ExplanationCard.tsx:68-71`: When both `attempt: 1` and `attempt: 2` fail the `verifyExplanationNumbers` language gate (`reason: 'devanagari'`) without any untraced numeric tokens (`flaggedNumbers: []`), `liveAdapter.explainRation` returns `reason: 'untraced_numbers'` with `flaggedNumbers: []`, causing `ExplanationCard` to interpolate an empty `numbers` string into `notice_explain_untraced` (`"untraced number ()"`). Consider falling back to `notice_explain_unavailable` in `ExplanationCard.tsx` when `flaggedNumbers.length === 0`.
- `api/llm.ts:465-478` vs `docs/ARCHITECTURE.md:573`: `ExtractionResponse` in `src/domain/types.ts`, `api/llm.ts`, and `src/App.tsx` places `breedId` at the top level of the response object (and `liveAdapter.ts:252-257` accepts both `raw.breedId` and `raw.animal.breedId`), whereas the example JSON snippet in `docs/ARCHITECTURE.md:573` nests `breedId` inside `animal`. Client and server agree on `ExtractionResponse`, so runtime behavior is unaffected.
- `src/components/RationResultsPanel.tsx:403`: Now that `rationService.ts` defaults to `liveAdapter` (`VITE_USE_MOCK_ADAPTER` defaults to `'false'`), remove or gate the footer `notice_prototype_fixture` string during the M3 UI polish pass (`M3-TASK-03`).

