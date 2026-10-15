# Feedback

## Round 1 (prototype, 2026-10-12)

| # | Feedback (user's words) | Class | Action |
|---|---|---|---|
| 1 | "The look is terrible and boxy. I want it to look simple, clean, visually not so bright and have modern design, and lesser contrast." | UI | Replace the Feed-Sack Analysis Panel visual direction with a calm, modern, low-glare direction. Layout, behavior, content, states and bilingual rules stay as built. Text stays at WCAG 2.2 AA (≥ 4.5:1); contrast is reduced on frames, fills and accents, not on reading text. |
| 2 | "Also lets keep toggle based language switch, that will look better." | Contract | Replace side-by-side bilingual UI with a Hindi/English toggle. Default English on first open; the choice is remembered on the device (offline). Reverses ADR-0005 decision 1 and SPEC AC-L1.1 ("no toggle"): SoftwareArchitect writes a superseding ADR at the freeze and ProductAnalyst updates AC-L1. Prototype builds it now (architecture still DRAFT). |

**Round 1 decisions (user, 2026-10-12):**
- Reference register: calm health apps (Apple Health, Google Fit). Soft off-white ground, rounded cards with gentle shadows, one muted green accent, large friendly numbers.
- Contrast: soft but readable. Remove heavy black frames, saturated yellow and pure black; body and label text still meets WCAG 2.2 AA (≥ 4.5:1) for outdoor use.
- Replaces the Feed-Sack Analysis Panel direction (seed 18e66e46). The new direction is in `.impeccable/surfaces/src-app-tsx.md`.
- Language (item 2): toggle "हिंदी | English" in the app bar, default English, remembered per device. Numbers stay Latin digits in both; the strings file keeps { hi, en } pairs; the LLM explanation stays English.

## Round 2 (prototype, 2026-10-12)

