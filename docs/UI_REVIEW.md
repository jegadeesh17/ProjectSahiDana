# UI Review

## Milestone M1 UI Review
Verdict: APPROVED
Screenshots: .ui-review/M1/home-desktop.png, .ui-review/M1/home-desktop-1440.png, .ui-review/M1/home-mobile.png, .ui-review/M1/solved-desktop.png, .ui-review/M1/solved-mobile.png, .ui-review/M1/audit-drawer-desktop.png, .ui-review/M1/audit-drawer-mobile.png, .ui-review/M1/solved-hindi-desktop.png, .ui-review/M1/solved-hindi-mobile.png, .ui-review/M1/infeasible-desktop.png, .ui-review/M1/infeasible-mobile.png

### Critical defects (must fix; any defect means REJECTED)
- None.

### Summary of M1 Verification (`1280x800` / `1440x900` desktop & `390x844` mobile)
1. **Design System & Token Fidelity (`DESIGN.md` — "The Calm Health Card"):**
   - All colour, typography, spacing, radius, elevation, and motion tokens are defined once in `:root` of `src/index.css`. Pattern scan confirmed **0 hard-coded hex/rgb/hsl colours** outside `src/index.css`, **0 gradients/glass/blur**, **0 emoji icons**, **0 placeholder/lorem copy**, and **0 removed focus outlines**.
   - Self-hosted `Noto Sans` and `Noto Sans Devanagari` (weights `400` and `600` only) render cleanly with `tabular-nums` on all numeric figures, `2.5rem` (`40px`, `-0.02em` tracking) on the supported-milk headline and fine-print sheet figure, and `1.55` line-height on `:lang(hi)` so Devanagari matras are never clipped.
   - The red rule is strictly respected: `--c-danger` / `--c-danger-tint` appear only on `InfeasibilityAlert` and form validation errors; `BudgetShortfallAlert` (budget below maintenance) uses `--c-warn-tint` / `--c-warn-ink`.
   - Feed vertical chips (`FeedChip` in `src/components/FeedName.tsx`) use `VERTICAL_CLASS[feed.vertical]` and `vertical_${feed.vertical}` with screen-reader text and titles.
2. **Screen States & M1 Vertical Slice Completeness (`docs/SPEC.md` & `docs/TASKS.json`):**
   - **How-to-use banner:** Renders across the full width at the top of `<main>` (`grid-column: 1 / -1` on desktop) in the active language (`data-testid="how-to-use"`).
   - **Live v1 data & two-stage LP solver (`VITE_USE_MOCK_ADAPTER=false`):** All 30 cited feeds from `src/data/feeds.v1.json` render under the 4 sticky vertical group headers (`Indigenous forage`, `Crop residues`, `Agro-byproducts`, `Mineral`) with the Jaipur seasonality month selector and reliability labels (`mandi`, `trade report`, `indicative`, `team estimate`). Breeds filter by species from `src/data/breeds.v1.json` and display `BreedBenchmark` (`9.64 L per day · cited peak daily yield` and `7.34%` fat for Murrah; `14.64 L per day · lactation average (no peak cited)` and `not cited` fat for HF crossbred).
   - **Solved state & Show details (`solved-desktop.png`, `solved-mobile.png`):** Displays `"This budget supports 9.6 L per day"`, `VerdictCard` (`+1.6 L/day possible`, caveat line, factual fat comparison), the as-fed ration table, budget/today cost notes, and the `Show details` / `Hide details` disclosure with Stage 1 & Stage 2 breakdown, maintenance cost (`₹59.95`), roughage share (`84%` vs cited `minimum 40% · ICAR 2013, Nutrient Requirements of Cattle and Buffalo; NDDB Ration Balancing Programme (p. 28)`), and the 5 nutrient coverage bars (`DM`, `CP`, `ME`, `Ca`, `P`).
   - **Tap-to-audit sheet (`audit-drawer-desktop.png`, `audit-drawer-mobile.png`):** Tapping `9.6 L` opens the rounded bottom sheet (`role="dialog"`, `aria-modal="true"`) showing `Solver output`, `Limited by, feed limit: Maize fodder (green)`, Stage 1 objective/constraints, `S = 9.60 L; cap 9.64 L; cost ₹178.14 ≤ ₹299.50`, binding constraint checkmark pill, and `SOLVER-LP-V1`. `Escape`, scrim click, and `Close` dismiss the drawer and restore focus to the tapped figure.
   - **Infeasible state (`infeasible-desktop.png`, `infeasible-mobile.png`):** Shows no partial ration; names limiting nutrients (`CP`, `P`) with tappable required vs max-supply figures and 1-tap `Add` suggestions (`Guar meal`, `Mineral mixture`).
   - **One-language-per-screen (`solved-hindi-desktop.png`, `solved-hindi-mobile.png`):** Switching the app-bar toggle to `हिंदी` updates all labels, verdicts, feed names, breed names, and audit drawer rows to Hindi while keeping all numerals in Latin digits (`0`–`9`) with `kg`, `L`, `₹`, `%`.
