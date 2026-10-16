# Project Mental Model — SahiDana

## Vision
SahiDana ("Sahi dana, har number ka hisaab.") is an open, auditable, offline-first ration balancer for field paravets. A browser LP solver computes the least-cost daily ration from a cited regional feed library. When online, an LLM fills the form from a free-text description and explains the ration, and every number in that explanation is verified against the solver output or a cited source row.

## Track 6 card (official, re-grounding 2026-10-12)

> "Formulate algorithmic nutritional balancing tools that calculate least-cost daily feeding rations utilizing indigenous forage, seasonal crop residue, and local agro-byproducts to maximize milk yield while reducing dairy maintenance expenditure."

- **D.01** Linear programming optimizer for least-cost nutrition: a two-stage LP. Stage 1 maximises the milk the budget's feeds can support, capped by the cited breed potential. Stage 2 finds the cheapest ration at that milk.
- **D.02** Comprehensive regional crop byproduct library: about 30 Jaipur-area feeds in three verticals (indigenous forage, seasonal crop residues, local agro-byproducts) plus mineral. Each has its available months, an NDDB citation and a dated price with its reliability. A breed table gives milk potential.
- **D.03** Offline progressive web app for field paravets: confirms the paravet persona. The screen is simple by default, with the details behind "Show details".
- Decisions and research: `docs/FEEDBACK.md` Round 3, `docs/DATA_SOURCES.md`.

## Target Persona
A field paravet or extension worker in Rajasthan/North India. They work on a basic Android phone with patchy connectivity, at the farmer's doorstep. Secondary: the vet or judge auditing a ration.

## Posture
Prototype, meaning the thinnest working path per milestone. Exception: the solver and the number check get thorough tests, because they are the product's claim.

## Project Facts

| Fact | Value | Reason |
|---|---|---|
| `ui` | yes | |
| `deploy` | yes | public URL so judges can click through (not one of D.01–D.03) |
| `sensitive-data` | no | no accounts or stored personal data; inputs are animal and feed data. The UI shows a notice that free-text goes to OpenRouter, and that free models may log prompts. |
| `existing-code` | no | |

## Milestones

| When | Milestone | Contents |
|---|---|---|
| Mon 12 Oct evening | Phases 0–2.4 | scope docs, SPEC, draft architecture, design studio, clickable prototype on mock data, feedback round(s), freeze, tasks, setup |
| Tue 13 Oct | **M1: MVP vertical slice (offline)** | Form input → requirements lookup → in-browser LP → ration (kg as fed per day), ₹/day, nutrient-coverage bars, and a tap-to-audit source for every number. Feed library v1 (~25–30 cited feeds). Installable PWA that works with the network off. Deployed preview URL. |
| Wed 14 Oct | **M2: Core AI flows (online)** | Free text → OpenRouter extraction → prefilled form the user confirms. LLM explanation with a "all N numbers verified" badge. Infeasibility diagnosis that names the limiting nutrient and suggests a library feed. Savings against the current ration. |
| Thu 15 Oct, by ~6 PM | **M3: Polish, edge cases, metrics** | Eval run: constraint satisfaction on 15 test animals, % cost saved, extraction accuracy on 30 labelled descriptions, 0 unverified numbers. Independent SciPy cross-check of the browser solver. Offline and LLM-failure edge cases. Handover README. |

## Repository
- **URL:** `https://github.com/jegadeesh17/ProjectSahiDana`
- **Branch:** `main`

## Part 1: Requirements and UX

**Primary journey:**
1. The paravet opens the installed app, offline or online.
2. They enter the animal: species (cow or buffalo), body weight in kg, milk yield in L/day, fat %. When online, they can instead paste or type a description and tap "Fill from description"; the prefilled form must be confirmed.
3. They pick the feeds on hand from the regional library, searchable by English or local name. For each feed: ₹/kg (a default is shown with its source and date) and an optional max kg/day.
4. Optionally, they enter today's ration so the app can show savings.
5. They tap **Balance ration** and see:
   - kg/day as fed per feed;
   - ₹/day;
   - coverage bars for DM, CP, ME, Ca and P against the requirement;
   - savings against today's ration.
6. They tap any number to open the audit drawer, which shows either the source (NDDB table/page, or the requirement standard/page) or "solver output" plus the constraint it satisfies.
7. When online, **Explain** gives a plain-English explanation with a verification badge.
8. They can copy a text summary.

