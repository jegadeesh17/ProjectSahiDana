# Hack4Pashudhan 2026: brainstorm notes

Started 2026-10-12. Source: the event page https://impacthackathon.com/ and /submit (read in full on 2026-10-12), plus a data and competitor fact-check the same day.

Status: **Track chosen (T6). Product named (SahiDana). Team registered (2026-10-12). Build plan not written.**

---

## 1. Hackathon facts

**Organiser:** Verdant Impact Pvt. Ltd. Theme: "Livestock, Livelihood, Longevity".

**Dates (IST)**
- 3 Oct: start; problem statements and rules released
- 3–15 Oct: online build period
- **Sun 18 Oct 2026, 11:59 PM: submission deadline** (PPT + GitHub; extended from Thu 15 Oct, user 2026-10-15)
- 16–18 Oct: evaluation
- Sun 18 Oct: top 10 announced
- Wed 28 Oct: finale at PGIVER (Post Graduate Institute of Veterinary Education and Research), Jaipur. Check-in 10:00 AM with ID; pitches 11:30–1:00; winners announced 2:00 PM.

**Rules**
- Teams of **3–5** registered members, students or professionals. "Individual participation isn't allowed." Cross-disciplinary teams encouraged.
- Each team picks **one** of the 12 problem statements.
- The team lead registers the team and submits. Registration is free.
- No published registration close date. Only the submission deadline is stated.

**Submission**
- PPT shared from Google Drive, set to "Anyone with the link".
- Public GitHub repository.
- The lead submits at /submit with the registration ID, registered email and submission code from the confirmation email. Links can be updated until the deadline.
- No demo video is required, so the PPT and the repo's README carry the demo.

**Judging:** no rubric published. Signals from the award text: technical maturity, clinical validity, rural adoption potential, practical utility for smallholders. Organisers pick the top 10. Finale slot: 5 min pitch + 3 min jury Q&A + 1 min changeover.

**Awards:** prizes "pending announcement". Categories: Grand Winner, Most Innovative AI Solution, Rural Impact & Grassroots Award, Women-Led Team Honor. All participants get a virtual certificate.

**Pending per FAQ:** logistics, jury names, dataset specifications, briefing schedule.

**The 12 tracks**
1. LSD & Mastitis Detection (edge CV)
2. Voice-First Advisory in Hindi & Rajasthani
3. Heat Stress Monitoring (THI, sensors)
4. AMR Tracking & Stewardship
5. One Health Dashboard (geospatial)
6. **Ration Balancing Calculator (least-cost, local forage)** ← chosen
7. SHG & FPO Collectivization Tools
8. Computer Vision for Lameness Detection
9. Alternatives to Liquid Nitrogen for Semen Storage
10. Livestock Waste Biorefinery
11. Indigenous Breed Conservation
12. Zero-Antibiotics Livestock System

---

## 2. Track decision

**Chosen: T6, Ration Balancing Calculator.** Focus: regional impact near Jaipur, mathematical least-cost ration balancing (two-stage LP), strict bilingual auditability, and offline reliability for rural smallholders.

Why not the others:
- T2 voice: high ambient noise in rural sheds impairs ASR accuracy; an offline-first visual audit sheet provides paravets and vets with verifiable proof.
- T1/T8 CV: cattle shed lighting and motion blur challenge mobile CV; ration balancing directly targets the farmer's largest expense (65–70% of milk production cost).
- T12/T4 antibiotics: requires longitudinal farm monitoring and lab bacteriology data.
- T3 heat stress: open meteorological stations are sparse across rural Rajasthan.
- T5 One Health: no open disease outbreak dataset exists.
- T7 SHG/FPO: primarily an operational management problem.
- T9/T10: requires wet-lab biotech infrastructure.
- T11 breeds: limited open nutritional performance registries.

---

## 3. What exists already + data fact-check (2026-10-12)

**Data**