3. **Responsive Layout & Accessibility (WCAG 2.2 AA):**
   - **Zero horizontal overflow:** Verified `document.documentElement.scrollWidth <= window.innerWidth` across initial, solved, Hindi, and infeasible states at `1440x900`, `1280x800`, and `390x844`.
   - **Desktop (`>= 1024px`) vs Mobile (`390x844`):** Desktop places inputs left (`5fr`) and `Ration analysis` right (`7fr`) with no nested scrollbar and an inline `Balance ration` button. Mobile collapses the Animal and Feeds cards after balancing into compact summary rows (`Edit` buttons) and pins `Balance ration` at the bottom.
   - **Contrast & Reduced Motion:** All text/surface pairs exceed 4.5:1 (lowest is 4.8:1 `--c-text-2` on `--c-track`); `@media (prefers-reduced-motion: reduce)` disables all animations and smooth scrolling.

### Recommendations (non-blocking)
- **`src/components/RationResultsPanel.tsx` (lines 402–404):** The card footer `<p className="frame-foot"><Bi id="notice_prototype_fixture" /></p>` still renders `"Prototype: these figures are fixtures, not the real solver or the cited library."` even when `liveAdapter` (`VITE_USE_MOCK_ADAPTER=false`) is active and serving compiled `v1` data and the real LP solver. Consider hiding or updating this footer notice when `getRationAdapterMode() === 'live'` during the M3 polish pass (`M3-TASK-03`).
- **`src/index.css` (line 1946, `.pill-btn`):** The tappable `"Out of season"` pill button in the feed library has `min-height: 36px` (exceeds the 24px WCAG 2.2 AA minimum, but is 8px below the 44px touch-target goal in `DESIGN.md` and `M3-TASK-03`). Increasing `.pill-btn` to `min-height: var(--target)` (`44px`) in `M3-TASK-03` will make every standalone interactive control 44px+.
- **`src/i18n/strings.ts` (lines 365–366, `audit_constraint_dm`):** The string still reads `'Σ (amount × DM%) ≤ DM limit (and ≥ 85% of the limit)'`. Since prototype alignment #2 removed the 85% DM floor in `src/domain/solver.ts`, consider dropping `(and ≥ 85% of the limit)` in `strings.ts` during M3.
- **`DESIGN.md` frontmatter (`rounded:`):** `impeccable detect` noted two advisory radius values in `src/index.css` (`24px` on `.sheet` at line 1572, which is documented in `DESIGN.md` prose line 147, and `1px` on the 2px-wide `.bar-mark` tick at line 1342). Adding `sheet: "24px"` to `DESIGN.md` YAML frontmatter when convenient would silence the advisory detector check.

## Milestone M2 UI Review
Verdict: APPROVED
Screenshots: .ui-review/M2/extractor-open-desktop.png, .ui-review/M2/extractor-open-desktop-1440.png, .ui-review/M2/extractor-open-mobile.png, .ui-review/M2/prefill-unmatched-desktop.png, .ui-review/M2/prefill-unmatched-mobile.png, .ui-review/M2/explain-verified-desktop.png, .ui-review/M2/explain-verified-mobile.png, .ui-review/M2/explain-verified-hindi-desktop.png, .ui-review/M2/explain-verified-hindi-mobile.png, .ui-review/M2/fallback-ratelimit-desktop.png, .ui-review/M2/fallback-ratelimit-mobile.png

### Critical defects (must fix; any defect means REJECTED)
- None.

