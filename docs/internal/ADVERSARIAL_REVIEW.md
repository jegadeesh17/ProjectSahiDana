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

## Change 4 (herd and 3-step flow), C4-M1 Review 1 (2026-10-16)

Verdict: REJECTED
Base commit: `2134ab6` (Head: `9a0c05b`)
Test command: `npm test && npx playwright test tests/e2e/herd-flow.spec.ts && npm run build && npm run eval:scipy` (exit code 0)

### Critical defects (must fix; any defect means REJECTED):
1. `src/components/ShoppingList.tsx:57` and `src/domain/summary.ts:112`: Later shopping steps in "What to buy" display "→ same milk" (`c4_shop_same` / "→ उतना ही दूध") for a dry-only herd instead of having no milk part. Violates SPEC AC-C4-1.14 and AC-C4-1.24. Fix: check `isDryHerd` and omit the milk gain element completely on UI and in summary.
2. `src/components/AuditDrawer.tsx:33-36` and `src/lib/hashRoute.ts:114-133`: Closing the audit drawer via the on-screen "Close" button, Escape key, or backdrop overlay fails to pop the history entry created on drawer open. Violates ARCHITECTURE.md line 1317 and SPEC AC-C4-1.22/AC-C4-R5. Fix: call `window.history.back()` when closing via non-popstate triggers.

### Recommendations (non-blocking):
- `src/services/planHerdPrototypeMock.ts`: Prototype mock fixture `src/data/herdPrototype.json` is no longer used by runtime code; prune once confirmed.
- `src/App.tsx:568-574`: Legacy toggle will be fully retired upon C4 completion.
- Localized date formatting for `feed.priceDate` in `auditShoppingCost`.

## Change 4 (herd and 3-step flow), C4-M1 Review 2 (2026-10-16)

Verdict: APPROVED
Base commit: `2134ab6` (Head: `cfcdf8e`)
Test command: `npm test && npx playwright test tests/e2e/herd-flow.spec.ts && npm run build && npm run eval:scipy` (exit code 0, 405 unit tests, 8 Playwright E2E tests)

### Summary of Review:
- **Fix Verification for Defect 1 (Dry herd shopping milk gain omission):** `cfcdf8e` introduced `isDryHerd` gating in both `ShoppingList.tsx` and `domain/summary.ts`. In `ShoppingList.tsx:45`, the `c4-shop-gain` element is omitted entirely for dry herds (`{gain && !isDryHerd && ...}`). In `domain/summary.ts:111-120`, plain text summary generation for dry herds appends only the feed line base without the milk gain suffix. Verified by explicit unit tests in `tests/unit/herdUi.test.tsx` and `tests/unit/domainFormat.test.ts` (AC-C4-1.14, AC-C4-1.24).
- **Fix Verification for Defect 2 (Audit drawer history cleanup on non-popstate close):** `cfcdf8e` refactored `useAuditDrawerHistory` in `src/lib/hashRoute.ts`. When the drawer opens, `pushState` is recorded. If dismissed via non-popstate triggers (Close button, Escape key, backdrop click), the cleanup effect calls `window.history.back()` to drop the pushed history entry. If closed via browser `popstate` (hardware Back), `poppedByHistory` prevents redundant back calls. Verified by unit tests in `tests/unit/hashRoute.test.ts` and E2E in `tests/e2e/herd-flow.spec.ts` (AC-C4-1.22, AC-C4-R5, ARCHITECTURE line 1317).
- **Full Test Suite & Parity:** All 405 unit tests passed, all 8 Playwright E2E tests passed, `npm run build` passed with zero errors, SciPy 23 tests passed.

### Critical defects:
None.

### Recommendations (non-blocking):
- `src/domain/herdPlan.ts`: Consider exporting a reusable helper `export function isDryHerd(plan: HerdPlan): boolean` in `herdPlan.ts` to share between `HerdPlan.tsx` and `domain/summary.ts` ahead of C4-M2.
- `src/lib/hashRoute.ts:136`: Guard `window.history.state?.drawerOpen` before calling `window.history.back()` for extra defense against external unmounts.

## Change 4 (herd and 3-step flow), C4-M2 Review 1 (2026-10-17)

