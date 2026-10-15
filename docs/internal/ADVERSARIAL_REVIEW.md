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

## Milestone M3 Review
Verdict: APPROVED
Test command: npm run test:full -> exit code 0
Python eval test command: python -m pytest -q eval/ -> exit code 0

### Critical defects (must fix; any defect means REJECTED)
None.

### Recommendations (non-blocking)
- `tests/e2e/language.spec.ts:8-28`: The `ALLOWED_HI_LATIN` whitelist contains specific publication titles (`Down`, `To`, `Earth`, `Kisan`, `Tak`) cited in price notes. If future data updates introduce new external English citations in Hindi price notes, consider extracting citation tokens automatically from data sources or annotating them with an explicit citation wrapper so the whitelist does not need manual expansion.
- `BRAINSTORM.md`: Working tree has unstaged modifications capturing early project brainstorm notes from 2026-10-12; consider committing or discarding them to keep git status clean.


## Change 2 (ship-ready), M1 Review 1 (2026-10-14)
Verdict: REJECTED. Base 64f19eb. tsc 0; npm test 178/178; playwright 13/13; pytest eval/ 68 passed.

Critical defects:
1. `src/i18n/strings.ts` `audit_peak_note` still labelled the breed note "Peak note", so the Murrah drawer still called the 9.64 L cap a peak. Fix: neutral "Source note" label plus a unit test.
2. README said feed figures show "Expert check: pending", but the feed/price audit sheet and `auditRoughageShare` passed no `verifiedOn`. Fix: pass `verifiedOn` through (`src/domain/audit.ts`); README "most rows" corrected to "every row".

Non-blocking: `basis_cited_peak_explain` wording, a stale Hindi-review comment, a missing semicolon in `ration-journey.spec.ts`.

## Change 2 (ship-ready), M1 Review 2 (2026-10-14)
Verdict: APPROVED (06a5266..52eb621). npm test 179/179; tsc 0; playwright 13/13; pytest eval/ 68 passed. Both defects from Review 1 fixed. No numeric changes, no bilingual leakage. UI review skipped for this change because of the user's 1-hour time limit.

## Change 2 (ship-ready), M1 code-review fix round (2026-10-14)
Verdict: APPROVED (422b213..45d02e0). tsc 0; vitest 196/196; playwright 13/13; pytest eval/ 68 passed; build ok. No numeric changes; ADR-0009 holds (sheets rebuild on language toggle; toggle unreachable while a sheet is open).

Non-blocking, open:
1. Basal-minimum row uses the verdict to pick dry vs lactating; the solver uses the solved milk level, so they disagree when an animal in milk is solved at 0 L (`src/domain/audit.ts:111`).
2. Basal-minimum row ignores the farmer's own max kg/day cap, which the solver honours (`solver.ts:244,252`).
3. Roughage-minimum sheet no longer shows the source note (it was English-only).
4. BRAINSTORM pending-flag wording: fixed in the same push.

## Change 3 (farmer-first flow), C3-M1 Review 1 (2026-10-15)

**Verdict: APPROVED.** Base `d28d90a`. Evidence: `npm run test:full` exit 0 (239 vitest, 27 Playwright), `npm run build` exit 0. Reviewer probes: verifier/wording/oneLanguage/resultUi/i18n unit tests 104/104; `git diff --stat d28d90a..HEAD -- src/domain src/services src/data` empty.

Confirmed: no logic change (AC-C3-1.7); `template_animal` keeps one language and the verifier passes; no "animal"/"पशु" left in strings (now enforced by `tests/unit/i18n.test.ts`); heading ids and aria refs consistent; 44 px preset targets; tests not weakened.

Findings (non-blocking):
1. Major: below 1024 px, "Try an example" rendered after the whole result card (`.presets { order: 3 }` vs `.frame { order: 2 }`), contradicting DESIGN.md. Sent as a fix to frontend-developer with a 375 px e2e position check.
2. Minor: for `below_today` / `same_as_today` the verdict sentence repeats the tile figures, and the tile says "ration" while the sentence says "budget". Deferred to UAT.
3. Minor: `grid-template-rows: subgrid` is ignored by WebViews older than about Chrome 117, so the figures may not line up if a label wraps. Accepted.
4. Minor: sticky bar covers nothing new.

## Change 3 (farmer-first flow), C3-M2 Review 1 (2026-10-15)

Verdict: REJECTED
Test command: cmd.exe /c "npm run test:full && npm run build && npm run compile:data && npm run eval:dump && npm run eval:scipy" -> exit code 0

Critical defects:
1. `src/components/BuyLadder.tsx:26-30`: When own feeds balance the ration alone without buying anything from the library (`plan.buyFeedIds` is empty and `hasRungs` is false per OQ-C3-4 and AC-C3-2.7), `resolvedOwnedIds` fell back to `plan.candidates.filter(...)`, retaining all 20+ candidate feeds in the library. Clicking Rung 0's milk or cost figure displayed all candidate library feeds under "Feeds in this step" for "Your feeds alone", violating AC-C3-2.10.

## Change 3 (farmer-first flow), C3-M2 Review 2 (2026-10-15)

Verdict: APPROVED (Base: d28d90a)
Test command: npm test && npx playwright test -> exit code 0

### Summary of Review
- Fix Verification (C3-M2-FIX-1): Fix commit a7af6ff added `ownedFeedIds: string[]` to `RationPlan` in `src/domain/rationPlan.ts`, populated it strictly from `owned.map(f => f.feedId)` in both return paths, wired `ownedFeedIds` into `BuyLadder.tsx`, and added an explicit assertion in `tests/unit/resultUi.test.tsx` verifying that all 7 owned feeds and 0 library feeds appear in the Rung 0 milk and cost audit drawers.
- Contract & Spec Compliance: Verified against AC-C3-2.1 through AC-C3-2.15 and edge cases AC-C3-E1 through AC-C3-E9. Feeds are optional; the button enables with valid cow profile + budget; "You have" and "Buy" tags correctly differentiate owned vs bought feeds; buy ladder correctly sequences supplements first then ascending cost; budget increase prompt appears strictly under the 4 ADR-0014 criteria with exact `roundUpInr` rounding; shortfall alerts show "Raise the budget by at least ₹X/day"; and all figures open audit drawers.
- Invariants & Solvers: SciPy HiGHS cross-check (`eval/cross_check_solver.py` and `eval/test_scipy_agreement.py`) verified 100% agreement on `costAtCapInrPerDay` across all 18 benchmark animals. Supported milk never decreases across ladder rungs, and the final rung equals the final solve within 1e-6 relative. Zero network requests during solve/plan (`AC-C3-E8`).
- Regressions: All regression criteria AC-C3-R1 through AC-C3-R7 hold. No tests were skipped, weakened, or removed.

### Critical defects:
None.

### Recommendations (non-blocking):
1. `src/components/BuyLadder.tsx:14`: `BuyLadderProps` retains an optional `ownedFeedIds?: string[];` property. Since `plan.ownedFeedIds` is now guaranteed on `RationPlan`, `BuyLadder` can directly rely on `plan.ownedFeedIds`.
2. `src/domain/rationPlan.ts:62-82`: `buildCandidates` assumes `owned` contains unique feeds (which the UI enforces). For programmatic safety if `planRation` is invoked directly with duplicate owned feed IDs in future tests or scripts, deduplicating `owned` by `feedId` before candidate assembly would prevent duplicate rows in the solver input.