### Summary of M2 Verification (`1280x800` / `1440x900` desktop & `390x844` mobile)
1. **Design System & Token Fidelity (`DESIGN.md` — "The Calm Health Card"):**
   - Pattern scan and `impeccable detect --json src/` (exit code `0`) confirmed **0 hard-coded hex/rgb/hsl colours** outside `src/index.css`, **0 gradients/glass/blur**, **0 emoji icons**, **0 placeholder/lorem copy**, **0 removed focus outlines**, and **0 Devanagari literals** outside `src/i18n/strings.ts` and `src/data/`.
   - All M2 AI states (`FreeTextExtractor` disclosure, privacy notice, prefill review region, unmatched feed rows, and `ExplanationCard` verified/fallback states) strictly adhere to the `DESIGN.md` tokens (`--c-warn-tint` / `--c-warn-ink` for unconfirmed prefill and regeneration/fallback notes, `--c-accent-tint` / `--c-accent-ink` for verified pills and badges, `--c-danger-tint` for extraction failure alerts).
2. **M2 Online AI Extraction, Unmatched Feeds & Mandatory Confirmation (`docs/SPEC.md` AC-2.2, AC-2.3, AC-E5.1, AC-L1.5):**
   - **OpenRouter privacy notice (`extractor-open-desktop.png`, `extractor-open-desktop-1440.png`, `extractor-open-mobile.png`):** Opening `Describe the animal and feeds` displays `"Your text is sent to OpenRouter. Free models may log prompts."` above the textarea and links it via `aria-describedby`.
   - **Unconfirmed prefilled state (`prefill-unmatched-desktop.png`, `prefill-unmatched-mobile.png`):** Extracting an English or Hinglish description populates the species segment (`[data-prefilled="true"]` with dashed amber outline), breed select (`Murrah`), body weight (`450`), milk yield (`8`), fat (`6.5`), budget (`250`), and matched library feeds (`Wheat straw`, `Mustard cake`) in the `--c-warn-tint` unconfirmed state. `Balance ration` stays disabled with `"Next: confirm the prefilled values"`.
   - **Unmatched feeds & nutrient safety (`prefill-unmatched-desktop.png`, `prefill-unmatched-mobile.png`):** Unknown feed names (`"magic probiotic mix"`, `"mystery herbal tonic"`) are isolated in `data-testid="unmatched"` with the explicit guardrail notice (`"No nutrient values are ever taken from the AI."`), a labeled `Map to a library feed` `<select>`, and a `Drop` button (with `Undo` support). `Values are right, confirm` remains disabled until every unmatched item is mapped or dropped.
3. **Verified Explanation Badge, Single Retry & Language Gate (`docs/SPEC.md` AC-7.1, AC-E6.1, AC-L1.3, AC-L1.6):**
   - **Verified explanation & single retry (`explain-verified-desktop.png`, `explain-verified-mobile.png`):** When Attempt 1 returns an untraced number (`777.77`), `liveAdapter.explainRation` automatically triggers Attempt 2 with `flaggedNumbers: ['777.77']` and renders `ExplanationCard` (`data-state="explain-verified"`) with the `Verified` status pill, the regeneration notice (`data-testid="flagged-notice"`), the plain-English explanation (`lang="en"`), and the `"All 6 numbers verified"` badge (`data-testid="badge"`).
   - **Hindi mode parity (`explain-verified-hindi-desktop.png`, `explain-verified-hindi-mobile.png`):** Switching the app-bar toggle to `हिंदी` updates all surrounding UI, status pills (`संतुलित`, `सत्यापित`), regeneration notice, and verification badge (`"सभी 6 संख्याएँ सत्यापित"`) to Hindi with Latin digits (`0`–`9`), while keeping `.explain-text` in English (`lang="en"`).
4. **Rate-Limit (`429`) & Deterministic Template Fallback (`docs/SPEC.md` AC-E4.1, AC-E4.2):**
   - **Graceful degradation (`fallback-ratelimit-desktop.png`, `fallback-ratelimit-mobile.png`):** On HTTP `429` (`RATE_LIMITED`), `FreeTextExtractor` renders `role="alert"` (`"The AI service is rate limited. Try again in a minute. Manual entry still works."`) with a `Try again` button while keeping manual entry and presets usable; `ExplanationCard` renders `data-state="explain-fallback"` with the `Template` status pill, `data-testid="fallback-notice"`, the citation-backed deterministic summary list (`buildTemplateExplanation`), and the `"Fixed template, not AI-written text"` badge.