Verdict: APPROVED
Base commit: `2134ab6` (Head: `a7ad058`)
Test command: `npm test && npx playwright test tests/e2e/herd-flow.spec.ts && npm run build && npm run eval:dump && npm run eval:scipy` (exit code 0, 432 unit tests, 10 Playwright E2E tests, 32 SciPy tests)

### Summary of Review
- **Multi-Animal Herd Flow (AC-C4-2.1, AC-C4-E5, AC-C4-2.2):** Supports up to 10 animals (`MAX_ANIMALS = 10`) with persistent monotonic per-species labeling (`label_cow_n`, `label_buffalo_n`) that never renumbers after removal. The add-animal card stays visible until 10 animals are listed, whereupon it hides and displays `c4_max_animals` ("You can add up to 10 animals" / "ज़्यादा से ज़्यादा 10 गाय-भैंस जोड़ सकते हैं"). Removing an animal on Screen 3 correctly drops the plan, redirects the hash to `#/animals`, and preserves remaining animals, budget, and home feeds.
- **Fair-share Joint LP & Home Feeds (AC-C4-2.3, AC-C4-2.4, AC-C4-2.5):** Solves multi-animal joint LP maximizing common scale factor $t^* \in [0, 1]$ across milking animals ($Y_i = t^* g_i$) while holding dry animals at maintenance ($y_i = 0$). Stage 2 minimizes purchase cost $P(F)$ with home stock costed at ₹0 and shared across animals ($\sum_i h_{i,f} \le q_f + 10^{-6}$). Stage 3 minimizes total home kg at that purchase cost. Double-precision `verifyHerdSolution` verifies all per-animal nutritional requirements (DM ceiling, roughage share $\ge 40\%$, CP, ME, Ca, P, Ca:P, Ca:DM), feed caps, and shopping conservation ($\sum_i b_{i,f} = B_f$).
- **Shopping Steps & Marginal Milk (AC-C4-2.6):** Buying order $Bu_H$ prioritizes mandatory supplements, ascending cost, and feed ID tie-breaking. Real joint prefix solves from $P_1$ to the full set guarantee non-decreasing milk ($\Delta L_k \ge 0$), with the final step matching $F$ within $10^{-6}$ relative tolerance.
- **Limit Diagnosis (AC-C4-2.10):** Evaluated at $Y$, tight constraints follow strict architectural priority: `budget`, `milk_target` ($t^* = 1$), `home_stock` in row order, then per-animal in list order (`intake`, `roughage`, `CP`, `ME`, `Ca`, `P`). Comprehensive isolated limit unit tests confirm exact detection for every limit kind.
- **SciPy HiGHS Cross-Check (AC-C4-2.9):** `eval/test_herd_animals.json` defines 7 benchmark herd cases spanning multi-species herds, dry animals, binding home stock, below maintenance, infeasible restricted feeds, $t^* = 1$, and tight budget. `scripts/dump_solver_results.ts` dumps browser solver outputs, and `eval/test_scipy_herd_agreement.py` asserts 100% agreement against SciPy HiGHS within $10^{-4}$ tolerance on $t^*$, $P(F)$, $M_H$, $\text{costAtCap}_H$, Stage 3 home kg, and $S_i$ floor formula.
- **Regressions & Presets (AC-C4-2.11, AC-C4-R1..R12):** Single-animal equivalence preserved across all 18 benchmark animals. Presets updated cleanly from single-animal to 3 multi-animal herd examples ("Cow + Buffalo", "Straw only", "Tight budget"). 10-animal worst case benchmark solves in ~466 ms ($\le 1.0$ s budget). All unit, E2E, build, and Python eval suites pass cleanly.

### Critical defects (must fix; any defect means REJECTED)
None.

### Recommendations (non-blocking)
- In `src/domain/herdSolver.ts:1463-1466`, the residual budget calculation for per-animal tight constraint detection loops through `slicesAtY`. While already optimized with a memoized `slicesAtY` map, caching `sumOtherCosts = totalCost - slice.totalCost` could marginally optimize future scaling beyond 10 animals.
- In `eval/cross_check_herd.py`, add explicit type annotations to `parse_args()` helper functions for consistency with the rest of the Python eval codebase.