| Need | Source found | Verified? | Gap |
|---|---|---|---|
| Feed composition | NDDB, *Nutritive Value of Commonly Available Feeds and Fodders in India* (Animal Nutrition Group, July 2012). Tables 1–5, book pp. 80–98: CP, EE, CF, NFE, Ash, NDF, ADF, lignin, **ME (Mcal/kg)**, all on DM basis; Ca, P and trace minerals. About 30 concentrates, about 150 roughages, plus unconventional feeds. Hindi and other local names appear in the text. | Yes, read the PDF tables | **No TDN column**: use ME, or derive TDN ≈ ME × 27.7 (from ME = 0.82 × DE and DE = 4.409 × TDN) and label it derived. **No DM% for fresh fodder**, which is needed for kg as fed. Image tables mean manual transcription. NDDB copyright with no stated licence, so cite it and copy only the rows used. |
| Feed composition (backup) | Feedipedia (INRAE/CIRAD/AFZ/FAO), about 1,400 feeds. Reuse allowed for research, teaching and non-commercial use with attribution. | Copyright page read | Not India-specific values |
| Nutrient requirements | ICAR 2013 *Nutrient Requirements of Cattle & Buffalo* (Tables 4.1, 4.2, 5.1, 5.2, 6.1) and CELKAU Dairy Nutrition Standards for maintenance (4.15 g CP, 0.145 Mcal ME / kg BW^0.75; 0.07 g Ca, 0.05 g P / kg BW) and tropical dairy lactation formulas. NRC 2001 Chapter 1 for dry matter intake ceiling (k0 + kY*Y). | Yes, verified and cited | Fully verified in requirements.json with exact chapter/table citations. |
| Feed prices | Agmarknet (site reachable). data.gov.in daily mandi API (resource 9ef84268-d588-465a-a308-a864a43d0070) was **unreachable** from here, and one source says the API does not exist. Cotton seed and oil cakes appear in old Agmark lists. | No | Wheat bran, bhusa and green fodder not confirmed. |
| Hackathon datasets | FAQ: "dataset specifications… pending" | Yes | None provided. Bring your own. |
| Test animals / validation | None public. Goswami et al. 2013 (LP least-cost diets on small farms in Central India) can serve as a benchmark. | Search only | Hand-make 10–20 test profiles |

**Existing solutions (novelty risk: high)**

| Exists | What it does | Implication |
|---|---|---|
| NDDB Ration Balancing Programme / INAPH | National scale, delivered by trained Local Resource Persons (LRPs) carrying netbooks; least-cost ration from local feeds; local-language output; offline mode. Net gain ≈ ₹25.5 per animal per day (₹16.3 lower feed cost + ₹9.2 more milk and fat) under NDP-I, 33,374 villages. | Proves the impact; needs a trained intermediary. |
| NDDB Pashu Poshan app | Ration balancing by species, age, milk yield, fat and feeding regime | Same core maths |
| ICAR Feed Assist | LP expert system for small farmers | Same core maths |
| BASU Feed App (Bihar Animal Sciences University) | Balanced, cost-effective rations for cows and buffaloes, Hindi/English | Same core maths |
| **Pashudhan Nutri AI** (pashudhan-nutri-ai.web.app, PyPI `pashudhan-ai` v0.5) | Commercial API: ICAR-NDRI/NASEM 2021 equations, LP, "AI Nutritionist critique", state/month regional databases, WhatsApp, B2B white-label for cooperatives. "Zero formulation logic is exposed." | **Nearly the same pitch, but closed.** |
| Open source | No Indian dairy LP repo found (WorldOfRations is generic and commercial) | Gap we fill |

"LLM + LP ration planner" is not novel, so the differentiation has to be the angle below. The team kept T6 knowing this.

**Sharpened angle: the open, auditable ration copilot.**
NDDB RBP needs a trained field worker, and Pashudhan Nutri AI is a closed box. SahiDana is open source, and every number on screen traces to either (a) a cited source row (NDDB table and page, or the requirements standard and page) or (b) the solver output. The explanation is checked so it contains no number that isn't one of those. Pitch line: **"a ration a vet can audit in 30 seconds."** The audit trail is a visible UI feature, not just an internal check.

---

## 4. The idea: SahiDana, where the AI explains and the solver decides

Tagline: **"Sahi dana, har number ka hisaab."** (Right feed, every number accounted for.) "Sahi" means right; "dana" is cattle concentrate feed.

**Pipeline**
1. **Understand:** the farmer or extension worker describes the animal and the feeds on hand in free text. An LLM tool call extracts structured inputs: species, body weight, milk yield, fat %, feeds on hand, prices.
2. **Require:** look up nutrient requirements (DM, CP, energy, Ca, P) from the standard chosen in §5, showing source and page.
3. **Solve:** a linear program (PuLP or `scipy.optimize.linprog`) finds the least-cost ration that meets the constraints. If none exists, it says so and names the missing nutrient.
4. **Explain + verify:** the LLM explains the ration. Every number in the text is checked against solver output and source rows, the same grounding check as ToolkitBuildabilityResearch and FinancialIntelligenceCopilot.
5. **Show:** the ration in kg per day, cost per day, savings against the farmer's current feeding, a nutrient-coverage chart, and a click-through audit trail for each number.

