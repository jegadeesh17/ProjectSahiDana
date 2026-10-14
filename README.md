# SahiDana (सही दाना)

> **Track 6:** Regional Dairy Ration Balancing Calculator for Jaipur Field Paravets.  
> **Offline-First PWA:** Zero-backend doorstep execution for field paravets, deployable with one command (`npm run build`).

SahiDana is an offline-first, auditable Progressive Web Application (PWA) designed for field paravets and dairy extension workers in Jaipur district, Rajasthan. It pairs an in-browser two-stage Linear Programming (LP) ration optimizer with a curated library of 31 regional feeds across four agro-ecological verticals (indigenous forages, crop residues, agro-byproducts, and minerals) and a cited performance benchmark table of 16 indigenous and crossbred cattle and buffalo breeds.

---

## Table of Contents

- [Live Demo & Quick Access](#live-demo--quick-access)
- [Features & Track 6 Deliverables](#features--track-6-deliverables)
- [System Architecture](#system-architecture)
- [Quick Start](#quick-start)
- [Usage Workflow](#usage-workflow)
- [Running Tests & Evaluations](#running-tests--evaluations)
- [Configuration](#configuration)
- [Evaluation Summary](#evaluation-summary)
- [Field Impact & Economic Validation](#field-impact--economic-validation)
- [Data Provenance & Verification Gates](#data-provenance--verification-gates)
- [Hackathon Team & Contributions](#hackathon-team--contributions)
- [Project Structure](#project-structure)
- [Documentation Suite](#documentation-suite)
- [License](#license)

---

## Live Demo & Quick Access

- **Live app:** [https://sahidana.vercel.app](https://sahidana.vercel.app) (installable PWA). Tap **Lactating buffalo** (हिंदी: *दुधारू भैंस*) for a balanced ration, or **Straw only** (*सिर्फ़ भूसा*) for an infeasible one with the missing nutrients named, under **One-tap demo** (*एक-टैप डेमो*). The हिंदी / English toggle in the top bar switches every label.
- **What works offline vs online:** the solver, requirements, feed library, audit drawer, demos and the template explanation work fully offline. The two AI features call `/api/llm` and need internet plus an `OPENROUTER_API_KEY` on the server: without a key, **Explain** falls back to the template explanation, and **Fill from description** shows an error, so enter the animal by hand. The free OpenRouter models can also be rate-limited under load, with the same fallbacks.
- **Local run (for development):** `npm run dev`, then open `http://localhost:5173`. Use `npm run build && npm run preview` to test the installable offline PWA locally.
- **Offline PWA:** installable to an Android home screen; the service worker caches the app shell, fonts and feed/breed datasets on first visit, so the solver core works at the doorstep with no network.
- **Repository:** [https://github.com/jegadeesh17/ProjectSahiDana](https://github.com/jegadeesh17/ProjectSahiDana)

---

## Features & Track 6 Deliverables

### D.01: Two-Stage Linear Programming Ration Optimizer
- **Stage 1 (Max Milk Yield):** Computes $Y^*$, the highest daily milk yield ($0 \le Y^* \le \text{effectiveCap}$) supported by available feeds within the paravet's daily feed budget (₹/day), subject to:
  - NRC 2001 dry-matter intake (DMI) ceiling equation (Equation 1-1 at mid-lactation week 20).
  - Per-feed intake caps (e.g. mustard cake maximum 3.0 kg/day, cottonseed cake 2.5 kg/day).
  - Minimum roughage dry-matter share ($r_{\min} = 40\%$) from indigenous green forages and dry crop residues (ICAR 2013 / NDDB).
  - **Mandatory Basal Mineral & Salt Requirements:** Enforces mandatory daily inclusion of area-specific mineral mixture (0.10 kg lactating, 0.05 kg dry) and common salt (0.05 kg lactating, 0.03 kg dry) following NDDB RBP field practice (team-asserted quantities, pending expert verification).
  - **Maximum Tolerable Calcium Level:** Upper bound based on NRC 2001 / ICAR Maximum Tolerable Level (1.5% of total dietary dry matter) preventing mineral antagonism.
- **Stage 2 (Least-Cost Balanced Ration):** Calculates the cheapest combination of feeds meeting all maintenance and production nutrient requirements (Crude Protein, Metabolizable Energy, Calcium, Phosphorus, Dry Matter, and Roughage) at step yield $S = \lfloor Y^* \times 10 \rfloor / 10$ L/day.
- **Stage 2' (Unconstrained Cost Benchmark):** Solves least-cost feeding without the paravet's budget constraint to determine genuine economic daily savings ($Z = \text{cost}_{\text{today}} - \text{cost}_{\text{stage2}}$) vs the farmer's current feeding practice.
- **Infeasibility Diagnosis & Budget Shortfall Guidance:** Detects binding constraints (budget, DMI ceiling, breed potential cap, roughage minimum, nutrient limits) and suggests single-feed additions (filtering out unpriced feeds) to resolve infeasibility.

### D.02: Jaipur Regional Feed Library & Breed Benchmarks
- **Jaipur Regional Feed Library (31 Feeds across 4 Verticals):**
  - **Indigenous forage (10):** Pearl millet fodder (green), Sorghum fodder (green), Maize fodder (green), Cowpea fodder (green), Cluster bean fodder (green), Berseem (green), Lucerne (green), Oats fodder (green), Marvel grass hay, Khejri leaf (dry).
  - **Crop residues (8):** Wheat straw (Bhusa), Pearl millet stover (Bajra stover / Karbi), Barley straw, Groundnut haulm, Gram (chickpea) straw, Cluster bean (guar) straw, Moong straw, Sorghum stover (Kadbi).
  - **Agro-byproducts (11):** Mustard cake, Cottonseed cake, Guar meal (korma/churi), Groundnut cake, Wheat bran, De-oiled rice bran (DORB), Pulse husk (chuni), Pearl millet grain (bajra), Maize grain, Sugarcane molasses, Saras compound cattle feed.
  - **Mineral supplements (2):** Area-specific mineral mixture (ASMM, Rajasthan / Zone IV), Common salt.
- **Cited Seasonal Windows, In-Season Filtering & Editable Prices:** Every feed includes monthly availability flags (1–12), seasonal harvesting notes in English and Hindi, in-season library filtering, out-of-season result indicators, and dated price benchmarks with transparent reliability tiers (`mandi`, `trade_report`, `listing`, `team_estimate`) that remain fully editable by paravets.
- **Cited 16-Breed Performance Table:**
  - 14 recognized breeds: Rathi, Tharparkar, Nagori, Gir, Kankrej, Sahiwal, Hariana, HF crossbred, Jersey crossbred, Murrah, Nili-Ravi, Bhadawari, Surti, Mehsana.
  - 2 national non-descript benchmarks: Desi cow (DAHD BAHS 2025: 3.86 L/day) and Desi buffalo (DAHD BAHS 2025: 4.73 L/day).
  - Strict milk potential cap hierarchy: cited peak daily yield wins over lactation averages, preventing unrealistic production projections.

### D.03: Offline Field-Paravet PWA with Zero-Leakage Bilingual UI
- **100% Offline Capability:** Progressive Web App with service worker caching the complete application shell, compiled feed and breed datasets, and bundled `@fontsource/noto-sans` and `@fontsource/noto-sans-devanagari` fonts (zero external CDN dependency in remote villages).
- **Strict Bilingual UI Isolation (ADR-0009):** Header language toggle (English / हिंदी). Zero Devanagari script leakage in English mode, zero unexempted Latin words in Hindi mode, and universal Latin digits across all numeric displays (SPEC AC-L1.1 to AC-L1.7).
- **Multilingual Free-Text Extraction:** Accepts spoken or typed field notes in English, Hindi (Devanagari), or Hinglish, mapping quantities, animal attributes, and feed names via `/api/llm` with strict nutrient and price safety gates, and sliding-window IP rate limiting (20 req/min/IP).
- **Tap-to-Audit Transparency:** Every displayed number (requirements, feed composition, costs, savings) is tappable, opening the Audit Drawer to reveal primary citations (document title, table, page number), mathematical equations, or dual LP binding constraints.

---

## System Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Field Paravet Device                            │
│                                                                        │
│  ┌───────────────────────┐       ┌──────────────────────────────────┐  │
│  │   Bilingual UI Shell  │       │  Two-Stage LP Ration Optimizer   │  │
│  │   (React 18 + PWA)    │ <───> │     (javascript-lp-solver)       │  │
│  │   Noto Sans + Deva    │       │   Stage 1 (Max Milk) + Stage 2   │  │
│  └───────────────────────┘       └──────────────────────────────────┘  │
│             │                                     │                    │
│             ▼                                     ▼                    │
│  ┌───────────────────────┐       ┌──────────────────────────────────┐  │
│  │   Tap-to-Audit Drawer │       │   Pre-Compiled v1 Data Library   │  │
│  │  (Citations & Duals)  │       │   (31 Feeds, 16 Breeds, ICAR)    │  │
│  └───────────────────────┘       └──────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
                                   │
              (Optional online free-text extraction)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     Vercel Serverless Gateway                          │
│                                                                        │
│  ┌───────────────────────┐       ┌──────────────────────────────────┐  │
│  │   /api/llm Proxy      │ <───> │        OpenRouter API            │  │
│  │   (API Key Guard)     │       │   Llama 3.3 / Gemma / Qwen       │  │
│  └───────────────────────┘       └──────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites
- **Node.js:** `>= 20.0.0`
- **npm:** `>= 10.0.0`
- **Python:** `>= 3.10` (for solver cross-checks and extraction benchmarks)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/jegadeesh17/ProjectSahiDana.git
   cd ProjectSahiDana
   ```

2. **Install web application dependencies:**
   ```bash
   npm install
   ```

3. **Set up Python virtual environment:**
   ```bash
   python -m venv .venv

   # Activate virtual environment:
   # On Windows (PowerShell):
   .venv\Scripts\Activate.ps1
   # On macOS / Linux:
   source .venv/bin/activate

    # Install evaluation dependencies:
    pip install -r eval/requirements.txt
    ```

4. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   *(The application runs 100% locally and offline out-of-the-box. An OpenRouter API key is only required if you wish to use the online LLM free-text extraction feature).*

5. **Start local development server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

---

## Usage Workflow

### 1. Paravet Field Balancing Workflow
1. **Language Selection:** Choose **English** or **हिंदी** from the app bar. The entire interface immediately switches with zero text leakage.
2. **Animal Profile:** Select species (**Cow** / **Buffalo**) and breed (e.g. *Rathi*, *Gir*, *Murrah*, or *Desi non-descript*). The breed's cited milk potential cap, cap basis, and benchmark fat percentage are displayed.
3. **Feed Picker:** Choose feeds available at the farm. Feeds are organized under 4 group headings: *Indigenous forage*, *Crop residues*, *Agro-byproducts*, and *Mineral*. In-season feeds for the selected month carry a green badge, and an *In-season feeds only* filter allows paravets to focus on current crops.
4. **Price Review:** Inspect cited default prices (with date, mandi/listing source, and reliability tier). Adjust ₹/kg prices to local village rates if different.
5. **Today's Baseline & Budget:** Enter the farmer's current feeding quantities to calculate today's baseline cost. Set the daily target budget in ₹/day (defaults to today's cost).
6. **Balance Ration:** Tap **Balance ration** (**राशन संतुलित करें**).
7. **Inspect Output & Verdict:**
   - **Supported Milk:** The exact maximum daily milk supported within the budget.
   - **Daily Savings:** Calculated dynamically against today's feeding.
   - **Ration Formulation:** Balanced amounts for each feed (kg/day as fed and kg/day dry matter), with out-of-season feeds clearly badged.
   - **Categorical Verdict:** Clear economic guidance (*Gain*, *At breed level*, *Below cost*, *Room*, *Same as today*).
8. **Audit Citations:** Tap any figure to inspect its primary ICAR/NDDB source, table, page number, formula, or active LP dual constraint.

### 2. Data Compilation & Verification Pipeline
To compile raw CSV sources into validated production JSON artifacts:
```bash
npm run compile:data
```
The compilation script (`scripts/compile_data.mjs`):
- Normalizes all Devanagari text to Unicode NFC.
- Validates all 31 feeds in `data/feeds.csv` against nutrient bounds, seasonal parsing, and price reliability requirements.
- Validates all 16 breeds in `data/breeds.csv` and computes breed potential caps.
- Validates `data/requirements.json` ensuring the 40% roughage minimum share has valid ICAR/NDDB citations.
- Emits production artifacts to `src/data/feeds.v1.json`, `src/data/breeds.v1.json`, and `src/data/requirements.v1.json`.

---

## Running Tests & Evaluations

| Suite | Command | Scope |
|---|---|---|
| **Fast Unit Tests** | `npm test` | Vitest unit test suite (176 tests, ~10s): solver, requirements, breeds, season, adapter, i18n, rate limiting, UI. |
| **All Unit Tests** | `npx vitest run` | Complete Vitest test suite including data compilation and verification gates. |
| **Playwright E2E** | `npx playwright test` | End-to-end user journeys and bilingual tests in headless Chromium. |
| **Language Isolation E2E** | `npx playwright test tests/e2e/language.spec.ts` | Strict AC-L1.1–L1.7 verification: zero Devanagari leakage, zero Latin in Hindi, Latin digits, font readiness. |
| **Solver Cross-Check Dump** | `npm run eval:dump` | Headless execution of browser solver across 18 benchmark animals (`eval/out/browser_results.json`). |
| **SciPy Solver Cross-Check** | `python -m pytest -q eval/test_scipy_agreement.py` | Pytest verification: browser solver agrees 100% with SciPy HiGHS simplex optimizer across 23 tests. |
| **Multilingual Extraction Eval** | `python -m pytest -q eval/test_extraction_eval.py` | Benchmark across 30 hand-labelled descriptions (EN, HI, Hinglish) and safety gates. |
| **Full Python Suite** | `python -m pytest -q eval/` | Full evaluation test suite (68 tests passing). |
| **Full Build & Test** | `npm run test:full` | Vitest unit tests + Playwright E2E suite. |

---

## Configuration

Environment variables can be configured in `.env` (refer to `.env.example`):

| Variable | Description | Default | Required? |
|---|---|---|---|
| `OPENROUTER_API_KEY` | Server-side API key for OpenRouter LLM proxy (`/api/llm`). | `""` (offline template fallback) | Optional (for online free-text extraction) |
| `OPENROUTER_MODEL` | Primary LLM model identifier for extraction and explanations. | `meta-llama/llama-3.3-70b-instruct:free` | Optional |
| `OPENROUTER_FALLBACK_MODELS` | Comma-separated list of fallback models tried on HTTP 429 rate limit or 5xx errors. | `google/gemma-3-27b-it:free,qwen/qwen-2.5-72b-instruct:free` | Optional |
| `VITE_USE_MOCK_ADAPTER` | Set to `true` to force fixture/mock adapter mode; leave empty or `false` for live in-browser solver. | `false` | Optional |
| `VERCEL_TOKEN` | Optional Vercel personal access token for automated deployments. | `""` | Optional |

---

## Evaluation Summary

### 1. 18-Animal Solver Cross-Check with SciPy HiGHS
An independent cross-check (`eval/cross_check_solver.py`, `eval/test_scipy_agreement.py`) was executed across 18 diverse animal scenarios in `eval/test_animals.json`, covering both species (cattle and buffalo), all 4 breed cap rules, all 6 categorical verdicts, and all 8 binding constraints:
- **100% Agreement on Feasibility:** Browser solver and SciPy HiGHS agree on feasibility across all 18 cases.
- **100% Constraint Satisfaction:** All nutrient requirements (CP, ME, Ca, P, DM ceiling, per-feed caps, and 40% roughage minimum share) satisfied within $1 \times 10^{-6}$ numerical tolerance.
- **Exact Numeric Parity:**
  - Maintenance cost $M$: identical within $1 \times 10^{-4}$ ₹/day.
  - Supported milk yield $Y^*$ and rounded step yield $S$: identical within $1 \times 10^{-4}$ L/day.
  - Stage 2 least-cost ration: identical within $1 \times 10^{-4}$ ₹/day.
  - Stage 2' unconstrained cost and daily savings $Z$: identical within $1 \times 10^{-4}$ ₹/day.
- **Zero Unverified Numbers in Explanations:** Explanations generated by LLM or deterministic fallback undergo regex extraction and numerical verification against solver outputs. Any explanation with unverified numbers is rejected and regenerated or replaced by verified templates (AC-7.1, AC-7.2).

### 2. 30-Description Multilingual Extraction Evaluation
Extraction accuracy was evaluated across 30 hand-labelled descriptions in `eval/test_descriptions.json`:
- 10 English, 10 Hindi in Devanagari, and 10 Hinglish descriptions grouped into 10 semantic triples (T01–T10).
- Confirmed cross-language parity (SPEC AC-L1.5) and species-scoped breed matching (SPEC AC-2.3).
- **Nutrient Safety Gate:** Extracted inputs are restricted to animal attributes and feed quantities; LLMs cannot override nutrient densities, price citations, or reliability tiers (SPEC AC-E5.1).

---

## Field Impact & Economic Validation

### Clinical & Economic Realism
- **Field Evidence Grounding (NDDB RBP):** Large-scale field trials conducted under the National Dairy Development Board's Ration Balancing Programme (NDP-I, 33,374 villages) demonstrate an average net gain of **₹25.5 per animal per day** (₹16.3 lower daily feed cost + ₹9.2 more milk and fat value) through scientific nutrient rebalancing.
- **No Circular Impact Claims:** SahiDana rejects hardcoded savings claims. Instead, all cost savings are dynamically computed against the farmer's entered baseline ration using Stage 2' unconstrained linear optimization, transparently displaying savings as a function of the farmer's actual village feed prices.
- **Nutritional Safety:** Mineral mixture and common salt basals are non-negotiable basals in every balanced ration, preventing the common clinical pitfall where bare linear programs omit essential micro-minerals once Ca and P constraints are satisfied.

---

## Data Provenance & Verification Gates

### Scientific Data Sources
- **Feed Nutritive Values:** NDDB (2012) *Nutritive Value of Commonly Available Feeds and Fodders in India*, Tables 1, 2, and 4; Feedipedia.
- **Seasonal Availability:** ICAR-CRIDA *Jaipur District Agriculture Contingency Plan* (2011), Table 1.7; NDDB (2012).
- **Breed Milk Yields & Caps:** NDDB *Dairying in Rajasthan* (2016), NDDB *Dairying in Punjab* (2014), NDDB *Dairying in Gujarat* (2013), ICAR-CIRB Buffalopedia, DAHD *Basic Animal Husbandry Statistics 2025* (BAHS 2025).
- **Nutrient Requirements:** ICAR (2013) *Nutrient Requirements of Cattle and Buffalo*; NRC (2001) *Nutrient Requirements of Dairy Cattle* (7th rev. ed., Equation 1-1); NDDB Ration Balancing Programme. The per-litre lactation values are a linear approximation of the ICAR 2013 standard by fat %, pending a check against the printed tables.

### Human Verification Gates
1. **Data Citation Audit Gate:**
   - Every row in `data/feeds.csv`, `data/breeds.csv`, and `data/requirements.json` carries a `verified_on` / `verifiedOn` field.
   - Enforced by `tests/unit/compileData.test.ts`: every feed, breed and requirement value must carry a source citation.
   - **Current status (2026-10-14):** values are cited, but expert sign-off is still pending for every row; `verifiedOn` is empty and `npm run compile:data` prints a warning for each. The app shows "Expert check: pending" on these figures in the audit drawer, and default prices show their reliability tier (`mandi`, `trade_report`, `listing`, `team_estimate`).
2. **Hindi Review Gate (ADR-0005 / ADR-0009):**
   - Maintained in `src/i18n/strings.ts` with strict human-in-the-loop verification status:
     ```typescript
     export const HINDI_REVIEW = {
       status: 'unverified',
       reviewedBy: null,
       reviewedOn: null,
     } as const;
     ```
   - All UI strings, Devanagari breed/feed names, and templates carry pending verification status until native-speaker review (ADR-0005) is recorded.
   - Enforced by `tests/unit/compileData.test.ts` and `tests/unit/i18n.test.ts` to guarantee honest provenance flags with zero script leakage.
3. **Zero Prototype Fixtures in Production Data:**
   - Production JSON files (`src/data/feeds.v1.json`, `src/data/breeds.v1.json`, `src/data/requirements.v1.json`) are audited to ensure zero prototype fixture flags (`__prototype`, `is_fixture`, `fixture`, `isPrototype`) or placeholder values exist.

---

## Hackathon Team & Contributions

SahiDana was developed for Track 6 of Hack4Pashudhan by a multidisciplinary team:
- **Clinical Data & Provenance Compilation:** Transcription of nutritive tables, requirements and breed benchmarks from ICAR 2013, NDDB 2012, CIRB Buffalopedia and NRC 2001, each with a citation; expert verification is pending.
- **Field Data & Mandi Benchmarks:** Regional price benchmarks across Jaipur mandi, RAJFED trade reports, and Rajasthan Zone IV agro-byproduct surveys.
- **Software Architecture & Optimization:** Two-stage linear programming engine, SciPy HiGHS cross-check evaluation, offline PWA implementation, and bilingual UI engineering.

---

## Project Structure

```text
ProjectSahiDana/
├── api/                                # Serverless API routes
│   └── llm.ts                          # Vercel proxy for OpenRouter LLM requests
├── data/                               # Raw human-curated datasets
│   ├── breeds.csv                      # Cited breed parameters and benchmarks
│   ├── feeds.csv                       # Jaipur 3-vertical regional feed library
│   └── requirements.json               # ICAR/NRC nutrient requirement tables
├── docs/                               # Living documentation suite
│   ├── ARCHITECTURE.md                 # System contracts, models, and test specifications
│   ├── DATA_SOURCES.md                 # Research hand-off and primary citations
│   ├── DECISIONS.md                    # Architecture Decision Records (ADRs)
│   ├── DEPLOYMENT.md                   # Vercel and offline PWA deployment guide
│   ├── PROJECT_MENTAL_MODEL.md         # Problem framing, persona, and core rules
│   ├── PROJECT_STATUS.md               # Implementation progress tracking
│   ├── SPEC.md                         # Given/When/Then acceptance criteria
│   ├── UI_REVIEW.md                    # UI, DESIGN.md, and WCAG accessibility audit
│   └── internal/                       # Team research, task backlog, and test execution history
│       ├── BRAINSTORM.md               # Track analysis, rules, and problem framing
│       ├── TASKS.json                  # Milestone task breakdown and criteria
│       ├── QA_RESULTS.json             # Automated test execution records
│       ├── ADVERSARIAL_REVIEW.md       # Milestone adversarial audit reports
│       └── FEEDBACK.md                 # Prototype and UAT user feedback rounds
├── eval/                               # Python evaluation & cross-check suite
│   ├── cross_check_solver.py           # SciPy HiGHS LP solver cross-check
│   ├── evaluate_extraction.py          # Multilingual free-text extraction benchmark
│   ├── test_animals.json               # 18 benchmark animal evaluation scenarios
│   ├── test_descriptions.json          # 30 hand-labelled multilingual descriptions
│   ├── test_extraction_eval.py         # Pytest extraction evaluation suite
│   └── test_scipy_agreement.py         # Pytest solver cross-check agreement suite
├── public/                             # PWA web manifest and static assets
├── scripts/                            # Build & evaluation scripts
│   ├── compile_data.mjs                # Data validation and v1 JSON compiler
│   └── dump_solver_results.ts          # Headless browser solver runner
├── src/                                # Application source code
│   ├── components/                     # React UI components (form, picker, result card)
│   ├── data/                           # Compiled production v1 JSON data & prototype fixtures
│   ├── domain/                         # Core domain logic (solver, breeds, season, verifier)
│   ├── i18n/                           # Internationalization, formatters, and strings.ts
│   ├── services/                       # Live and mock ration balancing adapters
│   ├── App.tsx                         # Main application shell
│   └── fonts.ts                        # Offline font registration (Noto Sans / Devanagari)
└── tests/                              # Automated test suites
    ├── e2e/                            # Playwright end-to-end tests (bilingual & journeys)
    └── unit/                           # Vitest unit test suite
```

---

## Documentation Suite

- [docs/SPEC.md](docs/SPEC.md): Complete specifications and Given/When/Then acceptance criteria for all user journeys.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): Technical architecture, mathematical formulations, and data schemas.
- [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md): Primary document citations and extraction methodology for Jaipur feeds and breeds.
- [docs/DECISIONS.md](docs/DECISIONS.md): Architectural Decision Records (ADR-0001 through ADR-0006).
- [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md): Current implementation status and milestone verification checklist.

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