5. **Responsive Layout & Accessibility (WCAG 2.2 AA):**
   - **Zero horizontal overflow:** Verified `document.documentElement.scrollWidth <= window.innerWidth` across all M2 states at `1440x900`, `1280x800`, and `390x844`.
   - **Semantics, keyboard & contrast:** All M2 interactive controls (`disclosure`, `textarea`, unmatched `<select>`, `Drop`, `Values are right, confirm`, `Discard prefilled values`, `Explain`, `Try again`) have programmatic labels, visible `:focus-visible` outlines, `44px+` touch targets, and WCAG 2.2 AA contrast (`>= 4.8:1`).

### Recommendations (non-blocking, for M3 polish pass `M3-TASK-03`)
- **`src/App.tsx` (lines 98, 128, 225–229, 280, 334–336):** `toast.message` currently stores a pre-rendered string evaluated when `showToast(...)` is called (e.g., `showToast(bi('state_confirmed'))`). If the user toggles the UI language between `English` and `हिंदी` while the 3.2-second toast is still visible (visible in `explain-verified-hindi-mobile.png`), the toast text remains in the previous language until it auto-dismisses. In `M3-TASK-03` (`tests/e2e/language.spec.ts`), either clear the active toast when switching languages or store a renderable callback/descriptor so active toasts switch language immediately.
- **Carry-over M3 polish items from M1 review:**
  - `src/components/RationResultsPanel.tsx` (lines 402–404): Hide or update the `notice_prototype_fixture` footer when `getRationAdapterMode() === 'live'` (`VITE_USE_MOCK_ADAPTER=false`).
  - `src/index.css` (line 1946, `.pill-btn`): Increase `.pill-btn` (`Out of season` pill button) from `min-height: 36px` to `min-height: var(--target)` (`44px`) in `M3-TASK-03`.
  - `src/i18n/strings.ts` (lines 365–366, `audit_constraint_dm`): Remove the legacy `(and ≥ 85% of the limit)` parenthetical to match the frozen solver formulation.

## Milestone M3 UI Review
Verdict: APPROVED
Screenshots: .ui-review/M3/home-desktop-1440.png, .ui-review/M3/home-desktop-1280.png, .ui-review/M3/home-mobile.png, .ui-review/M3/solved-desktop-1440.png, .ui-review/M3/solved-desktop-1280.png, .ui-review/M3/solved-details-desktop.png, .ui-review/M3/solved-mobile.png, .ui-review/M3/solved-details-mobile.png, .ui-review/M3/solved-hindi-desktop.png, .ui-review/M3/solved-hindi-mobile.png, .ui-review/M3/audit-drawer-desktop.png, .ui-review/M3/audit-drawer-mobile.png, .ui-review/M3/audit-drawer-hindi-desktop.png, .ui-review/M3/audit-drawer-hindi-mobile.png, .ui-review/M3/infeasible-desktop.png, .ui-review/M3/infeasible-mobile.png, .ui-review/M3/explain-verified-desktop.png, .ui-review/M3/explain-verified-hindi-mobile.png

### Critical defects (must fix; any defect means REJECTED)
- None.

### Summary of M3 UI Verification (Desktop 1440x900, 1280x800 & Mobile 390x844)

