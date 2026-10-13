# CLAUDE.md

Hack4Pashudhan (Impact Hackathon) entry. Product: **SahiDana**, "Sahi dana, har number ka hisaab."
Track 6, Regional Dairy Ration Balancing Calculator.
Repository: `https://github.com/jegadeesh17/ProjectSahiDana` | Live: `https://sahidana.vercel.app`

## Technical Stack & Architecture
- **Frontend / PWA:** TypeScript 5, React 18, Vite 5, Tailwind CSS 3, `vite-plugin-pwa`, `javascript-lp-solver`.
- **Backend / Serverless:** Vercel serverless function (`api/llm.ts`) proxying OpenRouter with IP rate limiting and model fallback.
- **Verification Suites:**
  - TypeScript unit tests: `npm test` (176 tests passing).
  - SciPy HiGHS agreement: `npm run eval:scipy` (23 benchmark cases, 100% agreement).
  - Benchmark dump: `npm run eval:dump` (18 animals, 100% constraint satisfaction).
  - Data compilation pipeline: `npm run compile:data`.

## Key Constraints & Guardrails
- **Solver Decides, AI Translates:** Linear programming and cited ICAR/NDDB tables own all nutrient calculations. The LLM never invents nutrients or prices.
- **No Uncited Numbers:** Every displayed value is backed by an authoritative publication citation or active LP dual constraint.
- **Bilingual Isolation (ADR-0009):** Single language per screen (English / हिंदी) with zero script leakage. Latin digits everywhere.