## Change 4 (herd and 3-step flow), C4-M3 Review 1 (2026-10-17)

Verdict: REJECTED
Base commit: `2134ab6` (Head: `5bb8a78`)
Test command: `npm test && npx playwright test tests/e2e/herd-flow.spec.ts && npm run build && npm run eval:dump && npm run eval:scipy` (exit code 0, 442 unit tests, 13 Playwright E2E tests, 32 SciPy tests)

### Critical defects (must fix; any defect means REJECTED):
1. `src/components/ShoppingList.tsx:68-80`: Expansion figures (amount `+X kg`, cost `(+₹Y)`, and milk gain `+Z L milk`) were rendered as plain text spans without `<Fig audit={...}>` wrappers, violating SPEC AC-C4-3.3 and ARCHITECTURE.md line 2266. Fix: export `auditExpansionKg`, `auditExpansionCost`, and `auditExpansionGain` in `src/domain/auditHerd.ts` and wrap each expansion figure with `<Fig audit={...}>`.
2. `src/components/ShoppingList.tsx:83-88`: The `aria-label` on `[+ Add to budget]` button omitted the feed name (`Add ₹X/day to budget for +Y L milk`), violating SPEC AC-C4-3.4 and ARCHITECTURE line 2271. Fix: update `c4_add_to_budget_aria` in `src/i18n/strings.ts` to include the feed name and pass `localizedFeed` to the label.

### Recommendations (non-blocking):
- None.

## Change 4 (herd and 3-step flow), C4-M3 Review 2 (2026-10-18)

Verdict: APPROVED
Base commit: `2134ab6` (Head: `a8b5249`)
Test command: `npm test && npx playwright test tests/e2e/herd-flow.spec.ts && npm run build && npm run eval:dump && npm run eval:scipy` (exit code 0, 442 unit tests, 13 Playwright E2E tests, 32 SciPy tests)

### Summary of Review
- **Within-budget Consolidation (AC-C4-3.1):** All bought feeds required for the optimal solve within the farmer's entered budget $B_d$ are consolidated in "What to buy" without artificial baseline rung splitting. Total shopping cost strictly obeys $P(F) \le B_d$.
- **Beyond-budget Expansion Steps (AC-C4-3.2, AC-C4-3.3):** "Then, if you can" (Hindi "फिर, हो सके तो") appears strictly when the budget limits yield ($t^* < 1.0 - 10^{-6}$ for milking herds). Beyond-budget feed additions $\Delta q_f$ are isolated from probed extra budget solves, rounded up to whole rupees, floored to 0.1 L milk, and sorted in descending order of economic return ($\Delta L / \Delta\text{Cost}$).
- **Interactive Budget Upgrade (AC-C4-3.4, AC-C4-3.5, AC-C4-E14):** Each expansion item provides an accessible `[+ Add to budget]` / `[+ बजट में जोड़ें]` button with $\ge 44\times 44$ px touch target and descriptive `aria-label` naming the feed, cost, and milk gain. Tapping the button immediately increments daily budget by $\Delta\text{Cost}$, triggers auto-resolve, updates Screen 3 view, and retains the upgraded budget when navigating back to Screen 2 and Screen 1.
- **Omission Criteria (AC-C4-3.6, AC-C4-E12, AC-C4-E13):** "Then, if you can" is cleanly omitted when the herd achieves peak genetic yield ($t^* = 1.0$), for dry herds ($Y = 0$), and when physical intake or non-budget constraints are tight.
- **Fix Verification (Review 1 Critical Defects):**
  - Defect 1 verified: All expansion figures wrapped in `<Fig audit={...}>` with solver probe metadata. Cleanly rendered without duplicate sign (`+`) or double parentheses (`((...))`).
  - Defect 2 verified: Button `aria-label` includes the localized feed name in English and Hindi.
- **Invariants & Regressions:** Zero regressions across single-animal benchmarks, multi-animal joint LP, offline PWA capability, language isolation, and SciPy HiGHS agreement.

### Critical defects:
None.

### Recommendations (non-blocking):
- None.