1. **Language Isolation & Devanagari Font Check (SPEC AC-L1.1, AC-L1.2, AC-L1.3, AC-L1.4, AC-L1.6, AC-L1.7, AC-E3.1):**
   - **Language Toggle & Storage Persistence:** Defaults to English, updates `<html lang>`, and persists selection across reloads in `localStorage['sahidana.lang']` (`tests/e2e/language.spec.ts` passes offline and online). Active toasts update reactively when toggling languages.
   - **Zero Cross-Language Bleed:**
     - **English mode:** 0 Devanagari characters outside `[data-lang-exempt]`.
     - **Hindi mode:** 0 unexempted Latin words outside `[data-lang-exempt]`. Metric units (`kg`, `L`, `g`, `Mcal`, `₹`, `%`), nutrient abbreviations (`DM`, `CP`, `ME`, `Ca`, `P`), and cited document acronyms (`DAHD`, `ICAR`, `NDDB`, `CIRB`) are isolated and permitted.
   - **Western Arabic Numerals (0–9 everywhere):** All numbers across form inputs, animal benchmarks, solver headline (`9.6 L`), verdict gains/savings, ration table amounts and costs, nutrient coverage percentages and grams/Mcal, and fine-print audit drawer formulas render strictly with Latin digits `0`–`9` in both English and Hindi.
   - **Self-Hosted Offline Fonts:** `@fontsource/noto-sans-devanagari` loads from local cached woff2 assets without external network dependency (`document.fonts.check('16px "Noto Sans Devanagari"') === true`). Line-height `1.55` on `:lang(hi)` ensures no Devanagari vowel matras or conjuncts are clipped.
   - **AI Explanation Language Gate:** Verified that in Hindi mode, the LLM explanation body remains in plain English (`lang="en"`) per SPEC AC-L1.6, while the explanation container, verified pill (`• सत्यापित`), count badge (`सभी 6 संख्याएँ सत्यापित`), and footnote notice (`AI का पाठ सिर्फ़ अंग्रेज़ी में है`) render fully in Hindi.

2. **UI Polish & Harden Pass (WCAG 2.2 AA, Responsiveness, Motion & Layout):**
   - **Touch Targets (44×44px minimum):** All interactive controls on 390×844 mobile viewports—including the `.langtoggle-btn` segments, demo preset chips, feed library `.pill-btn` ("Out of season") and `Add` buttons, input controls, `.fig` dotted buttons, `Details` disclosure toggle, and bottom drawer actions—meet or exceed 44×44px effective touch targets (`min-height: var(--target)` / 44px).
   - **Contrast Ratio (>= 4.5:1):** Color pairs strictly adhere to `DESIGN.md`:
     - Primary text `--c-text` (`#1f2a24`) on `--c-surface` (`#ffffff`) = 14.8:1
     - Secondary text `--c-text-2` (`#5b6660`) on `--c-surface` = 6.0:1; on `--c-ground` (`#f6f7f5`) = 5.6:1; on `--c-track` (`#e3e8e3`) = 4.8:1
     - Primary button text `--c-surface` on `--c-accent` (`#12804a`) = 5.0:1
     - Accent ink `--c-accent-ink` (`#0b5a33`) on `--c-accent-tint` (`#e3f4ea`) = 7.3:1
     - Warning ink `--c-warn-ink` (`#704708`) on `--c-warn-tint` (`#fbf3e1`) = 7.3:1
     - Danger ink `--c-danger-ink` (`#8c3128`) on `--c-danger-tint` (`#faeceb`) = 7.1:1
   - **Focus Restoration & Keyboard Navigation:** Opening `AuditDrawer` traps Tab/Shift+Tab focus within the dialog; dismissing via `Escape`, scrim backdrop click, or `Close` button immediately restores document focus to the triggering figure button (`tests/e2e/language.spec.ts` line 415 passed). Visible 2px accent outlines are preserved on all interactive elements.
   - **Reduced Motion:** `@media (prefers-reduced-motion: reduce)` disables all animations and transitions on the fine-print sheet slide, result card rise, skeleton loading shimmer, and coverage bar growth (`tests/e2e/language.spec.ts` line 447 passed).
   - **Desktop 2-Column Asymmetric Layout (>= 1024px):**
     - Verified at `1440x900` and `1280x800`: `<main>` uses a 2-column CSS grid (`5fr` inputs left, `7fr` results right) with the "How to use" banner spanning `grid-column: 1 / -1`.
     - The result card flows naturally with document scroll without internal/nested scrollbars (`scrollHeight === clientHeight`).
     - "Balance ration" renders inline directly below the Daily Budget card on desktop; the pinned bottom bar is active on mobile viewports only (`display: none` at `>= 1024px`).
   - **Pattern Scan & Refuse List:** 0 hard-coded hex/rgb colors outside `src/index.css`, 0 gradients/glow/glass, 0 emoji icons, 0 placeholder copy, and 0 missing image alt tags.

