# CLAUDE.md

Hack4Pashudhan (Impact Hackathon) entry. Product: **SahiDana**, "Sahi dana, har number ka hisaab."
Track 6: Regional Dairy Ration Balancing Calculator.
Team of 3–5, registered 2026-10-12. Folder: ProjectSahiDana.
Repository: `https://github.com/jegadeesh17/ProjectSahiDana`

## Working Rules & Deadlines
- **Read `docs/internal/BRAINSTORM.md` first.** It holds the rules, the track decision, the data fact-check (what feed and requirement data really exists), competitors, the SahiDana idea, risks, the team split, and next steps.
- **Deadlines (IST):** submission **Thu 15 Oct 2026, 11:59 PM**; top 10 announced Sun 18 Oct; in-person finale Wed 28 Oct at PGIVER Jaipur (5 min pitch + 3 min Q&A).
- **Hard rules:** one problem statement per team. The team lead submits at https://impacthackathon.com/submit with the registration ID and registered email. The PPT is a Google Drive link set to "Anyone with the link". The GitHub repo must be public. Links can be edited until the deadline.
- **Build constraints:** CPU-only, no model training. Every number shown to a farmer comes from the solver or a cited source row, never from the LLM.
- **Secrets rule:** A `.env` exists in this folder. Never read, print, or commit it; it is off-limits.
- **Keep notes updated:** Update `docs/internal/BRAINSTORM.md` when a decision changes, so the next session starts from current state.

## Technical Stack & Architecture
- **Frontend / PWA:** TypeScript 5, React 18, Vite 5, Tailwind CSS 3, `vite-plugin-pwa`, `javascript-lp-solver`. 100% offline-capable core.
- **Backend / Serverless:** Vercel serverless function (`api/llm.ts`) proxying OpenRouter with IP rate limiting (20 req/min/IP) and model fallback chain (`meta-llama/llama-3.3-70b-instruct:free`, `google/gemma-3-27b-it:free`, `qwen/qwen-2.5-72b-instruct:free`).
- **Verification Suites:**
  - TypeScript unit tests: `npm test` (176 tests passing).
  - Benchmark animals & SciPy HiGHS agreement: 18 benchmark animals in `eval/test_animals.json` evaluated across 23 SciPy agreement test cases in `eval/test_scipy_agreement.py` (`npm run eval:dump && npm run eval:scipy`, 100% agreement).
  - Playwright E2E tests: `npx playwright test` (13 tests passing).
  - Data compilation pipeline: `npm run compile:data` (strict citation & schema verification).

## Key Constraints & Guardrails
- **Solver Decides, AI Translates:** Linear programming and cited ICAR/NDDB tables own all nutrient calculations. The LLM never invents nutrients or prices.
- **No Uncited Numbers:** Every displayed value is backed by an authoritative publication citation or active LP dual constraint.
- **Bilingual Isolation (ADR-0009):** Single language per screen (English / हिंदी) with zero script leakage. Latin digits everywhere.