**Errors and edge cases:**
- Inline validation for out-of-range inputs: weight 150–800 kg, milk 0–40 L, fat 2.5–10%. **Balance** stays disabled until there is at least 1 feed and a price for each selected feed.
- An infeasible ration states which nutrient(s) can't be met and suggests a library feed that would fix it. It never shows a partial "best effort" ration as if it were valid.
- Offline: the LLM buttons are disabled with "needs internet", and the solver works fully.
- LLM error, timeout or rate limit (free tier): a message appears. Form entry still works, and the explanation falls back to a deterministic template.
- The LLM names a feed that isn't in the library: it is shown as unmatched for the user to map or drop. The LLM never supplies nutrient values.
- An explanation containing a number that can't be traced is flagged and regenerated once; if it fails again, the template is used.

**Non-goals (whole hackathon):**
- Voice input or output, and Rajasthani UI copy.
- A Hindi LLM explanation (the explanation stays English, with a deterministic Hindi template line; see "Language" below).

**Language:** Hindi/English toggle, default English, one language per screen, Latin digits (FEEDBACK Rounds 1–2, ADR-0009; supersedes the 2026-10-12 side-by-side decision).

- Accounts, login or a server database.
- Live mandi prices.
- Calves, heifers, bulls, pregnancy allowances, goats and sheep. Scope is adult cows and buffalo, lactating or dry.
- Micro-minerals beyond Ca and P.
- Veterinary or medical advice.
- A native app.


---

# Change 2: Ship-ready (started 2026-10-14)

- **Change:** make SahiDana ready to ship for the Hack4Pashudhan submission (deadline Thu 15 Oct 2026, 11:59 PM IST).
- **Change type:** Fix (with a UX Feature in M2). Keep the incumbent design world in root `PRODUCT.md` and `DESIGN.md`.
- **Posture:** Prototype, matching the project. Solver and data-honesty checks keep thorough tests.
- **Branch:** `main` (user decision 2026-10-14: judges read `main`; no PR step).
- **Base commit:** `64f19eb` (baseline of the 25 previously uncommitted files; `c1785ef` holds the docs/internal renames).
- **Tracking files:** `docs/internal/TASKS.json`, `docs/internal/QA_RESULTS.json`, `docs/internal/ADVERSARIAL_REVIEW.md`, `docs/internal/FEEDBACK.md` (user decision 2026-10-14: keep `docs/` tidy for judges). Every delegation names these paths.
- **Project facts:** `ui` yes, `deploy` yes, `sensitive-data` no, `existing-code` yes.
- **Team retro:** `~/.se-agents/retros/ProjectSahiDana-2026-10-14.md`

**Scope (user-selected 2026-10-14):**
1. Vercel live deploy with the URL at the top of the README.
2. Clinical honesty fixes: Murrah milk cap and its labels; unverified requirement values labelled honestly in UI and README. No invented numbers.
3. README and claims audit: only true, verified statements.
4. Full test and review gate, then push.
5. UI usable and simple for farmers and paravets, clear instructions, and one unified start-to-end flow toward the goal (a balanced, least-cost ration).


---

# Change 3: Farmer-first flow (started 2026-10-15)

- **Change:** make the input flow farmer-first. (1) Left column order: cow/buffalo, then budget, then feeds. (2) Replace "Animal" with "Your cow or buffalo" / "आपकी गाय या भैंस" ("Your cow" / "Your buffalo" once the species is picked). (3) Today's milk and the supported milk side by side. (4) Move the one-tap demo out of the top of the input column. (5) Calculate with only the cow and the budget: the solver picks from the in-season regional library; an optional "Feeds you already have" dropdown adds the farmer's own feeds, used first at their price and cap. (6) The result lists feeds to buy as a cheapest-to-best upgrade ladder, and when the budget limits milk it says "Add ₹X/day to reach the breed's best".
- **Change type:** Feature. Keep the incumbent design world in root `PRODUCT.md` and `DESIGN.md`.
- **Posture:** Prototype, matching the project. Solver and number-honesty checks keep thorough tests.
- **Branch:** `feat/farmer-flow`, merged to `main` only after both milestones are accepted and the user says yes.
- **Base commit:** `d28d90a`.
- **Deadline:** submission extended to Sun 18 Oct 2026, 11:59 PM IST (user, 2026-10-15).
- **Milestones:** C3-M1 layout and wording (items 1–4, UI only); C3-M2 farmer-first solve (items 5–6).
- **Tracking files:** `docs/internal/TASKS.json`, `docs/internal/QA_RESULTS.json`, `docs/internal/ADVERSARIAL_REVIEW.md`, `docs/internal/FEEDBACK.md` (Round 5).
- **Project facts:** `ui` yes, `deploy` yes, `sensitive-data` no, `existing-code` yes.
- **Team retro:** `~/.se-agents/retros/ProjectSahiDana-2026-10-15.md`


