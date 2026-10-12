# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

TypeScript 5, React 18, Vite 5, Tailwind CSS 3, `vite-plugin-pwa` (Workbox Service Worker precaching), and `javascript-lp-solver` (in-browser LP solver), deployed as a single project on Vercel (static PWA + `api/llm.ts` Vercel Serverless Function proxying OpenRouter).

## Users

- **Primary:** Field paravets and dairy extension workers in Rajasthan and North India operating on basic Android phones (`390×844` class) with patchy or absent mobile connectivity at the farmer's doorstep.
- **Secondary:** Veterinarians and Hack4Pashudhan evaluators/judges auditing a formulated ration's clinical validity, mathematical constraints, and source citations in under 30 seconds.

## Product Purpose

SahiDana formulates least-cost daily dairy rations (`kg/day` as fed per feed) for adult lactating or dry cows and buffaloes from a cited regional library of ~25–30 Rajasthan/North-India feeds. Success means a paravet can balance a feasible ration (or diagnose an infeasible one) completely offline at the doorstep, see daily cost (`₹/day`), nutrient coverage (`DM`, `CP`, `ME`, `Ca`, `P`), and savings against today's ration, and tap any number on screen to audit its exact publication source or solver constraint.

## Positioning

**"A ration a vet can audit in 30 seconds."** Unlike closed-box AI ration tools or netbook-only institutional software, SahiDana runs the linear program transparently in the browser offline, never allows the LLM to invent or supply nutrient values, and links every single number on screen (and every number in an online plain-English AI explanation) to either an authoritative cited source row (NDDB / ICAR / NASEM table and page) or an active LP solver constraint.

## Operating Context

- Used outdoors or in bright courtyard/doorstep lighting on low-end Android phones over intermittent rural networks.
- Paravets enter animal parameters (`cow` or `buffalo`, body weight `150–800 kg`, milk yield `0–40 L/day`, fat `2.5–10%`) manually or, when online, via free-text extraction (`Fill from description`) with mandatory user confirmation.
- Feeds are searched by English or transliterated local Hindi/Rajasthani names (e.g., *Turi / Bhusa*, *Sarson Khali*, *Bajra*) with editable `₹/kg` prices and optional `kg/day` caps.
- Judges evaluate clinical validity and mathematical rigor quickly using 1-tap demo presets (e.g., solved lactating buffalo ration and infeasible straw-only diagnosis) and the tap-to-audit drawer.

## Capabilities and Constraints

- **Offline-first core:** Animal requirement lookup, LP optimization (`javascript-lp-solver`), infeasibility diagnosis, deterministic explanation template, and clipboard text summary work 100% offline.
- **Online AI assist with strict guardrails:** Free-text extraction and plain-English explanation run via `/api/llm` (OpenRouter free models with fallback chain). A visible disclosure states free-text goes to OpenRouter and free models may log prompts. Unmatched LLM feed names are flagged for mapping or removal; untraced explanation numbers trigger at most one retry before falling back to a deterministic template.
- **Honest provenance tags:** Feed nutrient composition (`CP`, `ME`, `Ca`, `P` on DM basis) cites NDDB Tables 1–5 with page numbers; fresh-fodder `DM%` cites a second source; `TDN` is display-only (`ME × 27.7`) and labelled `derived`; any unverified regional/seasonal tag or default price is labelled `team-asserted`.
- **Bilingual UI:** every label, button, message and state is shown in Hindi and English side by side (no toggle); numbers stay in Latin digits with `kg`, `L`, `₹`. Free-text extraction accepts Hindi, Hinglish or English; the LLM explanation stays English with bilingual badges and template. Hindi strings live in one file, reviewed by a native-speaker teammate.
- **Explicit non-goals:** voice and Rajasthani UI copy; no login/accounts or server database; no live mandi API; adult cows and buffaloes only; no micro-minerals beyond `Ca` and `P`; no veterinary/medical diagnosis.

## Brand Commitments

- **Name:** SahiDana
- **Tagline:** *"Sahi dana, har number ka hisaab."* (Right feed, every number accounted for.)
- **Voice:** Direct, clinical, transparent, field-practical. Never presents a partial/broken ration as valid; never hides provenance.
- **Visual feel (user decision, 2026-10-12):** calm, clean and modern in the register of Apple Health / Google Fit: soft, low-glare, never boxy or loud. Reading text always keeps WCAG AA contrast for outdoor use.

## Evidence on Hand

- Cited regional feed dataset (~25–30 Rajasthan/North-India feeds from NDDB *Nutritive Value of Commonly Available Feeds and Fodders in India*, July 2012, Tables 1–5, pp. 80–98, plus secondary DM% citations).
- Maintenance nutrient requirements from CELKAU/ICAR tables by body weight and lactation requirements per kg milk by fat % (verified ICAR 2013 or NASEM 2021).
- Independent Python `scipy.optimize.linprog` (HiGHS) cross-check suite in `eval/` for Milestone 3 verification.

## Product Principles

1. **The solver decides; the AI only translates:** Linear programming and cited tables own every nutrient and weight calculation; the LLM never supplies nutritional data.
2. **Every number is tappable proof:** No naked numbers—tapping any requirement, feed nutrient, weight, cost, or coverage value opens its source citation or active LP constraint.
3. **Fail loud on infeasibility, fail graceful on connectivity:** Never output a partial "best-effort" ration when constraints cannot be met; instead name the limiting nutrient and suggest a library feed. When offline or rate-limited, keep manual entry and deterministic explanations working seamlessly.
4. **Doorstep speed on a basic phone:** Single-scroll mobile ergonomics with high outdoor contrast, minimal typing, and 1-tap demo presets for instant inspection.

## Accessibility & Inclusion

- WCAG 2.2 AA contrast and touch target sizing (`>= 44×44 px`) suited for one-handed mobile operation in bright daylight.
- Hindi + English side-by-side copy throughout, so a paravet and the farmer beside them can both read the screen; Devanagari set in a face with full Hindi coverage at the same weight and size as the Latin.
- Bilingual feed search (English + local Hindi/Rajasthani names, in Devanagari and transliteration) so extension workers can match farmer terminology directly.