**Proof metrics**
- Constraint satisfaction: 100% on N test animals
- Average % cost saved against a stated baseline ration
- Extraction accuracy on 30 hand-labelled farmer descriptions
- 0 unverified numbers in explanations

**Portfolio mapping:** reuses the SciPy optimiser from DentsuQcomDeck, the FastAPI + Docker + Cloud Run pattern from FinancialIntelligenceCopilot and CustomerSupportAnalytics, and the grounding/verification idea from ToolkitBuildabilityResearch and the Exasol entry. New skill: an LLM agent driving an OR solver.

---

## 5. Data plan

- **Feeds:** transcribe about 25–30 common Rajasthan/North-Indian feeds (wheat straw, green berseem, green maize, bajra, mustard/rapeseed cake, cottonseed cake, wheat bran, maize grain, guar meal, mineral mixture…) from NDDB Tables 1, 2, 4 and 5: CP, ME, Ca, P on DM basis, plus a `source_page` column.
- **DM% of fresh fodders:** from a second cited source.
- **Energy:** the constraint uses ME. Derived TDN is display-only and labelled "derived".
- **Requirements:** maintenance from the CELKAU/ICAR table by body weight. For milk per kg by fat %, first try to verify the ICAR 2013 values in a peer-reviewed paper; if that fails, use NASEM 2021 (free at nap.edu) and say so.
- **Prices:** user-entered, with a default table carrying a source and date per price.

---

## 6. Open risks

1. Every feed value needs a citation (table + page); a transcription error is a visible audit failure.
2. The requirement values or equations must be checked against the source before the demo.
3. The LLM must never produce nutrient values. Only the solver and the source table do.
4. Domain check: get a vet or dairy-science teammate, or at least sanity-check against the NDDB RBP examples.
5. Prizes and rubric are unknown; judges are likely vets and dairy experts who know NDDB RBP, so be ready for "how is this different?" (answer: §3 angle).
6. Top 10 means an in-person trip to Jaipur on 28 Oct.
7. Time: 3.5 days from 2026-10-12.
8. **Bilingual UI (decided 2026-10-12):** the UI shows Hindi and English side by side on every label, because the paravet ICP reads Hindi. This reverses the "no Hindi" constraint in §2. A native-speaker teammate must review the Hindi strings file on Wed 14 Oct; until then the strings are unverified. The LLM explanation stays English; free-text input may be Hindi/Hinglish.

---

## 7. Team split (12–15 Oct)

- **Jegadeesh:** solver, LLM agent, verification, API.
- **Teammate A:** feed and requirement tables with citations; 10–20 test animals; 30 labelled farmer descriptions.
- **Teammate B:** PPT, problem framing, UI polish, GitHub README.
- **Native Hindi speaker (teammate):** review the Hindi strings file on Wed 14 Oct.

| Day | Milestone |
|---|---|
| Mon 12 Oct | Register; teammates confirmed; repo created; feed table started |
| Tue 13 Oct | Solver working on the feed table, with tests on test animals |
| Wed 14 Oct | LLM extraction + explanation + number verification; UI with audit trail |
| Thu 15 Oct | Metrics run; README; PPT on Drive; submit by evening (not 11:59 PM) |

**Cut list if behind (in order):** drop the default price table (user enters prices) → drop free-text input (form only) → drop the savings-vs-current comparison.

---

## 8. Next steps

- [x] Register the team (done 2026-10-12).
- [x] Confirm 2–4 teammates (team registered).
- [ ] Create a public GitHub repo `sahi-dana` (add `.env` to `.gitignore` first).
- [ ] Transcribe the feed table from NDDB with page citations.
- [ ] Pick and verify the milk-requirement standard.
- [ ] Write the build plan.
- [ ] PPT on Drive ("Anyone with the link") by the evening of 15 Oct.

---

## Sources

