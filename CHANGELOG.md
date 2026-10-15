# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Dependencies, gitignore entries, and data compilation script with provenance validation (`M1-TASK-01`)
- Transcribe cited feed library, breed standards, and requirement tables into v1 JSON and align domain types (`M1-TASK-02`)
- Linear nutrient requirements engine, NRC 2001 DMI ceiling, and two-stage LP solver (`M1-TASK-03`)
- Wire liveAdapter with v1 data and browser solver into existing UI components (`M1-TASK-04`)
- PWA offline precaching config, Vercel routing, and E2E offline vertical-slice test (`M1-TASK-05`)
- Client-side explanation number verifier, Devanagari language gate, and authorized number collector (`M2-TASK-01`)
- Serverless OpenRouter proxy (`api/llm.ts`) with model fallback chain and nutrient safety (`M2-TASK-02`)
- Integrate liveAdapter with `/api/llm` and verifier retry flow, and add online AI E2E tests (`M2-TASK-03`)
- Benchmark animal suite and independent SciPy HiGHS LP solver cross-check (`M3-TASK-01`)
- Multilingual extraction benchmark on 30 labelled descriptions with cross-language parity and nutrient safety (`M3-TASK-02`)
- End-to-end language isolation, self-hosted offline Devanagari font verification, and UI polish/harden pass (`M3-TASK-03`)
- Human data and Hindi verification gate audit tests, zero prototype fixtures check, and root handover documentation (`M3-TASK-04`)
- Progressive buy ladder component (`BuyLadder.tsx`) and budget increase prompt (`BudgetIncreasePrompt.tsx`) with audit sheet links (`C3-M2-T3`)
- Pure ration planning domain module `src/domain/rationPlan.ts` with `buildCandidates` and `planRation` algorithm (`C3-M2-T2`)
- Solver `costAtCapInrPerDay` field with SciPy HiGHS LP agreement cross-check across all 18 benchmark animals (`C3-M2-T1`)
- Three farmer-focused presets: Buffalo (Murrah 12 L), Straw-only (needs feeds to buy), and Tight budget (shows raise-by prompt) (`C3-M2-T3`)

### Changed
- Reordered form layout into farmer-first sequence: description extractor, cow or buffalo card, daily feed budget, optional own feeds, and prominent "Calculate ration" action (`C3-M1-T1`)
- Replaced technical/clinical "animal" / "पशु" terminology with cow or buffalo species titles across all English and Hindi UI views (`C3-M1-T2`)
- Redesigned milk results into side-by-side comparison tiles ("Today" and "This ration supports") with benchmark line and tap-to-audit figures (`C3-M1-T3`)
- Enabled ration calculation with zero feeds selected, treating own feeds as optional and sourcing needed feeds from library (`C3-M2-T3`)
- Tagged ration feed rows explicitly as "You have" vs "Buy" in results table (`C3-M2-T3`)

### Fixed
- Scoped Rung 0 audit drawer feeds strictly to owned feeds when own feeds balance alone (`C3-M2-FIX-1`)

