# SahiDana Functional Specification

Functional specification, user journeys, and automated acceptance criteria for SahiDana, derived from [PROJECT_MENTAL_MODEL.md](PROJECT_MENTAL_MODEL.md), [FEEDBACK.md](FEEDBACK.md) (Rounds 1–3) and [DATA_SOURCES.md](DATA_SOURCES.md), and realized by [ARCHITECTURE.md](ARCHITECTURE.md) and [TASKS.json](TASKS.json). Last updated: 2026-10-12 (Round 3 re-grounding on the official Track 6 card).

## 1. Summary

- **Vision:** SahiDana ("Sahi dana, har number ka hisaab.") is an open, auditable, offline-first ration tool for field paravets, built on the Track 6 card: least-cost daily rations from indigenous forage, seasonal crop residues and local agro-byproducts that maximize milk yield while reducing maintenance spend. The paravet enters the animal (species, breed, body weight, today's milk and fat), a daily budget, and the feeds on hand. An in-browser two-stage linear programming (LP) solver answers two questions: how much milk this budget can support with these feeds (never above the cited breed potential), and the cheapest ration that supports it. The result leads with "This budget supports X L/day", compares it with today's milk and the breed benchmark, and gives a factual room-for-improvement verdict. Feeds come from a cited Jaipur-area library of about 30 feeds in three verticals (Indigenous forage, Crop residues, Agro-byproducts) plus Mineral, with season months and dated, editable default prices. When online, an LLM can fill the form from a free-text description and explain the result in plain English; every number in that explanation is verified against the solver output, the inputs, or a cited source row.
- **Simple by default:** The result screen shows the headline, the verdict, the ration and its cost. Per-feed max caps, nutrient coverage bars and the full audit sit behind **Show details**. Every number stays tappable to its source or its solver constraint.
- **Language:** A Hindi/English toggle in the app bar. The app opens in English, remembers the choice on the device, and shows one language per screen. Numbers always use Latin digits (`0`–`9`) with the units `kg`, `L`, and `₹`. The free-text description accepts Hindi, Hinglish, or English. The LLM explanation stays English.
- **Posture:** Prototype: the thinnest working path per milestone, with thorough automated test coverage on the LP solver and the explanation number-verification check because they back the product's core auditability claim.
- **Target Persona:**
  - **Primary:** Field paravet or extension worker in Rajasthan / North India (Track 6 D.03) operating on a basic Android phone with patchy connectivity at the farmer's doorstep.
  - **Secondary:** Veterinarian or evaluator/judge auditing the result and its underlying nutritional, breed and cost numbers.

## 2. User Journeys

### Primary Journey: Max Milk Within a Budget, Audit, and Explanation

1. **Launch App (Offline or Online):** The paravet opens the installed SahiDana progressive web app (PWA) on their phone or browser, online or offline. The app opens in English on first use (or in the language last chosen on this device). They see the workspace, the connectivity status, and the **हिंदी | English** toggle.
2. **Enter Animal Profile (Manual or AI-Assisted):**
   - **Manual entry (online or offline):** The paravet selects the species (`cow` or `buffalo`), then the **breed** from a list filtered by species: cattle Rathi, Tharparkar, Nagori, Gir, Kankrej, Sahiwal, Hariana, HF crossbred, Jersey crossbred; buffalo Murrah, Nili-Ravi, Surti, Mehsana; plus "Non-descript" for either species ([DATA_SOURCES §5](DATA_SOURCES.md)). The selected breed's cited benchmark (milk potential in L/day, the basis it came from, and fat %) appears under the field. They enter body weight (`kg`), today's milk yield (`L/day`) and fat (`%`).
   - **Free-text extraction (online only):** The paravet sees a disclosure notice that free-text prompts are sent to OpenRouter and free models may log prompts. They type or paste a description in Hindi, Hinglish, or English (e.g., *"450 kg Murrah buffalo giving 8 litres milk with 6.5% fat, has wheat bhusa, bajra, and mustard cake"*, or *"450 kilo ki Murrah bhains 8 litre doodh deti hai, 6.5% fat, gehun ka bhusa aur sarson khali hai"*) and tap **Fill from description**. The app fills the animal fields (including breed when one from the list is named), candidate feeds and, if stated, the budget, in a prefilled state, and asks the paravet to review and confirm before balancing.
3. **Select Feeds on Hand:** The paravet opens the feed picker. Feeds are grouped under **Indigenous forage**, **Crop residues**, **Agro-byproducts** and **Mineral**. A month selector above the list defaults to the current month; feeds in season near Jaipur in that month carry an "in season" mark, and out-of-season feeds stay selectable. Search matches English, transliterated and Devanagari names (e.g., *Wheat straw / Bhusa / भूसा*, *Mustard cake / Sarson khal / सरसों खल*). For each selected feed, the default price (`₹/kg`) is shown with its date, source and reliability label (prices from listings are labelled "indicative"), and the price is editable. Behind **Show details** the paravet can set an optional maximum `kg/day` (as fed) per feed.
4. **Enter Today's Ration and the Budget:** The paravet optionally enters today's ration (`kg/day` per selected feed); the app shows today's cost in `₹/day`. The **budget** (`₹/day`) defaults to today's cost when today's ration is entered; otherwise the paravet must enter it.
5. **Balance Ration:** The paravet taps **Balance ration**. The solver works in two stages, described to the user as:
   - **Stage 1:** find the most milk the selected feeds can support within the budget, never above the effective cap: the breed's milk cap, or today's milk if that is higher (an animal already giving more has shown it can). The breed cap is the breed's cited peak daily yield where one is published; otherwise a lactation average (top of the cited lactation range ÷ lactation length, else the breed's average daily yield); for a non-descript animal, the DAHD national average. Body weight limits how much the animal can eat (dry-matter intake); it does not set the milk cap.
   - **Stage 2:** find the cheapest ration that supports that milk.
   - In both stages, roughage (indigenous forage plus crop residues) must make up at least the cited minimum share of the ration's dry matter.
   - For a dry animal (today's milk `0 L/day`), stage 1 is skipped and the app gives the cheapest maintenance ration.

   The result shows, in this order:
   1. The headline **"This budget supports X L/day"**, with today's milk and the breed benchmark beside it.
   2. The room-for-improvement verdict, one of: **"+X L/day possible"**; **"Already at the breed level; same milk for ₹Z less"** (or **"Above the breed level; same milk for ₹Z less"** when today's milk is above the breed cap); **"This budget supports S L/day, less than today's T L/day. Keeping T L needs ₹B/day."**; **"Dry animal: maintenance ration"**; or **"Budget below the maintenance cost ₹M/day"**.
   3. Today's fat % against the breed's cited fat % (or "not cited"), stated as a fact with no advice.
   4. The caveat line: "Feed supports this milk; the actual gain depends on stage of lactation and health."
   5. The ration in `kg/day` (as fed) per feed and its cost in `₹/day`, against the budget and against today's cost.
6. **Show Details and Audit Any Number:** The paravet or auditing judge taps **Show details** to see the per-feed caps, the nutrient coverage bars (`DM`, `CP`, `ME`, `Ca`, `P`, supplied against required), and the full audit, and taps it again to hide them. In either state, tapping any number opens the audit drawer showing either the citation (NDDB / ICAR / breed source table and page, with the formula) or `"Solver output"` plus the LP objective or constraint it satisfies. The audit for the supported milk names the binding constraint: the budget, the breed cap (or today's milk, when it is used as the cap), the intake limit, the roughage minimum, or a named nutrient.
7. **Generate Verified Plain-English Explanation (Online Only):** The paravet taps **Explain**. The app requests a plain-English explanation and verifies every number in it against the solver output, inputs, or cited source rows. A verification badge (`"All N numbers verified"` or the template fallback badge) is shown in the active UI language; the LLM explanation body stays English.
8. **Copy Text Summary:** The paravet taps **Copy summary** to copy a plain-text summary (animal and breed, supported milk, verdict, ration, cost, budget, citations) for sharing via WhatsApp or SMS.

## 3. Acceptance Criteria

Unless a criterion says otherwise, quoted UI strings are the English-mode text; the Hindi-mode text comes from the strings file (L1).

**Shared definitions used by the criteria:**
- **Milk cap (`cap`)** for a breed, in L/day, taken from the first rule that applies (breed rows in `data/breeds.csv`, sourced per [DATA_SOURCES §5](DATA_SOURCES.md)):
  - (1) when the breed table has a cited **peak daily yield**: that peak, which is a cited mean or the top of a range of study means, never the top of an individual-animal range. `capBasis` `cited_peak`; label "cited peak daily yield".
  - (2) otherwise, a lactation average, labelled "lactation average (no peak cited)", with the sub-rule shown in the audit:
    - (a) when the source cites a lactation yield range: top of the yield range ÷ cited lactation length; when the length is also a range (HF crossbred, Jersey crossbred), top of the yield range ÷ the shorter cited length. Sub-rule `range top`.
    - (b) otherwise, when the source cites an average daily yield: that average. Sub-rule `breed average`.
    - (c) otherwise, when the source cites only lactation yield and length (Gir, Kankrej, Surti, Mehsana): lactation yield ÷ length. Sub-rule `breed average (calc)`.
  - (3) for "Non-descript": the DAHD average for the species (cattle `3.86`, buffalo `4.73`, pending verification per [DATA_SOURCES §5](DATA_SOURCES.md)). Label "national average (DAHD)".
  - Breed sources give milk in kg; the app treats **1 kg of milk ≈ 1 L**, and the audit sheet for every breed figure states this assumption.
- **Today's milk (`T`)**: the milk yield entered in L/day.
- **Roughage minimum (`r`)**: the cited minimum share of total ration dry matter that must come from roughage, meaning feeds in the Indigenous forage and Crop residues verticals. The value and its ICAR/NDDB citation come from the data task. In every solver stage, roughage DM ≥ `r` × total DM.
- **Maintenance cost (`M`)**: the cost in `₹/day` of the cheapest ration from the selected feeds (with their caps, prices and the roughage minimum) that meets the animal's requirements at `0 L/day` milk.
- **Stage-1 optimum (`Y*`)**: the unrounded largest milk found by stage 1.
- **Effective cap (`effCap`)**: `max(cap, T)`, the upper bound on milk in stage 1. When `T > cap`, the audit shows the breed `cap` (with its basis and source) and the line "today's milk is higher, so it is used as the cap". The breed `cap` itself is unchanged and is still the value shown as the breed benchmark. A cited breed peak in `data/breeds.csv` is a mean, or the top of a range of study means, never an individual-animal range.
- **Supported milk (`S`)**: `Y*` rounded **down** to `0.1` L/day, so `S ≤ Y* ≤ effCap`. The displayed ration is the stage-2 ration at `S`.
- **Keeps today's milk**: `Y* ≥ T − 1e-6`. **Below today's milk**: `Y* < T − 1e-6`. Verdicts compare `Y*` (not the rounded `S`) with `T`, so rounding alone never triggers the shortfall verdict.
- **Stage 2′**: stage 2 run with milk fixed at `T` (no budget limit, not bounded by the cap), used for `Z` (AC-5.7) and `B` (AC-5.11).
- **Reference cost**: today's ration cost when today's ration is entered, otherwise the budget.

### Journey Step Criteria

#### Step 1: Launch App (Offline or Online)
- **AC-1.1 (App shell loads online and offline):** *(changed: library size and breed table)*
  - **Given** the SahiDana web app has been loaded once or installed as a PWA,
  - **When** the user opens the application with network connectivity enabled or disabled,
  - **Then** the application renders the complete form, the regional feed library (about 30 cited feeds) and the breed table without network errors.

#### Step 2: Enter Animal Profile (Manual or AI-Assisted)
- **AC-2.1 (Manual animal profile entry):** *(changed: breed added)*
  - **Given** the user is on the animal profile section,
  - **When** they select species (`cow` or `buffalo`), select a breed, and enter valid body weight (`150`–`800` kg), milk yield (`0`–`40` L/day), and fat (`2.5`–`10`%),
  - **Then** the app accepts the inputs with no validation errors and computes the animal's daily nutrient requirements (`DM`, `CP`, `ME`, `Ca`, `P`) and its dry-matter intake ceiling from body weight.
- **AC-2.2 (OpenRouter privacy notice on free-text input):**
  - **Given** the user views the free-text extraction section,
  - **When** the free-text input area is rendered,
  - **Then** a visible notice states that free-text input is sent to OpenRouter and that free models may log prompts.
- **AC-2.3 (Online free-text extraction and mandatory confirmation):** *(changed: breed and budget)*
  - **Given** the device is online and the user enters a free-text description and taps **Fill from description**,
  - **When** the extraction service returns structured animal parameters, matched library feeds, and optionally a breed and a budget,
  - **Then** the form fields are populated in an unconfirmed prefilled state; a breed is filled only if it matches an entry in the breed list for the extracted species (otherwise the breed field stays empty); and the user must explicitly tap a confirmation action before the prefilled values are used for balancing.
- **AC-2.4 (Breed list and cited benchmark):** *(new)*
  - **Given** the user has selected a species,
  - **When** they open the breed field,
  - **Then** it lists exactly the breeds of that species from [DATA_SOURCES §5](DATA_SOURCES.md) plus "Non-descript"; and after a breed is selected, the benchmark shows the breed's `cap` in L/day with its basis label ("cited peak daily yield" for a breed with a cited peak, e.g. Sahiwal; "lactation average (no peak cited)" otherwise) and the breed's cited fat % (or "not cited"); and tapping the cap opens the audit drawer with the source document, table and page, the cited figure(s), the rule applied per the cap definition above (for a lactation average, the sub-rule and the division used), and the line "1 kg of milk ≈ 1 L (assumption)". A breed with a cited peak never uses a lactation average.
- **AC-2.5 (Non-descript animal uses the DAHD average, labelled as an average):** *(new)*
  - **Given** the user selects "Non-descript" for `cow` or `buffalo`,
  - **When** the benchmark is shown and the ration is balanced,
  - **Then** the `cap` equals the DAHD average for that species (cattle `3.86`, buffalo `4.73` L/day), the benchmark label reads "national average (DAHD)" rather than a breed potential, and the audit drawer for the cap cites DAHD *Basic Animal Husbandry Statistics* with the year of the figure and states "1 kg of milk ≈ 1 L (assumption)".

#### Step 3: Select Feeds on Hand
- **AC-3.1 (Search feed library by English, transliterated or Devanagari name):** *(changed: one language shown)*
  - **Given** the regional feed library is loaded, in either UI language,
  - **When** the user types an English name (e.g., `"Mustard"`), a transliterated name (e.g., `"Sarson"` or `"Bhusa"`), or a Devanagari name (e.g., `"सरसों"`) into the feed search box,
  - **Then** the list filters to the same matching feed(s) for all three query forms, each shown with its name in the active UI language only.
- **AC-3.2 (Feed selection with an editable cited default price):** *(changed: max cap moved to AC-6.3)*
  - **Given** the user selects a feed from the library,
  - **When** the feed is added to the active feed list,
  - **Then** its default `₹/kg` price is prefilled when the library has one, and the user can edit the `₹/kg` value; a feed with no default price shows an empty price field.
- **AC-3.3 (Feeds grouped by the three verticals plus Mineral):** *(new)*
  - **Given** the feed picker is open with no search text,
  - **When** the list is rendered,
  - **Then** feeds appear under four group headings in this order: Indigenous forage, Crop residues, Agro-byproducts, Mineral; every library feed appears in exactly one group, matching its `vertical` field; and search results keep the group heading of each matched feed.
- **AC-3.4 (Month selector defaults to the current month and marks in-season feeds):** *(new)*
  - **Given** the device date is in month `m`,
  - **When** the feed picker opens,
  - **Then** the month selector shows `m`; every feed whose `availableMonths` includes `m` carries an "in season" mark and no other feed does; and when the user changes the month to `n`, the marks update to the feeds whose `availableMonths` includes `n`, with no change to selected feeds, prices or solver inputs.
- **AC-3.5 (Out-of-season feed stays selectable):** *(new)*
  - **Given** the month selector is set to a month in which feed `F` is not in season,
  - **When** the user selects `F` and taps **Balance ration**,
  - **Then** `F` is added without a blocking error, is shown as "out of season" in the selected list with its `seasonNote` available on tap (in the active UI language, from the feed's `{en, hi}` note pair), and the solver treats `F` like any other selected feed.
- **AC-3.6 (Default prices show date, source and reliability, and stay editable):** *(new)*
  - **Given** a selected feed has a default price,
  - **When** the feed row is rendered,
  - **Then** the price shows its date (`YYYY-MM-DD`), its source, and its reliability label: `mandi` as "mandi", `trade_report` as "trade report", `listing` as "indicative", `team_estimate` as "team estimate" with its stated reason; any price note (including the `team_estimate` reason) is shown in the active UI language from the feed's `{en, hi}` note pair; the price field stays editable; and after the user edits it the row is labelled "your price" and the solver uses the edited value.

#### Step 4: Enter Today's Ration and the Budget
- **AC-4.1 (Optional today's ration):**
  - **Given** at least one feed is selected,
  - **When** the user enters today's quantities (`kg/day` as fed) in the optional "Today's ration" section,
  - **Then** the app calculates and displays today's cost (`₹/day`) as Σ(kg/day × price); if left blank, the user can still balance once a budget is entered.
- **AC-4.2 (Budget defaults to today's cost):** *(new)*
  - **Given** the user has entered today's ration and has not edited the budget,
  - **When** today's cost is calculated or changes,
  - **Then** the budget field shows today's cost in `₹/day` and is labelled "today's cost"; once the user edits the budget, later changes to today's ration no longer overwrite it.
- **AC-4.3 (Budget required without today's ration):** *(new)*
  - **Given** today's ration is blank,
  - **When** the budget field is also empty,
  - **Then** the budget field shows "Enter a daily budget" and **Balance ration** is disabled (see AC-E1.1 for invalid values).

#### Step 5: Balance Ration
- **AC-5.1 (Two-stage max-milk, least-cost ration output):** *(changed: two-stage LP, rounding down, roughage)*
  - **Given** a valid confirmed animal profile with breed and `T > 0`, a valid budget, at least 1 selected feed with a valid price, and a budget at or above the maintenance cost,
  - **When** the user taps **Balance ration**,
  - **Then** stage 1 returns `Y*`, the largest milk in L/day (`0 ≤ Y* ≤ effCap`) the selected feeds can support at a cost `≤ budget` within the dry-matter intake ceiling, the per-feed caps and the roughage minimum; `S = ⌊Y* × 10⌋ / 10`; and the displayed ration is the cheapest ration that supports `S`, with every nutrient requirement at `S` met (`supplied ≥ required` within `1e-6`), roughage DM `≥ r × total DM` within `1e-6`, total cost `≤ budget + 1e-6`, and each feed within its max `kg/day` cap.
- **AC-5.2 (Cost against budget and today's cost):** *(changed: budget comparison; savings may be negative)*
  - **Given** a feasible result is displayed,
  - **When** the cost line is rendered,
  - **Then** it shows the ration cost in `₹/day`, the amount under the budget in `₹/day`, and, when today's ration was entered, the difference from today's cost in `₹/day` and `%` worded as "less than today" or "more than today".
- **AC-5.3 (Supported milk never exceeds the effective cap):** *(new; changed: effective cap)*
  - **Given** any valid inputs, including a budget far above today's cost,
  - **When** the ration is balanced,
  - **Then** `S ≤ Y* ≤ effCap + 1e-6` where `effCap = max(cap, T)`; when `T ≤ cap`, `Y* ≤ cap + 1e-6`; `S` has at most one decimal place; and the headline reads "This budget supports `S` L/day" with today's milk and the breed benchmark (the breed `cap`) beside it.
- **AC-5.4 (Cap binding):** *(new; changed: effective cap)*
  - **Given** a budget and feeds that could support more milk than `effCap`,
  - **When** the ration is balanced,
  - **Then** `Y* = effCap` within `1e-6`; `S` = `effCap` rounded down to `0.1`; the ration cost is the cheapest cost at `S` (lower than the budget when the budget is not binding); and the audit drawer for `S` names the cap as the binding constraint: when `T ≤ cap`, "breed cap" with the cap basis and source; when `T > cap`, the breed `cap` with its basis and source plus the line "today's milk is higher, so it is used as the cap".
- **AC-5.5 (Binding constraint named in the audit):** *(new; changed: effective cap)*
  - **Given** a feasible result is displayed,
  - **When** the user taps `S`,
  - **Then** the audit drawer shows `"Solver output"` and names the constraint that limits `Y*`: "budget", "breed cap", "today's milk (used as cap)" (only when `T > cap`), "intake limit", "roughage", or the name of a nutrient (`DM`, `CP`, `ME`, `Ca`, `P`); for each test case in which exactly one of these is tight, the named constraint is that one.
- **AC-5.6 (Verdict: room for improvement):** *(new)*
  - **Given** a feasible result where `T > 0` and `S − T ≥ 0.1` L/day,
  - **When** the verdict is rendered,
  - **Then** it reads "+`X` L/day possible" with `X = S − T` rounded down to `0.1`, and the caveat line "Feed supports this milk; the actual gain depends on stage of lactation and health." is shown directly below it.
- **AC-5.7 (Verdict: at or above the breed level):** *(new; changed: effective cap)*
  - **Given** a feasible result where `T > 0`, `T ≥ cap`, and the result keeps today's milk (`Y* ≥ T − 1e-6`; otherwise AC-5.11 applies instead),
  - **When** the verdict is rendered,
  - **Then** it reads "Already at the breed level; same milk for ₹`Z` less" when `T = cap` (within `1e-6`), or "Above the breed level; same milk for ₹`Z` less" when `T > cap`, where `Z` = reference cost − the Stage 2′ cost, shown only when Stage 2′ is feasible and `Z > 0`; when Stage 2′ is infeasible or `Z ≤ 0` it reads "Already at the breed level" or "Above the breed level" with no saving; `Z` is tappable to its solver audit; when `T > cap`, the audit shows the line "today's milk is higher, so it is used as the cap"; and the caveat line is shown.
- **AC-5.8 (Verdict: budget below maintenance):** *(new)* see AC-E7.1.
- **AC-5.11 (Verdict: budget supports less than today's milk):** *(new; changed: effective cap)*
  - **Given** a feasible result where `T > 0` and the result is below today's milk (`Y* < T − 1e-6`), at any `T` relative to the breed `cap`,
  - **When** the verdict is rendered,
  - **Then** the binding constraint named per AC-5.5 is never "breed cap" or "today's milk (used as cap)" (because `effCap ≥ T`, only the budget or the feeds can hold milk below `T`); this verdict is shown instead of AC-5.7; it reads "This budget supports `S` L/day, less than today's `T` L/day. Keeping `T` L needs ₹`B`/day.", where `B` is the Stage 2′ cost (selected feeds, their prices and caps, the intake ceiling, the roughage minimum, no budget limit, not bounded by the cap); `B` is tappable and its audit drawer shows `"Solver output"` with the Stage 2′ run at `T`; and if Stage 2′ is infeasible, the second sentence is replaced by "Keeping `T` L is not possible with these feeds: `<limit>` limits it." naming the limiting nutrient(s) (`DM`, `CP`, `ME`, `Ca`, `P`) or "roughage", with no `B` shown.
- **AC-5.12 (Roughage minimum):** *(new)*
  - **Given** a feasible result (any verdict, including a dry animal),
  - **When** the ration is inspected and the user opens the full audit,
  - **Then** the DM supplied by feeds in the Indigenous forage and Crop residues verticals is `≥ r ×` total ration DM (within `1e-6`); the full audit shows the roughage share of DM achieved, the minimum `r`, and `r`'s ICAR/NDDB citation (document, table/section, page), with `r` tappable to that citation.
- **AC-5.13 (Dry animal: maintenance ration):** *(new)*
  - **Given** a valid profile with `T = 0` L/day, a valid budget at or above `M`, and selected feeds that meet the requirements at `0 L/day`,
  - **When** the user taps **Balance ration**,
  - **Then** stage 1 is not run; the displayed ration is the cheapest ration at `0 L/day` (cost `= M` within `1e-6`); the verdict reads "Dry animal: maintenance ration"; no "+`X` L/day possible", "Already at the breed level" or shortfall verdict, no supported-milk headline, no caveat line and no fat line are shown; the cost line follows AC-5.2; and when the budget is below `M`, AC-E7.1 applies instead.
- **AC-5.9 (Fat % stated against the breed as a fact):** *(new)*
  - **Given** a result is displayed and today's milk is `> 0`,
  - **When** the fat line is rendered,
  - **Then** it shows today's fat % and the breed's cited fat % (single value or range) with the cited value tappable to its source, and contains no recommendation, feeding instruction or health statement.
- **AC-5.10 (Breed with no cited fat %):** *(new)*
  - **Given** the selected breed has no cited fat % (e.g., Kankrej, HF crossbred, Jersey crossbred, or "Non-descript"),
  - **When** the fat line is rendered,
  - **Then** it shows today's fat % and "breed fat %: not cited", with no number substituted for the breed value.

#### Step 6: Show Details and Audit Any Number
- **AC-6.1 (Audit drawer for cited numbers):** *(changed: breed numbers)*
  - **Given** a result, a feed row, or the breed benchmark is displayed,
  - **When** the user taps a number taken from a standard, the feed library or the breed table (a nutrient requirement, a feed's nutrient value, a default price, a breed cap or fat %, the roughage minimum `r`),
  - **Then** the audit drawer opens and shows the source citation (document name, table/section, page or row) and the exact value or formula used.
- **AC-6.2 (Audit drawer for solver output numbers):** *(changed: supported milk, verdict)*
  - **Given** a result is displayed,
  - **When** the user taps a solver-computed number (`S`, a verdict number `X`, `Z`, `B` or `M`, a feed's `kg/day`, total `₹/day`, the cost difference, or a nutrient supplied),
  - **Then** the audit drawer opens and shows `"Solver output"`, the calculation, and the LP objective term or constraint(s) it satisfies (stage 1, stage 2 at `S`, or stage 2 at `T` for `Z` and `B`).
- **AC-6.3 (Show details expands and collapses; every number stays auditable):** *(new)*
  - **Given** the feed list or a result is displayed with details collapsed (the default),
  - **When** the user taps **Show details**, then taps it again,
  - **Then** the first tap reveals the per-feed max `kg/day` inputs (`≥ 0`), the nutrient coverage bars for `DM`, `CP`, `ME`, `Ca`, `P` (supplied against required), and the full audit (requirements, cap basis, binding constraint, roughage share against `r` with its citation, stage-1 `Y*` and `S`, stage-2 values), and the control reads **Hide details**; the second tap hides them; and in both states every visible number opens the audit drawer when tapped.

#### Step 7: Generate Verified Plain-English Explanation (Online Only)
- **AC-7.1 (Verified LLM explanation with badge):**
  - **Given** the device is online and a feasible result is displayed,
  - **When** the user taps **Explain** and the LLM returns an explanation in which every number matches an authorized solver output (including `S`, `X`, `Z`, `B`, `cap`), input value, or cited source value,
  - **Then** the app renders the plain-English explanation with a verification badge reading `"All N numbers verified"` (where `N` is the count of verified numbers).

#### Step 8: Copy Text Summary
- **AC-8.1 (Copy formatted summary to clipboard):** *(changed: contents)*
  - **Given** a result is displayed,
  - **When** the user taps **Copy summary**,
  - **Then** a plain-text summary in the active UI language, containing the species, breed, today's milk and fat, the supported milk `S`, the verdict, each feed's `kg/day` as fed, total `₹/day`, the budget, and source attribution, is written to the clipboard and a confirmation is shown.

---

### Error and Edge-Case Criteria

#### E1: Input Validation and Disabled Balance Button
- **AC-E1.1 (Inline validation for animal inputs, breed and budget):** *(changed: breed and budget)*
  - **Given** the user is entering the animal profile and budget,
  - **When** body weight is outside `150`–`800` kg, milk yield is outside `0`–`40` L/day, fat is outside `2.5`–`10`%, no breed is selected, or the budget is empty (with no today's ration), zero, negative, or non-numeric,
  - **Then** an inline error appears on each offending field (`150–800 kg`, `0–40 L/day`, `2.5–10%`, "Select a breed", "Budget must be a positive number in ₹/day") and **Balance ration** is disabled.
- **AC-E1.2 (Balance button disabled without feeds or prices):**
  - **Given** the animal profile and budget are valid,
  - **When** zero feeds are selected OR any selected feed has an empty, negative, or non-numeric price,
  - **Then** **Balance ration** stays disabled until at least 1 feed is selected and every selected feed has a valid numeric price (`≥ 0`).

#### E2: Infeasible Ration Diagnosis
- **AC-E2.1 (Infeasible nutrients named, library feed suggested, never a partial ration):** *(changed: applies at any budget)*
  - **Given** the selected feeds (with their max `kg/day` caps, the intake ceiling and the roughage minimum) cannot meet one or more requirements even at `0 L/day` milk, regardless of budget (e.g., wheat straw alone),
  - **When** the user taps **Balance ration**,
  - **Then** the app shows no ration, no supported milk and no verdict; it shows an alert naming the limiting nutrient(s) (`CP`, `ME`, `Ca`, `P`, or a `DM` intake conflict) and suggests at least one library feed rich in the limiting nutrient(s).
- **AC-E2.2 (Roughage minimum cannot be met):** *(new)*
  - **Given** the selected feeds (with their max `kg/day` caps and the intake ceiling) cannot supply roughage DM `≥ r ×` total DM at `0 L/day` (e.g., only Agro-byproducts and Mineral selected, or roughage feeds capped too low),
  - **When** the user taps **Balance ration**,
  - **Then** the app shows no ration, no supported milk and no verdict (no partial ration); the alert names "roughage" as the limiting factor with the minimum share `r` tappable to its citation; and it suggests at least one unselected library feed from the Indigenous forage or Crop residues vertical that has a default price.

#### E3: Offline Behavior
- **AC-E3.1 (Offline disables LLM actions with reason while the solver works fully):**
  - **Given** the device is offline (`navigator.onLine === false` or network disconnected),
  - **When** the user interacts with the app,
  - **Then** **Fill from description** and **Explain** are disabled and show a `"Needs internet"` indicator, while manual entry, breed selection, the month selector, feed selection, budget entry, both solver stages, **Show details**, the audit drawer, the language toggle, and **Copy summary** work fully offline.

#### E4: LLM Error, Timeout, or Rate Limit
- **AC-E4.1 (Extraction failure keeps manual form functional):**
  - **Given** the device is online and the user taps **Fill from description**,
  - **When** the OpenRouter request fails due to an HTTP error, network timeout, or rate limit (`429`),
  - **Then** a notice explains that the AI service is temporarily unavailable, and manual entry remains fully usable.
- **AC-E4.2 (Explanation failure falls back to deterministic template):**
  - **Given** a result is displayed and the user taps **Explain**,
  - **When** the OpenRouter request fails due to an error, timeout, or rate limit,
  - **Then** the app shows a notice that the AI explanation could not be reached and renders a deterministic, citation-backed template explanation in the active UI language, whose numbers all come from the solver output and cited sources.

#### E5: Unmatched LLM Feed Names and Nutrient Safety
- **AC-E5.1 (Unmatched feed names flagged for mapping or removal; LLM never supplies nutrients):**
  - **Given** the user uses **Fill from description** with text naming a feed not in the library (e.g., `"magic probiotic mix"`),
  - **When** the extraction response is processed,
  - **Then** the feed appears in an `"Unmatched feeds"` section where the user must map it to a library feed or drop it before confirming, and no nutrient, price, season or breed values from the LLM are ever injected into the library, the breed table or the solver.

#### E6: Untraced Numbers in LLM Explanation
- **AC-E6.1 (Untraced number triggers one regeneration, then deterministic fallback):**
  - **Given** the user taps **Explain** and the LLM returns text containing a number that cannot be traced to the inputs, requirements, breed table, selected library rows, or solver output (within rounding tolerance),
  - **When** the number verifier inspects the explanation,
  - **Then** the app triggers at most one regeneration that instructs the model to use only authorized numbers, and if the regenerated text still contains an untraced number, discards it and shows the deterministic template, so an unverified number is never shown as verified.

#### E7: Budget Below the Maintenance Cost
- **AC-E7.1 (Budget below maintenance is infeasible; maintenance cost stated; cheaper feed suggested):** *(new)*
  - **Given** the selected feeds can meet the requirements at `0 L/day` (AC-E2.1 does not apply) but the budget is below the maintenance cost `M`,
  - **When** the user taps **Balance ration**,
  - **Then** the app shows no ration and no supported milk (no partial ration); the verdict reads "Budget below the maintenance cost ₹`M`/day" with `M` tappable to its solver audit; and it names at least one unselected library feed that has a default price (feeds with no default price are never suggested) and that, added at that price, brings the maintenance cost to or below the budget, or, if no such feed exists, states that no library feed brings maintenance within this budget.

---

### Language Interface Criteria (Hindi/English toggle, FEEDBACK Round 1 #2 and Round 2 #2)

**Exempt from the one-language rule:** the toggle labels (`हिंदी`, `English`); the units `kg`, `L`, `₹`; Latin digits; the nutrient abbreviations `DM`, `CP`, `ME`, `Ca`, `P`; the SahiDana wordmark and its tagline; verbatim citation titles and source names; the LLM explanation body; and text the user typed.

#### L1: Toggle, One Language per Screen, Numbers, Search, Extraction, and Explanation
- **AC-L1.1 (Toggle defaults to English and is remembered on the device):** *(rewritten)*
  - **Given** the app has never been opened on this device (no stored language),
  - **When** the user opens it, switches the toggle to हिंदी, and then reloads the app (online or offline),
  - **Then** the first render is in English; after switching, every UI string changes to Hindi without a reload and without losing form inputs or results; and after the reload the app opens in Hindi.
- **AC-L1.2 (One language per screen):** *(rewritten)*
  - **Given** the app is rendered in any state (initial, prefilled, validation error, infeasible, budget below maintenance, offline, LLM failure, result with details collapsed and expanded, audit drawer, copy confirmation),
  - **When** the visible text outside the exempt elements is inspected,
  - **Then** in English mode it contains no Devanagari characters, in Hindi mode it contains no Latin-letter words, no element shows a secondary-language line, and no Devanagari string literal exists in the source code outside the single Hindi strings file and the data files (`data/*.csv`, library notes).
- **AC-L1.3 (Numbers use Latin digits and fixed units in both languages):**
  - **Given** a result, benchmark, verdict, price, validation message or summary is displayed in either language,
  - **When** the rendered text of any number is inspected (including the audit drawer, the badge, the template fallback and the copied summary),
  - **Then** every digit is a Latin digit `0`–`9` (no `०`–`९`) and units appear as `kg`, `L` and `₹`; the solver output and the number-verification result are identical in both languages.
- **AC-L1.4 (Feed, breed, group and month names in the active language; search matches all forms in both modes):** *(rewritten)*
  - **Given** the library and breed table are loaded,
  - **When** the user views the picker in either mode and searches by English, transliterated, or Devanagari name,
  - **Then** feed names, breed names (per AC-L1.7), group headings and month names appear in the active language only, and every query form returns the same feed in both modes.
- **AC-L1.5 (Hindi or Hinglish description extraction prefills the form):**
  - **Given** the device is online and the user enters a description in Hindi (Devanagari) or Hinglish (e.g., `"450 kilo ki Murrah bhains 8 litre doodh deti hai, 6.5% fat, gehun ka bhusa aur sarson khali hai"`),
  - **When** the user taps **Fill from description** and the extraction service returns,
  - **Then** the species, breed, body weight, milk yield, fat, and matched feeds are populated in the same unconfirmed prefilled state as AC-2.3, and the same description in English produces the same prefilled values.
- **AC-L1.6 (Badge and template in the active language; the LLM explanation stays English):** *(rewritten)*
  - **Given** a result is displayed and the user taps **Explain**,
  - **When** the explanation is rendered from a verified LLM response (AC-7.1) or from the template (AC-E4.2, AC-E6.1),
  - **Then** the badge and the template text are in the active UI language only, and the LLM explanation body is in English in both modes, with no Hindi text generated by the LLM.

- **AC-L1.7 (Breed names and feed notes come from data files in the active language):** *(new)*
  - **Given** `data/breeds.csv` holds each breed's English and Hindi name, and each feed's `seasonNote` and price note are `{en, hi}` pairs in the library data,
  - **When** the breed field, a season note, or a price note is shown in either mode,
  - **Then** breed names come from `data/breeds.csv` (not the strings file) and notes come from their `{en, hi}` pair, each in the active language only; switching the toggle switches them without a reload.

## 4. Non-Goals

- **No voice interface:** No voice input or output.
- **No Rajasthani UI copy:** UI copy is Hindi or English; Rajasthani local feed names appear only as given by the cited library.
- **No Hindi LLM explanation:** The LLM explanation stays English in both modes.
- **No mixed-language screens:** One language per screen; no side-by-side Hindi and English.
- **No user accounts, login, or server-side database:** All state and computation are client-side (with stateless LLM calls when online). Only the language choice is stored on the device.
- **No live price API:** No live mandi or market price feed (including the data.gov.in mandi API). Default prices are static, cited, dated values with a reliability label, editable by the paravet.
- **No predicting milk from body weight:** No cited standard does this; body weight sets only the dry-matter intake ceiling.
- **No veterinary or medical advice:** No diagnosis, treatment, or advice on fat %, lactation stage, breeding or health. The verdict, fat comparison and caveat are factual statements only.
- **No non-adult or non-bovine animal classes:** Calves, heifers, bulls, pregnancy allowances, goats, and sheep are out of scope. Scope is adult cows and adult buffaloes (lactating or dry).
- **No trace/micro-minerals beyond Calcium (`Ca`) and Phosphorus (`P`).**
- **No native mobile binary (APK/iOS store app):** Delivered as an installable offline-capable PWA.

## 5. Open Questions

Questions keep their original numbers so that references to them stay stable.

- **OQ1. Fat entry for a dry animal (verdict part resolved, see below):**
  - *Question:* Must fat be entered when `T = 0`?
  - *Assumption:* No. When `T = 0`, the fat field is optional and the `2.5–10%` check in AC-E1.1 applies only when a value is entered.
- **OQ6. Binding constraint when several are tight, or a per-feed cap binds:**
  - *Assumption:* All tight constraints are listed, the first-named in the order budget, breed cap, intake limit, roughage, nutrient; a binding per-feed max `kg/day` is reported as "feed limit: <feed name>".
- **OQ7. Show details scope:**
  - *Assumption:* Two independent **Show details** controls, one on the Feeds card (per-feed caps) and one on the result card (bars and full audit), both collapsed on each app open; the state is not remembered.
- **OQ8. Feeds with no Hindi name in Hindi mode (breed part resolved, see below):**
  - *Assumption:* No Hindi feed name is invented. A feed with no source local name shows its English name in Hindi mode and is exempt from AC-L1.2. The Hindi strings stay unverified in [DECISIONS.md](DECISIONS.md) until the native-speaker review on 2026-10-14.
- **OQ9. Intake ceiling formula depends on milk:**
  - *Question:* NRC 2001 DMI uses fat-corrected milk and week of lactation, which the form does not collect.
  - *Assumption:* [ARCHITECTURE.md](ARCHITECTURE.md) fixes the formula and default week of lactation; the audit drawer shows the formula and the values used.
- **OQ10. Mustard straw and other flagged feeds:**
  - *Assumption:* Feeds flagged in [DATA_SOURCES](DATA_SOURCES.md) as for non-productive animals only are either excluded from the library or shown with their `seasonNote` warning; no criterion depends on them.
- **OQ11. Number-verification tolerance:**
  - *Assumption:* A number in the LLM explanation is verified if it matches an authorized number as formatted in the UI or within `±0.05` absolute (or `±1%` relative).
- **OQ12. Today's ration input structure:**
  - *Assumption:* Each selected feed has an optional "Today kg/day" field; today's cost = Σ(kg/day × price).
- **OQ13. Dry Matter semantics:**
  - *Assumption:* Total DM is bounded above by the intake ceiling from body weight; `CP`, `ME`, `Ca`, `P` are minimums at the milk level being solved.
- **OQ14. Result keeps today's milk with less than 0.1 L/day to spare, below the breed cap:**
  - *Question:* When `T < cap`, `Y* ≥ T − 1e-6` and `S − T < 0.1`, none of AC-5.6 (needs `S − T ≥ 0.1`), AC-5.7 (needs `T ≥ cap`) or AC-5.11 (needs `Y* < T − 1e-6`) applies.
  - *Assumption:* No verdict is shown; the app states "This budget supports `S` L/day, the same as today" and the binding constraint from AC-5.5.
- **OQ17. Roughage minimum value:**
  - *Question:* The share `r` and its ICAR/NDDB citation are not yet found.
  - *Assumption:* The data task supplies `r` with a citation; per [FEEDBACK.md](FEEDBACK.md), if no citation is found, work stops and the user is asked. AC-5.12 and AC-E2.2 cannot be tested until then.

### Resolved (user and orchestrator, 2026-10-12, [FEEDBACK.md](FEEDBACK.md) Round 3)

- **OQ1 (verdict part) → AC-5.13:** A dry animal (`T = 0`) skips stage 1, gets the cheapest maintenance ration and the verdict "Dry animal: maintenance ration", with no "+X possible".
- **OQ2 → AC-5.11:** When the result is below today's milk (`Y* < T − 1e-6`), a verdict states the shortfall and the Stage 2′ cost `B` of keeping `T`, or names the limiting nutrient (or roughage) if Stage 2′ is infeasible. Because the effective cap is `max(cap, T)`, only the budget or the feeds can trigger it, never the breed cap.
- **OQ3 → shared definitions, AC-2.4, AC-2.5:** 1 kg of milk ≈ 1 L, stated in the audit sheet for breed figures.
- **OQ4 → shared definitions (cap rule 2), AC-2.4:** The cited peak daily yield comes first; otherwise a lactation average. Breeds with no cited range use lactation yield ÷ length ("breed average (calc)"); crossbreds use the top yield ÷ the shorter cited length ("range top").
- **OQ5 → AC-5.7:** `Z` is costed by Stage 2′ (milk fixed at `T`, not bounded by the cap) against the reference cost; no saving is shown when Stage 2′ is infeasible.
- **OQ8 (breed part) → AC-L1.7:** Breed Hindi names come from `data/breeds.csv` (team-asserted, reviewed 2026-10-14), not the strings file.
- **OQ15 → shared definitions (effective cap), AC-5.3, AC-5.4, AC-5.5, AC-5.7, AC-5.11:** The effective cap is `max(breed cap, T)`. An animal above its breed cap whose budget keeps `T` gets "Above the breed level; same milk for ₹`Z` less", and the audit shows the breed cap and "today's milk is higher, so it is used as the cap".
- **OQ16 → shared definitions:** `data/breeds.csv`, after the human data check, is the authority for the breed list and peaks (Nili-Ravi peak is the cited mean `9.4`; `7.2–11.8` is an individual range; a Bhadawari row was added to [DATA_SOURCES §5](DATA_SOURCES.md)). A cited breed peak is a mean, or the top of a range of study means, never an individual-animal range. The journey's breed list is illustrative.
