# Project Mental Model — SahiDana

## Vision
SahiDana ("Sahi dana, har number ka hisaab.") is an open, auditable, offline-first ration balancer for field paravets. A browser LP solver computes the least-cost daily ration from a cited regional feed library. When online, an LLM fills the form from a free-text description and explains the ration, and every number in that explanation is verified against the solver output or a cited source row.

## Target Persona
A field paravet or extension worker in Rajasthan/North India. They work on a basic Android phone with patchy connectivity, at the farmer's doorstep. Secondary: the vet or judge auditing a ration.

## Posture
Prototype, meaning the thinnest working path per milestone. Exception: the solver and the number check get thorough tests, because they are the product's claim.

## Project Facts

| Fact | Value | Reason |
|---|---|---|
| `ui` | yes | |
| `deploy` | yes | public URL for D.03 |
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
- Hindi or Rajasthani UI or voice; nobody on the team can verify it. Local feed names come from the source only.
- Accounts, login or a server database.
- Live mandi prices.
- Calves, heifers, bulls, pregnancy allowances, goats and sheep. Scope is adult cows and buffalo, lactating or dry.
- Micro-minerals beyond Ca and P.
- Veterinary or medical advice.
- A native app.
