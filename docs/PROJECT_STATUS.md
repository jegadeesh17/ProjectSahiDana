- [x] Phase 0: Scoping (posture, milestones, change type and project facts agreed), repository initialized, and for an existing project the working branch created and the codebase mapped, docs index created
- [x] Phase 0b: Baseline screenshots (existing projects with a UI only) (not needed)
- [x] Phase 1: Spec interview and user approval
- [x] Phase 2.1: docs/SPEC.md
- [x] Phase 2.2: docs/ARCHITECTURE.md (draft) and docs/DECISIONS.md
- [x] Phase 2.2b: Design studio (ui only)
- [x] Phase 2.2c: Prototype accepted by the user (ui only)
- [x] Phase 2.2d: Architecture frozen and signed off
- [x] Phase 2.2e: Design review (sensitive-data only) (not needed)
- [x] Phase 2.3: docs/TASKS.json
- [x] Phase 2.4: Setup (tools checked, credentials listed, user confirmed)
- [x] Phase 3.1: M1 built, verified and committed per task, reviewed (code, and UI for ui projects), UAT accepted, CHANGELOG updated
- [x] Phase 3.2: M2 built, verified and committed per task, reviewed (code, and UI for ui projects), UAT accepted, CHANGELOG updated
- [x] Phase 3.3: M3 built, verified and committed per task, reviewed (code, and UI for ui projects), UAT accepted, CHANGELOG updated
- [x] Phase 4: Final test run, README, and handover

## Project Complete (Handover 2026-10-13)

- **Status:** All phases and milestones (Phases 0–4, M1–M3) complete, verified, and accepted.
- **Verification:** Full test suite (`npm run test:full && python -m pytest -q eval/`) exits 0 with 174 unit tests, 13 Playwright E2E tests, and 68 Python evaluation tests.
- **Deliverables:** D.01 Two-stage LP optimizer, D.02 Jaipur regional feed library & breed table, D.03 Offline field-paravet PWA.

## Change 3: Farmer-first flow (branch `feat/farmer-flow`, base `d28d90a`)

- [x] C3 Phase 0/1: scope approved by the user (2026-10-15), branch created, retro started
- [x] C3 Phase 2: SPEC amendment, ADRs and Change 3 architecture section, tasks in docs/internal/TASKS.json
- [x] C3-M1: layout and wording built, verified, reviewed (code and UI), UAT accepted
- [x] C3-M2: farmer-first solve built, verified, reviewed (code and UI), UAT accepted
- [x] C3 close-out: README/CLAUDE.md/CHANGELOG updated, merged to main with the user's yes, full tests green on main

## Change 4: Herd and 3-step flow (branch `feat/herd-flow`, base `2134ab6`)

- [x] C4 Phase 0/1: scope approved by the user (2026-10-15), branch created
- [x] C4 Phase 2: SPEC amendment, ADRs and Change 4 architecture section, prototype accepted, tasks in docs/internal/TASKS.json
- [ ] C4-M1: 3 screens, breed prefill, home feed at ₹0, plain result; verified, reviewed (code and UI), UAT accepted, merged and deployed
- [ ] C4-M2: herd (fair-share joint LP, buying steps with per-animal split); verified, reviewed (code and UI), UAT accepted, merged and deployed
- [ ] C4 close-out: README/CLAUDE.md/CHANGELOG updated, full tests green on main

