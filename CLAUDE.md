# CLAUDE.md

Hack4Pashudhan (Impact Hackathon) entry. Product: **SahiDana**, "Sahi dana, har number ka hisaab."
Track 6: Regional Dairy Ration Balancing Calculator.
Team of 3–5, registered 2026-10-12. Folder: ProjectSahiDana.
Repository: `https://github.com/jegadeesh17/ProjectSahiDana`

## Working Rules & Deadlines
- **Read `docs/internal/BRAINSTORM.md` first.** It holds the rules, the track decision, the data fact-check (what feed and requirement data really exists), competitors, the SahiDana idea, risks, the team split, and next steps.
- **Deadlines (IST):** submission **Sun 18 Oct 2026, 11:59 PM** (extended from Thu 15 Oct); in-person finale Wed 28 Oct at PGIVER Jaipur (5 min pitch + 3 min Q&A).
- **Hard rules:** one problem statement per team. The team lead submits at https://impacthackathon.com/submit with the registration ID and registered email. The PPT is a Google Drive link set to "Anyone with the link". The GitHub repo must be public. Links can be edited until the deadline.
- **Build constraints:** CPU-only, no model training. Every number shown to a farmer comes from the solver or a cited source row, never from the LLM.
- **Secrets rule:** A `.env` exists in this folder. Never read, print, or commit it; it is off-limits.
- **Keep notes updated:** Update `docs/internal/BRAINSTORM.md` when a decision changes, so the next session starts from current state.

## Technical Stack & Architecture
- **Frontend / PWA:** TypeScript 5, React 18, Vite 5, Tailwind CSS 3, `vite-plugin-pwa`, `javascript-lp-solver`, `vaul`, `@radix-ui/react-dialog`, `@radix-ui/react-accordion`, `@radix-ui/react-slot`, `class-variance-authority`, `lucide-react`. 100% offline-capable core.
- **Backend / Serverless:** Vercel serverless function (`api/llm.ts`) proxying OpenRouter with IP rate limiting (20 req/min/IP) and model fallback chain (`meta-llama/llama-3.3-70b-instruct:free`, `google/gemma-3-27b-it:free`, `qwen/qwen-2.5-72b-instruct:free`).
- **Verification Suites:**
  - TypeScript unit tests: `npm test` (432 tests passing across 22 test files).
  - Herd flow E2E tests: `npx playwright test tests/e2e/herd-flow.spec.ts` (10 tests passing).
  - Benchmark animals, herds & SciPy HiGHS agreement: 18 single animals + 7 herds in `eval/test_animals.json` and `eval/test_herd_animals.json` evaluated across 32 SciPy HiGHS agreement test cases (`npm run eval:dump && npm run eval:scipy`, 100% mathematical agreement).
  - Data compilation pipeline: `npm run compile:data` (strict citation & schema verification).

## Key Constraints & Guardrails
- **Solver Decides, AI Translates:** Linear programming and cited ICAR/NDDB tables own all nutrient calculations. The LLM never invents nutrients or prices.
- **No Uncited Numbers:** Every displayed value is backed by an authoritative publication citation or active LP dual constraint.
- **Bilingual Isolation (ADR-0009):** Single language per screen (English / हिंदी) with zero script leakage. Latin digits everywhere.
