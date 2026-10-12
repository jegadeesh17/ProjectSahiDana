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
- [ ] Phase 3.1: M1 built, verified and committed per task, reviewed (code, and UI for ui projects), UAT accepted, CHANGELOG updated
- [ ] Phase 3.2: M2 built, verified and committed per task, reviewed (code, and UI for ui projects), UAT accepted, CHANGELOG updated
- [ ] Phase 3.3: M3 built, verified and committed per task, reviewed (code, and UI for ui projects), UAT accepted, CHANGELOG updated
- [ ] Phase 4: Final test run, README, and handover

## Resume here (saved 2026-10-12)

- **Current step:** Phase 3.1 (M1 Build Loop) — **`M1-TASK-03`** in `docs/TASKS.json` (`src/domain/requirements.ts`, `src/domain/solver.ts`, `tests/unit/requirements.test.ts`, `tests/unit/verdict.test.ts`, `tests/unit/solver.test.ts`).
- **Completed & committed in this session:**
  - **Phase 2.2c–2.4:** Round 4 "How to use" banner added and prototype accepted; `docs/ARCHITECTURE.md` frozen (`03b4397`); `docs/TASKS.json`, `.env.example`, and Round 4 prototype committed (`534db57`).
  - **`M1-TASK-01` (`completed`, commit `3c3004a`):** `scripts/compile_data.mjs`, `src/types/javascript-lp-solver.d.ts`, `tests/unit/compileData.test.ts` (84/84 tests passing).
  - **`M1-TASK-02` (`completed`, commit `ea3c0ee`):** Transcribed `data/feeds.csv` (30 feeds), `data/breeds.csv` (16 breed rows), `data/requirements.json` (with ICAR/NDDB 0.40 roughage minimum), compiled `src/data/*.v1.json`, aligned `src/domain/types.ts` & `breeds.ts`, and verified `tests/unit/breeds.test.ts` & `tests/unit/season.test.ts` (95/95 tests passing).
- **When resuming:** Check `git status --porcelain` first (in case the background `M1-TASK-03` subagent wrote files after pausing). If `src/domain/requirements.ts` and `src/domain/solver.ts` exist, inspect them and run `qa-tester` for `M1-TASK-03` (Attempt 1); otherwise delegate `M1-TASK-03` (Attempt 1) to `backend-developer`. Note: `.env` currently has `VITE_USE_MOCK_ADAPTER=true` until `M1-TASK-04` wires `src/services/liveAdapter.ts`.