| # | Feedback (user's words) | Class | Action |
|---|---|---|---|
| 1 | "The UI looks good, I just need a little more vibrance for the green." | UI | Make the accent green more saturated and vivid while white button text keeps ≥ 4.5:1. |
| 2 | "Don't mix the languages, keep English only or Hindi only." | UI | Remove the secondary other-language line everywhere (feed names, feed selector, transliterations). English mode shows English only; Hindi mode shows Hindi only. Search still matches all forms behind the scenes. Units `kg`, `L`, `₹` and Latin digits stay in both (ADR-0005). The toggle labels and the brand tagline are exempt. |
| 3 | "What about the mobile friendly screen and desktop friendly screen, or are we primarily keeping desktop?" | Question / UI | Answer: mobile-first (paravet's phone) is primary; desktop is the secondary audit layout. Fix the desktop layout: Balance button inline under the Feeds card on ≥ 1024px (sticky bottom bar on phones only), and no nested scrollbar inside the result card. |

## Round 3 (re-grounding on the Track 6 card, 2026-10-12)

Source: the official Track 6 card. "Formulate algorithmic nutritional balancing tools that calculate least-cost daily feeding rations utilizing indigenous forage, seasonal crop residue, and local agro-byproducts to maximize milk yield while reducing dairy maintenance expenditure." D.01 Linear programming optimizer for least-cost nutrition; D.02 Comprehensive regional crop byproduct library; D.03 Offline progressive web app for field paravets. Research: `docs/DATA_SOURCES.md`.

| # | Feedback / decision (user) | Class | Action |
|---|---|---|---|
| 1 | Build around the three verticals near Jaipur: indigenous forage, seasonal crop residues, local agro-byproducts, with prices. | Contract | Regional library of about 30 feeds with `vertical`, `availableMonths`, `seasonNote`, `priceReliability`; cited, dated, editable default prices (no live price API). |
| 2 | "Max milk within a budget." | Contract | Two-stage LP: stage 1 maximises supported milk within the budget ₹/day; stage 2 finds the cheapest ration at that milk. Budget defaults to today's ration cost when entered. |
| 3 | "Calculate the milk potential using a standard milk potential for a breed according to its weight, take the current milk and fat and tell if there is room for improvement." | Contract | New breed input. Milk cap = top of the breed's cited lactation range ÷ lactation length (else the breed wet average; non-descript uses the DAHD average). Research found no standard that predicts milk from body weight, so body weight sets the dry-matter intake ceiling. Factual verdict on room for improvement and a fat comparison; no veterinary advice. |
| 4 | Feed picker season-aware and grouped by the three verticals. | Behavior | Groups Indigenous forage / Crop residues / Agro-byproducts / Mineral; month selector defaults to the current month; in-season feeds marked; out-of-season still selectable. |
| 5 | "If our customers are farmers the app should be very simple." D.03 confirms the user is the field paravet. | UI | Simple by default: per-feed caps, nutrient bars and the full audit move behind "Show details"; every number stays tappable. |

**Round 3 decisions on SPEC open questions (user, 2026-10-12):**
- OQ2: when the budget supports less milk than today (today below the cap), state it and give the budget needed to keep today's milk, e.g. "This budget supports 6.2 L/day, less than today's 8 L. Keeping 8 L needs ₹245/day." The cheapest cost at today's milk comes from the stage-2 solve with Y fixed at today's milk.
- OQ3: treat 1 kg of milk ≈ 1 L, with the assumption stated in the audit sheet.
- OQ4 and OQ5: ProductAnalyst's assumptions accepted. Breeds with no cited range use yield ÷ length; crossbreds use top yield ÷ shorter length; Z is costed at today's milk.

**Round 3 decisions on architecture review findings (2026-10-12):**
- **Milk cap (user):** the breed's cited **peak daily yield** where published (e.g. Murrah 9.64 = top of cited study means, Nili-Ravi 9.4 = cited mean peak, Sahiwal 11.15, Bhadawari 6.93, per DATA_SOURCES §5; an individual-animal range is not a breed peak). Otherwise the existing rule (range top ÷ length, else average, else DAHD), labelled "lactation average (no peak cited)". New `capBasis` value `cited_peak`.
- **Roughage minimum (user):** add an LP constraint that roughage dry matter (indigenous forage + crop residues) is at least a cited share of total DM. The share comes from ICAR/NDDB guidance, found and verified in the data task, and is shown in the audit. If no citation is found, stop and ask the user.
- **Orchestrator decisions on the remaining items** (precedence: correctness, then UX):
  - S is rounded **down** to 0.1, so S ≤ Y* ≤ cap.
  - Whenever S < T, the shortfall line "Keeping T L needs ₹B/day" is shown, including when T ≥ cap. It overrides "at breed level".
  - Breed Hindi names live in `data/breeds.csv` (team-asserted, reviewed 2026-10-14).
  - Season and price notes are {en, hi} pairs.
  - If Stage 2' (milk fixed at T) is infeasible, the verdict shows no saving.
  - A dry animal (T = 0 L) skips Stage 1, gets the cheapest maintenance ration, and shows the verdict "Dry animal: maintenance ration".
  - Feeds with no default price are not suggested in E7.1.
- **Effective cap (orchestrator, correctness, OQ15):** effective cap = max(breed cap, T). An animal already giving more than the cited breed figure has shown it can, so the shortfall line only appears when the **budget or feeds** limit milk below T, never because of the cap. When T > breed cap and the budget keeps T, the verdict is "above the breed level; same milk for ₹Z less". The audit shows both the breed cap and "today's milk is higher, so it is used as the cap".
- **OQ16 data correction (orchestrator):** Nili-Ravi peak is 9.4 (cited mean; 7.2–11.8 is the individual range). Bhadawari row added to DATA_SOURCES §5. `data/breeds.csv` stays the authority after the human check.
- **Verdict comparison (orchestrator, correctness):** verdicts compare the unrounded Y* with T (tolerance 1e-6), not the displayed S, so rounding down never triggers the shortfall line on its own.

## Round 4 (prototype accepted, 2026-10-12)

| # | Feedback (user's words) | Class | Action |
|---|---|---|---|
| 1 | "accepted but i would like a one line how to use section on top so anybody using it can do" | UI | Add a concise one-line "How to use" banner at the top of the workspace (below the app bar, above the main inputs) in the active language (`src/i18n/strings.ts`, English and Hindi). Prototype is accepted. |

## Round 5 (Change 3 request, 2026-10-15)

| # | Feedback (user's words, condensed) | Class | Action |
|---|---|---|---|
| 1 | "order of the cards in the left to be Animal then budget then feeds" | UI | C3-M1: reorder to cow/buffalo, budget, feeds. |
| 2 | "i dont like the word Animal cuz farmers wouldnt like it" | UI | C3-M1: "Your cow or buffalo" / "आपकी गाय या भैंस" (user's choice). |
| 3 | "i would have the two milk comparison side to side" | UI | C3-M1: today's milk and the supported milk as two tiles in one row. |
| 4 | "move the demo mode somewhere else" | UI | C3-M1: demo moves below the Calculate button as "Try an example". |
| 5 | Farmer fills the cow, then the budget, then calculates directly; optional dropdown to add feeds they have; solver optimises within budget including those feeds | Contract | C3-M2: library-wide candidate set, owned feeds used first (user's choice), new `rationPlan` module. |
| 6 | Tell them what to add, cheapest to best; if budget is the constraint, say increase by X for the best result | Contract | C3-M2: upgrade ladder (user's choice) and the `costAtCapInrPerDay` solver field behind "Add ₹X/day". |