- Event page: https://impacthackathon.com/ · submission: https://impacthackathon.com/submit
- NDDB Ration Balancing Programme: https://www.nddb.coop/services/animalnutrition/programmes/ration-balancing-programme
- NDDB feeds booklet: https://www.nddb.coop/sites/default/files/pdfs/Animal-Nutrition-booklet.pdf
- INAPH brochure: https://www.dairyknowledge.in/sites/default/files/inaph_brochure.pdf
- Pashu Poshan: https://dairyknowledge.in/dkp/node/1985
- BASU apps directory: https://basu.org.in/directory-of-mobile-apps/
- ICAR Feed Assist: https://krishi.icar.gov.in/jspui/handle/123456789/12964
- Feedipedia copyright: https://www.feedipedia.org/content/copyright
- CELKAU nutrient requirements: https://old.celkau.in/Animalhusbandry/Cattle/nutrientmanagement.aspx
- ICAR 2013 standard (sale page): https://www.icar.org.in/en/product/73
- Pashudhan Nutri AI SDK: https://pypi.org/project/pashudhan-ai/
- data.gov.in mandi prices: https://data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi
- Goswami et al. 2013 (LP diets, Central India): found in a search summary only; URL not yet located.

---

## 9. Decision log: re-grounding on the Track 6 card (2026-10-12)

**What the card says:**
- Scope: least-cost daily rations from indigenous forage, seasonal crop residue and local agro-byproducts, "to maximize milk yield while reducing dairy maintenance expenditure".
- D.01: LP optimizer. D.02: regional crop byproduct library. D.03: offline PWA for **field paravets**.

**Decisions:**
- **Solver:** max milk within a ₹/day budget, then the cheapest ration at that milk.
- **Breed:** the breed-cited milk potential caps the solver. Body weight sets intake only, because no standard predicts milk from weight.
- **Verdict:** a factual room-for-improvement verdict and a fat comparison.
- **Library:** about 30 Jaipur feeds in three verticals, with months, NDDB citations and dated, editable prices labelled by reliability. No live price API.
- **UI:** simple by default, with a language toggle, one language per screen.

**Superseded from §5 and §8 above:**
- the generic 25–30 North-India feed list;
- the user-entered-only prices;
- the side-by-side bilingual UI.

**Full detail:** `docs/FEEDBACK.md` Round 3, `docs/DATA_SOURCES.md`.

---

## 10. Decision log: ship-ready change (2026-10-14)

- **Hindi review:** the native-speaker review planned for Wed 14 Oct (§6 item 8, §7) has not happened. Hindi strings stay marked unverified (`HINDI_REVIEW` in `src/i18n/strings.ts`) until a review is recorded.
- **Breed milk cap labels:** the app no longer calls any cap a "peak". `cited_peak` breeds show "Cited breed benchmark"; `range_top` and `breed_average_calc` breeds show "Breed benchmark (calculated from cited figures)"; non-descript breeds keep "National average". Numbers are unchanged; Murrah's 9.64 L is the upper value of reported study means and still needs checking against CIRB.
- **Verification status:** every feed, breed and requirement row has `verifiedOn` empty. The audit drawer shows "Expert check: pending" on these cited figures, including the forced mineral mixture and salt minimums (team-asserted). It is hidden on figures the user typed (own prices).
- **Deploy:** live at https://sahidana.vercel.app (Vercel project `sahidana`). No OpenRouter key on the server yet, so Explain uses the template and Fill from description is unavailable there.
- **Known gap:** the offline font E2E test runs on the dev server, which has no service worker, so it does not prove offline font self-hosting. Testing a production build is deferred.
- **Deadline extended (user, 2026-10-15):** submission now closes Sun 18 Oct 2026, 11:59 PM IST.

## 11. Decision log: farmer-first flow, Change 3 (2026-10-15)

- **Flow:** cow or buffalo, then budget, then Calculate. Feeds the farmer already has are optional and used first at their price and cap; the solver fills the gap from in-season library feeds that have a cited price.
- **Wording:** "Your cow or buffalo" / "आपकी गाय या भैंस" replaces "Animal".
- **Feeds to buy:** an upgrade ladder, cheapest first (by ₹/day in the final ration); every rung is a real solver run.
- **Budget prompt:** "Add ₹X/day" where X = least-cost ration at the effective cap with no budget, minus the budget (a solver output).
- **No invented caps:** library feeds get no per-feed inclusion caps, because none are cited.
- Work on branch `feat/farmer-flow`; merge to `main` after both milestones are accepted.