---

# Change 4: Herd and 3-step flow (started 2026-10-15)

- **Change:** a simple 3-screen app for the whole herd, built for farmers and paravets, not analysts (user, 2026-10-15). Screen 1 "Your animals": add each cow or buffalo (tap species, pick breed, type today's milk; weight and fat prefilled from the cited breed table), auto-labelled Cow 1 / Buffalo 1, up to 10, plus one daily budget for buying feed for all animals. Screen 2 "Feed you already have" (optional): feed name + kg per day for all animals, no price. Screen 3 "Your plan": "Buy first", "If you have more money", "What to give each animal" per animal, "Not needed today", budget prompts; nutrient detail collapsed under "Details (for paravet)".
- **User answers (2026-10-15):** home feed is just what the farmer has, used first where it helps; the budget is for buying only; one total herd budget; herd-level buying steps with a per-animal split; everything before the Sun 18 Oct deadline; keep it practical and do not over-optimise.
- **Rules:** (1) few inputs, breed prefill for weight and fat with the cited source; (2) plain words on the main view ("Buy first", not "Rung"); (3) farmer units: whole ₹, kg to 1 decimal, grams for mineral mixture and salt, exact value in the audit; (4) proof one tap away; (5) fair money rule: every animal kept healthy first, then the budget is shared so all animals reach the same share `t` of their milk target (no animal starved for another).
- **Solver contract:** home feed at ₹0 capped by herd kg/day, with a separate buy variable for the same feed at its cited price; one joint herd LP (per-animal constraints; shared budget and stock); Stage 1 max `t`, Stage 2 cheapest purchase at that `t`; `solveRation` (single animal) unchanged.
- **Superseded from Change 3:** own-feed price, "Today kg", savings vs today, single-page layout.
- **Change type:** Feature. Keep the incumbent design world in root `PRODUCT.md` and `DESIGN.md`.
- **Posture:** Prototype, matching the project. Solver and number-honesty checks keep thorough tests (including a herd SciPy cross-check).
- **Branch:** `feat/herd-flow`, merged to `main` per milestone only after tests, review, UAT and the user's yes; deployed with the Vercel CLI after each merge (the project is not git-connected).
- **Base commit:** `2134ab6`.
- **Deadline:** Sun 18 Oct 2026, 11:59 PM IST. Targets: C4-M1 Fri 16 Oct 11 PM; C4-M2 Sat 17 Oct 11 PM. Fallback: if C4-M2 is not accepted by Sat 11 PM, submit the C4-M1 build.
- **Milestones:** C4-M1 3 screens, breed prefill, home feed at ₹0, plain result (one animal); C4-M2 herd (several animals, fair-share joint LP, herd buying steps with per-animal split, herd demos).
- **Out of scope:** market value of home stock, total-kg stock over days, savings vs today, per-animal budgets, saving the herd across reloads, `vercel git connect`, a manual month choice.
- **Deferred by the user (2026-10-15, FEEDBACK Round 6 item 5):** all AI layers in the new flow, both the "Describe your animals and feed" helper and Explain. "Lets just add the core app features now, ill decide upon the AI features later." Existing AI code stays in the repo unused.
- **Seasons:** the buy set uses feeds in season in today's month (device date, read at Calculate), shown on screen 3 as "in season today (15 October)".
- **Architecture:** Change 4 section frozen with the user's yes (2026-10-15).
- **Tracking files:** `docs/internal/TASKS.json`, `docs/internal/QA_RESULTS.json`, `docs/internal/ADVERSARIAL_REVIEW.md`, `docs/internal/FEEDBACK.md` (Round 6).
- **Project facts:** `ui` yes, `deploy` yes, `sensitive-data` no, `existing-code` yes.
- **Team retro:** `~/.se-agents/retros/ProjectSahiDana-2026-10-15.md` (continued)
