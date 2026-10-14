# Architecture Decision Records

Key technical, hosting, solver, AI integration, data and language decisions for SahiDana, referenced by [ARCHITECTURE.md](ARCHITECTURE.md) and [SPEC.md](SPEC.md). Last updated: 2026-10-12 (frozen after Round 4 prototype acceptance).

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
