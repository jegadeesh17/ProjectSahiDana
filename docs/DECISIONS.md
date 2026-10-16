# Architecture Decision Records

Key technical, hosting, solver, AI integration, data and language decisions for SahiDana, referenced by [ARCHITECTURE.md](ARCHITECTURE.md) and [SPEC.md](SPEC.md). Last updated: 2026-10-15 (ADR-0021 added for the Change 4 Round 6 amendment and amended at the Change 4 freeze: the month comes from today's date, the herd explanation is never cut, and unitless number matching is accepted; ADR-0016 unchanged; ADR-0019 and ADR-0020 added for Change 4, herd and 3-step flow, with the status of ADR-0010, ADR-0011, ADR-0012 and ADR-0014 updated; ADR-0010 to ADR-0018 added for Change 3 and its UI primitives; ADR-0001 to ADR-0009 unchanged since the freeze on 2026-10-12).

| ID | Title | Status | Date |
|---|---|---|---|
| [ADR-0001](#adr-0001-static-pwa-plus-single-serverless-function-on-vercel) | Static PWA Plus Single Serverless Function on Vercel | Accepted | 2026-10-12 |
| [ADR-0002](#adr-0002-in-browser-linear-programming-with-javascript-lp-solver) | In-Browser Linear Programming with javascript-lp-solver | Accepted | 2026-10-12 |
| [ADR-0003](#adr-0003-server-side-openrouter-proxy-with-env-configured-model-fallback-chain) | Server-Side OpenRouter Proxy with Env-Configured Model Fallback Chain | Accepted | 2026-10-12 |
| [ADR-0004](#adr-0004-nutrient-requirement-standard-and-cited-feed-data-provenance) | Nutrient Requirement Standard and Cited Feed Data Provenance | Accepted (feed `category` and price tagging in decision 2 superseded by [ADR-0006](#adr-0006-regional-three-vertical-seasonal-library-with-cited-dated-editable-prices)) | 2026-10-12 |
| [ADR-0005](#adr-0005-bilingual-side-by-side-ui) | Bilingual Side-by-Side UI | Accepted (decision 1, and the side-by-side display in decisions 4 and 5, superseded by [ADR-0009](#adr-0009-language-toggle-one-language-per-screen)) | 2026-10-12 |
| [ADR-0006](#adr-0006-regional-three-vertical-seasonal-library-with-cited-dated-editable-prices) | Regional Three-Vertical Seasonal Library with Cited, Dated, Editable Prices | Accepted | 2026-10-12 |
| [ADR-0007](#adr-0007-two-stage-budget-max-milk-lp) | Two-Stage Budget Max-Milk LP | Accepted | 2026-10-12 |
| [ADR-0008](#adr-0008-breed-based-milk-cap-body-weight-sets-intake-not-milk) | Breed-Based Milk Cap; Body Weight Sets Intake, Not Milk | Accepted | 2026-10-12 |
| [ADR-0009](#adr-0009-language-toggle-one-language-per-screen) | Language Toggle, One Language per Screen | Accepted | 2026-10-12 |
| [ADR-0010](#adr-0010-farmer-first-candidate-set-own-feeds-plus-in-season-priced-library-feeds) | Farmer-First Candidate Set: Own Feeds Plus In-Season Priced Library Feeds | Accepted (the own-feed part of decision 1, and decision 2, superseded by [ADR-0019](#adr-0019-home-feed-at-0-capped-by-the-herds-daily-amount-with-a-separate-buy-option)) | 2026-10-15 |
| [ADR-0011](#adr-0011-own-feeds-used-first-at-the-farmers-price-and-cap-never-forced) | Own Feeds Used First at the Farmer's Price and Cap, Never Forced | Superseded by [ADR-0019](#adr-0019-home-feed-at-0-capped-by-the-herds-daily-amount-with-a-separate-buy-option) | 2026-10-15 |
| [ADR-0012](#adr-0012-cheapest-first-upgrade-ladder-from-nested-prefix-solves) | Cheapest-First Upgrade Ladder from Nested Prefix Solves | Accepted (decision 4, rung 0 and the per-rung display, superseded by [ADR-0020](#adr-0020-joint-herd-lp-with-a-fair-share-of-each-milk-target)) | 2026-10-15 |
| [ADR-0013](#adr-0013-cost-at-cap-solver-field) | Cost-at-Cap Solver Field | Accepted | 2026-10-15 |
| [ADR-0014](#adr-0014-budget-increase-prompt-with-rupee-amounts-rounded-up) | Budget-Increase Prompt with Rupee Amounts Rounded Up | Accepted (rounding to the paisa in decisions 2 and 4 superseded by [ADR-0020](#adr-0020-joint-herd-lp-with-a-fair-share-of-each-milk-target)) | 2026-10-15 |
| [ADR-0015](#adr-0015-no-invented-per-feed-inclusion-caps-for-library-feeds) | No Invented Per-Feed Inclusion Caps for Library Feeds | Accepted | 2026-10-15 |
| [ADR-0016](#adr-0016-candidate-month-is-the-devices-current-month) | Candidate Month Is the Device's Current Month | Accepted | 2026-10-15 |
| [ADR-0017](#adr-0017-two-milestone-delivery-layout-first-then-farmer-first-solve) | Two-Milestone Delivery: Layout First, Then Farmer-First Solve | Accepted | 2026-10-15 |
| [ADR-0018](#adr-0018-ui-primitives-vaul-radix-shadcn-style-components-lucide) | UI Primitives: vaul, Radix, shadcn-Style Components, lucide | Accepted | 2026-10-15 |
| [ADR-0019](#adr-0019-home-feed-at-0-capped-by-the-herds-daily-amount-with-a-separate-buy-option) | Home Feed at ₹0, Capped by the Herd's Daily Amount, with a Separate Buy Option | Accepted | 2026-10-15 |
| [ADR-0020](#adr-0020-joint-herd-lp-with-a-fair-share-of-each-milk-target) | Joint Herd LP with a Fair Share of Each Milk Target | Accepted | 2026-10-15 |
| [ADR-0021](#adr-0021-herd-ai-layers-and-visible-season) | Herd AI Layers and Visible Season | Accepted | 2026-10-15 |

---

## ADR-0001: Static PWA Plus Single Serverless Function on Vercel

Date: 2026-10-12
Status: Accepted

### Context

Field paravets in Rajasthan and North India work at the farmer's doorstep on basic Android phones where mobile internet is frequently patchy or absent. Deliverable D.03 is an offline progressive web app for field paravets, so core ration balancing must work reliably offline. Judges also need a public URL to try the app; that URL is wanted for judging but is not itself a named deliverable (wording corrected 2026-10-12 against the official Track 6 card). The app must also support online AI assistance (free-text extraction and plain-English explanation) without exposing API keys in the browser. We also need a free, zero-maintenance hosting setup that fits a 3.5-day hackathon schedule.

### Decision

We will build SahiDana as a TypeScript/React Progressive Web App (PWA) bundled with Vite and `vite-plugin-pwa`, hosted on **Vercel's free Hobby tier** alongside **one Vercel Serverless Function (`api/llm.ts`)**. The feed library and nutrient requirement tables ship as versioned static JSON files (`src/data/feeds.v1.json` and `src/data/requirements.v1.json`) that are precached by the Service Worker on first visit so the entire ration formulation and audit workflow runs offline with zero database or backend server dependencies. Python is used exclusively in `eval/` during Milestone 3 for offline evaluation metrics and solver cross-checking.

### Alternatives considered

- **Streamlit (Rejected):** Requires a persistent WebSocket connection to a Python server for every interaction. It cannot work offline, which directly fails the offline field requirement (D.03).
- **Separate FastAPI Backend + Vite Frontend (Rejected):** Requires deploying and maintaining two separate services (plus CORS and cold-start coordination) while offering no offline advantage, because the LP solver must still run in the browser for offline use.
- **Server-Side Database (Rejected):** Unnecessary because no user accounts or personal data are stored, and static versioned JSON cached by the Service Worker provides instant offline reads and deterministic auditability.

### Consequences

- **Positive:** One free deployment (`vercel`) serves both the offline-capable PWA and the online LLM proxy from the same origin. After the initial page load, form entry, feed search, LP optimization, and citation auditing work completely offline.
- **Negative:** Core calculation logic (`requirements.ts`, `solver.ts`, `verifier.ts`) is written in TypeScript rather than Python, requiring a separate Python script in `eval/` for Milestone 3 cross-verification.

---

## ADR-0002: In-Browser Linear Programming with javascript-lp-solver

Date: 2026-10-12
Status: Accepted

Note (2026-10-12): the choice of solver stands. What the LP optimizes changed from "cheapest ration" to the two-stage "most milk within budget, then cheapest" formulation in [ADR-0007](#adr-0007-two-stage-budget-max-milk-lp).

### Context

Because the app must balance rations offline on low-end Android phones, the linear program (minimizing daily feed cost across ~1–30 candidate feeds subject to Dry Matter, Crude Protein, Metabolizable Energy, Calcium, Phosphorus, and per-feed cap constraints) must run inside the browser. At the same time, veterinary and technical judges need confidence that a browser JavaScript solver produces mathematically accurate least-cost rations.

### Decision

We will use **`javascript-lp-solver`** inside the browser PWA to solve the linear program and diagnose infeasible constraint sets, and we will pair it in Milestone 3 with an offline Python evaluation script (`eval/cross_check_solver.py`) using **`scipy.optimize.linprog` (HiGHS)** across all benchmark test animals. This provides the audit guarantee that "two independent solvers agree" without shipping a second runtime in the production app.

### Alternatives considered

- **Pyodide / SciPy in the Browser (Rejected):** Downloads roughly 30 MB of WebAssembly runtime and scientific packages, which is far too slow and data-heavy for basic Android phones on rural mobile networks.
- **`highs-js` WebAssembly Solver (Rejected):** Requires fetching and initializing a ~1.5–2 MB `.wasm` binary asynchronously, which adds Service Worker caching complexity and test-runner friction while providing no accuracy or speed benefit on small LPs (~10–30 variables and ~10 constraints solve in under 1 millisecond in pure JavaScript).
- **Server-Side PuLP / SciPy Solver Only (Rejected):** Fails whenever the paravet loses internet connectivity at the farmer's doorstep.

### Consequences

- **Positive:** Instant (<1 ms), zero-WASM, 100% offline ration calculation in the browser with trivial unit testing in Vitest, backed by an independent SciPy `linprog` mathematical cross-check in `eval/`.
- **Negative:** The LP constraint formulation must be kept in sync between `src/domain/solver.ts` (TypeScript) and `eval/cross_check_solver.py` (Python), which is enforced by automated M3 tests.

---

## ADR-0003: Server-Side OpenRouter Proxy with Env-Configured Model Fallback Chain

Date: 2026-10-12
Status: Accepted

### Context

SahiDana uses an LLM for two optional online conveniences: extracting structured animal/feed inputs from free text, and explaining a balanced ration in plain English. Calling OpenRouter directly from the browser would leak `OPENROUTER_API_KEY` in client network traffic. Furthermore, OpenRouter's free-tier model catalogue (`:free` models) changes over time and enforces strict per-minute and daily request caps that can return HTTP `429` errors during testing or live demos.

### Decision

We will route all LLM calls through the single Vercel Serverless Function (`POST /api/llm`), which holds `OPENROUTER_API_KEY` strictly in server-side environment variables. The primary model ID is configured via the `OPENROUTER_MODEL` environment variable, backed by a comma-separated fallback list in `OPENROUTER_FALLBACK_MODELS`. If the primary model returns a rate-limit (`429`) or upstream error, the proxy automatically retries down the fallback chain. If all models fail (or the user is offline), the client keeps manual form entry active and falls back to a deterministic, citation-backed explanation template. In addition, the LLM is never allowed to supply nutrient values, and every number in an LLM explanation is checked client-side against authorized solver outputs and cited sources (with at most one retry before deterministic fallback). Free-tier daily request caps are checked during project setup and documented in `docs/ARCHITECTURE.md`.

### Alternatives considered

- **Direct Browser Calls to OpenRouter (Rejected):** Exposes `OPENROUTER_API_KEY` publicly in the client bundle and browser DevTools.
- **Hardcoding a Single Free Model ID (Rejected):** High risk of sudden breakage or rate limiting if OpenRouter deprecates or throttles a single `:free` endpoint during judging.
- **Paid Proprietary LLM API Only (Rejected):** Unnecessary cost when free OpenRouter instruction models combined with a fallback chain and deterministic client-side fallback satisfy the prototype requirements at `$0`.

### Consequences

- **Positive:** Zero API key leakage, automatic resilience against free-tier model churn or rate limits, and a 100% reliable deterministic fallback if all online models are exhausted.
- **Negative:** Requires configuring `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, and `OPENROUTER_FALLBACK_MODELS` in Vercel project settings before Milestone 2 deployment, and displaying a user notice that free models on OpenRouter may log prompts.

---

## ADR-0004: Nutrient Requirement Standard and Cited Feed Data Provenance

Date: 2026-10-12
Status: Accepted

Superseded in part (2026-10-12): in decision 2, the feed `category` and the `team-asserted` tag on default prices are replaced by the `vertical` field and the price reliability label of [ADR-0006](#adr-0006-regional-three-vertical-seasonal-library-with-cited-dated-editable-prices). The requirement standard (decision 3), the PDF handling (decision 1) and the human verification gate (decision 4) stand; ADR-0006 and ADR-0008 extend the gate to breeds, DAHD figures and the intake equation.

### Context

SahiDana's core promise—"a ration a vet can audit in 30 seconds"—depends on every feed nutrient value and every animal requirement tracing to a real, verifiable publication and page number. Our fact-check (`BRAINSTORM.md`) established that:
1. The NDDB booklet (*Nutritive Value of Commonly Available Feeds and Fodders in India*, July 2012) provides authoritative DM-basis values for `CP`, `ME (Mcal/kg DM)`, `Ca`, and `P` across Indian roughages and concentrates (Tables 1–5, pp. 80–98), but is under NDDB copyright and lacks fresh-fodder `DM%` values.
2. The printed ICAR 2013 *Nutrient Requirements of Cattle & Buffalo* booklet is out of stock with no official free PDF; however, CELKAU publishes the ICAR maintenance table by body weight, while per-kg-milk-by-fat requirements must come from either a verified peer-reviewed citation of ICAR 2013 or the freely accessible NASEM 2021 dairy standard.

### Decision

We adopt the following data provenance and requirement standard rules:
1. **NDDB Booklet Handling (`sources/`):** The NDDB PDF is downloaded into a gitignored `sources/` directory for local transcription and human verification, and is never committed to git.
2. **Feed Library (`data/feeds.csv` → `src/data/feeds.v1.json`):** Contains ~25–30 Rajasthan/North-India feeds with `CP`, `ME (Mcal/kg DM)`, `Ca`, and `P` on a DM basis, category, local name, `source_table`, and `source_page`. Fresh-fodder `DM%` is sourced from a second cited reference (`dm_source_citation`). Energy constraints use `ME (Mcal/kg DM)` directly; any displayed `TDN` is computed as `ME × 27.7` and explicitly labelled `derived`. Any seasonal, regional, or default-price metadata not backed by a published source is explicitly tagged `team-asserted`.
3. **Requirement Standard (`data/requirements.json` → `src/data/requirements.v1.json`):** Daily maintenance requirements (`DM` intake ceiling, `CP`, `ME`, `Ca`, `P`) use the CELKAU/ICAR maintenance table by body weight. Per-kg-milk-by-fat lactation values use **verified ICAR 2013 values** (when verified against a primary peer-reviewed paper during data task execution) or **NASEM 2021** equations (free at `nap.edu`), whichever is verified first; the exact table and page/section citations are embedded in `requirements.v1.json` so the audit drawer displays the exact standard used for every requirement calculation.
4. **Mandatory Human Verification:** Teammate A checks every row of `data/feeds.csv` and `data/requirements.json` against the source PDFs before Milestone 3 closes as a required UAT gate.

### Alternatives considered

- **Uncited or LLM-Generated Feed/Requirement Tables (Rejected):** Violates clinical safety and destroys the core auditability differentiator in front of veterinary judges.
- **Committing the NDDB PDF to the Public GitHub Repository (Rejected):** Violates NDDB copyright.
- **Using TDN as the Primary LP Energy Constraint (Rejected):** Because the NDDB booklet reports `ME (Mcal/kg DM)` rather than `TDN`, formulating the LP in `ME` avoids introducing conversion approximations into the solver constraints.

### Consequences

- **Positive:** Every number in the UI has an honest, inspectable provenance record (`cited` with document/table/page, `derived` with formula, or `team-asserted`), and copyright boundaries are respected.
- **Negative:** Requires manual row-by-row verification by Teammate A against `sources/Animal-Nutrition-booklet.pdf` before M3 closes.

---

## ADR-0005: Bilingual Side-by-Side UI

Date: 2026-10-12
Status: Accepted

Superseded in part (2026-10-12) by [ADR-0009](#adr-0009-language-toggle-one-language-per-screen): decision 1 (both languages at once, no switch), and the side-by-side display in decision 4 (local name next to the English name) and decision 5 (bilingual badge and template). Decisions 2, 3 and 6, the unverified-Hindi risk and its review line below stay in force.

### Context

The paravet works at the farmer's doorstep, and often the farmer reads the screen too. An English-only screen leaves the farmer out, and some paravets are more comfortable reading Hindi. The earlier scope dropped a Hindi UI because nobody on the team could check the Hindi. On 2026-10-12 the user changed the scope: every label, button, message and state is shown in Hindi and English side by side, a native-speaker teammate reviews the Hindi on 2026-10-14, and free-text descriptions may be written in Hindi, Hinglish or English (see [SPEC.md](SPEC.md), AC-L1.1 to AC-L1.5).

This must not weaken the product's main claim, that every number on screen is traceable. The solver, the number check on the AI explanation, and offline use must all keep working exactly as before.

### Decision

1. **Both languages at once, no switch.** Every UI string is shown with Hindi first and English after or below it. There is no language toggle and no language setting.
2. **One strings file.** All Hindi text lives in a single typed file, `src/i18n/strings.ts`, as `{ hi, en }` pairs keyed by an id. A small `<Bi>` component renders a pair. An automated test fails if Devanagari text appears in any other source file, and checks that both halves of every pair use the same placeholders.
3. **Numbers stay in Latin digits** (`0`–`9`) with the units `kg`, `L` and `₹`, in both languages. All number formatting goes through one helper file that can never output Devanagari digits. The solver and the number check only ever see plain numbers.
4. **Feed names come from the source.** Each feed shows its local name (Devanagari and/or transliteration) next to its English name, and can be searched by any of the three. Local names are copied from the cited source. Where the team writes the Devanagari spelling of a name that the source gives only in Latin letters, that spelling is marked `team-asserted`. The team never invents a local name for a feed that has none in the source.
5. **AI stays English for explanations.** Free-text extraction accepts Hindi, Hinglish or English and returns the same structured numbers as before. The AI explanation is English only: the prompt asks for English, any Devanagari in the reply counts as a failed attempt, and the number-check parser is unchanged. The verification badge and the fixed-template fallback explanation are bilingual, built from the strings file.
6. **Self-hosted font.** Noto Sans (Latin) and Noto Sans Devanagari, both under the free SIL Open Font License, installed from npm (`@fontsource/noto-sans`, `@fontsource/noto-sans-devanagari`). We load only weights 400 and 600 and only the Latin and Devanagari character subsets. The font files are bundled with the app and saved for offline use on the first visit. Estimated cost: about 200–270 KB of font files in total, downloaded once (budget 300 KB, measured at the first M1 build).

### Alternatives considered

- **Language toggle (Hindi or English) (Rejected):** The user chose side by side for this audience: the paravet and the farmer read the same screen at once, nobody has to find a setting, and judges see both languages in every screenshot. A toggle also adds a hidden state that every test would have to cover twice.
- **Hindi AI explanation (Rejected):** The number check is the product's core safety claim, and it parses English text with Latin digits. Hindi output brings Hindi number words, possible Devanagari digits and different sentence structures, which would need a new parser and new tests during a 3.5-day hackathon. Free models' Hindi quality also could not be verified before the deadline. The fixed template already gives a Hindi explanation that is correct by construction.
- **i18next or react-intl (Rejected):** These libraries add tens of KB plus language detection, switching and plural machinery that we do not need when both languages are always shown. A typed constant object gives compile-time errors for missing ids at zero cost.
- **Google Fonts CDN (Rejected):** The app must work offline, and a CDN font fails when there is no network. It would also send each visitor's IP address to a third party.
- **Phone system fonts only (Rejected):** Devanagari support on low-end Android phones varies by maker and Android version. Some older WebViews render conjunct letters badly, and the system Devanagari font would not match the Latin font in size or weight.
- **Mukta (single family covering Latin and Devanagari) (Considered, kept as fallback):** Smaller files (about 50–60 KB per weight), but its Latin half is less neutral for tables of numbers. If Noto goes over the 300 KB budget, the first step is to drop the Devanagari 600 weight; switching to Mukta comes after that.

### Consequences

- **Positive:** The farmer and the paravet can both read every screen. Changing or fixing Hindi text means editing one file. The solver, the number check and offline use are unaffected, because numbers never change script and the fonts are cached.
- **Negative:** Text takes roughly twice the vertical space on a 390 px wide phone, so layouts must be designed for that. The first visit downloads about 200–270 KB more. Every new UI string needs both halves before it can be merged. The feed data needs four local-name columns with their own citation and provenance.
- **Risk: the Hindi is unverified.** As of 2026-10-12, every Hindi string in `src/i18n/strings.ts`, and every `team-asserted` Devanagari feed name, is **UNVERIFIED**. Nobody on the team has checked the Hindi yet, so wrong or unnatural Hindi could reach a demo or a screenshot. Mitigation: a native-speaker teammate reviews the file on Wed 2026-10-14. The code carries `HINDI_REVIEW.status = 'unverified'` until then, and the review is a mandatory UAT checklist item. After the review, the reviewer appends a dated line below this ADR (`Review: YYYY-MM-DD, <name>, verified | changes made`) and sets `HINDI_REVIEW.status` to `'verified'`; the decision above is not rewritten.

---

## ADR-0006: Regional Three-Vertical Seasonal Library with Cited, Dated, Editable Prices

Date: 2026-10-12
Status: Accepted

### Context

The official Track 6 card asks for rations built from "indigenous forage, seasonal crop residue, and local agro-byproducts", and deliverable D.02 is a "comprehensive regional crop byproduct library". The user decided (FEEDBACK Round 3 #1 and #4) to build around these three groups near Jaipur, with season information and prices. The research in [DATA_SOURCES.md](DATA_SOURCES.md) found:
- nutrient values for most feeds in the NDDB booklet, with dry-matter percentages from Feedipedia;
- season windows for most feeds, some official (ICAR-CRIDA, RAJFED) and some not;
- **no single reliable price source.** The government mandi data (data.gov.in) covers grains such as bajra, maize and barley, but not oil cakes, bran, chuni or molasses. Other prices come from trade bodies, news reports and online listings, of very different reliability. There is no Jaipur price series for straw or green fodder at all.

A paravet needs a sensible starting price, but prices change by week and village, and the app must work offline.

### Decision

1. **Library of about 30 Jaipur-area feeds in four groups:** Indigenous forage, Crop residues, Agro-byproducts, and Mineral. Each feed has exactly one group (`vertical`), which the feed picker uses for its headings. The old `category` field is removed, because nothing in the calculation needs it.
2. **Season months on every feed.** Each feed lists the months it is available near Jaipur, a short season note in English and Hindi, and where the months come from (marked `team-asserted` when no official calendar gives them). Stored residues such as wheat bhusa are available all year. The months only drive the "in season" mark next to a feed; they never stop the paravet from choosing a feed and never change the calculation.
3. **Every default price is cited, dated and labelled by reliability:** "mandi" (government mandi data), "trade report" (trade body, exchange or news), "indicative" (an online listing) or "team estimate" (allowed only with a written reason). A feed with no price found has no default, and the paravet types one in.
4. **Every price is editable.** The paravet's own price is labelled "your price" and is what the calculation uses.
5. **No live price feed.** Prices are fixed values in the library, updated by editing `data/feeds.csv`.
6. **Human check.** Every row is checked against its source document before Milestone 3 closes, and the date of that check is stored with the row.

### Alternatives considered

- **Live data.gov.in mandi prices (Rejected):** It has none of the cakes, bran, chuni or molasses that matter most for cost; it needs internet, which fails the offline requirement; it needs an API key; and a demo would depend on a government server being up.
- **A national feed library without regional or season data (Rejected):** Does not meet the card's "regional" and "seasonal" wording, and offers feeds a Jaipur farmer cannot buy.
- **No default prices, the paravet types every price (Rejected):** Slower at the doorstep and hides the cost story from judges. Defaults with a visible date and reliability, which the paravet can overwrite, give a starting point without pretending to be exact.
- **Hiding out-of-season feeds (Rejected):** Farmers store fodder and buy from other districts, so a feed that is "out of season" may still be on hand. Marking is honest; hiding would be wrong.
- **Scraping online listings automatically (Rejected):** Unreliable, against the sites' terms, and still not offline.

### Consequences

- **Positive:** Judges can see where every price came from, how old it is and how much to trust it. The library matches the card's three groups. Everything works offline.
- **Negative:** Prices go stale; each shows its date so the paravet can see that. Many prices are "indicative" listings or have no default. Season notes and price notes need Hindi text, which adds to the native-speaker review. Each of about 30 rows needs a manual check.

---

## ADR-0007: Two-Stage Budget Max-Milk LP

Date: 2026-10-12
Status: Accepted

### Context

The card asks for least-cost rations "to maximize milk yield while reducing dairy maintenance expenditure". The first design only found the cheapest ration for the milk the animal gives today. The user asked instead for "max milk within a budget" (FEEDBACK Round 3 #2): given what the farmer can spend each day and the feeds on hand, how much milk can those feeds support, and what is the cheapest way to get it. The app must also say what keeping today's milk would cost when the budget is too small (Round 3, OQ2) and how much could be saved when the animal is already at its breed level (OQ5).

### Decision

The solver works in **two stages**, both linear programs solved in the browser with `javascript-lp-solver` (which supports both maximizing and minimizing):

1. **Stage 1, most milk:** find the highest milk level that the selected feeds can support, with every nutrient need met, within the animal's intake limit, with enough roughage (point 3), within the budget, within any per-feed limits, and never above the milk cap. The cap is the breed's cited figure ([ADR-0008](#adr-0008-breed-based-milk-cap-body-weight-sets-intake-not-milk)), or today's milk when the animal already gives more than that: an animal that gives more has shown it can.
2. **Stage 2, cheapest ration:** fix the milk at that level and find the cheapest ration that supports it. The milk level shown is rounded **down** to 0.1 L, so the ration shown always supports the number shown and the number never appears above the cap.
3. **Roughage minimum in every run.** At least a cited share of the ration's dry matter must come from roughage: indigenous forage and crop residues. Without it, a large budget could produce a ration of almost only cakes and grain, which a vet would reject. The share is a number with an ICAR or NDDB citation, shown in the audit sheet. If the data task cannot find such a citation, it stops and asks the user; no uncited number is used.
4. **Dry animals** (today's milk 0 L) skip stage 1 and get the cheapest maintenance ration, with the verdict "Dry animal: maintenance ration".

The same "cheapest ration at a fixed milk level" calculation is reused three more times: at zero milk to get the **maintenance cost** (if the budget is below it, the app says so and suggests a cheaper feed that has a default price); at today's milk without a budget limit to get the **cost of keeping today's milk** (used for "Keeping 8 L needs ₹B/day" and for the saving "same milk for ₹Z less"; if that run is impossible, no saving is shown); and at the stage 1 result to find **what is holding the milk back** (the budget, the cap, the intake limit, the roughage minimum or a named nutrient), which the audit sheet shows. The shortfall message "Keeping 8 L needs ₹B/day" therefore appears only when the budget or the feeds hold milk below today's, never because of the breed figure.

This works as a linear program because every nutrient need is a fixed maintenance amount plus a fixed amount per litre of milk, the intake limit is written the same way, and the roughage minimum is a fixed share. Details are in [ARCHITECTURE.md](ARCHITECTURE.md), "LP formulation (two-stage)". The SciPy cross-check in Milestone 3 re-solves every stage independently.

**Why the feed `category` field stays dropped.** The roughage minimum needs to know which feeds are roughage. That is taken from each feed's group ([ADR-0006](#adr-0006-regional-three-vertical-seasonal-library-with-cited-dated-editable-prices)): indigenous forage and crop residues are roughage; agro-byproducts and mineral are not. A separate `category` field would hold the same fact twice, and the two could disagree. Row chip styling also uses the feed's group (`vertical`) in M1.

**No uncited dry-matter floor, and binding-constraint order.** The prototype fixture (`src/services/mockSolver.ts`) included an ad-hoc lower bound requiring dry matter to be at least 85% of the intake ceiling (`DM_FLOOR_FRACTION = 0.85`). That bound is not in any standard and is dropped in the real solver: total dry matter has only the cited upper intake ceiling, while the positive nutrient minimums (`CP`, `ME`, `Ca`, `P`) and the cited roughage minimum share already ensure a realistic ration without inventing a floor. When naming what holds milk back, tight constraints are ordered `budget`, `breed_cap`, `intake`, `roughage`, `CP`, `ME`, `Ca`, `P` (with `roughage` before individual nutrients, per SPEC OQ6).

### Alternatives considered

- **Cheapest ration at today's milk only (Rejected):** The previous design. It cannot answer "how much milk can this budget support", which is what the user asked for.
- **One combined objective, such as "milk minus a tiny weight times cost" (Rejected):** The result depends on choosing the tiny weight; too large and it trades milk for money, too small and the solver's rounding makes it meaningless. Two stages give the exact answer with no tuning.
- **Trying milk levels one by one (for example every 0.1 L) and picking the highest that fits the budget (Rejected):** Up to 400 solves, only as accurate as the step, and it cannot name what is holding the milk back.
- **A non-linear intake or requirement model (Rejected):** Would need a different solver library, larger and harder to check in the browser.
- **No roughage rule (Rejected, user decision 2026-10-12):** Simpler, but allows rations that are mostly concentrate at high budgets.
- **An uncited dry-matter floor such as 85% of the intake ceiling (Rejected):** Used only in the prototype fixture (`mockSolver.ts`); no cited standard backs it, and it can falsely reject valid nutrient-dense rations when the roughage share and all nutrient minimums are already met.
- **Capping a high-yielding animal at the breed figure (Rejected, 2026-10-12):** It would tell the paravet that the budget "supports less than today" when only the breed figure is in the way.

### Consequences

- **Positive:** Answers the card's "maximize milk" and the user's "within a budget" directly; rations keep a sensible roughage base; every number on the result has a precise solver origin that the audit sheet can show; all runs together still take a few milliseconds.
- **Negative:** Up to five solver runs per tap instead of one (plus up to about 30 tiny runs when suggesting a cheaper feed for a budget below maintenance). The browser solver and the Python cross-check must be kept identical for all stages. Rounding the milk down means the headline can be up to 0.09 L below the exact optimum. The roughage share is blocked until a cited ICAR/NDDB value is found; a selection with no forage or crop residue cannot be balanced, and the app says "roughage" is the reason.

---

## ADR-0008: Breed-Based Milk Cap; Body Weight Sets Intake, Not Milk

Date: 2026-10-12
Status: Accepted

### Context

The user asked to "calculate the milk potential using a standard milk potential for a breed according to its weight" and tell the paravet if there is room for improvement (FEEDBACK Round 3 #3). The research ([DATA_SOURCES.md](DATA_SOURCES.md) §5) found **no published standard that predicts milk from body weight**. The ICAR, NRC and NASEM standards do the opposite: they estimate how much an animal can eat from its body weight and its milk. The research did find cited lactation figures (yield, range, length, fat) for 14 breeds common in Rajasthan and nearby states, cited peak daily yields for four of them (Murrah, Nili-Ravi, Bhadawari, Sahiwal), and national average daily yields for non-descript cattle and buffalo from the Department of Animal Husbandry and Dairying (DAHD). Without some ceiling, stage 1 of [ADR-0007](#adr-0007-two-stage-budget-max-milk-lp) would happily "support" impossible amounts of milk when the budget is large.

### Decision

1. **A breed input** with a cited breed table (`data/breeds.csv`): the 14 breeds plus "Non-descript" for each species. Breed names in Hindi are kept in the same table and reviewed with the other Hindi on 2026-10-14.
2. **The milk cap comes from the breed, in this order** (user decision, 2026-10-12): for "Non-descript", the DAHD national average (cattle 3.86, buffalo 4.73 L/day, pending verification). Otherwise, the breed's **cited peak daily yield** where one is published (Murrah 9.64, Nili-Ravi 9.4, Bhadawari 6.93, Sahiwal 11.15). When a source gives a range of study means, the top of that range is used (Murrah); when it gives a mean plus the range across individual animals, the mean is used (Nili-Ravi). Otherwise a lactation average, labelled "lactation average (no peak cited)": the top of the cited lactation range divided by the (shorter) cited lactation length, else the cited average daily yield, else the cited lactation yield divided by its length. The audit sheet names the rule, shows any division, and cites the document, table and page. The build computes every cap from the cited figures, so nobody types a cap by hand.
3. **An animal already above its breed figure keeps its own milk as the cap.** The calculation uses the higher of the breed cap and today's milk, and the verdict reads "Above the breed level; same milk for ₹Z less". The audit shows both numbers.
4. **1 kg of milk is treated as 1 L.** The sources give kg; every audit sheet with a breed figure says so.
5. **Body weight sets how much the animal can eat, not how much milk it can give.** The intake limit uses the NRC 2001 dairy equation (dry-matter intake from milk, fat and body weight), with the week of lactation fixed at 20 because the form does not ask for it.
6. **The verdict is a statement of fact,** never advice: "+X L/day possible", "Already at the breed level", "Above the breed level", "This budget supports less than today", "Dry animal: maintenance ration", or "Budget below the maintenance cost", with the caveat that the actual gain depends on stage of lactation and health. Today's fat % is shown next to the breed's cited fat %, with no recommendation.
7. **Human check.** Every breed figure (including each peak and which value of a range was taken), both DAHD figures (with their years) and the four NRC equation constants are checked against the original documents before Milestone 3 closes.

### Alternatives considered

- **Predict milk from body weight (Rejected):** No cited standard does it; any formula would be invented, which breaks the "every number is cited" rule.
- **Herd "peak day yield" from RAJUVAS (Rejected):** It is the single best animal in each herd, not a breed standard.
- **Lactation average for every breed, ignoring cited peaks (Rejected, 2026-10-12):** An average over the whole lactation sits well below what a healthy animal gives near its peak, so many normal animals would look "above potential" (a Murrah giving 8 L/day against a 6.88 L/day average).
- **The highest individual animal in a study as the cap (Rejected):** A record, not a breed standard (for example the 11.8 L/day top of Nili-Ravi's individual range).
- **Let the paravet type a potential (Rejected):** Not auditable, and the paravet usually does not know it.
- **A flat intake limit such as 3% of body weight (Rejected):** Ignores that a higher-yielding animal eats more, and is less precisely cited than the NRC equation.

### Consequences

- **Positive:** Every milk ceiling traces to a cited breed figure or a DAHD statistic, and the app is honest that body weight does not set milk.
- **Negative and risks:**
  - Note: only four breeds have a cited peak. For the others the cap is a lactation average, which is lower than a peak, so an animal near its peak may show "Above the breed level". The label "lactation average (no peak cited)" makes this visible.
  - The NRC equation was fitted on Holstein cows. Using it for zebu cattle, buffalo and dry animals is an extrapolation; the audit sheet shows the equation and the fixed week of lactation.
  - The DAHD figures and the NRC constants come from secondary quotations until the human check is done.
  - Breed body weights are shown for reference only and are missing for several breeds.

---

## ADR-0009: Language Toggle, One Language per Screen

Date: 2026-10-12
Status: Accepted

### Context

[ADR-0005](#adr-0005-bilingual-side-by-side-ui) showed Hindi and English side by side on every screen. After seeing the prototype, the user asked for a toggle (FEEDBACK Round 1 #2: "lets keep toggle based language switch, that will look better") and then for no mixing at all (Round 2 #2: "Don't mix the languages, keep English only or Hindi only"). The Round 3 decision that the app should be "very simple" for field paravets points the same way: half the text on a small phone screen.

### Decision

This supersedes ADR-0005 decision 1, and with it the side-by-side display in ADR-0005 decisions 4 and 5.

1. **A "हिंदी | English" toggle in the app bar.** The app opens in **English** the first time. The choice is saved on the device (browser storage key `sahidana.lang`) and used on every later visit, online or offline. Switching changes every string at once, without a reload and without losing anything typed or calculated.
2. **One language per screen.** English mode shows no Hindi and Hindi mode shows no English words, except: the toggle's own labels, the units `kg`, `L` and `₹`, digits, the nutrient abbreviations (`DM`, `CP`, `ME`, `Ca`, `P`), the SahiDana name and tagline, citation titles and source names quoted as published, the AI explanation (English in both modes), text the user typed, and a feed that has no local name in the source (shown by its English name in Hindi mode).
3. **Feed and breed names in the active language.** Hindi mode uses the Devanagari name, else the transliterated name, else the English name. Search still finds a feed by its English, transliterated or Devanagari name in both modes.
4. **Carried forward unchanged from ADR-0005:** one strings file holding both languages (decision 2), Latin digits everywhere (decision 3), the self-hosted fonts (decision 6), the English-only AI explanation, and the native-speaker review of the Hindi on 2026-10-14. The verification badge and the fixed-template explanation now appear in the active language only; the template is still checked in both languages by the tests.

### Alternatives considered

- **Keep side by side (Rejected):** The user's explicit feedback in Rounds 1 and 2; it doubles the text on a small screen.
- **Follow the phone's language setting automatically (Rejected):** Many phones are set to English even when the user prefers Hindi; an explicit, visible toggle is clearer and works the same on every phone.
- **An i18n library such as i18next (Rejected):** The existing typed strings file already holds both languages and gives errors for missing text; a library would add size for features we do not use.
- **Remember the choice in a cookie or on a server (Rejected):** There is no server-side storage, and the choice must work offline.

### Consequences

- **Positive:** Cleaner, shorter screens; the paravet chooses once per device. The solver and the number check are unaffected, because numbers never change script.
- **Negative:** The language is a hidden state, so the tests check every screen state in both modes. Team-written notes shown to users (season notes, price notes) need both a Hindi and an English text. Judges see one language per screenshot, so the demo should show the toggle.

---

## ADR-0010: Farmer-First Candidate Set: Own Feeds Plus In-Season Priced Library Feeds

Date: 2026-10-15
Status: Accepted (the own-feed part of decision 1, and decision 2, superseded by [ADR-0019](#adr-0019-home-feed-at-0-capped-by-the-herds-daily-amount-with-a-separate-buy-option))

### Context

In Change 3 (FEEDBACK Round 5, [SPEC.md](SPEC.md) "Change 3: Farmer-first flow") the farmer describes the cow or buffalo, sets a daily budget and taps **Calculate ration** without picking any feeds. The solver therefore needs a list of feeds to choose from. The solver already balances whatever list it is given ([ADR-0007](#adr-0007-two-stage-budget-max-milk-lp)). The regional library holds about 30 feeds, each with the months it is available near Jaipur and, for most, a dated default price with its source ([ADR-0006](#adr-0006-regional-three-vertical-seasonal-library-with-cited-dated-editable-prices)). Some feeds have no price at all (for example molasses). The farmer may also add feeds they already have.

### Decision

1. **The candidate set** is:
   - the farmer's own feeds exactly as entered, at the farmer's price and with the farmer's "how much you have" limit. An own feed is kept even when it is out of season this month, because the farmer already has it;
   - plus every library feed that the farmer has not added, that is in season this month ([ADR-0016](#adr-0016-candidate-month-is-the-devices-current-month)) and that has a cited default price. These enter at that default price, with no limit and no "today's amount".
2. **One entry per feed.** If an own feed is also a library feed, it appears once, at the farmer's price and limit, and is tagged "You have".
3. `buildCandidates` in `src/domain/rationPlan.ts` builds this list. The existing two-stage solver runs on it unchanged.
4. **No buying advice for feeds the farmer cannot buy.** The solver's own suggestions can name a feed outside the candidate set: the "add this feed" hint when the budget is below the maintenance cost, and the suggested feeds when no ration is possible. In the farmer-first flow, any suggestion for a feed that is out of season this month or has no cited price is dropped before the result is shown (SPEC C3.5).

### Alternatives considered

- **The whole library, including out-of-season feeds (Rejected):** The app would tell the farmer to buy feed that is not available locally this month.
- **Unpriced feeds at ₹0 or at a team-estimated price (Rejected):** ₹0 would make the solver choose them as "free" feed, and an estimated price is a number with no citation.
- **Own feeds only, as before (Rejected):** The user asked to calculate without picking feeds first.
- **Listing an owned feed twice, once as the farmer's and once from the library (Rejected):** Two rows for one feed would confuse the table and the tags. It would also let the solver buy more of a feed than the farmer said they have, at a different price, so "how much you have" would not mean what the farmer expects.

### Consequences

- **Positive:** The ration is built only from feed that is either on hand or can be bought this month at a cited price. Every price on the screen is the farmer's own or a cited, dated default.
- **Negative:**
  - The result depends on the device's month and on default prices that can be out of date (each shows its date).
  - A good feed that has no cited price is never suggested.
  - A farmer who has some straw and could buy more must either leave "how much you have" blank or enter the market price, because an owned feed has only one entry.
  - The solver now sees about 30 feeds instead of a handful; each run still takes milliseconds.

---

## ADR-0011: Own Feeds Used First at the Farmer's Price and Cap, Never Forced

Date: 2026-10-15
Status: Superseded by [ADR-0019](#adr-0019-home-feed-at-0-capped-by-the-herds-daily-amount-with-a-separate-buy-option)

### Context

The user wants feeds the farmer already has to be "used first" (FEEDBACK Round 5 #5, user choice). In a linear program, "first" can mean several things: force the solver to use them, rank them ahead of cost, or simply price them as the farmer sees them.

### Decision

"Used first" means that own feeds enter the candidate set at the **farmer's price** (the cited default is prefilled; ₹0 is allowed for home-grown feed) and with the farmer's optional **"how much you have"** limit. Because home-grown or already-bought feed is usually cheaper, the cheapest-ration search prefers it on its own. Own feeds are also **shown first**: rung 0 "Your feeds alone" on the ladder, a "You have" tag in the ration table, and a "Not needed" line for any own feed the solver left at 0 kg/day. No minimum amount of an own feed is forced, and the solver's objective is not changed.

### Alternatives considered

- **Force a minimum, such as all of "how much you have" (Rejected):** It can make the ration impossible (too much straw breaks the intake limit) or more expensive than needed, and it hides the cheaper ration.
- **A third solver stage that first uses as much own feed as possible, then minimises cost (Rejected):** It changes the solver formulation and would break the 100% agreement with the SciPy cross-check.
- **Price every own feed at ₹0 automatically (Rejected):** Feed the farmer has still has a value (it could be sold). The farmer's own price is more honest, and ₹0 remains available when the farmer chooses it.

### Consequences

- **Positive:** The solver formulation is untouched. The farmer controls the result through the price and the amount they enter.
- **Negative:** An own feed can be left unused, for example when the farmer's price is above the market price. The "Not needed" line makes this visible, but a farmer who expected "use my straw" may be surprised.

---

## ADR-0012: Cheapest-First Upgrade Ladder from Nested Prefix Solves

Date: 2026-10-15
Status: Accepted (decision 4, rung 0 and the per-rung display, superseded by [ADR-0020](#adr-0020-joint-herd-lp-with-a-fair-share-of-each-milk-target))

### Context

The user chose an upgrade ladder from cheapest to best (FEEDBACK Round 5 #6) to show which feeds to buy. Every number on the ladder must be a real solver result, the order must be the same every time, and a paravet must be able to explain it in one sentence. The real solver also adds two feeds in a fixed minimum daily amount whenever they are on offer: mineral mixture (`mineral_mix`) and common salt (`common_salt`) (the mineral-supplement rows in `src/domain/solver.ts`). Both are priced and available all year, so in the farmer-first flow they are almost always on the buy list.

### Decision

1. **The buy list** contains the feeds in the final ration with more than 0 kg/day that the farmer does not have. It is sorted by each feed's cost in ₹/day in the final ration, cheapest first. Ties are broken by feed id.
2. **Supplements go first (refinement of the plan).** Feeds that the solver always includes in a minimum amount (`mineral_mix`, `common_salt`) are moved to the front of the buy list, cheapest first, and always fall into rung 1. Without this, adding one of them partway up the ladder adds a fixed cost. When the budget is what limits milk, the supported milk could then go **down** at that rung.
3. **Steps of the ladder.** Step `k` is the own feeds plus the first `k` feeds of the buy list. Each step is solved with the same animal, breed and budget, using the full existing solver.
4. **Rungs:**
   - **Rung 0, "Your feeds alone"**, is the own feeds solved without any purchases. It appears only when the farmer added feeds and shows either "balanced" (with its milk and cost) or "not balanced".
   - **Rung 1** is the first step that gives a balanced ration (counting from at least the number of supplements on the buy list). It groups every feed up to that step: "buy these together to balance".
   - **Each later step** is its own rung and adds exactly one feed.
5. **Guarantees, checked by tests:**
   - The last rung equals the final ration: the exact supported milk and the cost agree within `1e-6` (relative).
   - Supported milk never goes down from rung 1 to the last rung.
   - Every rung from rung 1 on is balanced.

   These hold because, after rung 1, each step only adds a feed that the solver may leave at 0 kg/day. Rung 0 is a reference point and is not part of this chain. It can show slightly more milk than rung 1 when the supplements' fixed cost uses part of the budget.

### Alternatives considered

- **Re-optimise at every rung, adding the feed that gives the most milk per rupee (Rejected):** It needs many more solver runs, the order is hard to explain, and the last rung might not equal the final ration.
- **A flat list of feeds to buy (Rejected, user choice):** It does not show what each purchase adds.
- **Sort by price per kg (Rejected):** A feed that is cheap per kg but used in large amounts is not the cheapest to add. ₹/day is what the farmer actually pays.
- **Strict ₹/day order with the supplements wherever their cost puts them (Rejected):** Milk could go down between rungs, which breaks SPEC AC-C3-2.8 and OQ-C3-8.

### Consequences

- **Positive:** The order is fixed and explainable ("cheapest spend first"). Every rung figure is a real solver result with an audit, and the last rung matches the ration shown.
- **Negative:**
  - One tap now runs the solver 1 + (1 if the farmer added feeds) + (length of the buy list) times. Each run is up to about 6 small LPs, plus about 30 more for any step whose budget is below the maintenance cost. This is still expected to take well under a second and is measured at UAT.
  - The ₹/day order has an exception for supplements, so SPEC AC-C3-2.7 should mention it.
  - "Cheapest first" means cheapest spend, not best value per rupee.

---

## ADR-0013: Cost-at-Cap Solver Field

Date: 2026-10-15
Status: Accepted

### Context

The new prompt "Add ₹X/day to your budget to reach Y L/day (breed best)" needs one number the solver does not report today: the cost of the cheapest ration that supports the milk cap (the breed cap, or today's milk if higher) when there is no budget limit. Like every number shown, it must come from the solver and be checked by the SciPy cross-check.

### Decision

1. **New field.** `RationSolution` gets a required field `costAtCapInrPerDay: number | null`.
2. **Where it is computed.** `solveRation` computes it in Step 6, next to the existing stage 2′ run, as `solveFixedMilk(inputs, reqModel, effectiveCap, null)?.totalCost ?? null`. This is the same "cheapest ration at a fixed milk level" calculation already used for the maintenance cost and stage 2′, run at the effective cap with the budget row removed; the roughage and mineral rows stay.
3. **When it is null.** The field is `null` when that calculation has no solution, and always `null` in the dry-animal branch (Step 3).
4. **Scope of the change.** This is the only change to `src/domain/solver.ts`. Steps 1–5 and 7 and every existing output stay exactly as they are.
5. **Today's milk above the breed cap.** In that case the effective cap is today's milk, so the field equals `costAtTodayMilkInrPerDay`.
6. **Mock and cross-check.**
   - The mock solver (`src/services/mockSolver.ts`) sets the field to `null`.
   - `eval/cross_check_solver.py` computes the same quantity with SciPy HiGHS.
   - `scripts/dump_solver_results.ts` writes it out.
   - `eval/test_scipy_agreement.py` checks that both solvers agree on it and are null together.

### Alternatives considered

- **Re-run the whole solver with a very large budget (Rejected):** That gives the cost at the supported milk rounded down to 0.1 L, not at the cap, and needs an arbitrary "large" number.
- **Search for the budget step by step (Rejected):** Many runs, and only as accurate as the step.
- **Read it from the solver's shadow prices (Rejected):** `javascript-lp-solver` does not report them reliably, and the SciPy cross-check could not confirm them.

### Consequences

- **Positive:** One extra small LP per solve; the figure is exact, auditable and cross-checked.
- **Negative:** Every place that builds a `RationSolution` by hand (the mock solver, test fixtures) must set the field; `npm run build` (type check) finds any that are missed. The extra LP also runs on every ladder step.

---

## ADR-0014: Budget-Increase Prompt with Rupee Amounts Rounded Up

Date: 2026-10-15
Status: Accepted (rounding to the paisa in decisions 2 and 4 superseded by [ADR-0020](#adr-0020-joint-herd-lp-with-a-fair-share-of-each-milk-target))

### Context

SPEC Change 3 shows "Add ₹X/day to your budget to reach Y L/day (breed best)" when the budget is what holds milk back. When the budget is below the maintenance cost, it shows "Raise the budget by at least ₹X/day". The app shows rupees with two decimals (`formatInr`). SPEC OQ-C3-5 asks that adding the shown X must always be enough.

### Decision

1. **When the prompt appears.** All four must hold:
   - the final ration is balanced;
   - the budget is among its tight constraints;
   - the exact supported milk is below the effective cap by more than `1e-6`;
   - `costAtCapInrPerDay` is not null.
2. **The figures.**
   - `X = roundUpInr(costAtCapInrPerDay − budget)`. `roundUpInr` rounds **up** to the paise that `formatInr` shows: `Math.ceil(value × 100 − 1e-7) / 100`. So budget + X is always at least the cost at the cap.
   - `Y` is the effective cap, displayed rounded down to 0.1 L like the supported milk.
   - When these conditions hold, the cost at the cap is always above the budget (otherwise stage 1 would already have reached the cap), so X is positive.
3. **The audit for X** shows the cost at the cap, the budget, the exact subtraction and the words "rounded up". Tapping Y opens the existing effective-cap audit.
4. **The same rounding is used for "Raise the budget by at least ₹X/day"**, with X = maintenance cost − budget.
5. **Where it is computed.** `planRation` computes the prompt (`budgetIncrease`). `BudgetShortfallAlert` computes the raise-by amount with the same exported `roundUpInr`.

### Alternatives considered

- **Round to the nearest paisa (Rejected):** It can be up to half a paisa short, so "add X" would not quite reach Y.
- **Whole rupees (Rejected):** Every other rupee figure shows two decimals. Rounding up to a whole rupee also overstates X by up to ₹1.
- **Show the prompt whenever milk is below the cap (Rejected):** When intake, roughage or a nutrient is the limit, more money does not raise milk, so the prompt would be false.

### Consequences

- **Positive:** The promise "add X to reach Y" is always true to the paisa, and the audit shows the exact working.
- **Negative:** X can be up to 1 paisa above the exact difference, and the target is shown rounded down (for example 9.64 shows as 9.6 L).

---

## ADR-0015: No Invented Per-Feed Inclusion Caps for Library Feeds

Date: 2026-10-15
Status: Accepted

### Context

With the whole in-season library on offer, the cheapest ration could lean heavily on one cheap feed. Nutritionists usually apply per-feed limits (for example "molasses at most 10–15% of the ration"), but the cited data has no per-feed limit table. Such remarks exist only as text notes on a few feeds.

### Decision

Library feeds enter the candidate set with **no per-feed limit**. The only limits are those already in the LP: the cited roughage minimum, the intake ceiling, the nutrient requirements, the mineral and salt minimums, and the budget. A limit the farmer types for an own feed is still respected. UAT checks that the rations look sensible. If a library-wide ration is clearly unrealistic (for example one concentrate is more than half the ration) and fixing it would need uncited limits, the work stops and the user is asked.

### Alternatives considered

- **Team-chosen limits, such as "at most 3 kg of oilcake" (Rejected):** These are numbers without a citation, which breaks the rule that every number is cited.
- **Turning the text notes into limits (Rejected):** Only a few feeds have them, molasses is not a candidate anyway (it has no price), and adding a data column is out of scope for Change 3.
- **A general "maximum concentrate share" rule (Rejected):** No citation was found, and it changes the solver formulation.

### Consequences

- **Positive:** No uncited number enters the calculation, and the solver formulation and its SciPy agreement are unchanged.
- **Negative:** A ration may use more of one cheap feed than a nutritionist would advise. The paravet can see this in the ration table. The risk is accepted for the prototype.

---

## ADR-0016: Candidate Month Is the Device's Current Month

Date: 2026-10-15
Status: Accepted

### Context

The candidate set ([ADR-0010](#adr-0010-farmer-first-candidate-set-own-feeds-plus-in-season-priced-library-feeds)) needs a month to decide which library feeds are in season. The app already has a month selector in the feed picker, but by the frozen rule it changes only the "in season" marks and never what the solver sees (SPEC AC-3.4).

### Decision

The candidate month is the device's current month, `currentMonth()` from `src/i18n/months.ts`, read when the farmer taps **Calculate ration**. `rationService.planRation` passes it explicitly to `planRation`, so tests can set any month, and the `RationPlan` records which month was used. The month selector keeps changing the marks only.

### Alternatives considered

- **The picker's month selector (Rejected):** It would break the frozen rule that the selector is never a solver input. A paravet browsing next season's feeds would also silently change today's advice.
- **A new month field on the form (Rejected):** It adds an input the farmer does not need for today's ration. Planning for a future month is out of scope.

### Consequences

- **Positive:** No new input. The advice matches what is in season today.
- **Negative:** A device with the wrong date gives the wrong season, and the same inputs can give a different ration after the month changes.

---

## ADR-0017: Two-Milestone Delivery: Layout First, Then Farmer-First Solve

Date: 2026-10-15
Status: Accepted

### Context

Change 3 mixes a layout and wording pass (order of the input column, "Your cow or buffalo", side-by-side milk tiles, moving the demo) with a new way of solving. The user wants to review the layout before the logic lands. Judges read `main`, and Vercel deploys from `main`. The deadline moved to Sun 18 Oct 2026, 11:59 PM IST.

### Decision

1. Change 3 is built on branch `feat/farmer-flow`, from commit `d28d90a`, in two milestones:
   - **C3-M1** is UI only: wording, order, milk tiles and demo position. It changes no solver code, no types and no results, and feeds stay required (SPEC AC-C3-1.7).
   - **C3-M2** adds the cost-at-cap field, `src/domain/rationPlan.ts`, `rationService.planRation` and the new result UI.
2. Each milestone ends with the full test run, build, reviews and the user's UAT.
3. The branch is merged to `main` only after both milestones are accepted and the user confirms.

### Alternatives considered

- **One milestone (Rejected):** Layout feedback and logic feedback would arrive together, and a layout change found late would hold up the logic.
- **Work directly on `main` (Rejected):** Judges and the live Vercel site would see half-finished work.

### Consequences

- **Positive:** The user sees the layout early, and `main` always shows a finished app.
- **Negative:** Two review and UAT rounds. Between the milestones, the new layout still requires at least one feed.

---

## ADR-0018: UI Primitives: vaul, Radix, shadcn-Style Components, lucide

Date: 2026-10-15
Status: Accepted

### Context

The audit sheet lacked native mobile swipe-to-dismiss and robust scroll locking, button and pill elements had repetitive markup across multiple components, and icons were either missing or authored as ad-hoc inline SVGs. Upgrading to structured UI primitives was proposed: (1) `vaul` and `@radix-ui/react-dialog` for the audit sheet, (2) `lucide-react` for bundled iconography, and (3) typed shadcn-style `Button`, `Input`, `Badge`, `Drawer`, and `Accordion` primitives in `src/components/ui/`.
Technical trade-offs were identified: `vaul` is currently unmaintained, and standard `shadcn init / add` commands clobber existing `tailwind.config.ts` design tokens and `index.css`. The user accepted the unmaintained status of `vaul` on 2026-10-15 and approved adopting all three improvements.

### Decision

1. Adopt `vaul@1.1.2`, `@radix-ui/react-dialog@1.1.23`, `@radix-ui/react-accordion@1.2.20`, `@radix-ui/react-slot@1.3.3`, `class-variance-authority@0.7.1`, `clsx@2.1.1`, `tailwind-merge@2.6.1`, and `lucide-react@1.49.0`.
2. Hand-write shadcn-style primitives (`Button`, `Input`, `Badge`, `Drawer`, `Accordion`) in `src/components/ui/` with `cva` variants that map strictly to existing `index.css` classes (`btn`, `btn-primary`, `btn-quiet`, `btn-green`, `btn-preset`, `btn-sm`, `pill`, `pill-ok`, `pill-warn`, `pill-danger`, `pill-neutral`, `scrim`, `sheet`), preserving DESIGN.md tokens without running `shadcn CLI`.
3. Render `Drawer` inline without a portal so unit tests continue to query modal content within container bounds.
4. Replace the custom disclosure on the result details panel with `@radix-ui/react-accordion`, rendering `AccordionHeader` with `asChild` as a `div` to avoid unwanted `<h3>` hierarchy insertion.
5. Standardize iconography using `lucide-react` (`X`, `Copy`, `WifiOff`, `Trash2`, `BookOpen`, `ChevronDown`, `Check`), all tagged with `aria-hidden="true"` and no text/title elements to preserve strict single-language isolation tests.

### Alternatives considered

- **Running `shadcn init` / `shadcn add` (Rejected):** Rewrites `tailwind.config.ts` and replaces the design token system with shadcn defaults.
- **Portalled Dialog / Drawer (Rejected):** Breaks unit tests that inspect modal dialogs within test containers.
- **Custom touch/swipe event handlers (Rejected):** Error-prone across diverse mobile viewports and reduced-motion states compared to vaul's established physics.

### Consequences

- **Positive:** Audit sheet has native drag-down dismiss and scroll locking; button/input/badge markup is type-safe and consistent; visual styling and language test isolation remain 100% intact.
- **Negative:** `vaul` is unmaintained; dependency pinned at version 1.1.2.

---

## ADR-0019: Home Feed at ₹0, Capped by the Herd's Daily Amount, with a Separate Buy Option

Date: 2026-10-15
Status: Accepted

### Context

In Change 3 the farmer's own feeds entered the calculation at the farmer's own price, with an optional "how much you have" limit, and one entry per feed ([ADR-0010](#adr-0010-farmer-first-candidate-set-own-feeds-plus-in-season-priced-library-feeds), [ADR-0011](#adr-0011-own-feeds-used-first-at-the-farmers-price-and-cap-never-forced)). Three problems followed:
- the farmer had to type a price for straw that was already in the shed;
- a farmer who had some straw could not also be told to buy more of it;
- the budget mixed money already spent with money still to spend.

For Change 4 ([SPEC.md](SPEC.md) "Change 4: Herd and 3-step flow") the user said on 2026-10-15:
- home feed is just what the farmer has, used first where it helps;
- the budget is for buying only;
- screen 2 asks only for kg per day for all animals, with no price.

The single-animal solver (`solveRation`) names each feed's amount by the feed's id, so it cannot hold the same feed twice ("from home" and "bought") in one calculation. It must stay unchanged so the 100% SciPy agreement holds.

### Decision

1. **A home-feed row** is a library feed plus the kg per day the farmer can give to the whole herd (`q_f > 0`). It has no price. It may be out of season or have no cited price, because the farmer already has it. There is at most one row per feed.
2. **Home feed costs ₹0.** In the herd calculation ([ADR-0020](#adr-0020-joint-herd-lp-with-a-fair-share-of-each-milk-target)) each animal gets a "from home" amount of that feed at ₹0. The herd's total from home can never exceed `q_f`.
3. **The same feed can also be bought, as a separate line.** If the feed is in season this month and has a cited price, it is also in the buy set, and each animal gets a separate "bought" amount at that cited price, shown as its own "Buy" line. If the feed is not in the buy set, it is never bought.
4. **Never forced.** There is no minimum use of any home feed. A home feed the plan does not use is listed under "Not needed today".
5. **The budget pays for purchases only.** Home feed adds nothing to the cost or to "₹A of your ₹Bd a day".
6. **What is replaced.**
   - This replaces [ADR-0011](#adr-0011-own-feeds-used-first-at-the-farmers-price-and-cap-never-forced) entirely, and the own-feed part of decision 1 and decision 2 of [ADR-0010](#adr-0010-farmer-first-candidate-set-own-feeds-plus-in-season-priced-library-feeds) (own feeds at the farmer's price; one entry per feed).
   - ADR-0010's library rule still builds the buy set (in-season library feeds with a cited price, at that price), now with no own feeds. Its decision 4 (no buying advice for feeds that cannot be bought) also still applies.
7. **How much home feed the plan uses** is settled by the Stage 3 tie-break in [ADR-0020](#adr-0020-joint-herd-lp-with-a-fair-share-of-each-milk-target): the least home feed at the cheapest purchase.

### Alternatives considered

- **Keep the farmer's own price (Rejected, user choice):** It asks the farmer for a number they do not think about, and the budget then mixes spent and unspent money.
- **Value home feed at a market price (Rejected):** This is a non-goal in SPEC C4.6. It would also put an estimated value on feed the farmer is not going to sell.
- **Force the solver to use all, or some, of the home stock (Rejected):** Too much straw can break the intake or nutrient limits, making the ration impossible or worse, and hiding the better one ([ADR-0011](#adr-0011-own-feeds-used-first-at-the-farmers-price-and-cap-never-forced) reasoning).
- **One entry per feed, as in Change 3 (Rejected):** A farmer with 3 kg of straw who needs 5 kg could not be told to buy 2 kg.
- **Pass home feed through `solveRation` as a second entry with the same feed id (Rejected):** That solver names amounts by feed id, so it would need changing, which would put the 100% SciPy agreement at risk.

### Consequences

- **Positive:**
  - The screens match how farmers think: "what I have" and "what I must buy".
  - Entering a home feed can never raise the purchase cost (AC-C4-1.11).
  - "Some at home, buy the rest" now works.
  - No price is asked for on screen 2.
- **Negative:**
  - The plan does not show the value of the home feed used (a SPEC non-goal).
  - Because home feed is free, the cheapest purchase alone does not decide how much home feed to use. ADR-0020's Stage 3 resolves this, at the cost of one extra calculation.
  - A home feed out of season or without a price is accepted as typed, with no warning.

---

## ADR-0020: Joint Herd LP with a Fair Share of Each Milk Target

Date: 2026-10-15
Status: Accepted

### Context

Change 4 plans feed for up to 10 cows and buffaloes with:
- **one daily budget** for buying feed for the whole herd;
- **home feed shared** between the animals ([ADR-0019](#adr-0019-home-feed-at-0-capped-by-the-herds-daily-amount-with-a-separate-buy-option)).

The user's money rule (2026-10-15) is that every animal is kept healthy first, then the budget is shared so all animals reach the same share of their milk target, and no animal is starved for another.

The existing single-animal calculation (`solveRation`, [ADR-0007](#adr-0007-two-stage-budget-max-milk-lp)) is checked by SciPy at 100% on 18 benchmark animals and must not change. The results must also stay practical for a farmer:
- one shopping list in buying order, with the milk each later feed adds;
- amounts in whole rupees, kg to 1 decimal and grams for supplements;
- no arbitrary amounts of home feed.

### Decision

1. **One joint calculation (LP) for the herd**, in the new module `src/domain/herdSolver.ts`:
   - It is built by placing each animal's own rows side by side. These are the same rows `solveRation` uses: nutrients, the intake ceiling, the roughage minimum, the calcium limit and the mineral and salt minimums.
   - Each animal's amounts are named with its key (`a1__<feedId>` for bought feed, `a1__home__<feedId>` for home feed, `a1__Y` for milk).
   - Only two kinds of rows are shared: the total purchase must stay within the budget, and each home feed's total use must stay within its daily amount.
   - `solveRation` is not changed. Its internal helpers are only exported for reuse.
2. **Healthy first.** The herd maintenance cost `M_H` (every animal at 0 L, no budget limit) is calculated first:
   - if no ration exists, each animal is checked alone with the existing diagnosis (`diagnoseAtMilk`), and the ones that fail are named with their limit;
   - if the budget is below `M_H`, the screen says how much more to spend;
   - otherwise every animal's maintenance needs are hard limits in every later stage.
3. **Stage 1, the fair share.** The calculation finds the largest share `t` (from 0 to 1) such that every milking animal gets at least `t` times its milk target, where the target `g` is the existing effective cap (the breed figure or today's milk, whichever is higher). In LP terms the rule is `y_i ≥ t·g_i` with `y_i ≤ g_i`.
   - Dry animals have a target of 0 and get a maintenance ration.
   - Each animal's milk is then `t*·g`, rounded down to 0.1 L (`S_i`).
4. **Stage 2, the cheapest purchase.** With every animal's milk fixed at `S_i`, the cheapest purchase within the budget is found (`P*`).
5. **Stage 3, the home-feed tie-break (orchestrator decision, 2026-10-15).**
   - **Why.** Home feed costs ₹0, so Stage 2 alone leaves the amount taken from home open; a card could show an arbitrary "Bhusa 9 kg".
   - **What.** For the best plan only, a third calculation keeps every Stage 2 limit, allows the purchase to rise by at most the usual tolerance (`P*` plus `1e-6 × max(1, P*)`), and uses the least total home feed. In plain words: feed exactly what is needed from home, and keep the rest of the stock for tomorrow.
   - It runs only when home feed is entered. With no home feed the result is exactly Stage 2's, so the one-animal check against `solveRation` is unaffected.
   - It is not run for the buying-order steps, whose amounts are never shown.
6. **One animal equals the old calculation.** A herd of one animal with no home feed must give the same ration, milk, cost and main limit as `solveRation` (SPEC AC-C4-1.12). This is tested on all 18 benchmark animals.
7. **Buying order.**
   - The Change 3 step rule ([ADR-0012](#adr-0012-cheapest-first-upgrade-ladder-from-nested-prefix-solves): supplements first, then cheapest spend first, nested steps) is applied to the herd's shopping list, and every step is a real joint calculation.
   - "Rung 0" (own feeds alone) is removed, and only the best plan's amounts are shown. The steps decide only the order and the milk each later feed adds.
   - This replaces decision 4 of ADR-0012 (rung 0 and the per-rung milk and cost display).
8. **Whole rupees.** The herd prompts "Add ₹X/day to reach Y L" and "Spend at least ₹X more a day" round X **up to a whole rupee** (`X = ⌈costAtCap_H − Bd⌉`, `⌈M_H − Bd⌉`), so adding X is always enough. Every other rupee figure on the main view is rounded to the nearest whole rupee (SPEC C4.1 display units), and the audit shows the exact value. This replaces the rounding to the paisa in decisions 2 and 4 of [ADR-0014](#adr-0014-budget-increase-prompt-with-rupee-amounts-rounded-up). ADR-0014's rule for when the prompt appears carries over to the herd.
9. **Independent check.** A Python SciPy (HiGHS) version (`eval/cross_check_herd.py`) rebuilds `M_H`, Stage 1, Stage 2, Stage 3 and the cost at every target on herd benchmark cases. Its test must agree at 100%.

### Alternatives considered

- **A separate budget per animal (Rejected, user choice and SPEC non-goal):** The farmer thinks in one daily amount.
- **Most total milk for the herd (Rejected):** Money would flow to the animals that turn feed into milk most cheaply, and others would get only maintenance. That breaks the user's fairness rule.
- **The same litres for every animal (Rejected):** A high-yielding buffalo and a small desi cow have very different targets. Equal litres would cap the buffalo far below its target and push the cow above hers.
- **Feed the animals one at a time in list order (Rejected):** The result would depend on the order of entry, and the last animals could be starved.
- **Raise the others after the most limited animal stops (Rejected for now):** This "lexicographic" fair share would use leftover budget, but it needs many more LP runs and more rules to explain. Kept as a possible later change.
- **Extend `solveRation` itself to herds (Rejected):** It would change the frozen solver and reopen the 100% SciPy agreement.
- **Let free home feed fall where the solver puts it (Rejected, orchestrator decision):** It gives arbitrary amounts on the cards and fragile SciPy agreement on the ration lines.
- **A small invented cost on home feed instead of Stage 3 (Rejected):** It is a number without a citation and would change the purchase optimum.

### Consequences

- **Positive:**
  - The rule is fair and easy to explain: "every animal is kept healthy, then every milking animal gets the same share of its milk target".
  - The one-animal case is exactly the old, SciPy-verified calculation.
  - Home amounts on the cards are the least needed, so they are stable and checkable.
  - Every number still comes from a calculation or a cited row and opens its audit.
- **Negative:**
  - The calculation grows with the herd. For 10 animals and the full library, one tap is estimated at 0.8–2.3 s on a low-end phone. It is measured by a slow test, and a Web Worker (no new dependency) is the fallback ([ARCHITECTURE.md](ARCHITECTURE.md) "C4 risks").
  - The per-animal rows are written again in `herdSolver.ts`, and drift from `solver.ts` is caught only by the equivalence tests.
  - Because Stage 1 uses "at least `t` times the target", the Stage 2 calculation at the rounded milk can in rare cases need a retry. Tests assert it never does on the benchmark cases.
- **Known limitation (accepted 2026-10-15):** one animal can hold the whole herd back. If one animal is stopped by its own intake, roughage or a nutrient limit, the shared share `t` stops there for every animal, even when budget is left over. This is accepted for now. Details and the audit of `t` name the limiting animal and its limit, so the paravet can see why.

---

## ADR-0021: Herd AI Layers and Visible Season

Date: 2026-10-15
Status: Accepted

### Context

The user reviewed the Change 4 prototype and asked for three things ([FEEDBACK.md](internal/FEEDBACK.md) Round 6):
- the AI helpers at both ends of the 3-step flow: a description helper on screen 1 that can read several animals, and an explanation of the whole herd plan on screen 3;
- the seasons made visible.

The earlier Change 4 design kept the AI only for one animal. It left the description helper reading one animal through the existing `extract` action, which needs a body weight and fills a missing fat percentage with a fixed default. The season was used silently: the buy list holds only feeds in season in the device's month ([ADR-0016](#adr-0016-candidate-month-is-the-devices-current-month)), but screen 3 never said so.

A first version of this ADR also let the paravet change the month. The user withdrew that on 2026-10-15, before the Change 4 architecture was frozen. In the same decision the user made the herd explanation a part that is never cut, and accepted the number check as it is. This record reflects those decisions.

The founding rule still holds: the solver and cited tables own every number, and the AI only reads text in and writes text out.

### Decision

1. **A new, versioned request `extract_herd` for the description helper; `extract` is left unchanged.**
   - The new request returns:
     - a list of up to 10 animals (species, breed, milk, and an optional weight and fat);
     - the farmer's home feeds with kg per day;
     - the herd budget.
   - Weight and fat are left empty when the text does not state them, so the cited breed figures fill them in. No default is ever invented.
   - The server builds the answer only from a fixed list of allowed fields, so any price, nutrient or season figure the model returns is thrown away. It also cuts the list to 10 animals.
   - Everything lands as an unconfirmed review list that the farmer must confirm.
2. **Explain covers the whole herd plan.**
   - The model receives only the plan's own figures (shopping list, each animal's ration, the share of target, the limit, the prompts) with English names.
   - Every number it writes must match a figure in that plan, the inputs or a cited row, or the app shows a fixed, pre-checked template instead. There is one retry, then the template.
   - The explanation stays in English in both language modes.
   - Offline, or when the server has no key, the template is shown.
   - Rate limits and timeouts are unchanged.
   - The herd explanation is never cut for time. The template is the fallback, not a replacement.
3. **The season is shown with today's date and cannot be changed.**
   - The month is read from the phone's date when **Calculate ration** is tapped, exactly as ADR-0016 decides. It is not kept as a screen setting.
   - Screen 3 says, for example, "Feeds to buy: in season today (15 October)".
   - Tapping the date opens the audit, which shows:
     - the date and month used;
     - the in-season priced feeds and the excluded ones;
     - that home feeds count in any month.
   - There is no month control and no "try another month" hint. ADR-0016 is not superseded.
4. **The number check stays unitless (accepted limitation).**
   - The explanation check matches each number against the allowed numbers by value only, not by unit or meaning.
   - The user declined unit-aware matching.
5. **Placement.**
   - **C4-M1:** the one-animal helper (with the new request), the one-animal Explain, and the season line with today's date.
   - **C4-M2:** the helper opens to 10 animals, and the herd Explain is added.
   - **If time runs short:** only the multi-animal helper is cut.

### Alternatives considered

- **Extend `extract` with an animals list (Rejected):**
  - It would change a contract that the extraction eval and its tests measure.
  - It would keep the forced weight and the uncited fat default, which clash with the breed figures.
  - The server would have to guess which shape it was given.
- **Let the model return nutrient or price figures for unknown feeds (Rejected):** These are uncited numbers. Unknown feeds go to the farmer to map or drop, as before.
- **Template only for the herd, no AI explanation (Rejected by the user's feedback):** The template is kept only as the fallback.
- **A "Change month" control on screen 3 (Rejected by the user, 2026-10-15):** The advice should match what is in season today. A control adds state, a recompute path and a way to give advice for the wrong season.
- **Solve all 12 months automatically and suggest the best one (Rejected):** That is 11 more full herd calculations on a slow phone, for a choice the user does not want offered.
- **A month field on screen 1 (Rejected):** It adds an input the farmer does not need.
- **Unit-aware number matching (Rejected by the user, 2026-10-15):** It would tie each number to its unit (kg, L, ₹, %) before matching. It is more work and more brittle across the varied ways a model writes units.

### Consequences

- **Positive:**
  - The AI now appears at both ends of the flow, as the user asked, without ever supplying a number.
  - Seasons are visible and auditable, with the exact date used.
  - Offline users always get a checked explanation.
- **Negative:**
  - It adds about 11–13 hours to C4-M1 and 13–15 hours to C4-M2 ([ARCHITECTURE.md](ARCHITECTURE.md) "Effort, risk and cut order"). If time runs short, only the multi-animal helper is cut.
  - Planning for a future month is not possible, and a phone with a wrong date gives the wrong season.
  - A second extraction prompt must be maintained.
  - The live site needs the `OPENROUTER_API_KEY` set in Vercel before either AI layer works. Until then both fall back to the template or to manual entry.
- **Known limitation (accepted by the user, 2026-10-15): unitless number matching.**
  - **How the check works.** A number in the AI text passes if its value matches any allowed number, whatever unit is written next to it.
  - **What can slip through.** The herd's set of allowed numbers is larger, and includes small whole numbers such as animal labels and counts. So a stray "3 kg" passes when the herd has 3 animals, and a kg figure could pass as a rupee figure.
  - **What limits the risk:**
    - only the plan's own figures are sent to the model;
    - the tolerance is unchanged;
    - tests inject untraced numbers and check they are caught;
    - every figure on the screen itself still comes from the solver or a cited row.