### Recommendations (non-blocking)
- **`src/components/FeedSelector.tsx` (Feed library sticky vertical headers):** At narrow mobile viewports, the sticky headers (`Indigenous forage 10 feeds`) have `position: sticky; top: 0`. They remain clean and readable, but consider adding a subtle `border-bottom: 1px solid var(--c-line)` when scrolling within the feed library container on low-DPI displays for enhanced visual separation.
- **`src/i18n/strings.ts` (`audit_source_feeds_v1`):** In Hindi mode, dataset citations in the fine-print sheet show `'NDDB 2012'`. This is completely acceptable under the proper-noun and citation exemption in `DESIGN.md`, but adding an optional localized footnote explaining the survey publication year could offer additional clarity for rural users.


## Change 3 (farmer-first flow), C3-M1 UI Review 1 (2026-10-15)

**Verdict: APPROVED.** Base `d28d90a`. Checked at 375 px and 1280 px, English and Hindi, idle / buffalo demo / straw demo, against screenshots of `d28d90a`. Screenshots: `.ui-review/c3-m1-review/` (not committed).

All of AC-C3-1.1 to 1.6 observed as passing:
- order is cow or buffalo, budget, feeds, button, examples;
- the title follows the species;
- no farmer-facing "animal" or "पशु" (the only "पशु" is the feed brand "सरस पशु आहार");
- equal side-by-side tiles with aligned 40 px figures and no overflow;
- a quiet "Try an example" with 44 px+ targets, not covered by the pinned bar on phones.

Findings (non-blocking):
1. Major (UX): on desktop, "Try an example" sits at the foot of the left column, below the fold (~1750 px idle). Taken to the user at UAT.
2. Minor: at 320 px, two 4-digit figures overflow the tile background by ~5 px (fine at 360 and 375 px).
3. Minor: the example pills' hairline border is ~1.4:1 against the ground, a deliberately quiet style; the label and focus ring identify the control.
4. Minor: the "Infeasible"/"Solves" notes are jargon; the straw note is relabelled in C3-M2.
5. Minor: DESIGN.md Layout line still names the old card order; to fix in C3-M2.

## Change 3 (farmer-first flow), C3-M2 UI Review 1 (2026-10-15)

**Verdict: APPROVED.**
Screenshots: `.ui-review/c3-m2-review/` (01-initial to 11-hindi-straw at desktop & mobile).

### Critical defects
None.

### Recommendations (non-blocking)
- `src/index.css` (.feedname in .rung-feeds and .not-needed): `.feedname` defaults to `display: flex; flex-direction: column`. In inline comma-separated lists (`BuyLadder.tsx:100` and `RationResultsPanel.tsx:378`), adding `.rung-feeds .feedname, .not-needed .feedname { display: inline; }` and `.rung-feed-name { display: inline; }` will make multiple feeds wrap cleanly as fluent inline text.
- `src/components/BuyLadder.tsx` (Rung badge text size): On narrow mobile screens (`375px`), `.rung-badge` can be kept compact with `white-space: nowrap`.

### Summary of Verification
1. **Design System & Tokens:** 0 hard-coded colors outside index.css, 0 gradients/blobs/glass, 0 emoji icons, all interactive controls retain :focus-visible outlines. "Buy" tags use `--c-accent-tint` (`#e3f4ea`), "You have" tags use `--c-sunken` (`#f1f4f1`), `BudgetShortfallAlert` uses `--c-warn-tint` (red rule strictly preserved).
2. **Accessibility & Contrast:** All text pairs exceed 4.5:1 (primary text 14.8:1, secondary text 6.0:1, accent ink 7.3:1, warn ink 7.3:1). 44px+ touch targets on all interactive controls. Focus restoration verified across all audit sheets.
3. **Responsive Reflow:** Zero horizontal overflow across all states at 1440px desktop, 1280px desktop, and 390px/375px mobile viewports. Side-by-side milk tiles align with 40px numbers.
4. **C3-M2 Feature States:** Feeds section collapsed & optional (AC-C3-2.2); Calculate ration enabled with 0 feeds (AC-C3-2.1); "You have" and "Buy" tags verified (AC-C3-2.6); BuyLadder renders Rung 0 states and Rungs 1..n with non-decreasing milk (AC-C3-2.7, 2.8, 2.9); Not needed line verified (AC-C3-2.11); BudgetIncreasePrompt verified (AC-C3-2.12); Shortfall raise-by alert verified (AC-C3-2.14); Three demos verified (AC-C3-2.15).
5. **Language & Digits:** Strict one-language isolation in English and Hindi with 0 script leakage. All numerals use Western Arabic digits `0`–`9` across all states.

