# SahiDana System Architecture

Technical foundation, component design, data models, API contracts and operational setup for SahiDana, realizing [SPEC.md](SPEC.md) (48 acceptance criteria), [FEEDBACK.md](FEEDBACK.md) (Rounds 1–4) and [PROJECT_MENTAL_MODEL.md](PROJECT_MENTAL_MODEL.md), with key choices recorded in [DECISIONS.md](DECISIONS.md). Last updated: 2026-10-12 (frozen after Round 4 prototype acceptance).

Status: FROZEN

## Overview

SahiDana is an offline-first progressive web app (PWA) for field paravets in Rajasthan and North India. The paravet enters an animal (species, breed, body weight, today's milk and fat), a daily budget and the feeds on hand. An in-browser two-stage linear program (LP) answers two questions: how much milk this budget can support with these feeds (never above the breed's cited milk cap, or today's milk if that is higher), with a cited minimum share of roughage, and the cheapest ration that supports it ([ADR-0007](DECISIONS.md#adr-0007-two-stage-budget-max-milk-lp)). The result leads with "This budget supports X L/day", a factual room-for-improvement verdict, and a tap-to-audit trail for every number. All calculation (requirements, dry-matter intake ceiling, both LP stages, verdicts, infeasibility diagnosis, the deterministic explanation template and the LLM number check) runs in the browser against versioned, Service-Worker-cached JSON compiled from cited sources: a Jaipur-area feed library in three verticals plus Mineral with season months and dated, editable prices ([ADR-0006](DECISIONS.md#adr-0006-regional-three-vertical-seasonal-library-with-cited-dated-editable-prices)), a breed table that sets the milk cap ([ADR-0008](DECISIONS.md#adr-0008-breed-based-milk-cap-body-weight-sets-intake-not-milk)), and the requirement tables. When online, the PWA talks to one stateless Vercel function (`/api/llm`) that proxies form extraction and plain-English explanation to OpenRouter and keeps `OPENROUTER_API_KEY` server-side. The UI shows one language at a time behind a Hindi/English toggle, English by default and remembered on the device ([ADR-0009](DECISIONS.md#adr-0009-language-toggle-one-language-per-screen)); numbers always stay in Latin digits. For Milestone 3 an offline Python suite in `eval/` re-solves every LP stage with SciPy to show that two independent solvers agree. Trade-offs and rejected alternatives are in [DECISIONS.md](DECISIONS.md).

## Technology stack

- **Frontend & client runtime:** TypeScript 5.x, React 18, Vite 5, Tailwind CSS 3, `vite-plugin-pwa` (Workbox precaching for offline use).
- **In-browser LP solver:** `javascript-lp-solver`, pure JavaScript simplex, synchronous, no WebAssembly ([ADR-0002](DECISIONS.md#adr-0002-in-browser-linear-programming-with-javascript-lp-solver)). It supports both `opType: 'max'` (stage 1) and `opType: 'min'` (stage 2) objectives, so the two-stage formulation needs no second library.
- **Hosting & serverless API proxy:** Vercel (static PWA plus one Node.js/TypeScript function at `api/llm.ts`; [ADR-0001](DECISIONS.md#adr-0001-static-pwa-plus-single-serverless-function-on-vercel), [ADR-0003](DECISIONS.md#adr-0003-server-side-openrouter-proxy-with-env-configured-model-fallback-chain)).
- **Language (Hindi or English, one at a time):** in-house typed strings module (`src/i18n/strings.ts`), a `LanguageProvider` with `useLang()`, and a `<Bi>` component that renders the active language only; no i18n library. Fonts self-hosted from npm: `@fontsource/noto-sans` and `@fontsource/noto-sans-devanagari` (SIL OFL-1.1, weights 400 and 600), precached by Workbox ([ADR-0009](DECISIONS.md#adr-0009-language-toggle-one-language-per-screen), [ADR-0005](DECISIONS.md#adr-0005-bilingual-side-by-side-ui) decisions 2, 3, 6).
- **Evaluation & solver cross-check (`eval/`, M3 only):** Python 3.11+ with `scipy` (`scipy.optimize.linprog`, HiGHS) and `pytest`.
- **Test runners:**
  - **Unit & integration (TypeScript):** Vitest with React Testing Library and `jsdom`.
  - **End-to-end & offline UI:** Playwright (`@playwright/test`), headless Chromium.
  - **Evaluation cross-check (M3):** `pytest`.

## Preview and screenshot commands

- **Preview command:** `npm run dev -- --port 5173`
  - **Local URL:** `http://localhost:5173`
- **Screenshot command:** `npx playwright screenshot --viewport-size="390,844" http://localhost:5173 docs/screenshots/mobile-preview.png`

## Test commands

Vitest is configured in `vite.config.ts` and Playwright in `playwright.config.ts`. Tests that launch a browser, build bundles or take more than 1 second live in `tests/e2e/` or are named `*.slow.test.ts`, so the fast suite stays under 15 seconds after every task.

- **Full:** `npm run test:full` (runs `npx vitest run && npx playwright test`)
- **Fast:** `npm test` (runs `vitest run --exclude "tests/e2e/**" --exclude "**/*.slow.test.ts"`)
- **One file:** `npx vitest run tests/unit/<module>.test.ts` (or `npx playwright test tests/e2e/<spec>.spec.ts` for E2E specs)

*(In M3, `python -m pytest -q eval/` runs the Python evaluation and the SciPy cross-check of every LP stage.)*

## Components

```mermaid
flowchart TD
    subgraph Browser["Browser PWA (offline-capable client)"]
        UI["React UI: how-to-use banner, form, breed, budget, month, feed picker, result cards, Show details, audit drawer"]
        Lang["LanguageProvider + useLang, Bi (active language), strings, Latin-digit formatters (src/i18n)"]
        Store["localStorage key sahidana.lang"]
        Fonts["Self-hosted Noto Sans + Noto Sans Devanagari (woff2)"]
        Adapter["App service: mock adapter / live adapter"]
        ReqEngine["Requirements + DMI ceiling (linear in milk)"]
        Breeds["Breed cap rules (src/domain/breeds.ts)"]
        LPSolver["Two-stage LP solver, binding-constraint detection, infeasibility analyzer (javascript-lp-solver)"]
        Verdict["Verdict + fat comparison (src/domain/verdict.ts)"]
        Verifier["Number verifier + deterministic template"]
        DataStore["Versioned cited JSON: feeds.v1, breeds.v1, requirements.v1"]
        SW["Workbox Service Worker cache"]
    end

    subgraph Serverless["Vercel serverless (online only)"]
        Proxy["POST /api/llm (OpenRouter proxy)"]
    end

    subgraph External["External services"]
        OR["OpenRouter chat completions API"]
    end

    subgraph OfflineEval["Data pipeline & evaluation (repo only)"]
        CSV["data/feeds.csv, data/breeds.csv, data/requirements.json, sources/ (gitignored PDFs)"]
        BuildData["scripts/compile_data.mjs"]
        PyEval["eval/ SciPy cross-check of every LP stage + M3 metrics"]
    end

    CSV --> BuildData
    BuildData --> DataStore
    DataStore --> PyEval
    LPSolver -.->|"cross-checked in M3"| PyEval
    SW --> DataStore
    SW --> Fonts
    UI --> Lang
    Lang --> Store
    UI --> Fonts
    Verifier --> Lang
    UI --> Adapter
    Adapter --> ReqEngine
    Adapter --> Breeds
    Adapter --> LPSolver
    Adapter --> Verdict
    Adapter --> Verifier
    LPSolver --> ReqEngine
    Verdict --> LPSolver
    ReqEngine --> DataStore
    Breeds --> DataStore
    LPSolver --> DataStore
    Verifier --> DataStore
    Adapter -->|"online: extract / explain"| Proxy
    Proxy -->|"Bearer OPENROUTER_API_KEY + fallback models"| OR
```

- **React UI (`src/components/`, `src/App.tsx`):** mobile-first workspace. At the top of the workspace (below the app bar, above the main inputs) sits a concise one-line **"How to use"** banner (`notice_how_to_use` in `src/i18n/strings.ts`, rendered via `<Bi>` in the active language; [FEEDBACK.md](FEEDBACK.md) Round 4 #1). Below it sit the animal form with `BreedSelect` (breeds filtered by species, with the cited benchmark), `BudgetField` (defaults to today's cost), `MonthSelector` and the feed picker grouped by vertical, `SupportedMilkCard` (headline), `VerdictCard` (verdict, fat line, caveat), the ration table, `DetailsToggle` for per-feed caps, coverage bars and the full audit, and the audit drawer. Every visible string goes through `<Bi>` or `bi()`; components contain no Devanagari literals.
- **Language layer (`src/i18n/`):** strings module, `LanguageProvider`/`useLang`, `<Bi>`, `bi()`/`biText()` plain-text helpers, `feedLabel()`/`breedLabel()` name pickers and the Latin-digit formatters (see [Language interface](#language-interface)).
- **Self-hosted fonts (`src/fonts.ts`):** Latin and Devanagari subsets, weights 400 and 600, precached.
- **App service (`src/services/rationService.ts`):** one `RationAppAdapter` interface; `mockAdapter.ts` for the prototype and tests, `liveAdapter.ts` (browser solver + `/api/llm` client) from M1.
- **Requirements & DMI ceiling (`src/domain/requirements.ts`):** turns species, body weight and fat into a linear requirement model: each of `CP`, `ME`, `Ca`, `P` is maintenance(body weight) + milk × per-litre(fat), and the dry-matter intake ceiling is NRC 2001 Eq. 1-1 written as intercept + slope × milk (see [LP formulation](#5-lp-formulation-two-stage)).
- **Breed rules (`src/domain/breeds.ts`):** the cap rules (cited peak first) and the effective cap `max(breed cap, T)`, `breedsForSpecies()`, and the benchmark shown under the breed field.
- **Two-stage LP solver (`src/domain/solver.ts`):** maintenance run, stage 1 (max milk), stage 2 (min cost at that milk), stage 2' (min cost at today's milk), binding-constraint detection, infeasibility and below-maintenance diagnosis.
- **Verdict (`src/domain/verdict.ts`):** pure function from `S`, `T`, cap, reference cost and the stage 2' result to the verdict union, plus the fat comparison.
- **Number verifier & template (`src/domain/verifier.ts`):** unchanged algorithm; the authorized-number set now includes `S`, `X`, `Z`, `B`, `M` and the cap.
- **Versioned cited JSON (`src/data/feeds.v1.json`, `src/data/breeds.v1.json`, `src/data/requirements.v1.json`):** compiled from `data/` and precached. The clickable prototype uses fixture files instead (`src/data/feeds.prototype.json` and, for Round 3, `src/data/breeds.prototype.json`), every value flagged `isPrototypeFixture`.
- **`POST /api/llm` (`api/llm.ts`):** stateless proxy with the model fallback chain.
- **Data pipeline & evaluation (`scripts/`, `eval/`):** compile script with validation, and the M3 SciPy cross-check and metrics.

## Data tasks and provenance workflow

The research hand-off for every value below is [DATA_SOURCES.md](DATA_SOURCES.md). Its rule applies to every table: **never invent a number**. A value that was not found leaves the cell empty, or (prices only) is labelled `team_estimate` with a stated reason.

1. **Source documents (`sources/`, gitignored):** the NDDB booklet (*Nutritive Value of Commonly Available Feeds and Fodders in India*, 2012), NDDB *Dairying in Rajasthan 2016*, *Dairying in Punjab 2014* and *Dairying in Gujarat 2013*, DAHD *Basic Animal Husbandry Statistics 2025*, and the NRC 2001 dairy chapter used for the intake equation. Copyrighted PDFs are never committed.
2. **Regional feed library (`data/feeds.csv` → `src/data/feeds.v1.json`):** about 30 Jaipur-area feeds in four groups (DATA_SOURCES §2–§4). UTF-8 without BOM. Columns:

   | Column | Content |
   |---|---|
   | `id` | unique slug, e.g. `wheat_straw` |
   | `english_name` | English name |
   | `local_name_latn`, `local_name_latn_citation`, `local_name_deva`, `local_name_deva_provenance` | local names exactly as the source gives them; rules unchanged (a team Devanagari spelling of a cited transliteration is `team-asserted`; no invented names) |
   | `vertical` | `indigenous_forage`, `crop_residue`, `agro_byproduct` or `mineral` |
   | `available_months` | months near Jaipur, as comma-separated numbers or ranges `a-b` with `a ≤ b`; a season across the new year is two ranges (`11-12,1-3`); `1-12` for stored feeds (DATA_SOURCES §3 seasonality model) |
   | `season_note_en`, `season_note_hi` | one short sentence shown on tap, e.g. "Rabi, irrigated; green Jan–Apr" (both languages, ADR-0009) |
   | `season_citation`, `season_provenance` | where the months come from; `cited` or `team-asserted` (DATA_SOURCES marks unofficial harvest windows) |
   | `dm_pct`, `cp_pct_dm`, `me_mcal_per_kg_dm`, `ca_g_per_kg_dm`, `p_g_per_kg_dm` | nutrients on a DM basis (NDDB) and DM% (Feedipedia) |
   | `source_doc`, `source_table`, `source_page`, `dm_source_citation` | nutrient citations; pages are printed pages (PDF page − 12) |
   | `provenance_status`, `nutrient_note` | `cited`, or `team-asserted` when a value is taken from a cited text range (e.g. pulse chuni CP 15–20); `nutrient_note` says which value was picked and why |
   | `default_price_inr_per_kg_as_fed` | number, or empty when no price was found |
   | `price_source`, `price_source_url`, `price_date` | source name, link, and `YYYY-MM-DD` |
   | `price_reliability` | `mandi`, `trade_report`, `listing` or `team_estimate` |
   | `price_note_en`, `price_note_hi` | unit conversion, range and pick rule, or the estimate's reason |
   | `verified_on` | date the row was checked against the primary document (human gate), empty until then |

   The old `category` and `availability_tag` columns are removed (see `FeedItem` below). Mustard straw is left out of v1: DATA_SOURCES §3 says feed it only to non-productive animals, and a max-milk tool should not offer it (SPEC OQ10).
3. **Price reliability rules:**
   - `mandi`: a data.gov.in mandi record. Date = arrival date; the modal ₹/quintal ÷ 100 gives ₹/kg; `price_note` names the market (e.g. Malpura).
   - `trade_report`: SEA, NCDEX or a dated news report. Date = report date; conversions (₹/MT ÷ 1000, ₹/q ÷ 100) go in `price_note`.
   - `listing`: an IndiaMART or TradeIndia listing, shown to the user as "indicative". Date = the listing date, or the date accessed for an undated listing (and `price_note` says "undated listing, date accessed"). When the listing gives a range, the default is the midpoint and the range goes in `price_note`.
   - `team_estimate`: allowed only with a reason in `price_note` that cites what the estimate is based on (for example a dated price from another district). The compile script rejects a `team_estimate` without a note.
   - **No price found:** all price columns stay empty. The feed shows an empty price field and the paravet must enter one (SPEC AC-3.2).
   - Every default price stays editable in the app; an edited price is labelled "your price" and replaces the default for that run only (AC-3.6). There is no live price API ([ADR-0006](DECISIONS.md#adr-0006-regional-three-vertical-seasonal-library-with-cited-dated-editable-prices)).
4. **Breed table (`data/breeds.csv` → `src/data/breeds.v1.json`):** the 14 breeds of DATA_SOURCES §5 (Bhadawari added in the OQ16 correction) plus one non-descript row per species. Breed Hindi names live here, not in the strings file. Columns:

   | Column | Content |
   |---|---|
   | `id`, `species` | slug (e.g. `murrah`, `nondescript_cattle`); `cow` or `buffalo` |
   | `english_name`, `local_name_latn`, `local_name_deva`, `local_name_deva_provenance` | names; the Devanagari spelling of a breed name is normally `team-asserted` and reviewed on 2026-10-14 |
   | `is_non_descript` | `true` for the two DAHD rows |
   | `female_body_weight_kg`, `body_weight_citation` | cited adult female weight, or empty. Display only: never used to set milk or intake |
   | `lactation_yield_kg`, `lactation_yield_low_kg`, `lactation_yield_high_kg` | cited lactation yield and its range, each empty when not cited (crossbreds have a range and no single value) |
   | `lactation_length_days`, `lactation_length_min_days` | cited length; when the source gives a range, `lactation_length_days` is the longer and `lactation_length_min_days` the shorter, otherwise both are the same value |
   | `avg_daily_yield_kg` | cited average daily ("wet") yield, or empty; for non-descript rows, the DAHD figure |
   | `peak_daily_yield_kg`, `peak_source_doc`, `peak_source_table`, `peak_source_page`, `peak_source_url` | cited peak daily yield, or empty. When the source gives a range of study means (e.g. Murrah 7.1–9.64 [BP]), the cell holds the upper cited value |
   | `peak_note_en`, `peak_note_hi` | required when the peak is the upper value of a range: states the range and that its upper value is used, e.g. "Upper value of reported study means 7.1–9.64 kg/day" |
   | `yield_source_doc`, `yield_source_table`, `yield_source_page`, `yield_source_url`, `yield_figure_year` | citation for the yield figures; `yield_figure_year` is required for DAHD rows (`2024-25` cattle, `2023-24` buffalo) |
   | `fat_pct_low`, `fat_pct_high`, `fat_source_doc`, `fat_source_table`, `fat_source_page`, `fat_source_url` | cited fat %; a single value fills both; all empty when not cited (Kankrej, crossbreds, non-descript) |
   | `verified_on` | date the row was checked against the primary document, empty until then |

   `cap_basis` and `milk_cap_l_per_day` are **not** CSV columns: the compile script computes them with the rules below, so nobody types a cap by hand.
5. **Nutrient requirements (`data/requirements.json` → `src/data/requirements.v1.json`):** maintenance by body weight (CELKAU/ICAR) and per-litre-of-milk by fat (ICAR 2013 or NASEM 2021, whichever is verified first; [ADR-0004](DECISIONS.md#adr-0004-nutrient-requirement-standard-and-cited-feed-data-provenance)), plus the intake-ceiling constants of NRC 2001 Eq. 1-1 (`0.372`, `0.0968`, `0.192`, `3.67`), the 4% fat-corrected-milk constants (`0.4`, `15`), the default week of lactation (`20`), and the **roughage minimum share** `roughageMinShareOfDm` (`r_min`), each with its citation:

   ```json
   "roughageMinShareOfDm": { "value": null, "citation": { "doc": "", "table": "", "page": "", "url": "" }, "note": "", "verifiedOn": null }
   ```

   `value` is the minimum fraction (0–1) of total ration dry matter that must come from roughage (feeds whose `vertical` is `indigenous_forage` or `crop_residue`). **The data task must find it in an ICAR or NDDB source** (for example ICAR 2013 *Nutrient Requirements of Cattle and Buffalo* or NDDB ration-balancing guidance) and record document, table or section, and page. **If no ICAR/NDDB citation is found, the data task stops and asks the user**; no value is typed in without a citation, and the code has no built-in default. The clickable prototype may use a fixture value only if it is flagged `isPrototypeFixture` like every other fixture.
6. **Compile script (`scripts/compile_data.mjs`):** reads the three sources, NFC-normalizes Devanagari, and fails the build when: a required column is empty; `vertical` or `price_reliability` is not in its enum; `available_months` does not parse to months 1–12; a default price has no reliability, date or source, or a reliability is set without a price; a `team_estimate` has no note; a `team-asserted` Devanagari name has no transliterated name; a breed matches none of the cap rules; a `peak_daily_yield_kg` has no peak citation; a non-descript row has no `yield_figure_year`; `roughageMinShareOfDm.value` is missing, outside `(0, 1)`, or has an empty citation `doc` or `page`. It prints a warning (not a failure) for every row whose `verified_on` is empty.
7. **Human verification gate (Teammate A, before M3 closes):** every row of `data/feeds.csv`, every row of `data/breeds.csv` (figures against [R], [P], [GJ], [G1], [BP], [S] in DATA_SOURCES §5, including each peak and, where a range of study means was given, that the upper value was taken), both DAHD non-descript figures (3.86 and 4.73 against the BAHS 2025 PDF, including the year of each), the requirement tables, the NRC 2001 Eq. 1-1 constants (DATA_SOURCES §5 warns to verify the constant against the original), and the roughage minimum share against its ICAR/NDDB source. Teammate A fills `verified_on` / `verifiedOn`. The M3 release check requires none empty. Tracked as a mandatory UAT checklist item.
8. **Hindi review gate (native-speaker teammate, Wed 2026-10-14):** every `hi` value in `src/i18n/strings.ts`, every `team-asserted` Devanagari feed and breed name (breed Hindi names live in `data/breeds.csv`, not the strings file), and every `season_note_hi`, `price_note_hi` and `peak_note_hi`. Until then `HINDI_REVIEW.status` is `'unverified'`. After the review the reviewer sets `status: 'verified'` with name and date and appends a dated review line under [ADR-0005](DECISIONS.md#adr-0005-bilingual-side-by-side-ui). Mandatory UAT checklist item.

## Data models

### 1. Animal profile (`AnimalProfile`)

| Field | Type | Validation rules |
|---|---|---|
| `species` | `'cow' \| 'buffalo'` | Required. |
| `breedId` | `string` | Required ("Select a breed", AC-E1.1). Must be the `id` of a `BreedStandard` with the same `species`. Cleared when the species changes. |
| `bodyWeightKg` | `number` | Required; finite, `[150, 800]`. Sets the requirements' maintenance part and the intake ceiling, never the milk cap. |
| `milkYieldLitersPerDay` | `number` | Required; finite, `[0, 40]`. This is today's milk `T`. |
| `milkFatPct` | `number \| null` | Finite, `[2.5, 10.0]`. Required when milk `> 0`. When milk is `0` (dry animal) it is optional and unused: a dry animal skips stage 1 and gets the maintenance ration (see LP formulation), and neither maintenance nor the intake ceiling at 0 L depends on fat. |
| `budgetInrPerDay` | `number \| null` | The budget passed to the solver, finite and `> 0`. Rule (AC-4.2, AC-4.3): the value the user typed, if they edited the budget; otherwise today's ration cost when today's ration is entered; otherwise `null`, and **Balance ration** is disabled with "Enter a daily budget". Whether the user has edited it is form state (`budgetEdited`), not part of this type. |
| `isConfirmed` | `boolean` | Must be `true` before balancing; `false` after LLM prefill until the user confirms. |

### 2. Cited feed library item (`FeedItem`)

| Field | Type | Validation rules |
|---|---|---|
| `id` | `string` | Unique slug. |
| `englishName` | `string` | Non-empty. |
| `localNameLatn` | `string \| null` | Transliterated local name(s) as the source gives them, alternatives separated by `' / '`. |
| `localNameLatnCitation` | `string \| null` | Non-null iff `localNameLatn` or a `cited` `localNameDeva` is non-null. |
| `localNameDeva` | `string \| null` | NFC-normalized Devanagari name; never invented. |
| `localNameDevaProvenance` | `'cited' \| 'team-asserted' \| null` | Non-null iff `localNameDeva` is non-null; `team-asserted` requires `localNameLatn`. |
| `vertical` | `'indigenous_forage' \| 'crop_residue' \| 'agro_byproduct' \| 'mineral'` | Required. Sets the picker group (AC-3.3); each feed is in exactly one group. |
| `availableMonths` | `number[]` | Sorted, unique integers `1`–`12`, non-empty. `[1..12]` for stored feeds. Drives the "in season" mark only (AC-3.4); never a solver input. |
| `seasonNote` | `BiText` (`{ hi: string; en: string }`) | Both halves non-empty; shown on tap for an out-of-season feed (AC-3.5). A pair rather than a single string because it is team-written prose shown in either language (ADR-0009). |
| `seasonCitation` | `string` | Source of the months (e.g. ICAR-CRIDA Jaipur contingency plan; RAJFED purchase guidelines). |
| `seasonProvenance` | `'cited' \| 'team-asserted'` | `team-asserted` when the months are not from an official calendar. |
| `dmPct` | `number` | DM % as fed, `(0, 100]`. |
| `cpPctDm` | `number` | CP % of DM, `[0, 100]` (`1 % = 10 g/kg DM`). |
| `meMcalPerKgDm` | `number` | ME Mcal/kg DM, `[0, 10]`. |
| `caGramsPerKgDm` | `number` | Ca g/kg DM, `[0, 500]`. |
| `pGramsPerKgDm` | `number` | P g/kg DM, `[0, 500]`. |
| `derivedTdnPctDm` | `number` | Display only, `ME × 27.7`, labelled `derived`. |
| `sourceDoc`, `sourceTable`, `sourcePage` | `string` | Nutrient citation (printed page). |
| `dmSourceCitation` | `string` | DM% citation (Feedipedia node). |
| `provenanceStatus` | `'cited' \| 'team-asserted'` | Now scoped to the nutrient values: `team-asserted` when a value is picked from a cited range. |
| `nutrientNote` | `string \| null` | Required when `provenanceStatus` is `team-asserted`. |
| `defaultPriceInrPerKgAsFed` | `number \| null` | `>= 0`, or `null` when no price was found (empty price field, AC-3.2). |
| `priceSource` | `string \| null` | Source name (exempt from the one-language rule as a source name). Non-null iff a default price exists. |
| `priceSourceUrl` | `string \| null` | Link, when the source has one. |
| `priceDate` | `string \| null` | `YYYY-MM-DD`; non-null iff a default price exists. |
| `priceReliability` | `'mandi' \| 'trade_report' \| 'listing' \| 'team_estimate' \| null` | Non-null iff a default price exists. Labels (AC-3.6): "mandi", "trade report", "indicative", "team estimate". |
| `priceNote` | `BiText \| null` | Required (non-null) for `team_estimate`; optional otherwise. |
| `verifiedOn` | `string \| null` | Human-gate date, `YYYY-MM-DD`. |

**`category` is removed; roughage and row chip styling are derived from `vertical` (prototype alignment #1).** `category` (`FeedCategory`) and `availabilityTag` were kept on `FeedItem` in `src/domain/types.ts` and `src/data/feeds.prototype.json` during the prototype only for row chip classes (`CATEGORY_CLASS` in `src/domain/feedNames.ts`). In the frozen contract and `data/feeds.csv` → `src/data/feeds.v1.json`, `category` and `availabilityTag` are removed from `FeedItem`:
- Roughage classification is a pure function of `vertical`: `isRoughage(feed) = feed.vertical === 'indigenous_forage' || feed.vertical === 'crop_residue'` (in `src/domain/nutrition.ts`). `agro_byproduct` and `mineral` feeds are non-roughage. Keeping a separate `category` would store the same classification twice and allow them to disagree ([ADR-0006](DECISIONS.md#adr-0006-regional-three-vertical-seasonal-library-with-cited-dated-editable-prices), [ADR-0007](DECISIONS.md#adr-0007-two-stage-budget-max-milk-lp)).
- Row chip styling in `src/domain/feedNames.ts` moves from `CATEGORY_CLASS: Record<FeedCategory, string>` to `VERTICAL_CLASS: Record<FeedVertical, string>` in M1 when `feeds.v1.json` replaces `feeds.prototype.json`.

### 3. Breed standard (`BreedStandard`)

Compiled from `data/breeds.csv` into `src/data/breeds.v1.json` by `scripts/compile_data.mjs`.

| Field | Type | Validation rules |
|---|---|---|
| `id` | `string` | Unique slug. |
| `species` | `'cow' \| 'buffalo'` | Required. |
| `englishName` | `string` | Non-empty, e.g. `'Murrah'`, `'Non-descript'`. |
| `localNameLatn` | `string \| null` | Alternative names as cited, or `null`. |
| `localNameDeva` | `string \| null` | Hindi display name (NFC). |
| `localNameDevaProvenance` | `'cited' \| 'team-asserted' \| null` | Non-null iff `localNameDeva` is non-null. |
| `isNonDescript` | `boolean` | Exactly one `true` row per species. |
| `femaleBodyWeightKg` | `number \| null` | Cited weight, display only (audit sheet). |
| `lactationYieldKg` | `number \| null` | Cited lactation yield. |
| `lactationYieldLowKg`, `lactationYieldHighKg` | `number \| null` | Cited range; both or neither. |
| `lactationLengthDays` | `number \| null` | Cited length (the longer, when a range). |
| `lactationLengthMinDays` | `number \| null` | The shorter cited length; equals `lactationLengthDays` when the source gives one value. |
| `avgDailyYieldKg` | `number \| null` | Cited average daily yield; for non-descript rows, the DAHD figure. |
| `peakDailyYieldKg` | `number \| null` | Cited peak daily yield; the upper cited value when the source gives a range of study means. |
| `peakCitation` | `Citation \| null` | Non-null iff `peakDailyYieldKg` is non-null. |
| `peakNote` | `BiText \| null` | Required when the peak is the upper value of a cited range; shown in the audit sheet. |
| `fatPctLow`, `fatPctHigh` | `number \| null` | Cited fat % (single value: both equal); both `null` when not cited, and the UI says "breed fat %: not cited" (AC-5.10). |
| `capBasis` | `'cited_peak' \| 'range_top' \| 'breed_average' \| 'breed_average_calc' \| 'dahd_average'` | Computed. |
| `milkCapLPerDay` | `number` | Computed, rounded to 2 decimals. The solver uses this stored value, so the number shown is the number used. |
| `yieldCitation` | `Citation` | `{ doc, table, page, url, year }` (`year` required for DAHD). |
| `fatCitation` | `Citation \| null` | Non-null iff fat is cited. |
| `bodyWeightCitation` | `Citation \| null` | Non-null iff `femaleBodyWeightKg` is non-null. |
| `verifiedOn` | `string \| null` | Human-gate date. |

**Cap rules** (FEEDBACK Round 3, architecture review decisions: cited peak first, then the SPEC "Shared definitions" rules; applied in this order; implemented once in `src/domain/breeds.ts` and called by the compile script and by a unit test that recomputes every stored cap):

| Order | When | `milkCapLPerDay` | `capBasis` | Benchmark label |
|---|---|---|---|---|
| 1 | `isNonDescript` | `avgDailyYieldKg` (DAHD: cattle `3.86`, 2024-25; buffalo `4.73`, 2023-24; pending verification) | `dahd_average` | "national average (DAHD)" |
| 2 | `peakDailyYieldKg` is set | `peakDailyYieldKg` | `cited_peak` | "cited peak daily yield" |
| 3 | `lactationYieldHighKg` is set | `lactationYieldHighKg ÷ lactationLengthMinDays` (the top of the yield range over the shorter cited length; for single-length breeds the shorter length is the length) | `range_top` | "lactation average (no peak cited)" |
| 4 | `avgDailyYieldKg` is set | `avgDailyYieldKg` | `breed_average` | "lactation average (no peak cited)" |
| 5 | `lactationYieldKg` and `lactationLengthDays` are set | `lactationYieldKg ÷ lactationLengthDays` | `breed_average_calc` | "lactation average (no peak cited)" |

The non-descript rule sits first only because those rows have no breed figures; among breeds, `cited_peak` is the first rule. For rules 3–5 the audit sheet also names the exact rule ("range top", "breed average", "breed average (calc)") and shows the division.

**Cap table** (DATA_SOURCES §5 figures, all pending the human gate):

| Breed | Species | Cap L/day | `capBasis` | From |
|---|---|---|---|---|
| Murrah | buffalo | 9.64 | `cited_peak` | [BP] peak 7.1–9.64 is a range of study means; its top, 9.64, is used (stated in `peakNote`) |
| Nili-Ravi | buffalo | 9.40 | `cited_peak` | [BP] peak 9.4 is the cited mean; 7.2–11.8 is the range across individual animals and is not used |
| Bhadawari | buffalo | 6.93 | `cited_peak` | [BP] peak 6.93 (lactation 1,232 kg / 291 days, IGFRI herd; fat 8.09%, individual range 5.5–14 not used) |
| Sahiwal | cattle | 11.15 | `cited_peak` | [S] Pantnagar Sahiwal study, peak 11.15 |
| Rathi | cattle | 8.36 | `range_top` | [R] 2,810 ÷ 336 |
| Tharparkar | cattle | 7.53 | `range_top` | [R] 2,147 ÷ 285 |
| Nagori | cattle | 3.39 | `range_top` | [R] 905 ÷ 267 |
| Hariana | cattle | 6.45 | `range_top` | [P] 1,754 ÷ 272 |
| HF crossbred | cattle | 14.64 | `range_top` | [P] 4,568 ÷ 312 (shorter length) |
| Jersey crossbred | cattle | 10.70 | `range_top` | [P] 3,476 ÷ 325 (shorter length) |
| Gir | cattle | 6.33 | `breed_average_calc` | [G1]/[GJ] 2,063 ÷ 326 |
| Kankrej | cattle | 6.22 | `breed_average_calc` | [GJ] 1,954 ÷ 314 |
| Surti | buffalo | 5.48 | `breed_average_calc` | [GJ] 1,699 ÷ 310 |
| Mehsana | buffalo | 5.84 | `breed_average_calc` | [GJ] 1,840 ÷ 315 |
| Non-descript | cattle | 3.86 | `dahd_average` | DAHD BAHS, 2024-25 |
| Non-descript | buffalo | 4.73 | `dahd_average` | DAHD BAHS, 2023-24 |

Rule for ranges: a peak given as a range of **study means** uses its top (Murrah). A peak given as a single mean with a range across **individual animals** uses the mean (Nili-Ravi); individual extremes are never used as a cap. Fat follows the same rule (Bhadawari 8.09). Bhadawari was added to DATA_SOURCES §5 in the OQ16 correction; it is in the breed list because AC-2.4 lists "exactly the breeds of DATA_SOURCES §5". `data/breeds.csv` stays the authority after the human check.

**Effective cap.** The breed cap above is a cited benchmark, not a limit on a real animal that already gives more. Stage 1 therefore uses the **effective cap** $\bar{Y}_{\text{eff}} = \max(\bar{Y}, T)$ (FEEDBACK Round 3, OQ15). When $T > \bar{Y}$, the audit shows both numbers and the line "today's milk is higher, so it is used as the cap". `RationSolution` records the breed cap and the effective cap separately.

**1 kg of milk ≈ 1 L.** Breed sources report milk in kg; the app uses the kg figure as litres without conversion. Every audit sheet that shows a breed figure (cap, peak, lactation yield, average) carries the line "1 kg of milk ≈ 1 L (assumption)" (AC-2.4, AC-2.5). The intake equation (NRC 2001) also takes milk in kg and uses the same assumption.

`femaleBodyWeightKg` is never used in a calculation: no cited standard predicts milk from body weight, and the animal's own entered weight sets intake ([ADR-0008](DECISIONS.md#adr-0008-breed-based-milk-cap-body-weight-sets-intake-not-milk)).

### 4. Selected feed input (`SelectedFeedInput`)

| Field | Type | Validation rules |
|---|---|---|
| `feedId` | `string` | Must exist in `feeds.v1.json`. |
| `priceInrPerKgAsFed` | `number` | Required; finite, `>= 0` (the default or the user's price). |
| `maxKgAsFedPerDay` | `number \| null` | Optional cap behind **Show details**; finite, `>= 0`. |
| `currentKgAsFedPerDay` | `number \| null` | Optional "today's ration"; finite, `>= 0`. |

The month selector value and the "your price" label are UI state; neither reaches the solver.

### 5. LP formulation (two-stage)

**Notation.** For selected feed $i \in \{1,\dots,k\}$: $x_i \ge 0$ is kg/day **as fed**, $d_i = \text{dmPct}_i/100$, $p_i$ the price (₹/kg as fed), $u_i$ the optional cap. Nutrient supply per kg as fed:
$a_{\text{CP},i} = 10\,\text{cpPctDm}_i\,d_i$ (g), $a_{\text{ME},i} = \text{meMcalPerKgDm}_i\,d_i$ (Mcal), $a_{\text{Ca},i} = \text{caGramsPerKgDm}_i\,d_i$ (g), $a_{\text{P},i} = \text{pGramsPerKgDm}_i\,d_i$ (g).
$Y$ is milk in L/day. $\bar{Y}$ is the breed's `milkCapLPerDay`; $T$ is today's milk; $\bar{Y}_{\text{eff}} = \max(\bar{Y}, T)$ is the effective cap. $W$ is body weight (kg) and $f$ the entered fat % (a dry animal never reaches a stage that uses $f$). $\mathcal{R} = \{\, i : \text{vertical}_i \in \{\texttt{indigenous\_forage}, \texttt{crop\_residue}\} \,\}$ is the set of selected roughage feeds, and $r$ is `roughageMinShareOfDm` from `requirements.v1.json` (cited, ICAR/NDDB).

**Requirements are linear in milk.** For $n \in \{\text{CP}, \text{ME}, \text{Ca}, \text{P}\}$:
$$\text{req}_n(Y) = m_n(W) + \ell_n(f)\,Y$$
where $m_n(W)$ is the maintenance requirement from the CELKAU/ICAR table and $\ell_n(f)$ the per-litre requirement at fat $f$ (ICAR 2013 or NASEM 2021, ADR-0004). Both are computed **before** solving from the inputs, so they are constants in the LP.

**Dry-matter intake ceiling, linear in milk.** NRC 2001 *Nutrient Requirements of Dairy Cattle*, 7th rev. ed., Chapter 1, Eq. 1-1:
$$\text{DMI} = \left(0.372\,\text{FCM} + 0.0968\,W^{0.75}\right)\left(1 - e^{-0.192\,(\text{WOL} + 3.67)}\right)$$
with 4% fat-corrected milk $\text{FCM} = 0.4\,Y + 15\,(f/100)\,Y = (0.4 + 0.15 f)\,Y$ (NRC 2001, same chapter; milk in kg, used as L by the 1 kg ≈ 1 L assumption). The form does not collect week of lactation (SPEC OQ9), so **WOL is fixed at 20** (mid-lactation of a roughly 300-day lactation), giving the lag factor $\lambda = 1 - e^{-0.192 \times 23.67} \approx 0.9894$. Then
$$\text{DM}_{\max}(Y) = k_0 + k_Y\,Y,\qquad k_0 = 0.0968\,\lambda\,W^{0.75},\qquad k_Y = 0.372\,\lambda\,(0.4 + 0.15 f)$$
$W^{0.75}$ is computed once from the entered body weight and enters only through the constant $k_0$; $f$ enters only through the constant $k_Y$. Worked check: a 450 kg buffalo at 6.5% fat gives $k_0 \approx 9.36$ kg and $k_Y \approx 0.506$ kg per L, so 8 L/day allows about 13.4 kg DM (3.0% of body weight). The audit drawer shows the equation, WOL = 20, $\lambda$, $W^{0.75}$ and the result. **Warning:** the constants come from a secondary quotation (DATA_SOURCES §5, "verify the constant against the original"); Teammate A verifies all four constants and the FCM formula at the human gate before M3. NRC 2001 was fitted on Holstein cows; using it for zebu cattle and buffalo, and at $Y = 0$ for dry animals, is an extrapolation stated in [ADR-0008](DECISIONS.md#adr-0008-breed-based-milk-cap-body-weight-sets-intake-not-milk).

**Roughage minimum, linear** (FEEDBACK Round 3 architecture decisions). Roughage dry matter must be at least the cited share $r$ of total ration dry matter (all selected feeds, including agro-byproducts and mineral):
$$\sum_{i \in \mathcal{R}} d_i\,x_i \ \ge\ r \sum_{i} d_i\,x_i$$
Moving everything to the left gives a homogeneous constant-coefficient row:
$$\sum_{i \in \mathcal{R}} (1 - r)\,d_i\,x_i \;-\; \sum_{i \notin \mathcal{R}} r\,d_i\,x_i \ \ge\ 0 \qquad\text{(roughage row, written } \rho(x) \ge 0\text{)}$$
It applies in **every** run below (maintenance, stage 1, both stage 2 runs, stage 2', the AC-E7.1 re-runs and the AC-E2.1 diagnosis). It is homogeneous, so it keeps the feasible set convex and keeps $x = 0$ admissible; the rounding-down argument below still holds. The audit drawer shows $r$ with its citation and the roughage share achieved. If no roughage feed is selected, every ration with positive dry matter breaks the row, which the diagnosis reports as "roughage".

**No dry-matter floor (prototype alignment #2: `DM_FLOOR_FRACTION` is prototype-only).** The prototype's `src/services/mockSolver.ts` included an ad-hoc lower bound $\sum_i d_i x_i \ge 0.85\,\text{DM}_{\max}(Y)$ (`DM_FLOOR_FRACTION = 0.85`). The frozen LP formulation (`src/domain/solver.ts` and `eval/cross_check_solver.py`) has **no** DM floor:
- Per SPEC OQ13, total DM is bounded above by the NRC 2001 intake ceiling ($\sum_i d_i x_i \le \text{DM}_{\max}(Y)$), while `CP`, `ME`, `Ca` and `P` are positive minimums ($m_n + \ell_n Y > 0$ for all $Y \ge 0$) that already force positive dry-matter intake, and the homogeneous roughage row $\rho(x) \ge 0$ (SPEC AC-5.12) enforces the cited minimum roughage share of total DM.
- No ICAR, NDDB, NRC or NASEM standard specifies an 85% DM floor; keeping an uncited floor would violate the "never invent a number" rule and could cause false infeasibility when nutrient-dense feeds satisfy all requirements below 85% of the intake ceiling.
- Roughage infeasibility diagnosis in `src/domain/solver.ts` (Step 1 below) therefore does not divide by `0.85 × dmMax`: it solves the maintenance LP with vs. without $\rho(x) \ge 0$ (and checks capped roughage supply against the minimum DM required to meet `CP`, `ME`, `Ca`, `P`).

**Why everything stays linear.** The only decision variables are $x_1,\dots,x_k$ and $Y$. Every non-linear term ($W^{0.75}$, the exponential lag factor, the fat-dependent per-litre requirement, the maintenance lookup) depends only on inputs and is evaluated to a number before the LP is built; $r$ is a constant from data. Every constraint and objective is therefore a constant-coefficient linear expression in $(x, Y)$. Fat is an input, never a variable; making it a variable would create the bilinear term $f \cdot Y$.

**Maintenance run** (gives $M$; no budget):
$$M = \min_x \sum_i p_i x_i \quad\text{s.t.}\quad \sum_i a_{n,i}x_i \ge m_n\ \ \forall n,\qquad \sum_i d_i x_i \le k_0,\qquad \rho(x) \ge 0,\qquad 0 \le x_i \le u_i$$

**Stage 1** (most milk the budget supports):
$$\max_{x,\,Y}\ Y$$
$$\text{s.t.}\quad \sum_i a_{n,i}\,x_i - \ell_n\,Y \ \ge\ m_n \qquad \forall n \in \{\text{CP},\text{ME},\text{Ca},\text{P}\}$$
$$\sum_i d_i\,x_i - k_Y\,Y \ \le\ k_0 \qquad\text{(intake ceiling)}$$
$$\rho(x) \ \ge\ 0 \qquad\text{(roughage minimum)}$$
$$\sum_i p_i\,x_i \ \le\ \text{budget}$$
$$0 \le Y \le \bar{Y}_{\text{eff}} = \max(\bar{Y}, T),\qquad 0 \le x_i \le u_i \ \ (\text{when } u_i \text{ is set})$$
The optimum is $Y^*$. Because $\bar{Y}_{\text{eff}} \ge T$, stage 1 can only end below today's milk when the budget, the feeds (intake, roughage, nutrients, feed limits) stop it, never because of the breed figure.

**Stage 2** (cheapest ration at a fixed milk level $y$):
$$\min_x \sum_i p_i\,x_i \quad\text{s.t.}\quad \sum_i a_{n,i}\,x_i \ge m_n + \ell_n\,y\ \ \forall n,\qquad \sum_i d_i\,x_i \le k_0 + k_Y\,y,\qquad \rho(x) \ge 0,\qquad \sum_i p_i\,x_i \le \text{budget},\qquad 0 \le x_i \le u_i$$
Stage 2 runs twice:
- **at $y = Y^*$**, only to detect the binding constraint (below); and
- **at $y = S$**, the displayed ration (AC-5.1, AC-6.2 "stage 2 at `S`").

**Tolerance between the stages.** $S = \lfloor 10\,Y^* + 10^{-7} \rfloor / 10$: $Y^*$ **rounded down** to 0.1 L. Rounding down is the tolerance: the feasible set in $(x, Y)$ is convex and contains both $(x_M, 0)$ and $(x^*, Y^*)$, so every milk level between 0 and $Y^*$ is feasible within the budget, and stage 2 at $S \le Y^*$ cannot fail. It also keeps $S \le \bar{Y}_{\text{eff}}$ on screen (rounding 3.86 to nearest would show 3.9 above a 3.86 cap). The $10^{-7}$ absorbs float noise such as $Y^* = 6.0999999$; if that ever makes $S$ exceed $Y^*$ by more than the solver tolerance and stage 2 reports infeasible, the solver retries once at $S - 0.1$. When $S = Y^*$ within $10^{-6}$, the two stage 2 runs are the same run.

**Stage 2'** (cheapest ration at today's milk $T$; no budget, no cap): stage 2 with $y = T$ and the budget row removed (the roughage row stays). It gives `costAtTodayMilkInrPerDay`, used as $B$ (AC-5.11) and for $Z$ = reference cost − that cost (AC-5.7). It runs only when $T > 0$ and either $Y^* < T - 10^{-6}$ or $T \ge \bar{Y}$ (comparisons use the unrounded $Y^*$, see Verdict selection). If it is infeasible, the limiting constraints at $T$ are found with the same diagnosis as AC-E2.1, $B$ is `null`, and **no saving is shown** ($Z$ is `null`).

**Dry animal ($T = 0$).** Stage 1, stage 2 and stage 2' are skipped. The displayed ration is the maintenance run's ration (cheapest ration at 0 L), $S = 0$, and the verdict is `dry_maintenance` ("Dry animal: maintenance ration"). Steps 1 and 2 below still apply, so an infeasible selection or a budget below $M$ is reported exactly as for a milking animal. There is no binding constraint, no fat line, and fat is not needed.

**Order of runs in `solveRation`:**
1. Maintenance run. Infeasible → `InfeasibilityReport` (AC-E2.1, AC-E2.2). Diagnosis, with feed caps and $\sum_i d_i x_i \le k_0$ in every LP:
   - for each nutrient, a max-supply LP ($\max \sum_i a_{n,i}x_i$, **without** the roughage row) compared with $m_n$; nutrients that fall short are named;
   - if no roughage feeds are selected ($\mathcal{R} = \emptyset$) or if repeating the maintenance run **without** the roughage row $\rho(x) \ge 0$ is feasible, the report names `roughage` (AC-E2.2: the selected feeds cannot meet the requirements with at least the share $r$ of roughage DM);
   - otherwise the report is a "DM intake conflict".

   Suggested feeds: for a nutrient, the unselected library feed with the most of it per kg DM; for `roughage`, the unselected roughage feed (`indigenous_forage` or `crop_residue`) with a default price (`defaultPriceInrPerKgAsFed !== null`) and the lowest price per kg DM (AC-E2.2). No ration, no `S`, no verdict.
2. If $\text{budget} < M - 10^{-6}$ → `BudgetBelowMaintenanceReport` (AC-E7.1). Only unselected library feeds **with a default price** are tried: the maintenance run is repeated with each one added (default price, no cap); the feed with the lowest resulting $M'$ that is $\le$ budget is named (ties: library order), or `fixFeed: null` when none qualifies. Feeds with no default price are never suggested. No ration, no `S`.
3. If $T = 0$: dry animal (above); stop.
4. Stage 1. It is always feasible here ($Y = 0$ at cost $M \le$ budget) and bounded ($Y \le \bar{Y}_{\text{eff}}$).
5. Stage 2 at $Y^*$ (diagnosis), then stage 2 at $S$ (display).
6. Stage 2' at $T$ when needed.
7. Verdict and fat comparison (`src/domain/verdict.ts`).

**Binding constraint detection (prototype alignment #3: `roughage` position in `BINDING_ORDER`)** (AC-5.5, SPEC OQ6). Evaluated on the stage 2 solution at $Y^*$, not on the stage 1 solution: stage 1 can have several optimal rations, and one that happens to spend the whole budget would wrongly report "budget" when the breed cap is what stops it. A constraint is **tight** when its slack is at most $10^{-6}\max(1, |\text{rhs}|)$:
- `breed_cap`: $Y^* \ge \bar{Y}_{\text{eff}} - 10^{-6}$ (the milk cap; when $T > \bar{Y}$ the audit names it "today's milk, used as the cap" instead of "breed cap");
- `budget`: stage 2 cost at $Y^*$ $\ge$ budget − tolerance (the cheapest way to reach $Y^*$ uses the whole budget);
- `intake`: $\sum_i d_i x_i \ge k_0 + k_Y Y^*$ − tolerance;
- `roughage`: $\rho(x) \le 10^{-6}\max(1, \sum_i d_i x_i)$ (roughage share exactly at $r$);
- `CP`, `ME`, `Ca`, `P`: supplied $\le \text{req}_n(Y^*)$ + tolerance.

`tightConstraints` lists every tight one in the frozen `BINDING_ORDER`: **`['budget', 'breed_cap', 'intake', 'roughage', 'CP', 'ME', 'Ca', 'P']`** (matching SPEC OQ6: `budget, breed cap, intake limit, roughage, nutrient`); `bindingConstraint` is the first. Note on prototype alignment: `src/domain/types.ts` and `src/services/mockSolver.ts` in the prototype placed `'roughage'` after `'P'`; in M1, `src/domain/types.ts` and `src/domain/solver.ts` update `BindingConstraint` and `BINDING_ORDER` so `'roughage'` sits immediately after `'intake'` and before `'CP'`. Per-feed caps at their limit are listed separately in `feedLimitIds` and shown as "feed limit: <feed name>"; they are never the primary, because when $Y^* < \bar{Y}_{\text{eff}}$ at least one of budget, intake, roughage or a nutrient must be tight (otherwise $Y$ could grow), so the primary always exists. Unit tests build one case per constraint in which exactly that one is tight.

**Numerical guard.** `javascript-lp-solver` rounds its reported values. After every solve the solver recomputes supplied nutrients, DM and cost from the returned $x$ in double precision and checks every constraint within $10^{-6}$ (`supplied + 1e-6 >= required`, `cost <= budget + 1e-6`). A violation is reported as a solver error and nothing is shown; it is never displayed as a valid ration.

**Model sketch (`javascript-lp-solver`, stage 1):**

```ts
{
  optimize: 'milk', opType: 'max',
  constraints: {
    CP: { min: m.CP }, ME: { min: m.ME }, Ca: { min: m.Ca }, P: { min: m.P },
    DM: { max: k0 }, roughage: { min: 0 }, cost: { max: budget }, milkCap: { max: Math.max(cap, T) },
    // cap_<feedId>: { max: u_i } for each capped feed
  },
  variables: {
    // <feedId>: { CP: aCP_i, ME: aME_i, Ca: aCa_i, P: aP_i, DM: d_i, cost: p_i, 'cap_<feedId>': 1,
    //             roughage: isRoughage ? (1 - r) * d_i : -r * d_i }
    milk: { milk: 1, CP: -l.CP, ME: -l.ME, Ca: -l.Ca, P: -l.P, DM: -kY, milkCap: 1 },
  },
}
```

Stage 2 uses `optimize: 'cost', opType: 'min'`, drops the `milk` variable and moves $\ell_n y$ and $k_Y y$ into the right-hand sides.

### 6. Requirement result (`RequirementModel`, `RequirementResult`)

```ts
interface LinearTerm { maintenance: number; perLitre: number }   // value(Y) = maintenance + perLitre × Y
interface RequirementModel {
  CP: LinearTerm; ME: LinearTerm; Ca: LinearTerm; P: LinearTerm;   // minimums
  dmMax: LinearTerm;                                               // ceiling: k0 + kY × Y
  dmi: { weekOfLactation: 20; lagFactor: number; bw075: number; fcmPerLitre: number };
  roughage: { minShareOfDm: number; citation: AuditCitation };   // r, from requirements.v1.json
  fatPctUsed: number;
  citations: Record<NutrientKey, AuditCitation>;                   // DM cites NRC 2001 Eq. 1-1
}
interface RequirementResult {
  model: RequirementModel;
  atMilkLPerDay: number;            // the milk level these values are for
  requirements: NutrientVector;     // model evaluated at atMilkLPerDay
  citations: Record<NutrientKey, AuditCitation>;
}
```

`computeRequirements(animal)` returns the result at today's milk (AC-2.1); `RationSolution.requirementsAtS` is the model evaluated at `S`. `NutrientVector` and `AuditCitation` are unchanged.

### 7. Ration outcome (`RationSolution`, verdicts, reports)

```ts
type CapBasis = 'cited_peak' | 'range_top' | 'breed_average' | 'breed_average_calc' | 'dahd_average';
type BindingConstraint = 'budget' | 'breed_cap' | 'intake' | 'roughage' | 'CP' | 'ME' | 'Ca' | 'P';
const BINDING_ORDER: readonly BindingConstraint[] = ['budget', 'breed_cap', 'intake', 'roughage', 'CP', 'ME', 'Ca', 'P'];
type LimitingConstraint = NutrientKey | 'roughage';   // used by InfeasibilityReport and below_today

type Verdict =
  | { kind: 'room'; gainLPerDay: number }                         // AC-5.6: X = S − T ≥ 0.1, rounded to 0.1
  | { kind: 'at_breed_level'; savingInrPerDay: number | null }    // AC-5.7 (T = breed cap): Z, set only when stage 2' is feasible and Z > 0
  | { kind: 'above_breed_level'; savingInrPerDay: number | null } // T > breed cap and S ≥ T: "Above the breed level; same milk for ₹Z less"
  | { kind: 'below_today';                                         // AC-5.11: budget or feeds limit milk below T (never the cap)
      costToKeepTodayInrPerDay: number | null;                     // B; null when T is infeasible
      limitingAtToday: LimitingConstraint[] }                      // non-empty iff B is null
  | { kind: 'same_as_today' }                                      // SPEC OQ14
  | { kind: 'dry_maintenance' }                                    // T = 0: "Dry animal: maintenance ration"
  | { kind: 'below_maintenance';                                   // AC-E7.1 (no ration)
      maintenanceCostInrPerDay: number;                            // M
      fixFeed: { feedId: string; maintenanceCostInrPerDay: number } | null };  // priced feeds only

interface FatComparison {                // null when today's milk is 0
  todayFatPct: number;
  breedFatPctLow: number | null;         // both null → "breed fat %: not cited" (AC-5.10)
  breedFatPctHigh: number | null;
}

interface RationSolution {
  status: 'optimal';
  breedId: string;
  supportedMilkLPerDay: number;          // S = Y* rounded down to 0.1; 0 for a dry animal
  supportedMilkExactLPerDay: number;     // Y*, for the audit; 0 for a dry animal
  milkCapLPerDay: number;                // the breed cap (cited benchmark)
  capBasis: CapBasis;
  effectiveCapLPerDay: number;           // max(breed cap, T): the bound used in stage 1
  effectiveCapSource: 'breed' | 'today_milk';  // 'today_milk' when T > breed cap
  bindingConstraint: BindingConstraint | null;  // first tight constraint in BINDING_ORDER; null for a dry animal
  tightConstraints: BindingConstraint[];
  feedLimitIds: string[];                // feeds at their max kg/day
  roughageMinShare: number;              // r, cited
  roughageShareAchieved: number;         // roughage DM ÷ total DM of the displayed ration
  verdict: Exclude<Verdict, { kind: 'below_maintenance' }>;
  costAtTodayMilkInrPerDay: number | null;   // stage 2' at T: B, or the cost behind Z
  fatComparison: FatComparison | null;
  maintenanceCostInrPerDay: number;      // M
  budgetInrPerDay: number;
  referenceCostInrPerDay: number;        // today's cost if entered, else the budget
  feeds: RationFeedLine[];               // stage 2 at S, or the maintenance ration for a dry animal
  totalKgAsFed: number;
  totalCostInr: number;
  underBudgetInr: number;                // budget − total cost (AC-5.2)
  requirementsAtS: NutrientVector;
  supplied: NutrientVector;
  coveragePct: Record<NutrientKey, number>;
  currentCostInr: number | null;         // today's cost
  savingsInr: number | null;             // today's cost − total cost; negative means "more than today"
  savingsPct: number | null;
  solvedOn: string;
}

interface BudgetBelowMaintenanceReport {
  status: 'below_maintenance';
  verdict: Extract<Verdict, { kind: 'below_maintenance' }>;
  budgetInrPerDay: number;
  checkedOn: string;
}

// InfeasibilityReport keeps its shape (limitingNutrients, dmConflict, suggestedFeeds), but
// LimitingNutrient.nutrient widens to LimitingConstraint, so 'roughage' can be named. It means
// "the selected feeds cannot meet maintenance at 0 L/day, at any budget" (AC-E2.1).
type RationSolveOutcome = RationSolution | BudgetBelowMaintenanceReport | InfeasibilityReport;
```

**Verdict selection** (`selectVerdict` in `src/domain/verdict.ts`). Following SPEC "Shared definitions", the shortfall and breed-level comparisons use the **unrounded** $Y^*$ against $T$ with a `1e-6` tolerance, never the displayed `S`. `S` ($Y^*$ rounded down to 0.1) stays the displayed value. Example: cap 9.64 and $T$ = 9.64 give $Y^*$ = 9.64, so there is no shortfall even though `S` shows 9.6.
1. $T = 0$ → `dry_maintenance` (stage 1 skipped; see Dry animal).
2. $Y^* < T - 10^{-6}$ → `below_today`: "This budget supports `S` L/day, less than today's `T` L/day. Keeping `T` L needs ₹`B`/day", with $B$ from stage 2', or "Keeping `T` L is not possible with these feeds: <limits>" when stage 2' is infeasible. Because stage 1 uses the effective cap $\max(\bar{Y}, T)$, this case only arises when the budget or the feeds hold milk below $T$, never because of the breed cap. It takes precedence over the breed-level verdicts.
3. $T > \bar{Y}$ (so $Y^* \ge T - 10^{-6}$) → `above_breed_level`: "Above the breed level; same milk for ₹`Z` less". $Z$ = reference cost − stage 2' cost at $T$. `savingInrPerDay` is $Z$ only when stage 2' is feasible and $Z > 0$; otherwise `null` and the line reads "Above the breed level" without a saving. The audit shows the breed cap, the effective cap and "today's milk is higher, so it is used as the cap".
4. $T = \bar{Y}$ (within the tolerance) → `at_breed_level`, with $Z$ by the same rule ("Already at the breed level; same milk for ₹`Z` less", or without a saving).
5. $S - T \ge 0.1$ → `room`, $X$ = $S - T$ rounded to 0.1.
6. Otherwise → `same_as_today` ("This budget supports `S` L/day, the same as today", plus the binding constraint).

The cases are mutually exclusive in this order (case 5 needs $S > T$, so $T < \bar{Y}$, because $S \le \bar{Y}_{\text{eff}}$ and when $T \ge \bar{Y}$ the effective cap is $T$). The caveat line is shown with `room`, `at_breed_level` and `above_breed_level`.

### 8. Audit trail item (`AuditMeta`)

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique identifier for the displayed number. |
| `label` | `BiText` | Built with `t()`; `label.en` is what `/api/llm` receives in `authorizedNumbers`. |
| `formattedValue` | `string` | Exactly as shown, from `src/i18n/format.ts` (Latin digits). |
| `numericValue` | `number` | Raw value for number verification. |
| `originType` | `'cited_source' \| 'solver_output' \| 'user_input'` | Provenance category. |
| `citation` | `{ doc; table; page; formula?; provenanceStatus; assumption?: BiText } \| null` | For cited numbers. Breed figures set `assumption` to "1 kg of milk ≈ 1 L (assumption)"; the cap's `formula` shows the division and its basis label. |
| `solverConstraint` | `{ stage: 'maintenance' \| 'stage1' \| 'stage2_at_S' \| 'stage2_at_T'; role: BiText; activeConstraint: BiText; breakdown: string } \| null` | For solver numbers: `S` → `stage1` with the binding constraint named; ration amounts and cost → `stage2_at_S`; `B`, `Z` → `stage2_at_T`; `M` → `maintenance` (AC-6.2). |
| `binding` | `boolean?` | True when set by a tight constraint. |

## Interfaces and API contract

### 1. Client-side adapter interface (`RationAppAdapter`)

`src/services/mockAdapter.ts` (prototype and tests) and `src/services/liveAdapter.ts` (M1 onward) implement the same interface, so the prototype becomes the real frontend without component changes:

```ts
export interface RationAppAdapter {
  getFeedLibrary(): Promise<FeedItem[]>;
  getBreedLibrary(): Promise<BreedStandard[]>;
  computeRequirements(animal: AnimalProfile): RequirementResult;          // at today's milk
  solveRation(animal: AnimalProfile, selectedFeeds: SelectedFeedInput[]): RationSolveOutcome;
  extractFromText(freeText: string, options?: { signal?: AbortSignal }): Promise<ExtractionResponse>;
  explainRation(context: ExplanationRequestContext, options?: { signal?: AbortSignal }): Promise<VerifiedExplanationResult>;
}
```

- `solveRation` requires `animal.breedId` and a non-null `animal.budgetInrPerDay`; the UI never calls it otherwise (AC-E1.1, AC-4.3). Errors: throws `SolverError` only for the numerical guard; infeasibility and below-maintenance are normal outcomes.
- `ExplanationRequestContext` includes `animal`, `requirement`, `solution` and `feeds` (and looks up the selected `BreedStandard` via `animal.breedId`).
- Selection is controlled by `VITE_USE_MOCK_ADAPTER` (`true` for prototype preview).

### 2. Serverless API endpoint: `POST /api/llm`

One stateless endpoint (`api/llm.ts`) for both AI tasks; `OPENROUTER_API_KEY` never leaves the server.

#### Request A: free-text extraction (`action: "extract"`)

```json
{
  "action": "extract",
  "freeText": "450 kilo ki Murrah bhains 8 litre doodh deti hai, 6.5% fat, gehun ka bhusa aur sarson khali hai, 250 rupaye roz",
  "catalog": [
    { "id": "wheat_straw", "englishName": "Wheat straw", "localNameLatn": "Bhusa / Bhoosa", "localNameDeva": "भूसा" },
    { "id": "mustard_cake", "englishName": "Mustard cake", "localNameLatn": "Sarson khal", "localNameDeva": "सरसों खल" }
  ],
  "breeds": [
    { "id": "murrah", "species": "buffalo", "englishName": "Murrah" },
    { "id": "nondescript_buffalo", "species": "buffalo", "englishName": "Non-descript" }
  ]
}
```

- **Nutrient safety (AC-E5.1):** the request carries only ids and names. The response schema has no nutrient, price, season or breed-figure fields; feed names not matched to a catalog `id` are returned in `unmatchedFeeds`.
- **Language of `freeText` (AC-L1.5):** 1–1000 characters of Hindi, Hinglish or English; the client runs `toLatinDigits()` first. The prompt (English instructions) maps common terms (`bhains` → buffalo, `gaay`/`gai` → cow, `kilo` → kg, `litre` → L/day, `doodh` → milk, `rupaye roz` → budget ₹/day), turns Hindi number words into numbers, and matches feeds and breeds by any of their names.

#### Response A (`200 OK`)

```json
{
  "action": "extract",
  "modelUsed": "meta-llama/llama-3.3-70b-instruct:free",
  "animal": { "species": "buffalo", "breedId": "murrah", "bodyWeightKg": 450, "milkYieldLitersPerDay": 8, "milkFatPct": 6.5 },
  "budgetInrPerDay": 250,
  "matchedFeeds": [
    { "feedId": "wheat_straw", "priceInrPerKgAsFed": null, "maxKgAsFedPerDay": null },
    { "feedId": "mustard_cake", "priceInrPerKgAsFed": null, "maxKgAsFedPerDay": null }
  ],
  "unmatchedFeeds": []
}
```

`breedId` and `budgetInrPerDay` may be `null`. The server drops a `breedId` that is not in `breeds`, and the client drops one whose species does not match the extracted species (AC-2.3). All values land in the unconfirmed prefilled state.

#### Request B: ration explanation (`action: "explain"`)

```json
{
  "action": "explain",
  "attempt": 1,
  "authorizedNumbers": [
    { "label": "Body weight (kg)", "value": 450, "formatted": "450" },
    { "label": "Today's milk (L/day)", "value": 8, "formatted": "8.0" },
    { "label": "Supported milk (L/day)", "value": 9.1, "formatted": "9.1" },
    { "label": "Milk possible above today (L/day)", "value": 1.1, "formatted": "1.1" },
    { "label": "Breed milk cap (L/day)", "value": 9.64, "formatted": "9.64" },
    { "label": "Budget (INR/day)", "value": 250, "formatted": "250.00" },
    { "label": "Total cost (INR/day)", "value": 231.4, "formatted": "231.40" },
    { "label": "Wheat straw (kg/day as fed)", "value": 7.1, "formatted": "7.10" }
  ],
  "rationSummary": {
    "species": "buffalo",
    "breed": "Murrah",
    "supportedMilkLPerDay": 9.1,
    "verdict": { "kind": "room", "gainLPerDay": 1.1 },
    "feeds": [{ "name": "Wheat straw", "kgAsFedPerDay": 7.1, "costInr": 49.7 }],
    "totalCostInrPerDay": 231.4,
    "budgetInrPerDay": 250
  }
}
```

- **Language (AC-L1.6):** the prompt says English only. Labels are `AuditMeta.label.en`; names are `englishName`. Authorized numbers include `S`, `X`, `Z`, `B`, `M`, the cap and the breed fat % whenever they are on screen. The prompt also tells the model to state the verdict as a fact with no veterinary advice.

#### Response B (`200 OK`)

```json
{
  "action": "explain",
  "modelUsed": "meta-llama/llama-3.3-70b-instruct:free",
  "explanationText": "Your 450 kg Murrah buffalo gives 8.0 L a day. With these feeds, a budget of ₹250.00 a day supports 9.1 L, so 1.1 L more is possible, below the cited Murrah peak of 9.64 L. ..."
}
```

#### Error response (`400 | 429 | 502 | 504`)

```json
{ "error": { "code": "RATE_LIMITED | UPSTREAM_ERROR | TIMEOUT | INVALID_REQUEST", "message": "For logs only." } }
```

The client never displays `message`; it maps `error.code` to a string id (`error_llm_rate_limited`, `error_llm_upstream`, `error_llm_timeout`, `error_llm_invalid_request`) rendered in the active language.

### 3. Client-side number verifier (`verifyExplanationNumbers`)

- Parses numeric tokens in `explanationText` (integers, decimals, `₹`, `%`, commas) and checks each against the authorized set $A$ (inputs, requirements, cited library and breed values, solver outputs including `S`, `X`, `Z`, `B`, `M`, costs and coverage):
  $$\text{verified}(v) \iff \exists a \in A:\ |v - a| \le \max(0.05,\ 0.01\,|a|)\ \text{ or }\ \text{round}(v, d) = \text{round}(a, d),\ d \in \{0,1,2\}$$
- **Language gate (before parsing):** any Devanagari character (U+0900–U+097F) counts as a failed attempt, like an untraced number.
- All $N$ traced → `{ status: 'verified', verifiedCount: N, badge: { id: 'badge_all_verified', params: { n: N } } }`. The UI renders the badge with `<Bi>` in the active language; `verifier.ts` holds no display text.
- Untraced on attempt 1 → one retry (`attempt: 2`) listing the offending numbers. Still untraced, or an API error → the deterministic template (`status: 'deterministic_fallback'`, `badge: { id: 'badge_template_fallback' }`).
- **Deterministic template:** `buildTemplateExplanation(context): BiText[]`, one pair per sentence from `template_*` string ids (headline, verdict, ration, cost), numeric params only from the solver, inputs and cited rows. The UI shows the active half with `biText()`. A unit test runs the verifier on **both** halves and requires `verified`.

### 4. Prototype-to-frozen alignment (M1 hand-off)

The accepted Round 4 prototype (`src/domain/types.ts`, `src/services/mockSolver.ts`, `src/App.tsx`) already implements the two-stage flow, breed caps, seasonal verticals and language toggle. Three prototype-to-architecture alignment items and one Round 4 UI addition are reconciled in M1 when `liveAdapter.ts`, `src/domain/solver.ts` and `src/data/*.v1.json` replace the prototype fixtures:

1. **`category` field on `FeedItem`:** removed from `FeedItem` (`src/domain/types.ts`) and absent from `data/feeds.csv` → `src/data/feeds.v1.json` (along with `availabilityTag`, `sourceKey` and `isPrototypeFixture`). Both roughage classification (`isRoughage(feed) = feed.vertical === 'indigenous_forage' || feed.vertical === 'crop_residue'`) and row chip styling (`VERTICAL_CLASS` replacing `CATEGORY_CLASS` in `src/domain/feedNames.ts`) derive solely from `vertical` ([ADR-0006](DECISIONS.md#adr-0006-regional-three-vertical-seasonal-library-with-cited-dated-editable-prices), [ADR-0007](DECISIONS.md#adr-0007-two-stage-budget-max-milk-lp)).
2. **85% DM floor (`DM_FLOOR_FRACTION = 0.85` in `mockSolver.ts`) vs. the frozen LP formulation:** `DM_FLOOR_FRACTION` is a prototype-only fixture in `src/services/mockSolver.ts` and is **not** included in the frozen LP (`src/domain/solver.ts` and `eval/cross_check_solver.py`). In the frozen LP, total DM has only the NRC 2001 Eq. 1-1 upper ceiling ($\sum_i d_i x_i \le k_0 + k_Y Y$), while positive feed intake and fibre adequacy are enforced by the four positive nutrient minimums (`CP`, `ME`, `Ca`, `P`) and the homogeneous roughage minimum row ($\rho(x) \ge 0$, SPEC AC-5.12, OQ13).
3. **`roughage` position in `BINDING_ORDER`:** frozen as `['budget', 'breed_cap', 'intake', 'roughage', 'CP', 'ME', 'Ca', 'P']` per SPEC OQ6 (`budget, breed cap, intake limit, roughage, nutrient`). In M1, `src/domain/types.ts` and `src/domain/solver.ts` move `'roughage'` from after `'P'` (its prototype position in `mockSolver.ts`) to immediately after `'intake'` and before `'CP'`.
4. **Round 4 one-line "How to use" banner ([FEEDBACK.md](FEEDBACK.md) Round 4 #1):** added at the top of the workspace in `src/App.tsx` (below the app bar, above the main inputs) using string id `notice_how_to_use` in `src/i18n/strings.ts` (English and Hindi, rendered in the active language via `<Bi>`).

## Language interface

Realizes SPEC AC-L1.1 to AC-L1.6 and OQ8; decision in [ADR-0009](DECISIONS.md#adr-0009-language-toggle-one-language-per-screen), which supersedes ADR-0005 decision 1. The prototype already implements this layer in `src/i18n/lang.ts`, `src/i18n/LanguageProvider.tsx`, `src/i18n/Bi.tsx`, `src/i18n/strings.ts` and `src/components/LanguageToggle.tsx`.

### 1. Selected language (`src/i18n/lang.ts`, `src/i18n/LanguageProvider.tsx`)

- `type Lang = 'hi' | 'en'`. **Default English.**
- Stored per device in `localStorage` under the key **`sahidana.lang`** (`LANG_STORAGE_KEY`). `readStoredLang()` returns the stored value when it is `'hi'` or `'en'`, otherwise `'en'` (including when storage is blocked). `storeLang()` ignores a failed write, so the choice still lasts for the visit. Works offline; nothing is sent anywhere. This is the only value the app stores on the device (SPEC Non-goals).
- `LanguageProvider` reads the stored language once, holds it in React state, sets `<html lang>` to it, and keeps a module-level copy (`getActiveLang()`/`setActiveLang()`) in step during render, so plain-text callers (`bi()`, `biText()`, the copied summary) agree with the rendered screen. `setLang(next)` updates the module value, storage and state; every `<Bi>` re-renders without a reload, and form inputs and results are untouched (AC-L1.1).
- `useLang()` returns `{ lang, setLang }`.
- `LanguageToggle` (`src/components/LanguageToggle.tsx`): two buttons in the app bar labelled from `LANGUAGE_LABELS` (`हिंदी`, `English`, each in its own script), with `aria-pressed`. It works offline (AC-E3.1).

### 2. Strings module (`src/i18n/strings.ts`)

The only file in `src/` and `api/` that may contain Devanagari characters.

```ts
export type BiText = { readonly hi: string; readonly en: string };
export const strings = { action_balance_ration: { hi: '<Hindi>', en: 'Balance ration' }, /* ... */ } as const satisfies Record<string, BiText>;
export type StringId = keyof typeof strings;
export type BiParams = Record<string, number | string | BiText>;
export const HINDI_REVIEW = { status: 'unverified', reviewedBy: null, reviewedOn: null } as const;
export function t(id: StringId, params?: BiParams): BiText;   // both halves, interpolated
export function bi(id: StringId, params?: BiParams): string;  // active language only
export function biText(text: BiText): string;                 // active half of a built pair
export const LANGUAGE_LABELS = { hi: 'हिंदी', en: 'English' } as const;
```

- Both halves are still stored for every id: the toggle needs both, and the template is verified in both.
- Ids are `snake_case` with a role prefix (`action_`, `label_`, `unit_`, `notice_`, `state_`, `error_`, `badge_`, `template_`, `audit_`, `toast_`, `verdict_`, `vertical_`, `month_`, `capbasis_`, `binding_`, `reliability_`). Round 3–4 ids include `notice_how_to_use` (the Round 4 one-line how-to-use banner at the top of the workspace), `vertical_indigenous_forage` … `vertical_mineral`, `month_1` … `month_12`, `capbasis_range_top` …, `binding_budget` …, `reliability_listing` ("indicative"), the `verdict_*` sentences, the caveat line and the "1 kg of milk ≈ 1 L (assumption)" line.
- `{name}` placeholders must match between halves. Number params are formatted with Latin digits; domain constants (validation ranges) are passed as params, never typed into strings.
- Word units are strings, not fixed text: `/day` comes from `unit_per_day`, so Hindi mode shows `L/दिन`. Only `kg`, `L`, `₹`, `%` and the nutrient abbreviations are fixed Latin.

### 3. `<Bi>` and plain-text helpers (`src/i18n/Bi.tsx`)

```tsx
<Bi id="action_balance_ration" />
<Bi id="badge_all_verified" params={{ n: 7 }} />
<Bi text={audit.label} />
```

Renders `<span data-bi="<id or 'text'>" lang="<active>" class="bi">…</span>` with the **active language only**. There is no secondary-language line and no `layout` prop. `bi()` and `biText()` serve places that cannot hold markup (`aria-label`, `title`, `<option>`, the toast, the copied summary).

### 4. One language per screen and its exemptions

- English mode shows no Devanagari; Hindi mode shows no Latin-letter words; no element shows a second-language line (AC-L1.2).
- **Exempt** (SPEC L1): the toggle labels; the units `kg`, `L`, `₹`; Latin digits; `DM`, `CP`, `ME`, `Ca`, `P`; the SahiDana wordmark and tagline; verbatim citation titles and source names (including `priceSource`); the LLM explanation body; text the user typed; and, per OQ8, a feed with no source local name, which shows its English name in Hindi mode.
- Exempt elements carry `data-lang-exempt="<reason>"` so the tests can remove them before checking. Team-written prose (season notes, price notes, breed Hindi names) is **not** exempt and is stored as `{ en, hi }` pairs.

### 5. Names and search (`src/i18n/feedLabel.ts`, `src/i18n/breedLabel.ts`, `src/domain/feedSearch.ts`)

- `feedLabel(feed, lang)`: Hindi → `localNameDeva ?? localNameLatn ?? englishName`; English → `englishName`. `FeedName` renders it. `breedLabel(breed, lang)` follows the same rule. Group headings and month names come from `vertical_*` and `month_*` ids (AC-L1.4).
- `searchFeeds(query, feeds)` is unchanged and language-independent: it matches English, each transliterated part and the Devanagari name (normalized), so every query form returns the same feed in both modes (AC-3.1). Results keep their vertical group heading (AC-3.3).

### 6. Numbers (`src/i18n/format.ts`)

Unchanged: every displayed number goes through `formatNumber`/`formatKg`/`formatLitres`/`formatInr`/`formatPct`, built on `Intl.NumberFormat('en-IN', { numberingSystem: 'latn' })`, in both languages. `toLatinDigits()` maps Devanagari digits on input. The solver and verifier see raw numbers only, so solver output and verification results are identical in both languages (AC-L1.3).

### 7. LLM handling

- Extraction accepts Hindi, Hinglish or English (AC-L1.5).
- The explanation body is English in both modes (prompt plus language gate, AC-L1.6).
- The badge, the template, error and offline notices are string ids rendered in the active language.
- The copied summary is built with `bi()` in the active language (AC-8.1).

### 8. Font (`src/fonts.ts`)

Unchanged from ADR-0005 decision 6: Noto Sans and Noto Sans Devanagari, weights 400 and 600, Latin and Devanagari subsets, `font-display: swap`, precached (`globPatterns` includes `**/*.woff2`) so Hindi mode renders offline even if the user switches language while offline. CSS stack `"Noto Sans", "Noto Sans Devanagari", system-ui, sans-serif`; `:lang(hi)` gets `line-height: 1.6`. Budget 300 KB for all font files, measured at the first M1 build.

### 9. Language tests

- `tests/unit/i18n.test.ts` (fast, exists): every id has a Devanagari `hi` and a Devanagari-free `en`, NFC; same placeholders; no Devanagari digits; `bi()`/`biText()` return the active language only; `LANGUAGE_LABELS`; formatters never output Devanagari digits and `toLatinDigits` round-trips. **Devanagari-literal scan:** every `*.ts`, `*.tsx`, `*.css`, `*.html` under `src/` and `api/` plus `index.html`, except `src/i18n/strings.ts`, contains no U+0900–U+097F; the same files except `src/i18n/format.ts` contain no `toLocaleString` or `Intl.NumberFormat`. Data JSON (`src/data/*.json`) and test files are excluded because cited names and test inputs legitimately contain Devanagari.
- `tests/unit/languageToggle.test.tsx` (fast, exists): first render English; switching changes every string without a reload and sets `<html lang>`; the choice persists under `sahidana.lang` across a remount; an invalid stored value falls back to English.
- `tests/unit/oneLanguage.test.tsx` (fast, exists, extended): in English mode no Devanagari outside `[data-lang-exempt]`; in Hindi mode no Latin-letter word (`/[A-Za-z]{2,}/`, allowing `kg`, `DM`, `CP`, `ME`, `Ca`) outside `[data-lang-exempt]`; Hindi feed and breed names replace English ones; checked for initial, prefilled, validation-error, infeasible, below-maintenance and result states, with details collapsed and expanded.
- `tests/unit/feedSearch.test.ts` (fast, exists): `"Mustard"`, `"Sarson"` and `"सरसों"` return `mustard_cake`, in both modes.
- `tests/unit/verifier.test.ts`: language gate; badge ids; both template halves verify.
- `tests/e2e/language.spec.ts` (Playwright, slow; replaces `bilingual.spec.ts`): every AC-L1.2 state in both modes, including the audit drawer, offline, LLM failure and copy confirmation; reload persistence online and offline; no Devanagari digits anywhere; in Hindi mode offline, `document.fonts.check('16px "Noto Sans Devanagari"')` after `document.fonts.ready`.
- `src/services/mockAdapter.ts` keeps Hindi and Hinglish extraction fixtures; `eval/test_descriptions.json` pairs each Hindi/Hinglish description with an English one with the same expected labels, now including breed and budget.

## Domain tests (solver, breeds, season, verdict)

- `tests/unit/requirements.test.ts`: linear model values; DMI ceiling equals NRC Eq. 1-1 at WOL 20 for several weights, fats and milk levels; `k0`, `kY` match the closed form; the roughage share is read from data with its citation.
- `tests/unit/breeds.test.ts`: every DATA_SOURCES §5 breed (including Bhadawari) plus both non-descript rows present; breed list per species (AC-2.4); recomputed caps equal stored caps and bases; `cited_peak` wins over the lactation rules (Murrah 9.64, Nili-Ravi 9.40, Bhadawari 6.93, Sahiwal 11.15); non-descript caps 3.86 and 4.73 with the DAHD year (AC-2.5).
- `tests/unit/season.test.ts`: `isInSeason(feed, month)` and `currentMonth()`; marks change with the month and solver inputs do not (AC-3.4, AC-3.5).
- `tests/unit/solver.test.ts`: stage 1 optimality against hand-solved cases; `S ≤ max(cap, T)` with a very large budget (AC-5.3); breed cap binding (AC-5.4); `T` above the breed cap with a large budget gives `Y* = T` and `effectiveCapSource: 'today_milk'`; one case per binding constraint, including `roughage`, with only that one tight (AC-5.5); every requirement at `S` met within `1e-6`, roughage share `≥ r − 1e-6`, cost `≤ budget + 1e-6`, caps respected (AC-5.1); maintenance infeasible by nutrient, by roughage (no roughage feed selected) and by DM conflict (AC-E2.1); budget below `M` with and without a fixing feed, and an unpriced feed never suggested (AC-E7.1); dry animal skips stage 1 and returns the maintenance ration; stage 2' feasible and infeasible.
- `tests/unit/verdict.test.ts`: every verdict kind (`dry_maintenance`, `below_today`, `above_breed_level`, `at_breed_level`, `room`, `same_as_today`), boundary values (`S − T` exactly 0.1, `T` exactly at the breed cap, cap 9.64 with `T` = 9.64 gives `Y*` = 9.64 and no shortfall although `S` = 9.6, `Y*` exactly `T − 1e-6`, `Z ≤ 0`, stage 2' infeasible gives no saving), fat comparison with cited, ranged and missing breed fat, and no fat line at milk 0.

## Directory layout

```text
ProjectSahiDana/
├── api/
│   └── llm.ts                          # Vercel function proxying OpenRouter
├── data/
│   ├── breeds.csv                      # Breed table: cited yields, lengths, fat, DAHD rows (human-verified)
│   ├── feeds.csv                       # Regional feed library: vertical, months, nutrients, prices (human-verified)
│   └── requirements.json               # Maintenance, per-litre, and NRC 2001 DMI constants with citations
├── docs/
│   ├── ARCHITECTURE.md                 # This file
│   ├── DATA_SOURCES.md                 # Research hand-off for every data value
│   ├── DECISIONS.md                    # Architecture Decision Records
│   ├── FEEDBACK.md                     # Prototype feedback rounds
│   ├── PROJECT_MENTAL_MODEL.md
│   ├── PROJECT_STATUS.md
│   └── SPEC.md
├── eval/                               # M3 Python evaluation and SciPy cross-check
│   ├── cross_check_solver.py           # Rebuilds every LP stage from the v1 JSON and solves with linprog (HiGHS)
│   ├── evaluate_extraction.py          # Extraction accuracy on 30 labelled descriptions (incl. breed, budget)
│   ├── out/                            # browser_results.json written by scripts/dump_solver_results.ts (gitignored)
│   ├── test_animals.json               # 15+ animals with breed, budget, feeds; covers every verdict and binding constraint
│   ├── test_descriptions.json          # 30 hand-labelled descriptions (English, Hindi, Hinglish)
│   └── test_scipy_agreement.py         # pytest: browser and SciPy agree on M, Y*, S, stage 2 costs, B/Z, verdict, binding
├── public/
│   ├── icons/
│   └── manifest.webmanifest
├── scripts/
│   ├── compile_data.mjs                # feeds.csv, breeds.csv, requirements.json → src/data/*.v1.json, with validation and cap rules
│   └── dump_solver_results.ts          # Runs the browser solver on eval/test_animals.json (npx vite-node) for the cross-check
├── sources/                            # Gitignored source PDFs (NDDB, DAHD, NRC)
├── src/
│   ├── components/
│   │   ├── AnimalLine.tsx              # One-line animal summary
│   │   ├── AnimalProfileForm.tsx       # Species, breed, weight, milk, fat + validation
│   │   ├── AuditDrawer.tsx             # Tap-to-audit: citation, formula, assumption, or LP stage and constraint
│   │   ├── BreedSelect.tsx             # NEW: breeds filtered by species + cited benchmark (cap, basis, fat)
│   │   ├── BudgetField.tsx             # NEW: ₹/day budget, defaults to today's cost until edited
│   │   ├── ConnectivityBanner.tsx
│   │   ├── DetailsToggle.tsx           # NEW: Show details / Hide details (feeds card and result card)
│   │   ├── ExplanationCard.tsx         # Verified explanation + badge
│   │   ├── FeedName.tsx                # Feed name in the active language
│   │   ├── FeedSelector.tsx            # Picker grouped by vertical, in-season marks, price with date/source/reliability
│   │   ├── Fig.tsx                     # Tappable number that opens the audit drawer
│   │   ├── FreeTextExtractor.tsx       # Privacy notice, text box, unmatched feeds
│   │   ├── InfeasibilityAlert.tsx      # AC-E2.1 limiting nutrients and AC-E7.1 below-maintenance
│   │   ├── LanguageToggle.tsx          # हिंदी | English
│   │   ├── MonthSelector.tsx           # NEW: month for in-season marks, defaults to the current month
│   │   ├── NutrientCoverageBars.tsx    # Behind Show details
│   │   ├── PrototypeStatesPanel.tsx    # Prototype only (mock adapter)
│   │   ├── RationResultsPanel.tsx      # Ration table, cost vs budget and today, Copy summary
│   │   ├── StatusPill.tsx
│   │   ├── SupportedMilkCard.tsx       # NEW: "This budget supports X L/day", today's milk, breed benchmark
│   │   └── VerdictCard.tsx             # NEW: verdict, fat line, caveat
│   ├── data/
│   │   ├── breeds.v1.json              # Compiled breed table (M1)
│   │   ├── feeds.v1.json               # Compiled feed library (M1)
│   │   ├── requirements.v1.json        # Compiled requirement tables and DMI constants (M1)
│   │   ├── breeds.prototype.json       # Prototype fixtures (Round 3 prototype)
│   │   ├── feeds.prototype.json        # Prototype fixtures
│   │   ├── prototypeExamples.json      # Prototype example descriptions
│   │   └── prototypeLexicon.json       # Prototype rule-based extraction lexicon
│   ├── domain/
│   │   ├── audit.ts                    # AuditMeta builders (citations, assumptions, LP stages)
│   │   ├── breeds.ts                   # NEW: cap rules, breedsForSpecies, benchmark
│   │   ├── feedNames.ts                # feedNameBi, vertical styling, nutrient string ids
│   │   ├── feedSearch.ts               # English / transliterated / Devanagari search
│   │   ├── nutrition.ts                # Per-kg supply and coverage helpers
│   │   ├── presets.ts                  # Prototype presets
│   │   ├── requirements.ts             # NEW (M1): linear requirement model + NRC 2001 DMI ceiling
│   │   ├── season.ts                   # NEW: isInSeason, currentMonth
│   │   ├── solver.ts                   # NEW (M1): maintenance run, stages 1, 2, 2', binding detection, diagnosis
│   │   ├── summary.ts                  # Copy summary in the active language
│   │   ├── types.ts                    # Shared types (this document's data models)
│   │   ├── validation.ts               # Animal, breed, budget and feed validation
│   │   ├── verdict.ts                  # NEW: selectVerdict, fat comparison
│   │   └── verifier.ts                 # Number verifier, language gate, template
│   ├── i18n/
│   │   ├── Bi.tsx                      # <Bi>: active language only
│   │   ├── breedLabel.ts               # NEW: breed name in the active language
│   │   ├── feedLabel.ts                # Feed name in the active language
│   │   ├── format.ts                   # Latin-digit formatters, toLatinDigits
│   │   ├── lang.ts                     # Lang, sahidana.lang storage, active-language value
│   │   ├── LanguageProvider.tsx        # LanguageProvider, useLang
│   │   └── strings.ts                  # The ONLY source file with Devanagari: { hi, en } pairs, t(), bi(), HINDI_REVIEW
│   ├── services/
│   │   ├── liveAdapter.ts              # M1: browser solver + /api/llm
│   │   ├── mockAdapter.ts              # Prototype adapter with fixtures
│   │   └── rationService.ts            # Adapter selection
│   ├── App.tsx
│   ├── fonts.ts
│   ├── index.css
│   ├── main.tsx
│   └── vite-env.d.ts
├── tests/
│   ├── unit/
│   │   ├── adapter.test.ts             # Contract tests for both adapters
│   │   ├── breeds.test.ts              # NEW
│   │   ├── compileData.test.ts         # NEW: compile-script validation rules on small CSV fixtures
│   │   ├── feedSearch.test.ts
│   │   ├── i18n.test.ts
│   │   ├── languageToggle.test.tsx
│   │   ├── oneLanguage.test.tsx
│   │   ├── requirements.test.ts
│   │   ├── season.test.ts              # NEW
│   │   ├── solver.test.ts
│   │   ├── verdict.test.ts             # NEW
│   │   └── verifier.test.ts
│   └── e2e/
│       ├── language.spec.ts            # Both modes, every state, persistence, fonts offline
│       └── ration-journey.spec.ts      # Online, offline, budget, verdicts, Show details, audit drawer
├── .env.example
├── package.json
├── playwright.config.ts
├── tsconfig.json
├── vercel.json
└── vite.config.ts
```

## Configuration

Environment variables (documented in `.env.example`; never commit `.env`):

| Variable | Scope | Default / example | Purpose |
|---|---|---|---|
| `OPENROUTER_API_KEY` | Server (`api/llm.ts`) | `sk-or-v1-...` | OpenRouter key; never exposed to the browser (no `VITE_` prefix). |
| `OPENROUTER_MODEL` | Server | `meta-llama/llama-3.3-70b-instruct:free` | Primary model. |
| `OPENROUTER_FALLBACK_MODELS` | Server | `google/gemma-3-27b-it:free,qwen/qwen-2.5-72b-instruct:free` | Comma-separated fallbacks on `429` or upstream error. |
| `VITE_USE_MOCK_ADAPTER` | Client | `false` | `true` forces `mockAdapter.ts` for prototype review and screenshots. |

The language choice is a per-device `localStorage` value (`sahidana.lang`), not configuration. The solver tolerances (`1e-6`), the default week of lactation (`20`) and the rounding of `S` are constants in code and data, not environment variables.

## Expensive to change

Plain-English list for the freeze. Each item is costly to change after M1 because code, data and tests all depend on it.

1. **The two-stage solver and its rules.** Stage 1 finds the most milk the budget supports, never above the breed cap or today's milk, whichever is higher; stage 2 finds the cheapest ration for that milk; extra runs give the maintenance cost and the cost of keeping today's milk. Every run also requires a minimum share of roughage (forage and crop residues), set by a cited number. The browser solver and the Python cross-check must match exactly, so changing the formulation means rewriting both and all their tests.
2. **The breed table and its cap rules.** The rule order (cited peak first, then the lactation averages, then the DAHD average for non-descript animals) and "1 kg of milk ≈ 1 L" decide every headline and verdict. Changing a rule changes every result and every expected value in the tests.
3. **Requirements that grow in a straight line with milk, and the intake equation.** The LP only works because each requirement and the intake ceiling are "fixed part + amount per litre". A standard that is not a straight line in milk would need a different kind of solver.
4. **The feed table's shape.** Group (`vertical`, which also decides what counts as roughage), season months and note, nutrient citations, and dated prices with a reliability label. Changing columns after about 30 rows are transcribed and verified means redoing that work.
5. **Everything runs in the browser.** This is what makes the app work offline. Moving the solver to a server would break offline use.
6. **The AI boundary.** `/api/llm` only fills the form and writes an English explanation; it never supplies nutrients, prices, seasons or breed figures, and every number it writes is checked. Making the explanation Hindi would mean a new number checker.
7. **The language contract.** Every screen string is an id with a Hindi and an English text, shown one language at a time; numbers always use Latin digits. Changing this touches every component. Adding or rewording strings stays cheap.
8. **Hosting, data model and accounts.** One Vercel project serves the app and the AI proxy. There are no user accounts, no login and no server database; adding any of them later is a new design.

## Setup requirements

### Tools

| Tool | Minimum version | Check command | Notes |
|---|---|---|---|
| Node.js | `20.0.0` | `node --version` | Vite, Vitest, Vercel runtime, compile script. |
| npm | `10.0.0` | `npm --version` | Package manager. |
| Python | `3.11.0` | `python --version` | `eval/` (M3) with `scipy` and `pytest`. |
| Playwright + Chromium | `1.45.0` | `npx playwright --version` | E2E and screenshots (`npx playwright install chromium`). |
| Vercel CLI | `37.0.0` | `npx vercel --version` | Deploys the public URL that judges use to try the app (wanted for judging; not one of the named deliverables D.01–D.03). |
| Impeccable (skill) | Optional | Launcher check from the orchestrator | Optional design and polish skill. |
| Noto Sans + Noto Sans Devanagari | `@fontsource/*` 5.x | `npm ls @fontsource/noto-sans @fontsource/noto-sans-devanagari` | Self-hosted fonts, no account or CDN. |
| UTF-8 editor setting | n/a | `src/i18n/strings.ts`, `data/feeds.csv` and `data/breeds.csv` open with Devanagari intact | Save as UTF-8 without BOM. |

### Accounts and credentials

| Service | Environment variable | First milestone needed | Where to get it | Cost | How tests run without it |
|---|---|---|---|---|---|
| OpenRouter | `OPENROUTER_API_KEY` (plus `OPENROUTER_MODEL`, `OPENROUTER_FALLBACK_MODELS`) | **M2** | `https://openrouter.ai/keys` | Free with `:free` models. Setup check: confirm the free-tier caps at `https://openrouter.ai/docs/api-reference/limits` and `GET https://openrouter.ai/api/v1/auth/key`. | Tests use `mockAdapter` or mock `/api/llm` (`vi.fn()`, `page.route()`); without a key the app keeps manual entry and the deterministic template. |
| Vercel | `VERCEL_TOKEN` (or `npx vercel login`) | **M1** (public URL for judges) | `https://vercel.com/account/tokens` | Free (Hobby tier). | All tests run against the local Vite server (`http://localhost:5173`). |

### Local services

None. All data is bundled as static versioned JSON cached by the Service Worker.

## Change 3: Farmer-first flow (2026-10-15)

This section is a **superseding addition** to the frozen architecture above, for Change 3 ([SPEC.md](SPEC.md) "Change 3: Farmer-first flow", [ADR-0010](DECISIONS.md#adr-0010-farmer-first-candidate-set-own-feeds-plus-in-season-priced-library-feeds) to [ADR-0017](DECISIONS.md#adr-0017-two-milestone-delivery-layout-first-then-farmer-first-solve)). The frozen sections are not edited. Where this section differs from them, this section applies from C3-M1 (layout) or C3-M2 (solve) onward, as marked. Change type: Feature. Posture: Prototype. Branch `feat/farmer-flow` from `d28d90a`.

### C3 overview

- **C3-M1, layout and wording (UI only).**
  - The input column order becomes: free-text extractor, "Your cow or buffalo", budget, feeds, balance button, then "Try an example".
  - The farmer's animal is called "Your cow or buffalo", then "Your cow" or "Your buffalo" once the species is picked.
  - Today's milk and supported milk sit side by side, with the breed benchmark on one line below.
  - No type, solver, service or result changes.
- **C3-M2, farmer-first solve.**
  - The farmer enters the animal and the budget and taps **Calculate ration**. Feeds are optional.
  - `rationService.planRation` builds the candidate set (own feeds plus in-season, priced library feeds) and runs the **unchanged** two-stage solver on it, then once more per ladder step.
  - It returns a `RationPlan`: the final ration, rung 0, the cheapest-first ladder, the buy and not-needed lists, and the budget-increase prompt.
  - The only solver change is the new output `costAtCapInrPerDay` ([ADR-0013](DECISIONS.md#adr-0013-cost-at-cap-solver-field)).

The stack, hosting, data files, `/api/llm`, the language layer and the LP formulation (Steps 1–5 and 7 of `solveRation`) are unchanged. No new dependency.

### C3 components

New and changed parts only (additions to the [Components](#components) diagram):

```mermaid
flowchart TD
    App["App.tsx: Calculate ration (profile + budget valid; own feeds optional)"]
    Svc["rationService.planRation(profile, owned) (src/services/rationService.ts)"]
    Lib["getInitialFeeds(): live v1 library or prototype fixtures"]
    Month["currentMonth() (src/i18n/months.ts)"]
    Plan["planRation + buildCandidates (src/domain/rationPlan.ts, pure)"]
    Solve["selectAdapter().solveRation (live: solver.ts; mock: mockSolver.ts)"]
    Solver["solveRation Step 6: + costAtCapInrPerDay"]
    Results["RationResultsPanel: You have / Buy tags, Not needed line"]
    Ladder["BuyLadder.tsx: rung 0 + rungs 1..n"]
    Prompt["BudgetIncreasePrompt.tsx: Add ₹X/day to reach Y L/day"]
    Shortfall["BudgetShortfallAlert.tsx: Raise the budget by at least ₹X/day"]
    Audit["auditMilk.ts: auditRung, auditBudgetIncrease, auditRaiseToMaintenance"]

    App --> Svc
    Svc --> Lib
    Svc --> Month
    Svc --> Plan
    Plan -->|"final, rung 0, each ladder step"| Solve
    Solve --> Solver
    Plan -->|"RationPlan"| App
    App --> Results
    App --> Ladder
    App --> Prompt
    App --> Shortfall
    Ladder --> Audit
    Prompt --> Audit
    Shortfall --> Audit
```

- **`src/domain/rationPlan.ts` (new, C3-M2):** a pure module with no React, no i18n and no adapter imports. It builds the candidate set, runs the final solve, rung 0 and the ladder steps through an injected `solve` function, and applies the ladder and budget-prompt rules. It also exports `roundUpInr`.
- **`rationService.planRation` (C3-M2):** wires `planRation` to the active adapter's `solveRation`, the same adapter's feed library (`getInitialFeeds()`) and `currentMonth()`.
- **`src/domain/solver.ts` (C3-M2):** Step 6 adds `costAtCapInrPerDay`; nothing else changes.
- **UI (C3-M1 and C3-M2):**
  - Changed: `src/App.tsx`, `src/components/AnimalProfileForm.tsx`, `src/components/VerdictCard.tsx` (`SupportsHeadline` tiles), `src/components/FeedSelector.tsx`, `src/components/RationResultsPanel.tsx`, `src/components/BudgetShortfallAlert.tsx`, `src/domain/presets.ts`, `src/i18n/strings.ts`, `src/index.css`.
  - New: `src/components/BuyLadder.tsx` and `src/components/BudgetIncreasePrompt.tsx`.

### C3 data models

**`RationSolution` gains one field** (`src/domain/types.ts`, C3-M2). All other fields are unchanged.

| Field | Type | Rule |
|---|---|---|
| `costAtCapInrPerDay` | `number \| null` | Required. Cost in ₹/day of the least-cost ration from the solved feeds that supports `effectiveCapLPerDay`, with no budget row: `solveFixedMilk(inputs, reqModel, effectiveCap, null)?.totalCost ?? null`, computed in Step 6 next to `stage2AtT`. `null` when that LP is infeasible, and always `null` in the dry-animal branch (Step 3). Equals `costAtTodayMilkInrPerDay` when `effectiveCapSource` is `'today_milk'`. The mock solver sets `null`. |

**Plan types** (`src/domain/rationPlan.ts`, C3-M2). The plan's fields are kept as approved. Three fields are additions, marked below: `candidates`, `month` and `RationRung.prefixFeedIds`.

```ts
import type { AnimalProfile, FeedItem, RationSolveOutcome, SelectedFeedInput } from './types';

/** The active adapter's solveRation, injected so the module stays pure and testable. */
export type SolveFn = (profile: AnimalProfile, feeds: SelectedFeedInput[]) => RationSolveOutcome;

export interface RationRung {
  /** Feeds bought at this rung; rung 1 may group several ("buy these together to balance"). */
  addedFeedIds: string[];
  /** Addition: every feed in this rung's step (own feeds + bought so far), for the rung audit (AC-C3-2.10). */
  prefixFeedIds: string[];
  /** The step's solve. Status 'optimal' for every rung by construction (ADR-0012). */
  outcome: RationSolveOutcome;
}

export interface BudgetIncrease {
  /** X = roundUpInr(costAtCapInrPerDay − budgetInrPerDay); > 0 whenever this object exists. */
  extraInrPerDay: number;
  /** Y = final.effectiveCapLPerDay (displayed rounded down to 0.1 like S). */
  targetMilkLPerDay: number;
  /** The final solve's costAtCapInrPerDay, kept for the audit of X. */
  costAtCapInrPerDay: number;
}

export interface RationPlan {
  /** The existing two-stage solve over the candidate set, with unbuyable suggestions removed (ADR-0010 decision 4). */
  final: RationSolveOutcome;
  /** Rung 0: the own feeds alone; null when no own feeds or when final is not 'optimal'. */
  ownedOnly: RationSolveOutcome | null;
  /** Rungs 1..n; empty when final is not 'optimal' or nothing is bought. */
  rungs: RationRung[];
  /** The buy list in ladder order (supplements first, then ₹/day ascending, ties by feed id). */
  buyFeedIds: string[];
  /** Own feeds with no line above 0 kg/day in final, in the order entered. */
  notNeededFeedIds: string[];
  budgetIncrease: BudgetIncrease | null;
  /** Addition: exactly the feeds passed to the final solve (AC-C3-2.3). */
  candidates: SelectedFeedInput[];
  /** Addition: the month used for the in-season filter (ADR-0016). */
  month: number;
}

/** Feeds the solver always includes at a minimum kg/day when offered (mineral-supplement rows in solver.ts). */
export const MANDATORY_SUPPLEMENT_IDS: readonly string[] = ['mineral_mix', 'common_salt'];
```

### C3 interfaces

```ts
// src/domain/rationPlan.ts
export function buildCandidates(
  owned: SelectedFeedInput[],
  library: readonly FeedItem[],
  month: number,
): SelectedFeedInput[];

export function planRation(
  profile: AnimalProfile,
  owned: SelectedFeedInput[],
  library: readonly FeedItem[],
  month: number,
  solve: SolveFn,
): RationPlan;

/** Round a rupee amount up to the 2 decimals formatInr shows: Math.ceil(value * 100 - 1e-7) / 100. */
export function roundUpInr(value: number): number;

// src/services/rationService.ts
export interface RationService extends RationAppAdapter {
  planRation(profile: AnimalProfile, owned: SelectedFeedInput[]): RationPlan;
}
export const rationService: RationService; // planRation: (profile, owned) =>
//   planRation(profile, owned, getInitialFeeds(), currentMonth(), (p, f) => selectAdapter().solveRation(p, f))

// src/domain/auditMilk.ts (new builders; same AuditMeta shape as auditKeepCost / auditMaintenance)
export function auditRung(solution: RationSolution, prefixFeedIds: string[], figure: 'milk' | 'cost', byId: Map<string, FeedItem>): AuditMeta;
export function auditBudgetIncrease(solution: RationSolution, increase: BudgetIncrease): AuditMeta;
export function auditRaiseToMaintenance(report: BudgetShortfallReport, extraInrPerDay: number): AuditMeta;
```

`RationAppAdapter` is **unchanged**: both adapters keep the frozen interface. `planRation` lives on the service, not the adapter, so `mockAdapter.ts` and `liveAdapter.ts` need no new method. `rationService.solveRation` stays; it is still used by the C3-M1 flow, the adapter contract tests and `scripts/dump_solver_results.ts`.

**`buildCandidates(owned, library, month)`:**
1. Returns every entry of `owned` unchanged, in order. This includes own feeds out of season in `month` and keeps the farmer's price, cap and today's amount.
2. Then, in library order, it adds every `FeedItem` whose `id` is not an owned `feedId`, for which `inSeason(feed, month)` holds (`src/domain/feedGroups.ts`) and whose `defaultPriceInrPerKgAsFed !== null`. Each enters as `{ feedId, priceInrPerKgAsFed: defaultPriceInrPerKgAsFed, maxKgAsFedPerDay: null, currentKgAsFedPerDay: null }`.
3. It does not validate own feeds; the UI validates them before calling (`validateFeed`, AC-C3-E3).

**`planRation(profile, owned, library, month, solve)`, in order:**
1. **Candidates.** `candidates = buildCandidates(owned, library, month)`.
2. **Final solve.** `final = solve(profile, candidates)`, then remove unbuyable suggestions:
   - `budget_below_maintenance`: when `fixFeedId` names a feed that is not in season in `month` or has no default price, return a copy with `fixFeedId`, `fixFeed` and `maintenanceWithFixInrPerDay` set to `null`.
   - `infeasible`: keep only those `suggestedFeeds` whose feed is in season in `month` and has a default price.
   - No number is changed; only advice is removed.
3. **Final not balanced.** If `final.status !== 'optimal'`, return `{ final, ownedOnly: null, rungs: [], buyFeedIds: [], notNeededFeedIds: [], budgetIncrease: null, candidates, month }` (AC-C3-2.14, AC-C3-E7).
4. **Rung 0.** `ownedOnly = owned.length > 0 ? solve(profile, owned) : null`.
5. **Buy list.** Take the lines of `final.feeds` with `kgAsFed > 0` whose `feedId` is not owned. Sort them by:
   1. `MANDATORY_SUPPLEMENT_IDS` members first;
   2. then `costInr` ascending;
   3. then `feedId` by plain code-unit comparison (not `localeCompare`).

   The result is `buyFeedIds`.
6. **Ladder.** Let `nSup` be the number of supplements in `buyFeedIds`. For `k` from `max(1, nSup)` to `buyFeedIds.length`:
   - Solve step `k`: the `owned` entries followed by the `candidates` entries for `buyFeedIds.slice(0, k)`.
   - Until the first balanced (`'optimal'`) step, skip unbalanced steps.
   - The first balanced step becomes rung 1, with `addedFeedIds = buyFeedIds.slice(0, k)`.
   - Every later step becomes one rung, with `addedFeedIds = [buyFeedIds[k - 1]]`.
   - `prefixFeedIds` is the owned ids followed by `buyFeedIds.slice(0, k)`.
   - When `buyFeedIds` is empty, `rungs` is `[]` and rung 0 is the answer (SPEC OQ-C3-4).
7. **Not needed.** `notNeededFeedIds` lists the owned `feedId`s (in the order entered) that have no line with `kgAsFed > 0` in `final.feeds`.
8. **Budget prompt.** `budgetIncrease` is set only when all of these hold:
   - `final.tightConstraints.includes('budget')`;
   - `(final.supportedMilkExactLPerDay ?? final.supportedMilkLPerDay) < final.effectiveCapLPerDay − 1e-6`;
   - `final.costAtCapInrPerDay !== null`.

   Then `budgetIncrease = { extraInrPerDay: roundUpInr(costAtCap − budget), targetMilkLPerDay: effectiveCapLPerDay, costAtCapInrPerDay }`. Otherwise it is `null`. It is always `null` for a dry animal, because the cost at the cap is `null`.

**Invariants (unit-tested in `tests/unit/rationPlan.test.ts`):**
- The last rung's exact supported milk and total cost equal `final`'s within `1e-6 × max(1, |value|)`.
- Every rung is `'optimal'`.
- `supportedMilkExactLPerDay` never decreases from rung 1 to the last rung (within `1e-6`).
- Rung 0 is outside this chain ([ADR-0012](DECISIONS.md#adr-0012-cheapest-first-upgrade-ladder-from-nested-prefix-solves)).

**Cost.** One tap runs `solve` 1 + (1 if own feeds) + up to `buyFeedIds.length` times. Each run is about 6 small LPs, plus about 30 for a step whose budget is below the maintenance cost (the frozen fix-feed search). The work is synchronous on the main thread and is expected to stay well under 1 second; measure it at C3-M2 UAT on a phone-width preview.

### C3 data flow (C3-M2)

1. **Inputs.** `App.tsx` validates the profile and budget (`validateAnimal`) and the own-feed rows (`toInputs`).
   - **Calculate ration** is enabled when the profile and budget are valid and every own-feed row is valid.
   - The `notice_next_feeds` gate is removed; `notice_next_price` stays for an invalid own-feed row.
2. **Plan.** `balance()` calls `rationService.planRation(profile, owned)`. It stores `{ profile, requirement, outcome: plan.final, plan }`, so `SolveResult` gains `plan: RationPlan`.
   - `outcome` stays `plan.final`, so the existing headline, tiles, verdict, cost line, alerts, Explain and Copy summary read the same object as before.
   - `requirement` is computed at `plan.final`'s supported milk, as today.
3. **Results.** The results column renders:
   - the existing cards from `plan.final`;
   - in `RationResultsPanel`, a "You have" tag on rows whose `feedId` is owned and "Buy" on rows in `plan.buyFeedIds`, plus the "Not needed" line from `plan.notNeededFeedIds`;
   - `BuyLadder` from `plan.ownedOnly` and `plan.rungs` (milk figures hidden for a dry animal, AC-C3-E6);
   - `BudgetIncreasePrompt` from `plan.budgetIncrease`. X uses `auditBudgetIncrease`; Y uses the existing effective-cap audit (`auditBreedCap(breed, todayMilk)`);
   - for `plan.final.status === 'budget_below_maintenance'`, `BudgetShortfallAlert` with "Raise the budget by at least ₹X/day", where `X = roundUpInr(maintenanceCostInrPerDay − budget)` with `auditRaiseToMaintenance`.
4. **Audits and offline.** Every new figure is a `Fig` with an audit built from that rung's or the final solve's output. Everything runs offline; no network call is added.

### C3 mock mode

With `VITE_USE_MOCK_ADAPTER=true`:
- `rationService.planRation` uses `PROTOTYPE_FEEDS` (from `getInitialFeeds()`) and `mockAdapter.solveRation`. The candidate, ladder, tag and not-needed rules behave the same.
- The mock solver returns `costAtCapInrPerDay: null`, so **the budget-increase prompt never appears in mock mode**.
- The mock has no mineral-supplement rows. `MANDATORY_SUPPLEMENT_IDS` ordering still applies if those ids appear, and it is harmless there.
- Tests of the prompt (AC-C3-2.12, the "Tight budget" demo in AC-C3-2.15) use the live adapter, or a fake `SolveFn` in `rationPlan.test.ts`.

### C3 compatibility

**Must stay unchanged:**
- `RationAppAdapter` and `solveRation(animal, selectedFeeds, feedLibrary?, breedLibrary?)`.
- Steps 1–5 and 7 of the LP and every existing `RationSolution` field value for the same feed set (AC-C3-R1).
- `POST /api/llm` and its prompts, the verifier and the template.
- `ExplanationRequestContext`.
- `data/*` and `src/data/*.v1.json`.
- String ids (only English and Hindi texts change in C3-M1).
- The `data-testid="supports"` and `data-preset` hooks.

**Other compatibility facts:**
- There is no stored state to migrate; the only device value is still `sahidana.lang`.
- Today's cost and the reference cost come from own feeds only, because library candidates have `currentKgAsFedPerDay: null` (AC-C3-R5).
- Free-text extraction lands matched feeds as own feeds (AC-C3-R4).

### C3 directory layout (delta)

```text
src/
├── components/
│   ├── BudgetIncreasePrompt.tsx      # NEW (C3-M2): Add ₹X/day to reach Y L/day (breed best)
│   └── BuyLadder.tsx                 # NEW (C3-M2): Feeds to buy, cheapest first; rung 0 + rungs 1..n
├── domain/
│   ├── auditMilk.ts                  # + auditRung, auditBudgetIncrease, auditRaiseToMaintenance (C3-M2)
│   ├── rationPlan.ts                 # NEW (C3-M2): buildCandidates, planRation, roundUpInr, types
│   ├── solver.ts                     # Step 6 only: costAtCapInrPerDay (C3-M2)
│   └── types.ts                      # RationSolution.costAtCapInrPerDay (C3-M2)
└── services/
    ├── mockSolver.ts                 # costAtCapInrPerDay: null (C3-M2)
    └── rationService.ts              # RationService type + planRation (C3-M2)
scripts/dump_solver_results.ts        # writes costAtCapInrPerDay (C3-M2)
eval/cross_check_solver.py            # HiGHS cost at effective cap, no budget row (C3-M2)
eval/test_scipy_agreement.py          # costAtCap agreement + null together (C3-M2)
tests/unit/rationPlan.test.ts         # NEW (C3-M2)
```

### C3 tests

**C3-M1** (selectors and text only; no expected solver values change):
- `tests/unit/resultUi.test.tsx`: side-by-side tiles and benchmark line; card title by species.
- `tests/unit/oneLanguage.test.tsx`: new strings in both modes; no "animal" or "पशु" for the farmer's animal (AC-C3-1.4).
- `tests/e2e/ration-journey.spec.ts`: column order, "Try an example" below the button, `data-preset` demos still fill the form.
- `tests/e2e/language.spec.ts`: renamed texts.

**C3-M2:**
- `tests/unit/solver.test.ts`:
  - `costAtCapInrPerDay >= totalCostInr` when the budget is tight;
  - `null` when the cap is infeasible;
  - `null` for a dry animal;
  - equal to `costAtTodayMilkInrPerDay` when `T > cap`.
- `tests/unit/rationPlan.test.ts` (new), using the real solver with `LIVE_FEEDS` and a fixed month, plus a fake `SolveFn` for pure-rule cases. It covers:
  - the candidate rules: out-of-season and unpriced library feeds are excluded; an owned out-of-season feed is kept; an owned library feed appears once at the farmer's price and cap;
  - the buy list order, including supplements first;
  - rung 1 is the first balanced step; every rung is balanced; milk never decreases from rung 1; the last rung equals `final`;
  - a non-balanced `final` gives an empty plan; an empty buy list gives `rungs: []` with rung 0;
  - `notNeededFeedIds`;
  - `budgetIncrease`: null when the budget is not tight, null when the cost at the cap is null, and for a dry animal; otherwise `budget + X >= costAtCap`;
  - out-of-season or unpriced fix-feed and suggested feeds are removed;
  - `roundUpInr` boundaries.
- `tests/unit/adapter.test.ts`: both adapters return `costAtCapInrPerDay` (`number | null`); `rationService.planRation` works in mock and live modes.
- `tests/unit/resultUi.test.tsx`, `tests/unit/oneLanguage.test.tsx`: tags, ladder, rung 0 states, Not needed, prompt, raise-by line, three demos, both languages, every new figure opens its audit.
- `tests/e2e/ration-journey.spec.ts`, `tests/e2e/language.spec.ts`: calculate with no feeds, with own straw, tight-budget demo prompt, below-maintenance raise-by, offline.
- `scripts/dump_solver_results.ts`, `eval/cross_check_solver.py`, `eval/test_scipy_agreement.py`: `costAtCap` agreement on all 18 benchmark animals (AC-C3-2.13); every existing case still agrees (AC-C3-R1). `eval/test_animals.json` needs no change, though an `expected.costAtCapFeasible` flag may be added per animal.
- Demo and expected values are taken from real solver output only. If `rationPlan.test.ts` takes more than about 1 second, its real-library cases move to `tests/unit/rationPlan.slow.test.ts` so the fast suite stays under 15 seconds.

**Test commands** (unchanged from [Test commands](#test-commands)):
- **Fast** (after every task): `npm test`
- **Full** (milestone end): `npm run test:full`
- **One file:** `npx vitest run tests/unit/rationPlan.test.ts`
- **Also at C3-M2 end:** `npm run build` (type check catches any `RationSolution` without `costAtCapInrPerDay`), `npm run compile:data`, `npm run eval:dump && npm run eval:scipy`.

### C3 setup requirements

None beyond [Setup requirements](#setup-requirements). No new tool, account, environment variable or local service.

### Expensive to change

Plain-English list for Change 3. Each item is costly to change after C3-M2 because code, tests and the SPEC criteria depend on it.

1. **Which feeds the solver may choose.** The farmer's own feeds plus library feeds that are in season this month and have a cited price. This rule decides what the farmer is told to buy. Changing it (for example, allowing out-of-season feeds) changes every result, the demos and their tests.
2. **The ladder rule.** Supplements first, then the cheapest ₹/day first; rung 1 groups the feeds needed to balance. The tests check that milk never goes down and that the last rung matches the final ration. A different order means new rules, new invariants and new expected results.
3. **The new solver number, the cost at the milk cap.** It is part of the solver's output and is checked by the Python cross-check. Renaming or redefining it touches the solver, the mock, the cross-check, the dump script and the tests.
4. **The shape of `RationPlan`.** The app, the ladder card, the prompt, the table tags and their tests all read it. Adding a field is cheap; renaming or removing one is not.
5. **The solver itself stays unchanged.** This keeps the 100% agreement with SciPy. Any later wish to force own feeds, add per-feed limits or rank feeds inside the solver reopens that agreement and the frozen formulation.
6. **Calculating without picking feeds.** The button rules, the hints, the demos and the end-to-end tests all assume feeds are optional. Going back to "feeds first" would undo most of C3-M2.