## Change 4 (herd and 3-step flow), C4-M1 UI Review 1 (2026-10-16)

Verdict: APPROVED
Screenshots:
- `.ui-review/C4-M1/screen1-animals-empty-desktop.png`
- `.ui-review/C4-M1/screen1-animals-empty-mobile.png`
- `.ui-review/C4-M1/screen1-animals-filled-desktop.png`
- `.ui-review/C4-M1/screen1-animals-filled-mobile.png`
- `.ui-review/C4-M1/screen2-feeds-desktop.png`
- `.ui-review/C4-M1/screen2-feeds-mobile.png`
- `.ui-review/C4-M1/screen3-result-desktop.png`
- `.ui-review/C4-M1/screen3-result-mobile.png`
- `.ui-review/C4-M1/screen3-result-mobile-375.png`
- `.ui-review/C4-M1/screen3-result-details-desktop.png`
- `.ui-review/C4-M1/screen3-result-details-mobile.png`
- `.ui-review/C4-M1/screen3-audit-drawer-desktop.png`
- `.ui-review/C4-M1/screen3-audit-drawer-mobile.png`
- `.ui-review/C4-M1/screen3-result-hindi-desktop.png`
- `.ui-review/C4-M1/screen3-result-hindi-mobile.png`

### Verification Summary
- **Test command:** `cmd.exe /c "npm test && npx playwright test tests/e2e/herd-flow.spec.ts"` exited with code 0 (22 unit test files / 405 tests passed, all 8 Playwright E2E tests passed).
- **Design Tokens & Fidelity:** Strict compliance with DESIGN.md color ramp (`--c-ground`, `--c-surface`, `--c-accent`, `--c-accent-ink`, `--c-accent-tint`, etc.). Grep pattern scan found zero hardcoded hex/rgb outside `src/index.css`.
- **Refuse List Scan:** Exit code 1 / zero hits for gradients, frosted glass, backdrop blur, emoji icons, placeholder copy, invented metrics, or removed focus outlines.
- **Motion:** Transitions and animations respect `prefers-reduced-motion` in `src/index.css`.
- **WCAG 2.2 AA Contrast:** All text and control borders meet or exceed standards (body text 14.8:1, secondary text 6.0:1 on surface and 5.6:1 on ground, accent buttons 5.0:1, controls 3.3:1).
- **Touch Targets:** Verified >= 44x44 px for all buttons, chips, links, and interactive figures (e.g., primary buttons 56px, secondary 48px, interactive figures 44px hit area with `.fig`).
- **Mobile Viewport & Symmetry (AC-C4-1.18):** Verified at 390px and 375px; sections "What to buy" and "Not needed today" share `.c4-card` with identical padding, verified both visually and via Playwright test #7.
- **Language Isolation & Numerals:** Strict one-language isolation in English and Hindi toggle states. Latin digits (`0-9`) used consistently in both languages with standard units (`kg`, `g`, `L`, `₹`, `%`) per AC-C4-R10 and DESIGN.md.
- **Audit Drawer:** Bottom sheet with grab handle, value at 40px, proper provenance rows (`cited_source`, `solver_output`, `user_input`), accessible focus management (focus moves to Close on open, returns to figure on close), and history push/pop support.

### Critical defects (must fix; any defect means REJECTED)
None.

### Recommendations (non-blocking)
- `src/components/HerdPlan.tsx`: In the season line, the figure button `<Fig inline>` applies `--s-1` (4px) horizontal padding, which slightly separates the date from enclosing parentheses `( 16 October )`. Removing the outer whitespace inside the string or adjusting the inline fig margin would yield tighter typographical parentheses without reducing target height.
- `src/components/AnimalPlanCard.tsx`: On desktop (1440px), the expanded "Details (for paravet)" nutrient bars look clean, but adding a slight background tint or card separator to the expanded accordion container could further visually distinguish paravet technical data from the farmer's primary plan view.
- Desktop multi-column anticipation: Currently the 3-screen flow is centered single-column (max 640px). When C4-M2 introduces multiple herd animals, consider whether multi-animal cards could sit side-by-side on wide viewports to minimize page scrolling.
