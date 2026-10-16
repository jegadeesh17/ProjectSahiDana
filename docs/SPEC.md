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

---

## Change 3: Farmer-first flow

This section specifies Change 3 (started 2026-10-15, branch `feat/farmer-flow`, base commit `d28d90a`) from [PROJECT_MENTAL_MODEL.md](PROJECT_MENTAL_MODEL.md) "Change 3" and [FEEDBACK.md](internal/FEEDBACK.md) Round 5. It specifies only what is new or different. Everything in sections 1–5 above still holds unless a criterion below says it is superseded.

### C3.1 Summary

- **Change:** make the input flow farmer-first. The farmer describes their cow or buffalo, sets a daily budget and taps **Calculate ration**; picking feeds becomes optional. The solver chooses from the farmer's own feeds plus the regional library feeds in season this month, and the result says which feeds to buy as a cheapest-first upgrade ladder, plus how much more budget would reach the breed's best milk.
- **Change type:** Feature. **Posture:** Prototype; the solver and the number-honesty checks keep thorough tests.
- **Persona:** unchanged (field paravet at the farmer's doorstep), with the wording aimed at the farmer looking at the same screen.
- **Milestones:** **C3-M1** layout and wording (UI only, no logic change); **C3-M2** farmer-first solve.
- **Constraint restated:** every displayed number comes from the solver, a cited source row, or the user's input, and is tappable to its audit. No per-feed inclusion cap is invented for library feeds: the only limits on a library feed are the cited roughage minimum, the dry-matter intake ceiling and the nutrient requirements already in the LP. The two-stage LP formulation is unchanged.

**Shared definitions for Change 3** (in addition to the shared definitions in section 3):

- **Own feeds (`O`)**: the feeds the farmer adds under "Feeds you already have (optional)", each with the farmer's price in `₹/kg` (the cited default is prefilled; `0` is allowed for home-grown feed) and an optional "how much you have" cap in `kg/day` (as fed). May be empty.
- **Current month (`m`)**: the device's current month.
- **Candidate set (`C`)**: `O` exactly as entered (including own feeds out of season in `m`), plus every library feed not in `O` whose `availableMonths` includes `m` and that has a cited default price, at that default price with no per-feed cap. Library feeds with no default price (e.g., molasses) and library feeds out of season in `m` are never in `C` unless the farmer adds them as own feeds.
- **Final solve (`F`)**: the existing two-stage solve over `C` with the animal, breed and budget as entered.
- **Supplements**: `mineral_mix` and `common_salt`, the two feeds the solver always includes in a fixed minimum daily amount when they are on offer ([ADR-0012](DECISIONS.md#adr-0012-cheapest-first-upgrade-ladder-from-nested-prefix-solves)).
- **Buy list (`Bu`)**: the feed lines of `F` with `kg/day > 0` whose feed is not in `O`. Supplements on the list come first, cheapest `₹/day` first; the rest follow by that line's cost in `₹/day` ascending. Ties are broken by feed id in both groups.
- **Own-feed cap:** an own feed's "how much you have" cap also limits the total of that feed in every solve. The app never buys extra of an own feed on top of the cap, because an own feed is a single entry in `C` (OQ-C3-3). Leaving the cap blank allows any amount.
- **Prefix `k`**: `O ∪ Bu[1..k]` (the own feeds plus the first `k` feeds of `Bu`), solved with the same animal, breed and budget. Prefix `0` is `O` alone.
- **Ladder rule:**
  - **Rung 0** "Your feeds alone" is shown only when `O` is non-empty. It shows its status: balanced, with its supported milk and cost; or "not balanced".
  - **Rung 1** is the smallest prefix `k ≥ s` whose solve is optimal (balanced), where `s` (0, 1 or 2) is the number of supplements on `Bu` (`k ≥ 1` when `s = 0`). All feeds `Bu[1..k]` are grouped in rung 1 ("buy these together to balance"), so any supplements on `Bu` are always in rung 1 ("the basics needed to balance").
  - Each later prefix is its own rung, adding one feed.
  - Each rung shows the added feed name(s), its supported milk in `L/day` and its ration cost in `₹/day`, both from that rung's solver output.
  - The last rung's supported milk and cost equal `F`'s within `1e-6` (relative). Every rung from rung 1 on is balanced, and supported milk never goes down from rung 1 to the last rung.
  - Rung 0 is outside that guarantee: it skips the supplements' fixed cost, so it may show slightly more milk than rung 1. The UI labels this on the ladder card.
- **Cost at cap (`costAtCap`)**: the cost in `₹/day` of the least-cost ration from `C` that supports `effCap`, with no budget limit (Stage 2 at `effCap`, no budget row). It is null when that LP is infeasible or the animal is dry.
- **Budget-prompt rule:** the prompt "Add ₹`X`/day to your budget to reach `Y` L/day (breed best)" is shown only when all of these hold: `F` is optimal; the budget is among `F`'s tight constraints; `Y* < effCap − 1e-6`; and `costAtCap` is not null. Then `X = costAtCap − budget` and `Y = effCap`.

### C3.2 User Journeys

#### Journey C3-A: Farmer-first layout (C3-M1, starts from the existing input column, Step 2–5 above)

1. The user opens the app. The left input column shows, top to bottom: the free-text extractor, the "Your cow or buffalo" card, the daily budget, the feeds, and the **Balance ration** button. The one-tap demo is no longer at the top of the column.
2. The card for the animal is titled "Your cow or buffalo" (Hindi: "आपकी गाय या भैंस"). Once the species is picked, the title becomes "Your cow" or "Your buffalo" (Hindi: "आपकी गाय" or "आपकी भैंस"). The word "Animal" no longer appears anywhere the farmer reads.
3. Below the **Balance ration** button, a quieter "Try an example" (Hindi: "उदाहरण आज़माएँ") section holds the demo buttons, which work as before.
4. After balancing, the result shows two equal tiles side by side: "Today" with today's milk, and "This ration supports" with the supported milk. The breed benchmark sits on a small line below the tiles. Both tiles keep their audits.

#### Journey C3-B: Farmer-first solve (C3-M2, replaces the feed-first path of Steps 3–5 above)

1. The user fills in "Your cow or buffalo" and the daily budget. "Feeds you already have (optional)" is collapsed.
2. The user taps **Calculate ration** (Hindi: "राशन निकालें") without adding any feeds. The solver balances the ration from the in-season regional library within the budget.
3. Optionally, before calculating, the user opens "Feeds you already have (optional)" and adds own feeds, each with "your price" (default prefilled, `0` allowed) and an optional "how much you have" in `kg/day`.
4. The result shows the existing headline, tiles, verdict and cost line, and:
   - the ration table, each row tagged "You have" or "Buy";
   - a "Feeds to buy, cheapest first" card following the ladder rule;
   - a "Not needed" line naming own feeds the solver left at `0 kg/day`;
   - when the budget-prompt rule holds, "Add ₹`X`/day to your budget to reach `Y` L/day (breed best)".
5. When the budget is below the maintenance cost, the existing alert also says "Raise the budget by at least ₹`X`/day".
6. The user taps any number on the ladder, the prompt or the alert to open its audit.
7. Below the button, "Try an example" offers three demos: the existing lactating buffalo demo, the straw demo now labelled "Needs feeds to buy" (Hindi: "चारा ख़रीदना ज़रूरी"), and a new "Tight budget" demo that shows the budget prompt.

### C3.3 Acceptance Criteria

Quoted strings are the English-mode text unless stated; the Hindi text comes from the strings file (AC-L1.2 still applies).

#### C3-M1: Layout and wording

- **AC-C3-1.1 (Input column order):**
  - **Given** the app is open at any width (375 px and desktop), in either language,
  - **When** the left input column is rendered,
  - **Then** its sections appear in DOM and visual order: free-text extractor, "Your cow or buffalo" card, daily budget, feeds, the balance button; and no demo section appears above the free-text extractor or between these sections.
- **AC-C3-1.2 (Card title before a species is picked):**
  - **Given** no species is selected,
  - **When** the card is rendered,
  - **Then** its title is "Your cow or buffalo" in English mode and "आपकी गाय या भैंस" in Hindi mode.
- **AC-C3-1.3 (Card title after a species is picked):**
  - **Given** the card is rendered,
  - **When** the user selects `cow`, then `buffalo`,
  - **Then** the title reads "Your cow" (Hindi "आपकी गाय") after the first selection and "Your buffalo" (Hindi "आपकी भैंस") after the second, without a reload and without losing other inputs.
- **AC-C3-1.4 (No "Animal" for the farmer):**
  - **Given** the app in any state listed in AC-L1.2,
  - **When** the visible text is inspected,
  - **Then** in English mode no visible text contains the word "animal" (case-insensitive) outside the exempt elements of section 3 and the `audit_*` technical labels inside the audit drawer; in Hindi mode no visible text uses "पशु" to name the farmer's cow or buffalo; and the "How to use" line reads in the new order (cow or buffalo, then budget, then feeds).
- **AC-C3-1.5 (Milk tiles side by side):**
  - **Given** a feasible result with `T > 0`,
  - **When** the result is rendered at 375 px wide and at desktop width,
  - **Then** two tiles of equal width sit in one row (same top offset, neither wrapping below the other): "Today" with `T` L/day and "This ration supports" with `S` L/day; both values are tappable and open the same audits as before the change (input for `T`, solver output with the binding constraint for `S`); the breed benchmark (`cap` with its basis label) appears on one line below the tiles and stays tappable to its source; and the element keeps `data-testid="supports"`.
- **AC-C3-1.6 (Demo below the button as "Try an example"):**
  - **Given** the app is open,
  - **When** the input column is rendered and the user taps a demo button,
  - **Then** the demo section appears after the balance button, titled "Try an example" (Hindi "उदाहरण आज़माएँ"), its buttons keep their `data-preset` attributes, and tapping one fills the form exactly as before the change.
- **AC-C3-1.7 (M1 changes no logic):**
  - **Given** the C3-M1 build and the pre-change build (`d28d90a`) with the same inputs,
  - **When** the ration is balanced,
  - **Then** the solver output (every feed's `kg/day`, `S`, `Y*`, cost, verdict and binding constraint) is identical, and **Balance ration** is still disabled without at least 1 feed (AC-E1.2 holds through C3-M1).

#### C3-M2: Farmer-first solve

- **AC-C3-2.1 (Calculate with cow and budget only):** *(supersedes AC-E1.2 from C3-M2 on)*
  - **Given** a valid profile (species, breed, weight, milk, fat per AC-E1.1) and a valid budget, and no own feeds,
  - **When** the input column is rendered,
  - **Then** the button reads "Calculate ration" (Hindi "राशन निकालें") and is enabled, and no "add at least one feed" hint is shown.
- **AC-C3-2.2 (Own feeds section collapsed and optional):**
  - **Given** the app opens,
  - **When** the feeds section is rendered,
  - **Then** it is collapsed and titled "Feeds you already have (optional)" (Hindi "आपके पास पहले से मौजूद चारा (वैकल्पिक)"); when expanded, each added feed shows a price field labelled "your price" (cited default prefilled with its date, source and reliability per AC-3.6) and an optional field labelled "how much you have" in `kg/day`.
- **AC-C3-2.3 (Candidate set):**
  - **Given** own feeds `O` (possibly empty) and the device month `m`,
  - **When** the user taps **Calculate ration**,
  - **Then** the feeds passed to the solver are exactly `C`: every feed in `O` with the farmer's price and "how much you have" cap (an own feed out of season in `m` is kept); plus every library feed not in `O` that is in season in `m` and has a cited default price, at that price with no cap; and no library feed that is out of season in `m` or has no default price is included unless it is in `O`.
- **AC-C3-2.4 (Own feeds used at the farmer's price and cap):**
  - **Given** an own feed `f` with price `p` (including `p = 0`) and "how much you have" `q`,
  - **When** the ration is calculated,
  - **Then** the solver costs `f` at `p` (not the library default), `f`'s `kg/day` in the ration is `≤ q + 1e-6`, and when `q` is blank `f` has no per-feed cap.
- **AC-C3-2.5 (Final ration is the existing two-stage solve over `C`):**
  - **Given** valid inputs and a budget at or above the maintenance cost over `C`,
  - **When** the ration is calculated,
  - **Then** the displayed ration, `S`, cost, verdict and binding constraint equal the output of the existing two-stage solver run on `C` (AC-5.1 to AC-5.13 hold with "selected feeds" read as `C`), and every library feed in the ration has a `kg/day` limited only by the intake ceiling, the roughage minimum, the nutrient requirements and the budget (no other per-feed cap).
- **AC-C3-2.6 ("You have" and "Buy" tags):**
  - **Given** a feasible result,
  - **When** the ration table is rendered,
  - **Then** every row with `kg/day > 0` carries exactly one tag: "You have" when its feed is in `O`, "Buy" otherwise; the "Buy" rows are exactly the feeds of `Bu`.
- **AC-C3-2.7 (Ladder card: order and grouping):**
  - **Given** a feasible result with `Bu` non-empty,
  - **When** the "Feeds to buy, cheapest first" card is rendered,
  - **Then** rung 0 "Your feeds alone" appears only when `O` is non-empty; rung 1 lists all feeds `Bu[1..k]` for the smallest `k ≥ s` (`k ≥ 1` when `s = 0`) whose prefix solve is optimal, so `mineral_mix` and `common_salt`, when on `Bu`, are always in rung 1; each later rung adds exactly the next feed of `Bu`; the feeds of `Bu` appear across the rungs once each, supplements first, then the rest in `₹/day` ascending order (ties by feed id in both groups).
- **AC-C3-2.8 (Ladder rung figures and invariants):**
  - **Given** the ladder card is rendered,
  - **When** each rung's figures are inspected,
  - **Then** each balanced rung shows its supported milk (`L/day`, rounded down to `0.1` like `S`) and its ration cost (`₹/day`), both equal to that prefix's solver output; every rung from rung 1 on is balanced; supported milk never decreases from rung 1 to the last rung; the last rung's supported milk and cost equal `F`'s `S` and cost within `1e-6` (relative); and rung 0 is not part of the non-decreasing check: when rung 0 shows more milk than rung 1, the card shows a label saying rung 1 includes the basics (mineral mixture, salt) needed to balance.
- **AC-C3-2.9 (Rung 0 status):**
  - **Given** `O` is non-empty,
  - **When** rung 0 is rendered,
  - **Then** if `O` alone gives an optimal solve, rung 0 shows "Your feeds alone" with its supported milk and cost; otherwise it shows "Your feeds alone: not balanced" with no milk or cost figure.
- **AC-C3-2.10 (Every ladder figure is auditable):**
  - **Given** the ladder card is rendered,
  - **When** the user taps a rung's milk or cost,
  - **Then** the audit drawer opens with "Solver output", the feeds in that rung's prefix, the stage it came from (stage 1 milk, stage 2 cost at that milk), and the binding constraint for that rung's milk.
- **AC-C3-2.11 ("Not needed" line):**
  - **Given** a feasible result,
  - **When** some own feeds have `0 kg/day` in `F`,
  - **Then** a line "Not needed" names exactly those own feeds (in the active language); when every own feed has `kg/day > 0`, or `O` is empty, the line is not shown.
- **AC-C3-2.12 (Budget prompt shown):**
  - **Given** a result where the budget-prompt rule holds (`F` optimal, budget tight, `Y* < effCap − 1e-6`, `costAtCap` not null),
  - **When** the result is rendered,
  - **Then** it shows "Add ₹`X`/day to your budget to reach `Y` L/day (breed best)" with `X = costAtCap − budget` and `Y = effCap` (rounded down to `0.1`); tapping `X` opens the audit drawer with "Solver output", `costAtCap`, the budget and the subtraction; tapping `Y` opens the effective-cap audit (breed cap with basis and source, or "today's milk is higher, so it is used as the cap" when `T > cap`).
- **AC-C3-2.13 (`costAtCap` agrees with an independent solver):**
  - **Given** the benchmark animals in `eval/test_animals.json`,
  - **When** `npm run eval:dump && npm run eval:scipy` runs,
  - **Then** for each animal, `costAtCap` equals the SciPy HiGHS minimum cost at `effCap` with no budget row within the suite's tolerance, and both are null/infeasible together; and in unit tests, whenever the budget is tight, `costAtCap ≥` the final cost.
- **AC-C3-2.14 (Budget below maintenance: raise by X):** *(extends AC-E7.1)*
  - **Given** `C` can meet the requirements at `0 L/day` but the budget is below the maintenance cost `M` over `C`,
  - **When** the user taps **Calculate ration**,
  - **Then** AC-E7.1 holds (no ration, no supported milk, "Budget below the maintenance cost ₹`M`/day"), except that a suggested library feed that is out of season in `m` or has no cited default price is removed and never named (no number changes; when no suggestion is left, the alert states that no library feed brings maintenance within this budget); the alert adds "Raise the budget by at least ₹`X`/day" with `X = M − budget`, `X` is tappable and its audit shows `M`, the budget and the subtraction, and no ladder or budget prompt is shown.
- **AC-C3-2.15 (Three demos):**
  - **Given** the "Try an example" section,
  - **When** the user taps each demo and then **Calculate ration**,
  - **Then** there are exactly three demos: the lactating buffalo demo gives a feasible ration as before; the straw demo, labelled "Needs feeds to buy" (Hindi "चारा ख़रीदना ज़रूरी"), gives a feasible ration with at least one "Buy" row and rung 0 "Your feeds alone: not balanced"; the "Tight budget" demo gives a result in which the budget prompt (AC-C3-2.12) is shown. The demo inputs are fixed values whose outcomes are asserted by tests against real solver output.

#### C3-M2: Edge cases

- **AC-C3-E1 (No own feeds):**
  - **Given** `O` is empty,
  - **When** a feasible ration is calculated,
  - **Then** every ration row is tagged "Buy", rung 0 and the "Not needed" line are absent, and the ladder starts at rung 1.
- **AC-C3-E2 (Own feeds cover only part of the need):**
  - **Given** own feeds that cannot balance the ration alone (e.g., wheat straw only) and `C` that can,
  - **When** the ration is calculated,
  - **Then** rung 0 shows "Your feeds alone: not balanced"; rung 1 groups the supplements on `Bu` (`mineral_mix`, `common_salt`) plus the fewest following `Bu` feeds, in buy-list order, that balance the ration; the own feed used appears in the ration tagged "You have"; and no partial ration is presented as balanced.
- **AC-C3-E3 (Invalid own feed row):**
  - **Given** a valid profile and budget and an own feed with an empty, negative or non-numeric price, or a negative or non-numeric "how much you have",
  - **When** the input column is rendered,
  - **Then** **Calculate ration** is disabled and the hint "Next: enter a valid price for every feed" (the existing `notice_next_price` text) is shown, until the row is fixed or removed.
- **AC-C3-E4 (Budget not limiting):**
  - **Given** a feasible result where the budget is not among `F`'s tight constraints (e.g., `Y* = effCap`),
  - **When** the result is rendered,
  - **Then** no "Add ₹`X`/day" prompt is shown.
- **AC-C3-E5 (Least-cost ration at the cap infeasible):**
  - **Given** a result where the budget is tight and `Y* < effCap − 1e-6`, but no ration from `C` supports `effCap` at any cost (`costAtCap` is null),
  - **When** the result is rendered,
  - **Then** no "Add ₹`X`/day" prompt is shown and no other budget figure is substituted.
- **AC-C3-E6 (Dry animal):**
  - **Given** `T = 0` and a budget at or above `M` over `C`,
  - **When** the ration is calculated,
  - **Then** AC-5.13 holds; `costAtCap` is null; no budget prompt is shown; the ladder rungs show only cost (no supported-milk figure or milk gain on any rung); and the ration rows keep their "You have"/"Buy" tags.
- **AC-C3-E7 (Infeasible at maintenance even with the library):**
  - **Given** `C` cannot meet the requirements at `0 L/day` (AC-E2.1 or AC-E2.2),
  - **When** the user taps **Calculate ration**,
  - **Then** the existing infeasibility alert is shown with no ration, no ladder, no "Not needed" line and no budget prompt; the limiting nutrient(s) or "roughage" are named as before, and any suggested library feed that is out of season in `m` or has no cited default price is removed and never named (no number changes).
- **AC-C3-E8 (Offline):**
  - **Given** the device is offline,
  - **When** the user calculates a ration with and without own feeds,
  - **Then** the candidate set, the final solve, the ladder, the tags, the "Not needed" line, the budget prompt, the raise-by alert, all three demos and every audit work with no network request; only the LLM actions are disabled per AC-E3.1.
- **AC-C3-E9 (One language per screen for the new UI):**
  - **Given** Hindi mode,
  - **When** any C3 element is rendered (card titles, "Try an example", the milk tiles, "Calculate ration", the own-feeds section and its labels, the "You have"/"Buy" tags, the ladder card and rung 0, "Not needed", the budget prompt, the raise-by line, the demo labels),
  - **Then** AC-L1.2 and AC-L1.3 hold: no Latin-letter words outside the exempt elements, Latin digits only, and every new string has both an English and a Hindi entry in the strings file.

### C3.4 Regression Criteria

- **AC-C3-R1 (Solver formulation unchanged):**
  - **Given** the 18 benchmark animals and the existing SciPy agreement cases,
  - **When** `npm run eval:dump && npm run eval:scipy` runs on the C3-M2 build,
  - **Then** every pre-existing case still agrees 100%, and stage 1, stage 2 and Stage 2′ outputs for the same feed set equal the pre-change output.
- **AC-C3-R2 (Existing verdicts and audits):**
  - **Given** a result,
  - **When** it is rendered,
  - **Then** AC-5.3 to AC-5.13 (headline, verdicts, caveat, fat line, roughage) and AC-6.1 to AC-6.3 (audit drawer, Show details) hold unchanged, read over `C`.
- **AC-C3-R3 (Validation unchanged for the profile and budget):**
  - **Given** invalid weight, milk, fat, breed or budget,
  - **When** the input column is rendered,
  - **Then** AC-E1.1 holds and **Calculate ration** is disabled.
- **AC-C3-R4 (Free-text extraction still fills the form):**
  - **Given** the device is online and the user uses **Fill from description** naming feeds,
  - **When** the extraction returns,
  - **Then** AC-2.3, AC-E5.1 and AC-L1.5 hold, with matched feeds landing in "Feeds you already have (optional)" as own feeds at their default prices.
- **AC-C3-R5 (Today's ration and cost comparison):**
  - **Given** own feeds with today's quantities entered,
  - **When** a result is displayed,
  - **Then** AC-4.1, AC-4.2 and AC-5.2 hold, with today's cost computed over own feeds only.
- **AC-C3-R6 (Explain, copy summary, language toggle):**
  - **Given** a result,
  - **When** the user taps **Explain**, **Copy summary** or the language toggle,
  - **Then** AC-7.1, AC-E4.2, AC-E6.1, AC-8.1 and AC-L1.1 hold, and every number in the summary and explanation still traces to the solver, an input or a cited row.
- **AC-C3-R7 (Existing test suites stay green):**
  - **Given** the C3-M1 and the C3-M2 builds,
  - **When** `npm run test:full`, `npm run build` and `npm run compile:data` run,
  - **Then** all exit 0; expected values changed by this change are updated only from real solver output.

### C3.5 Non-Goals

- No change to the LP formulation, requirement tables, feed or breed data, citations or prices.
- No invented per-feed inclusion caps for library feeds.
- No buying advice for out-of-season feeds or feeds with no cited price.
- No change to the LLM prompts, the verifier logic or the explanation card.
- No forced minimum use of own feeds.

### C3.6 Open Questions

- **OQ-C3-1. Meaning of "used first":**
  - *Assumption:* own feeds are "used first" only in the sense that they enter `C` at the farmer's price (often lower, or `0`) and cap and are shown first; the LP is free to leave one at `0 kg/day` (then it is listed under "Not needed"). No minimum use is forced (plan decision).
- **OQ-C3-2. Month used for the candidate set:**
  - *Assumption:* the device's current month, not the picker's month selector. The month selector still only changes the "in season" marks (AC-3.4 holds).
- **OQ-C3-3. Own feed that is also a library feed:**
  - *Assumption:* the own entry replaces the library entry in `C` (one row, farmer's price and cap), and its row is tagged "You have".
- **OQ-C3-4. Feeds to buy when own feeds already give the final ration (`Bu` empty):**
  - *Assumption:* the ladder card shows rung 0 only, with no buy rungs; no new text with numbers is added.
- **OQ-C3-5. Rounding of `X` in the prompts:**
  - *Assumption:* `X` uses the app's existing `₹` display format; the audit shows the unrounded subtraction. If the existing format rounds to a whole rupee, `X` is rounded up so that adding it always reaches `Y`.
- **OQ-C3-6. "(breed best)" when `T > cap`:**
  - *Assumption:* `Y = effCap = T` and the label still reads "(breed best)"; the audit for `Y` explains that today's milk is used as the cap. In that case AC-5.11's `B` equals `costAtCap`, and both are shown.
- **OQ-C3-7. AC-E7.1 feed suggestion under the library-wide candidate set:**
  - *Assumption:* the suggestion search runs over library feeds not in `C`; since `C` already holds every in-season priced feed, the alert usually states that no library feed brings maintenance within this budget, and the new "Raise the budget by at least ₹`X`/day" line is the actionable message.
- **OQ-C3-8. Ladder rungs that are not optimal after rung 1 (resolved, user 2026-10-15, ADR-0012):**
  - *Resolution:* cannot happen. From rung 1 on, prefixes are nested and each step adds only a feed the solver may leave at 0 kg/day, so every rung is balanced and milk never goes down; tests assert both. The fixed-minimum supplements (`mineral_mix`, `common_salt`) are always in rung 1, because adding one later would add a fixed cost and could lower milk. Rung 0 is outside this chain and may show slightly more milk than rung 1; the UI labels it.
- **OQ-C3-9. Hindi strings for new labels not given in the plan ("You have", "Buy", "Feeds to buy, cheapest first", "Not needed", the prompt and raise-by lines, "Tight budget"):**
  - *Assumption:* the frontend task writes them in the strings file; they stay unverified until a native-speaker review, as in OQ8.

---

## Change 4: Herd and 3-step flow

This section specifies Change 4 (started 2026-10-15, branch `feat/herd-flow`, base commit `2134ab6`) from [PROJECT_MENTAL_MODEL.md](PROJECT_MENTAL_MODEL.md) "Change 4" and [BRAINSTORM.md §12](internal/BRAINSTORM.md). It specifies only what is new or different. Sections 1–5 and Change 3 still hold unless C4.4 lists a criterion as superseded.

### C4.1 Summary

- **Change:** SahiDana becomes a 3-screen app for the whole herd, built for farmers and paravets rather than analysts.
  - Screen 1 "Your animals" (`#/animals`): add each cow or buffalo and set one daily budget for buying feed.
  - Screen 2 "Feed you already have" (`#/feeds`, optional): the feed already at home, in kg per day for all animals, with no price.
  - Screen 3 "Your plan" (`#/result`): the best plan within the budget. It shows one shopping list, "What to buy" (in buying order, with the milk each later feed adds), what to give each animal, what is not needed today, and budget prompts.
  - Nutrient detail sits in a collapsed "Details (for paravet)" inside each animal card. Every number stays one tap from its audit.
  - No AI in the new flow. The user decided on 2026-10-15 ([FEEDBACK.md](internal/FEEDBACK.md) Round 6 item 5): "remove the AI options completely, lets just add the core app features now ill decide upon the AI features later." Screens 1–3 have no description helper and no Explain control. The AI criteria written earlier are kept, unchanged, in C4.8 so they can return later.
  - Seasons are visible: screen 3 says that the feeds to buy come from what is in season today, with today's date. The month always comes from the device date.
- **Change type:** Feature. **Posture:** Prototype; the solver and the number-honesty checks keep thorough tests, including a herd SciPy cross-check.
- **Persona:** the farmer and the paravet reading the same phone screen (a basic Android phone, see [PRODUCT.md](../PRODUCT.md)). The main view uses plain words with no technical terms.
- **Milestones:**
  - **C4-M1** (target 2026-10-16 23:00 IST): screens 1–3 for one animal, breed prefill, home feed at ₹0, the plain result, display units, and the "Not needed" padding fix.
  - **C4-M2** (target 2026-10-17 23:00 IST): several animals, herd budget sharing, the herd shopping list in buying order with per-animal cards, and herd demos. If C4-M2 is not accepted by then, the C4-M1 build is submitted.
- **Constraint restated:** every displayed number comes from the solver, a cited source row, or the user's input, and is tappable to its audit. The single-animal solver (`solveRation`) is unchanged.

**Shared definitions for Change 4** (in addition to section 3 and C3.1):

- **Herd (`H`)**: the animals `a_1 … a_n` in the screen-1 list. `1 ≤ n ≤ 10` from C4-M2 on, and `n = 1` in C4-M1. Each animal has a species, a breed, a body weight `W_i`, today's milk `T_i` and a fat %.
- **Animal label**: each animal gets a label made of its species word and a number counted per species: "Cow 1", "Cow 2", "Buffalo 1" (Hindi "गाय 1", "गाय 2", "भैंस 1"). The number is the highest number used so far for that species in this session plus 1. Labels are not renumbered when an animal is removed (OQ-C4-3).
- **Prefill**: a body-weight or fat field that the user has not typed in shows a value from the selected breed's row in `data/breeds.csv`:
  - **Weight** comes from `female_body_weight_kg`, cited by `body_weight_citation`.
  - **Fat** comes from `fat_pct_low` when `fat_pct_high` is blank (the single cited value). When both are present it is `(fat_pct_low + fat_pct_high) / 2`, labelled "calculated from cited range". It is cited by the `fat_source_*` columns.
  - When the column is blank (for example, weight for Kankrej, HF crossbred, Jersey crossbred, Surti, Mehsana and both non-descript rows; fat for Kankrej, both crossbreds and both non-descript rows), the field stays blank and is required.
  - Once the user types in a field, that field holds "your value" and a later breed change does not overwrite it. A breed change re-prefills only fields the user has not typed in.
- **Milk target (`g_i`)**: `effCap_i = max(cap_i, T_i)` when `T_i > 0`, with `cap_i` per section 3. It is `0` for a dry animal (`T_i = 0`).
- **Home feeds (`Hm`)**: the screen-2 rows. Each row is a library feed `f` with `q_f`, the herd total in kg/day as fed, where `q_f > 0`. A feed appears at most once. Home feeds may be in or out of season and may have no cited price.
- **Planning month (`m`)**: the month of today's device date (user decision 2026-10-15: "make sure the season and months are calculated according to the day"). It cannot be changed in the app. It is read again each time the plan is calculated, so a plan calculated after midnight on the 1st of a month uses the new month.
- **Buy set (`C`, or `C(m)`)**: every library feed whose `availableMonths` includes the planning month `m` and that has a cited default price, at that price, with no per-feed cap. This is the C3 candidate rule with no own feeds. Home feeds are usable in any month, whatever their season.
- **Herd budget (`Bd`)**: the screen-1 amount in ₹/day, spent only on buying feed for the whole herd. It must be `> 0`.
- **Joint herd LP**: one linear program over the herd.
  - For each animal `i` and feed `f`, there is a home amount `h_{i,f} ≥ 0` (for `f ∈ Hm`) and a buy amount `b_{i,f} ≥ 0` (for `f ∈ C`). A feed in both `Hm` and `C` has both variables.
  - Each animal has the existing per-animal constraints: requirements at its milk level `y_i`, its dry-matter intake ceiling from `W_i`, the roughage minimum `r`, and the supplement fixed minimums ([ADR-0012](DECISIONS.md#adr-0012-cheapest-first-upgrade-ladder-from-nested-prefix-solves)).
  - Home stock is shared: `Σ_i h_{i,f} ≤ q_f`.
  - Home feed costs ₹0. The purchase cost is `P = Σ_i Σ_f price_f × b_{i,f}`.
  - No minimum use of any home feed is imposed.
- **Herd maintenance cost (`M_H`)**: the minimum `P` with every `y_i = 0` and no budget row. It is null when that LP is infeasible.
- **Fair share (`t*`)**: Stage 1 maximizes `t ∈ [0, 1]` subject to `y_i = t × g_i` for every animal and `P ≤ Bd`. When every animal is dry, Stage 1 is skipped and `t* = 0`.
- **Per-animal milk**: `Y_i = t* × g_i` (unrounded) and `S_i = ⌊Y_i × 10⌋ / 10`.
- **Herd plan (`F`)**: Stage 2 minimizes `P` subject to `y_i = S_i` for every animal and `P ≤ Bd`. The split of a shared home feed between animals is the solver's.
  - **Home-use tie-break (`F` only):** among plans whose purchase cost equals the minimum `P` within `1e-6` (relative), `F` is one with the least total home use `Σ_i Σ_f h_{i,f}` (kg/day as fed). In plain words: feed exactly what is needed from home and keep the rest for tomorrow. The tie-break does not apply to the ladder prefixes.
  - `F` is the best plan within the budget, and it is the only plan whose amounts appear on the main view: the shopping list, the total line, the animal cards, "Not needed today" and the copied summary.
- **Herd buy list (`Bu_H`)**: the feeds `f ∈ C` with `Σ_i b_{i,f} > 1e-6` in `F`. Supplements come first, cheapest herd ₹/day first, then the rest by herd ₹/day ascending, with ties broken by feed id. This is the C3 buy-list order applied to herd totals.
- **Prefix `k`**: the joint herd LP (Stage 1 and Stage 2) with the buy set restricted to `Bu_H[1..k]`, the same home feeds, herd and budget.
- **Buy-first prefix (`P1`)**: when `Bu_H` is non-empty, `P1` is the prefix `k1` = the smallest `k ≥ s` (`k ≥ 1` when `s = 0`) whose solve is optimal, where `s` is the number of supplements on `Bu_H`. This is the C3 rung-1 rule. `P1` decides only which feeds are in the "Buy first" group; its amounts are not shown on the main view.
- **Later steps**: the prefixes `k1 + 1 … |Bu_H|`, one step per added feed `Bu_H[k]`. The last step is `F`. Steps decide the buying order and the milk gain only; their amounts are not shown on the main view.
  - **Step gain** is `ΔL_k = Σ_i S_i(k) − Σ_i S_i(k − 1)`, which is `≥ 0` because prefixes are nested.
- **Shopping list ("What to buy")**: the feeds of `Bu_H` in `Bu_H` order. Each line shows that feed's herd kg/day and ₹/day from `F`.
  - Group 1, headed "Buy first", holds `Bu_H[1..k1]`.
  - Then, under "Then, if you can", there is one line per later step `k`, for the feed `Bu_H[k]`, ending with its step gain `ΔL_k`.
- **Herd cost at target (`costAtCap_H`)**: the minimum `P` with every `y_i = g_i` and no budget row. It is null when that LP is infeasible or every animal is dry.
- **Herd budget-prompt rule:** "Add ₹`X`/day to reach `Y` L" is shown only when all of these hold:
  - `F` is optimal;
  - the budget is tight in Stage 1;
  - `t* < 1 − 1e-6`;
  - `costAtCap_H` is not null.

  Then `X = ⌈costAtCap_H − Bd⌉` and `Y = Σ_i ⌊g_i × 10⌋ / 10`.
- **Below-maintenance rule:** when `M_H` is not null and `Bd < M_H − 1e-6`, the plan is replaced by "Spend at least ₹`X` more a day", with `X = ⌈M_H − Bd⌉`.
- **Display units (main view):**
  - Rupees are rounded to the nearest whole rupee, except the `X` in the two budget prompts, which is rounded up.
  - kg are shown to 1 decimal place (half up).
  - `mineral_mix` and `common_salt` are shown in grams (`g`), as kg × 1000 rounded to the nearest whole gram.
  - Milk is shown as `S_i` (rounded down to `0.1` L), and herd milk gains are rounded down to `0.1` L.
  - A line is shown when its exact amount is `> 1e-6` kg.
  - The audit drawer shows the exact solver value.
- **Main view**: screen 3 outside the collapsed "Details (for paravet)" panels and outside the audit drawer.

### C4.2 User Journeys

#### Journey C4-A: One animal, three screens (C4-M1, replaces the single-page flow of Journeys C3-A and C3-B)

1. The user opens the app at `#/animals`, titled "Your animals" (Hindi "आपकी गाय-भैंस", pending native review). The add-animal card is open.
2. The user taps **Cow** or **Buffalo** and picks a breed from that species' list, which includes "Desi / don't know" (Hindi "देशी / पता नहीं", pending native review).
3. Body weight and fat fill in from the cited breed row, each with the hint "typical for this breed — change if you know" (Hindi "इस नस्ल के लिए आम — पता हो तो बदलें", pending native review). For a breed with a fat range, the fat hint adds "calculated from cited range". The user can tap either value to see its citation, or type over it.
4. The user types today's milk in L/day and taps **Add**. The animal appears in the list as "Cow 1" (or "Buffalo 1") with **Edit** and **Remove**.
5. The user types the answer to "How much can you spend on feed each day, for all animals?" in ₹/day. **Next** becomes enabled. Before that, it was disabled with a line saying why.
6. On `#/feeds`, "Feed you already have", the user reads "Skip if you have nothing at home.". They search by English or local name, tap a feed to add a row, and type "kg per day you can give (all animals)". They can also tap **Calculate ration** with no rows.
7. On `#/result`, "Your plan", the user sees, top to bottom:
   - "What to buy", one shopping list for the best plan within the budget. It shows the "Buy first" group, then lines under "Then, if you can", each ending "→ about +`L` L milk". Every line shows its kg/day and ₹/day, and the list ends with "₹`A` of your ₹`Bd` a day";
   - "What to give each animal", with one card per animal from the same plan, each line tagged "From home" or "Buy", ending "enough for about `S` L milk";
   - "Not needed today";
   - any budget prompt;
   - the season line "Feeds to buy are chosen from what is in season today (15 October)", with the date tappable to the season sources.
8. The user taps any number to open its audit, and taps "Details (for paravet)" in a card to see nutrients, the breed benchmark and the verdict.
9. The user taps **Copy summary** to copy the plan as plain text.
10. The phone's Back button returns to `#/feeds`, then to `#/animals`, with every input kept.

#### Journey C4-B: Herd (C4-M2, extends Journey C4-A)

1. On screen 1 the user adds up to 10 animals, for example "Cow 1", "Cow 2" and "Buffalo 1". Adding an 11th is refused with a message.
2. The user sets one herd budget, adds home feeds as herd totals, and taps **Calculate ration**.
3. Every animal is kept healthy first. The rest of the budget is shared so every milking animal reaches the same share of its milk target, and a dry animal gets a maintenance ration.
4. "What to buy" shows herd totals in buying order. Each animal's share of the plan is on its own card.
5. The user taps **Remove** on "Cow 2" on screen 3. The app returns to screen 1 with the remaining animals, the budget and the home feeds kept, and the plan must be calculated again.

The AI steps that were in these journeys, and journey C4-C, are deferred to C4.8.

### C4.3 Acceptance Criteria

Quoted strings are the English-mode text. The Hindi text is given where it is proposed, and new Hindi strings stay "pending native review" (OQ-C4-1). AC-L1.2 applies to every new string.

#### C4-M1: Three screens for one animal

- **AC-C4-1.1 (Three screens on hash routes) [C4-M1]:**
  - **Given** the app opens with no hash, `#/`, or an unknown hash,
  - **When** it renders,
  - **Then** it shows screen 1 at `#/animals`, titled "Your animals"; screen 2 is at `#/feeds` ("Feed you already have", Hindi "आपके पास पहले से मौजूद चारा") and screen 3 is at `#/result` ("Your plan", Hindi "आपकी योजना"); opening `#/feeds` or `#/result` with no valid animal and budget redirects to `#/animals`; and opening `#/result` with no current plan redirects to `#/feeds`.
- **AC-C4-1.2 (Add-animal card) [C4-M1]:**
  - **Given** screen 1 with the add-animal card open,
  - **When** the user taps **Cow** or **Buffalo**,
  - **Then** the breed list shows exactly that species' breeds from `data/breeds.csv`, with the non-descript row shown as "Desi / don't know" (Hindi "देशी / पता नहीं"); the card has a today's-milk field in L/day and an **Add** button; and **Add** adds the animal only when species, breed, weight, milk and fat (fat optional when milk is `0`, per OQ1) pass AC-E1.1, showing AC-E1.1's inline errors otherwise.
- **AC-C4-1.3 (Weight prefill) [C4-M1]:**
  - **Given** the user has not typed a body weight,
  - **When** they pick a breed whose `female_body_weight_kg` is filled (for example Rathi, `295`),
  - **Then** the weight field shows that value with the hint "typical for this breed — change if you know", and tapping the value opens the audit drawer with `body_weight_citation` and the line "typical female body weight from the breed table".
- **AC-C4-1.4 (Fat prefill: single value or midpoint) [C4-M1]:**
  - **Given** the user has not typed a fat %,
  - **When** they pick a breed with only `fat_pct_low` (for example Sahiwal, `4.93`) and then a breed with both bounds (for example Rathi, `3.7`–`4`),
  - **Then** the fat field shows `4.93` with the prefill hint; after the second pick it shows `3.85` with the hint and the label "calculated from cited range"; and the audit for `3.85` shows the low value, the high value, the formula `(low + high) / 2` and the `fat_source_*` citation.
- **AC-C4-1.5 (Typed values win) [C4-M1]:**
  - **Given** a prefilled weight and fat,
  - **When** the user types a weight, then picks another breed,
  - **Then** the typed weight is kept and labelled "your value" (no prefill hint), the fat re-prefills from the new breed, and the solver uses the values shown.
- **AC-C4-1.6 (Animal list entry) [C4-M1]:**
  - **Given** a valid add-animal card,
  - **When** the user taps **Add**,
  - **Then** the list shows the animal as "Cow 1" or "Buffalo 1" (Hindi "गाय 1" or "भैंस 1") with its breed and today's milk, and with **Edit** and **Remove**; **Edit** reopens the card with that animal's values and saving keeps the label; **Remove** removes it; and in C4-M1 the add card is hidden while one animal is listed.
- **AC-C4-1.7 (Herd budget field) [C4-M1]:**
  - **Given** screen 1,
  - **When** it renders,
  - **Then** a single budget field labelled "How much can you spend on feed each day, for all animals?" (Hindi "सभी गाय-भैंस के चारे पर रोज़ कितना ख़र्च कर सकते हैं?") takes ₹/day, and a value that is not a number greater than `0` shows "Budget must be a positive number in ₹/day".
- **AC-C4-1.8 (Next gating says why) [C4-M1]:**
  - **Given** screen 1,
  - **When** the list has no animal, or the budget is blank or not greater than `0`,
  - **Then** **Next** is disabled and a line names each missing item: "Add at least one animal" (Hindi "कम से कम एक गाय या भैंस जोड़ें") and/or "Enter how much you can spend each day" (Hindi "रोज़ का ख़र्च लिखें"); with at least 1 listed animal and a valid budget, **Next** is enabled and goes to `#/feeds`.
- **AC-C4-1.9 (Home feed screen) [C4-M1]:**
  - **Given** screen 2,
  - **When** the user searches by an English, transliterated or Devanagari name (AC-3.1) and taps a result,
  - **Then** the text "Skip if you have nothing at home." (Hindi "घर पर कुछ नहीं है तो छोड़ दें।") is shown; a row is added with the feed name, a field "kg per day you can give (all animals)" (Hindi "रोज़ कितने kg दे सकते हैं (सभी गाय-भैंस)") and **Remove**; tapping a feed already listed adds no second row; no row shows a price field, a season mark or a month selector (the month comes from the device date); and every library feed can be added as a home feed in any month.
- **AC-C4-1.10 (Calculate gating on screen 2) [C4-M1]:**
  - **Given** screen 2,
  - **When** there are no rows, or every row has a kg/day greater than `0`,
  - **Then** **Calculate ration** (Hindi "राशन निकालें") is enabled, and tapping it solves and goes to `#/result`; **Back** goes to `#/animals`. (For invalid rows see AC-C4-E4.)
- **AC-C4-1.11 (Home feed is free, capped and optional) [C4-M1]:**
  - **Given** a home feed `f` with `q_f` kg/day,
  - **When** the plan is calculated,
  - **Then** the solver costs `f`'s home amount at ₹0; the herd total of `f` from home is `≤ q_f + 1e-6`; when `f ∈ C`, the plan may also buy `f` at its cited price as a separate line, tagged "Buy"; when `f ∉ C` (out of season or no cited price), `f` is never bought; and the plan's purchase cost is never higher than the same inputs with that home row removed.
- **AC-C4-1.11a (Home feed used only as needed) [C4-M1]:**
  - **Given** one animal, home wheat straw at `20` kg/day, and a budget that already balances the ration,
  - **When** the plan is computed,
  - **Then** the straw used in `F` is no more than the least amount of straw any minimum-purchase plan needs (within `1e-6`), as checked by a SciPy HiGHS case that minimizes home use with the purchase cost fixed at its minimum; and the animal card's "From home" straw line equals that amount (before display rounding).
- **AC-C4-1.12 (Single animal equals the Change 3 solver) [C4-M1]:**
  - **Given** a one-animal herd with no home feeds,
  - **When** the plan is calculated,
  - **Then** `F`'s ration, `S_1`, `Y*`, cost and binding constraint equal `solveRation` run on `C` with the same animal and budget, within `1e-6` (relative); the "Buy first" group equals the feeds of C3 rung 1; the order of the "Then, if you can" lines equals the feeds added by C3 rungs 2 to last; and each line's `ΔL_k` equals the difference between consecutive C3 rung milk figures for the same inputs.
- **AC-C4-1.13 ("What to buy" shopping list) [C4-M1]:**
  - **Given** a feasible plan with `Bu_H` non-empty,
  - **When** screen 3 renders,
  - **Then** the first section is "What to buy" (Hindi "क्या ख़रीदें", pending native review); it lists every feed of `Bu_H` exactly once, in `Bu_H` order, each with its herd kg/day (or g) and ₹/day from `F`; the first group is headed "Buy first" (Hindi "पहले यह ख़रीदें") and holds `Bu_H[1..k1]`; the section ends with the line "₹`A` of your ₹`Bd` a day" (Hindi "आपके ₹`Bd` रोज़ में से ₹`A`"), where `A` is `F`'s purchase cost (whole rupees); and no text on screen 3 says "more money" (Hindi "ज़्यादा पैसे").
- **AC-C4-1.14 ("Then, if you can" lines) [C4-M1]:**
  - **Given** a feasible plan with at least one later step,
  - **When** the shopping list renders,
  - **Then** after the "Buy first" group comes the heading "Then, if you can" (Hindi "फिर, हो सके तो", pending native review) and one line per later step `k`, in step order, reading "`<feed>` `<kg>` (₹`<cost>`) → about +`<L>` L milk" (Hindi "`<feed>` `<kg>` (₹`<cost>`) → लगभग +`<L>` L दूध"), where kg and ₹ come from `F` and `L = ΔL_k` rounded down to `0.1`; `L` is tappable and its audit shows "Solver output", the feeds in prefixes `k − 1` and `k`, and `Σ_i S_i` for each; when `ΔL_k` rounds to `0.0` the line ends "→ same milk" (Hindi "→ उतना ही दूध", pending native review); for a dry-only herd the line has no milk part; and the heading is absent when there is no later step.
- **AC-C4-1.14a (Nothing to buy) [C4-M1]:**
  - **Given** a feasible plan with `Bu_H` empty,
  - **When** screen 3 renders,
  - **Then** "What to buy" shows "Nothing to buy today" (Hindi "आज कुछ ख़रीदना नहीं", pending native review), with no "Buy first" group, no "Then, if you can" lines and no total line.
- **AC-C4-1.15 (Animal card) [C4-M1]:**
  - **Given** a feasible plan,
  - **When** "What to give each animal" (Hindi "हर गाय-भैंस को क्या दें") renders,
  - **Then** each animal has one card, for example "Cow 1: Bhusa 5.0 kg · Wheat bran 1.5 kg · Mineral mix 50 g · Salt 30 g — enough for about 7.0 L milk", from `F`; each line carries exactly one tag, "From home" (Hindi "घर का") for `h_{i,f}` or "Buy" (Hindi "ख़रीदें") for `b_{i,f}`, so a feed both used from home and bought shows two lines; the milk is `S_i(F)`; and a dry animal's card ends "keeps her healthy (dry)" (Hindi "सूखी गाय/भैंस का गुज़ारा", pending native review) instead of a milk figure.
- **AC-C4-1.16 ("Details (for paravet)") [C4-M1]:**
  - **Given** an animal card,
  - **When** it first renders, and then the user taps "Details (for paravet)" (Hindi "विवरण (पैरावेट के लिए)"),
  - **Then** the details are collapsed at first; once expanded they show the nutrient coverage bars (`DM`, `CP`, `ME`, `Ca`, `P`, supplied against required at `S_i`), the intake ceiling, the roughage share against `r`, the breed benchmark per AC-2.4 and AC-2.5, the milk target `g_i` with `t*`, the per-animal verdict (AC-5.6, AC-5.13, the AC-5.7 wording without `Z`, the AC-5.11 first sentence without `B`), the fat line (AC-5.9, AC-5.10), the caveat line and the binding constraint (AC-5.5, or AC-C4-2.10 for a herd); and a second tap collapses them.
- **AC-C4-1.17 ("Not needed today" and its padding) [C4-M1]:**
  - **Given** a feasible plan,
  - **When** some home feeds have a herd total of `≤ 1e-6` kg/day in `F`,
  - **Then** a section "Not needed today" (Hindi "आज ज़रूरत नहीं") names exactly those feeds; it is absent when there are none; and at 375 px wide its content has the same left and right padding as the "What to buy" section (computed style equal, text not touching the card edge).
- **AC-C4-1.18 (Budget prompts) [C4-M1]:**
  - **Given** a plan,
  - **When** the herd budget-prompt rule holds, or the below-maintenance rule holds,
  - **Then** in the first case screen 3 adds "Add ₹`X`/day to reach `Y` L" (Hindi "`Y` L तक पहुँचने के लिए रोज़ ₹`X` और जोड़ें"), with `X` tappable to an audit showing `costAtCap_H`, `Bd`, the subtraction and the rounding up, and `Y` tappable to the milk-target audit; in the second case screen 3 shows only "Spend at least ₹`X` more a day" (Hindi "रोज़ कम से कम ₹`X` और ख़र्च करें"), with `X` tappable to `M_H`, `Bd` and the subtraction, and no "What to buy", cards or "Not needed today"; and neither prompt is shown when its rule does not hold (AC-C3-E4 and AC-C3-E5 read for the herd).
- **AC-C4-1.19 (Display units) [C4-M1]:**
  - **Given** a plan,
  - **When** the main view is inspected,
  - **Then** every ₹ amount is a whole number; every kg amount has exactly 1 decimal place; `mineral_mix` and `common_salt` lines are in whole `g` and never in kg; milk figures have exactly 1 decimal place; and the audit drawer for each such number shows the exact unrounded solver value.
- **AC-C4-1.20 (Every number tappable) [C4-M1]:**
  - **Given** screens 1–3,
  - **When** the user taps any number (a prefilled weight or fat, a kg, g, ₹ or L figure, a total, a milk gain, a prompt figure),
  - **Then** the audit drawer opens with its citation (AC-6.1) or "Solver output" with the stage and LP term (AC-6.2); for a milk gain the audit follows AC-C4-1.14; and a typed input opens "Your input".
- **AC-C4-1.21 (Plain words on the main view) [C4-M1]:**
  - **Given** screen 3 in English mode, in any plan state,
  - **When** the main-view text is inspected,
  - **Then** it contains none of `DM`, `ME`, `CP`, "rung", "binding", "supported milk" or "Stage" (whole words, case-insensitive); in Hindi mode it contains no "चरण" step label; and these terms may appear only inside "Details (for paravet)" and the audit drawer.
- **AC-C4-1.22 (Navigation keeps inputs) [C4-M1]:**
  - **Given** inputs on screens 1 and 2 and a plan on screen 3,
  - **When** the user taps **Back** or **Edit**, or presses the phone's Back button,
  - **Then** the hash moves `#/result` → `#/feeds` → `#/animals` and every animal, the budget and every home-feed row are kept; when the user returns to screen 3 after changing any input, the old plan is not shown until **Calculate ration** is tapped again; and with no input changed, the forward button reshows the same plan.
- **AC-C4-1.24 (Copy summary) [C4-M1]:**
  - **Given** a feasible plan,
  - **When** the user taps **Copy summary**,
  - **Then** the copied plain text, in the active language, is built from `F` and contains "What to buy" with its "Buy first" group, its "Then, if you can" lines with their milk gains, and the total line, then each animal card line, "Not needed today", any budget prompt, the budget, the season line (AC-C4-1.30) and source attribution, using the main-view units.
- **AC-C4-1.25 (Single-animal examples) [C4-M1]:**
  - **Given** the "Try an example" (Hindi "उदाहरण आज़माएँ") section on screen 1 in the C4-M1 build,
  - **When** the user taps each example and goes through to screen 3,
  - **Then** there are three one-animal examples, each filling screens 1 and 2: a lactating buffalo with a feasible plan; a cow with home feed wheat straw only, labelled "Needs feeds to buy" (Hindi "चारा ख़रीदना ज़रूरी"), whose "What to buy" list has at least one line; and a "Tight budget" example showing "Add ₹`X`/day to reach `Y` L". Outcomes are asserted by tests against real solver output.
- **AC-C4-1.30 (Season line) [C4-M1]:**
  - **Given** a plan or a below-maintenance result on screen 3, calculated on device date `d` in month `m`,
  - **When** it renders,
  - **Then** it shows "Feeds to buy are chosen from what is in season today (`<day> <month>`)", for example "… in season today (15 October)" (Hindi "ख़रीदने का चारा आज (`<day> <month>`) मौसम में मिलने वाले चारे से चुना गया है", for example "आज (15 अक्टूबर)", pending native review). The day is in Latin digits and the month name is in the active language. Tapping the date opens the audit drawer listing the feeds in `C(m)`, each with its `availableMonths` and its season source row. The line states that home feeds are used in any month (Hindi pending native review). No control on any screen changes the month. `m` is read from the device date each time **Calculate ration** is tapped, so with the device clock set to the last day of a month and then past midnight, a new calculation uses the new month and the line shows the new date.
- **AC-C4-1.32 (No out-of-season purchase) [C4-M1]:**
  - **Given** any plan with planning month `m`,
  - **When** "What to buy", the "Then, if you can" lines and the "Buy" card lines are inspected,
  - **Then** every bought feed's `availableMonths` includes `m`, and a home feed out of season in `m` can still appear as a "From home" line.
- **AC-C4-1.34 (No AI controls in the new flow; Copy summary stays) [C4-M1]:**
  - **Given** screens 1, 2 and 3 in any state, in either language, online or offline,
  - **When** they render,
  - **Then** there is no description helper (no free-text box, no **Fill from description**, no OpenRouter privacy notice), no "Explain" or "Explain in simple words" control, and no explanation card or verification badge; **Copy summary** is present on screen 3 whenever a plan is shown (AC-C4-1.24); using screens 1–3 makes no request to `/api/llm`; and every plan is the same as with the AI code present.

#### C4-M2: Herd

- **AC-C4-2.1 (Up to 10 animals, labelled per species) [C4-M2]:**
  - **Given** screen 1,
  - **When** the user adds a cow, a cow, then a buffalo,
  - **Then** they are listed as "Cow 1", "Cow 2", "Buffalo 1" (Hindi "गाय 1", "गाय 2", "भैंस 1"); the add card stays available below the list while fewer than 10 animals are listed; after "Cow 1" is removed, the next cow added is "Cow 3"; and the labels on screen 3 match screen 1.
- **AC-C4-2.2 (Remove from the plan returns to screen 1) [C4-M2]:**
  - **Given** a plan for 2 or more animals on screen 3,
  - **When** the user taps **Remove** on an animal card,
  - **Then** that animal is removed, the app goes to `#/animals`, the other animals, the budget and the home feeds are kept, and no plan is shown until **Calculate ration** is tapped again.
- **AC-C4-2.3 (Every animal kept healthy first) [C4-M2]:**
  - **Given** a herd with `Bd ≥ M_H` and `M_H` not null,
  - **When** the plan is calculated,
  - **Then** every animal's ration in `F` and in every prefix solve from `P1` on meets its requirements at `y_i = S_i ≥ 0`, its intake ceiling and the roughage minimum (within `1e-6`), so no animal is below maintenance; and the plan's purchase cost is `≤ Bd + 1e-6`.
- **AC-C4-2.4 (Same share of the milk target) [C4-M2]:**
  - **Given** a herd with at least two milking animals and a feasible plan,
  - **When** Stage 1 runs,
  - **Then** `Y_i / g_i = t*` within `1e-6` for every milking animal; `0 ≤ t* ≤ 1`; each dry animal has `y_i = 0`; no other split of the budget gives every milking animal a share greater than `t*` (checked against the SciPy cross-check, AC-C4-2.9); and Details shows `t*` as "share of milk target" with its solver audit.
- **AC-C4-2.5 (Cheapest purchase at that share, stock shared) [C4-M2]:**
  - **Given** a feasible herd plan,
  - **When** Stage 2 runs,
  - **Then** `F`'s purchase cost is the minimum `P` with every `y_i = S_i` (agreeing with SciPy within tolerance), and among such plans `F`'s total home use `Σ_i Σ_f h_{i,f}` is minimal (agreeing with SciPy within tolerance); for every home feed `f`, `Σ_i h_{i,f} ≤ q_f + 1e-6`; and for every bought feed, the "Buy" card lines summed over animals equal its herd total in "What to buy" within `1e-6` before display rounding.
- **AC-C4-2.6 (Herd shopping list in buying order) [C4-M2]:**
  - **Given** a herd plan with `Bu_H` non-empty,
  - **When** "What to buy" renders,
  - **Then** AC-C4-1.13 and AC-C4-1.14 hold with herd totals from `F`; each prefix from `P1` to the last is a real joint herd solve; every feed of `Bu_H` appears exactly once in the list; supplements on `Bu_H` are in the "Buy first" group; `Σ_i S_i` never decreases from `P1` through each later step, so every `ΔL_k ≥ 0`; the last step equals `F` within `1e-6` (relative); and no per-step per-animal split is shown (each animal's share is its card, AC-C4-2.7).
- **AC-C4-2.7 (Herd cards, dry animal included) [C4-M2]:**
  - **Given** a herd with a dry animal and milking animals,
  - **When** the plan renders,
  - **Then** there is one card per animal in screen-1 list order, each from `F`; the dry animal's card shows a maintenance ration with no milk figure (AC-C4-1.15); and the milking animals' cards show `S_i(F)`.
- **AC-C4-2.8 (Herd budget prompts) [C4-M2]:**
  - **Given** a herd,
  - **When** the herd budget-prompt rule or the below-maintenance rule holds,
  - **Then** AC-C4-1.18 holds with herd totals: `Y` is the sum over milking animals of `⌊g_i × 10⌋ / 10`, and `X` uses `costAtCap_H` or `M_H` of the whole herd; no per-animal budget is shown.
- **AC-C4-2.9 (Herd SciPy agreement) [C4-M2]:**
  - **Given** herd benchmark cases added to `eval/` (at least: 2 animals of different species; a herd with a dry animal; a herd with shared home stock that binds; a herd below maintenance),
  - **When** `npm run eval:dump && npm run eval:scipy` runs,
  - **Then** `t*`, `F`'s purchase cost, `M_H` and `costAtCap_H` equal the SciPy HiGHS results within the suite's tolerance, infeasible or null together, at 100% agreement.
- **AC-C4-2.10 (Herd limit named in Details) [C4-M2]:**
  - **Given** a herd plan,
  - **When** the user opens Details or taps `t*`,
  - **Then** the audit names what limits `t*`: "budget"; "milk target" when `t* = 1`; or a named animal's limit ("`<label>`: intake limit", "roughage", a nutrient), or "home stock: `<feed>`"; and for each test case in which exactly one of these is tight, that one is named.
- **AC-C4-2.11 (Herd examples) [C4-M2]:**
  - **Given** "Try an example" in the C4-M2 build,
  - **When** the user taps each example and goes through to screen 3,
  - **Then** there are exactly three herd examples: "Cow + Buffalo" with a feasible plan for both; "Straw only" with home wheat straw and a "What to buy" list of at least one line; and "Tight budget" showing "Add ₹`X`/day to reach `Y` L". Outcomes are asserted against real solver output.
- **AC-C4-2.14 (Copy summary for a herd) [C4-M2]:**
  - **Given** a plan for 2 or more animals,
  - **When** the user taps **Copy summary**,
  - **Then** the herd plan is copied per AC-C4-1.24 with every animal card in screen-1 list order, and AC-C4-1.34 holds (no Explain control).

#### Edge cases

- **AC-C4-E1 (No animals) [C4-M1]:**
  - **Given** screen 1 with an empty list (including after **Remove** of the last animal),
  - **When** it renders,
  - **Then** **Next** is disabled with "Add at least one animal", and `#/feeds` and `#/result` redirect to `#/animals`.
- **AC-C4-E2 (Budget blank or 0) [C4-M1]:**
  - **Given** at least one animal,
  - **When** the budget is blank, `0`, negative or non-numeric,
  - **Then** **Next** is disabled with "Enter how much you can spend each day", and a typed invalid value also shows "Budget must be a positive number in ₹/day".
- **AC-C4-E3 (Budget below herd maintenance) [C4-M1; herd C4-M2]:**
  - **Given** `M_H` not null and `Bd < M_H − 1e-6`,
  - **When** the user taps **Calculate ration**,
  - **Then** screen 3 shows only "Spend at least ₹`X` more a day" with `X = ⌈M_H − Bd⌉`, with no ration, no animal card and no partial plan; and AC-E7.1's feed suggestion is not shown (OQ-C3-7).
- **AC-C4-E4 (Home-feed row with blank or invalid kg) [C4-M1]:**
  - **Given** screen 2 with a row whose kg/day is blank, `0`, negative or non-numeric,
  - **When** it renders,
  - **Then** the row shows an inline error, **Calculate ration** is disabled, and the line "Enter kg per day for every feed, or remove it" (Hindi "हर चारे के रोज़ के kg लिखें या उसे हटाएँ", pending native review) is shown until the row is fixed or removed.
- **AC-C4-E5 (11th animal) [C4-M2]:**
  - **Given** 10 animals in the list,
  - **When** the user tries to add another,
  - **Then** the list stays at 10 and the message "You can add up to 10 animals" (Hindi "ज़्यादा से ज़्यादा 10 गाय-भैंस जोड़ सकते हैं", pending native review) is shown.
- **AC-C4-E6 (Breed with no cited weight or fat) [C4-M1]:**
  - **Given** a breed whose `female_body_weight_kg` or fat columns are blank (for example "Desi / don't know", Kankrej, HF crossbred),
  - **When** it is picked,
  - **Then** each such field is blank with no hint and no number substituted, and **Add** stays disabled with AC-E1.1's range message until the user types a valid value (fat is optional when milk is `0`).
- **AC-C4-E7 (Language switch on each screen) [C4-M1]:**
  - **Given** inputs on screen 1, rows on screen 2, or a plan on screen 3,
  - **When** the user switches the language on that screen,
  - **Then** the hash and screen stay the same, every input is kept, the plan is not recalculated and its numbers are identical, the animal labels switch ("Cow 1" ↔ "गाय 1"), and AC-L1.2 and AC-L1.3 hold.
- **AC-C4-E8 (Everything works offline) [C4-M1]:**
  - **Given** the device is offline,
  - **When** the user uses screens 1–3, the examples, the audits, the language toggle and **Copy summary**,
  - **Then** all of them work fully with no network request; there is no AI control to disable and no "Needs internet" indicator on screens 1–3 (AC-C4-1.34); and the planning month is still read from the device date.
- **AC-C4-E9 (One animal cannot be fed healthily at any cost) [C4-M1; per-animal naming C4-M2]:**
  - **Given** `M_H` is null,
  - **When** the user taps **Calculate ration**,
  - **Then** no plan is shown (no partial plan); the alert names each animal that fails alone at `0` L with all of `C` and the full home stock, as "`<label>`: `<limit>` limits it", with the limiting nutrient(s) or "roughage" per AC-E2.1 and AC-E2.2 and an **Edit** for that animal; feed suggestions follow AC-C3-E7; and when every animal passes alone, the alert says "These feeds cannot keep all animals healthy together" (pending native review). AC-C4-E12 adds a month hint.
- **AC-C4-E12 (Today's month has too few in-season feeds) [C4-M1]:**
  - **Given** a device date whose month `m` gives a `C(m)` that, with the home feeds, cannot keep every animal healthy (`M_H` null),
  - **When** the user taps **Calculate ration**,
  - **Then** AC-C4-E9 applies: no plan is shown, and the existing diagnosis names the limiting nutrient(s) or "roughage" per animal. The alert adds "Few feeds are in season this month" (Hindi "इस महीने मौसम में कम चारे मिलते हैं", pending native review). The season line with today's date (AC-C4-1.30) is shown, every input is kept, and no month control is offered.

#### Language

- **AC-C4-L1 (One language per screen for the new UI) [C4-M1]:**
  - **Given** Hindi mode,
  - **When** any C4 element is rendered (screen titles, add card, prefill hints, labels, list, budget question, Next/Back/Calculate, gating lines, screen 2 rows, every screen 3 section including "What to buy" and "Then, if you can", tags, Details, prompts, examples, messages, **Copy summary** and its confirmation, the season line with today's date, "Few feeds are in season this month"),
  - **Then** AC-L1.2 and AC-L1.3 hold; the unit `g` joins the exempt units; every new string has an English and a Hindi entry in the strings file; and Hindi text does not use "पशु" for the farmer's cows and buffaloes.

### C4.4 Superseded

These criteria no longer apply from the milestone shown. The criterion that replaces each one is in brackets.

- **From C4-M1:**
  - **Own-feed price and its default:** AC-3.2 (home rows have no price; buy lines use the cited price) [AC-C4-1.9, AC-C4-1.11]; AC-3.6 for home rows (price provenance stays in the audit of "Buy" lines, AC-6.1); AC-C3-2.2; AC-C3-2.4; AC-C3-E3 [AC-C4-E4].
  - **Season marks and month selector on the picker:** AC-3.4, AC-3.5 [AC-C4-1.9, AC-C4-1.30, AC-C4-1.32]. The month selector is gone, and the device date decides `C`. Screen 3 shows which day's season was used (AC-C4-1.30). AC-3.5's rule that an out-of-season feed stays usable is kept for home feeds.
  - **"Today kg" and today's cost:** AC-4.1, AC-4.2, AC-4.3 [AC-C4-1.7, AC-C4-E2]; AC-C3-R5.
  - **Savings vs today and the reference cost:** AC-5.2 [AC-C4-1.13 total line]; the "same milk for ₹`Z` less" part of AC-5.7; the `B` sentence of AC-5.11; AC-C3-R2 as worded [AC-C4-1.16].
  - **Single-page layout:** AC-C3-1.1, AC-C3-1.2, AC-C3-1.3, AC-C3-1.5, AC-C3-1.6 [AC-C4-1.1–1.6, AC-C4-1.25]; the AC-5.3 headline wording [AC-C4-1.15; `S ≤ effCap` still holds per animal]; AC-6.3 Show details and per-feed max caps [AC-C4-1.16]; AC-C3-2.1 [AC-C4-1.8, AC-C4-1.10].
  - **The English rule against the word "animal":** AC-C3-1.4 English part ("Your animals" is approved); the Hindi part continues in AC-C4-L1.
  - **Own-feed candidate set and tags:** AC-C3-2.3, AC-C3-2.5 [shared definitions, AC-C4-1.11, AC-C4-1.12]; AC-C3-2.6 "You have" [AC-C4-1.15 "From home"]; AC-C3-2.11 [AC-C4-1.17]; AC-C3-R4 [deferred, C4.8].
  - **AI layers (deferred, user decision 2026-10-15):** AC-2.2, AC-2.3, AC-7.1, AC-E4.1, AC-E4.2, AC-E5.1, AC-E6.1, AC-L1.5, AC-L1.6, the LLM parts of AC-E3.1 and AC-8.1's place beside Explain, the Explain part of AC-C3-R6, and AC-C3-R4.
    - These do not apply to screens 1–3 [AC-C4-1.34, AC-C4-E8].
    - The code behind them stays unchanged and tested (AC-C4-R7), and C4.8 holds the Change 4 versions for when AI returns.
  - **Rung labels on the main view:** AC-C3-2.7, AC-C3-2.8, AC-C3-2.9, AC-C3-2.10, AC-C3-E1, AC-C3-E2 (rung 0 is gone; the ladder now sets only the buying order and the milk gains in "What to buy") [AC-C4-1.13, AC-C4-1.14, AC-C4-1.14a, AC-C4-1.20, AC-C4-2.6].
  - **Budget messages:** AC-C3-2.12 [AC-C4-1.18]; AC-E7.1 and AC-C3-2.14 [AC-C4-E3].
  - **Other:** AC-8.1 [AC-C4-1.24]; AC-C3-2.15 [AC-C4-1.25, then AC-C4-2.11]; AC-C3-E8 [AC-C4-E8]; AC-C3-E9 [AC-C4-L1].
  - **Historical:** AC-C3-1.7 (C3-M1 only).

### C4.5 Regression Criteria

These existing criteria must keep passing. "Per animal" means the criterion holds for each animal in the herd plan.

- **AC-C4-R1 (Solver and SciPy agreement):**
  - **Given** the 18 benchmark animals and every existing SciPy case,
  - **When** `npm run eval:dump && npm run eval:scipy` runs on each C4 build,
  - **Then** 100% still agree; `solveRation`, Stage 2′ and `costAtCap` (AC-C3-2.13) outputs are unchanged; and AC-5.1, AC-5.4, AC-5.5, AC-C3-R1 hold for a one-animal herd with no home feeds.
- **AC-C4-R2 (Per-animal nutrition rules):**
  - **Given** a plan,
  - **When** each animal's ration is inspected,
  - **Then** AC-2.1 (ranges and requirements), AC-5.12 (roughage), AC-5.13 (dry animal at maintenance), AC-5.6, AC-5.9, AC-5.10, AC-2.4 and AC-2.5 (shown in Details) hold per animal; and `S_i ≤ Y_i ≤ g_i + 1e-6`.
- **AC-C4-R3 (Infeasibility diagnosis):**
  - **Given** inputs that cannot be balanced at `0` L,
  - **When** the plan is calculated,
  - **Then** AC-E2.1, AC-E2.2 and AC-C3-E7 hold per animal (AC-C4-E9), and AC-C3-E4 and AC-C3-E5 hold for the herd prompt.
- **AC-C4-R4 (Validation):**
  - **Given** invalid weight, milk, fat or breed on the add card,
  - **When** it renders,
  - **Then** AC-E1.1's messages appear and **Add** is disabled (AC-C3-R3).
- **AC-C4-R5 (Audit drawer):**
  - **Given** any screen,
  - **When** a number is tapped,
  - **Then** AC-6.1 and AC-6.2 hold: the drawer opens with the citation or "Solver output", closes by its close control, the Escape key or the phone's Back button without changing the screen, and works offline.
- **AC-C4-R6 (Offline core):**
  - **Given** the app was loaded once or installed,
  - **When** it opens offline,
  - **Then** AC-1.1 holds for all 3 screens and the whole flow works offline (AC-C4-E8).
- **AC-C4-R7 (AI endpoint unchanged and unused):**
  - **Given** the C4-M1 and C4-M2 builds,
  - **When** the code and the test suites are inspected and run,
  - **Then** the AI endpoint (`api/llm.ts`) and its client code are unchanged and unused by the new flow (no import from screens 1–3 calls them), and their existing tests stay green.
- **AC-C4-R8 (Feed search):**
  - **Given** screen 2,
  - **When** the user searches,
  - **Then** AC-3.1, AC-3.3 (grouping when no search text) and AC-L1.4 hold.
- **AC-C4-R9 (One language per screen, ADR-0009):**
  - **Given** every C4 state (screen 1 empty, prefilled, listed, 10-animal message, gating; screen 2 empty, rows, invalid row; screen 3 plan, "Nothing to buy today", Details open, both prompts, infeasible with "Few feeds are in season this month", the season line with today's date, offline, audit drawer, copy confirmation),
  - **When** it renders in each language,
  - **Then** AC-L1.1 (default English, remembered, switch without losing inputs), AC-L1.2, AC-L1.7 and AC-C4-L1 hold.
- **AC-C4-R10 (Latin digits):**
  - **Given** any number on any screen, the audit, or the copied summary,
  - **When** it is inspected in either language,
  - **Then** AC-L1.3 holds: Latin digits only, units `kg`, `g`, `L`, `₹`.
- **AC-C4-R11 (Touch targets):**
  - **Given** any screen at 375 px wide,
  - **When** every interactive control (species buttons, Add, Edit, Remove, Next, Back, Calculate, feed results, Details toggles, tappable numbers, example buttons, language toggle, Copy summary, the tappable date in the season line) is measured,
  - **Then** each has a hit area of at least 44 × 44 CSS px.
- **AC-C4-R12 (Suites stay green):**
  - **Given** the C4-M1 and C4-M2 builds,
  - **When** `npm run test:full`, `npx playwright test`, `npm run build` and `npm run compile:data` run,
  - **Then** all exit 0, and expected values changed by this change are updated only from real solver output.

### C4.6 Non-Goals

- No market value of home stock (home feed is always ₹0).
- No total-kg stock over several days (home feed is kg per day only).
- No savings against today's ration.
- No per-animal budgets.
- No saving the herd across reloads: a reload starts at `#/animals` with an empty list. Only the language choice is stored.
- No manual month or season choice: the planning month always comes from today's device date (user decision 2026-10-15).
- AI layers in the new flow (deferred, C4.8): no description helper and no Explain on screens 1–3 (user decision 2026-10-15).
- No LLM-supplied nutrients, prices, breed figures or seasons.
- No change to the single-animal solver formulation, the requirement tables, feed or breed citations, or prices.
- No forced minimum use of home feed.

### C4.7 Open Questions

- **OQ-C4-1. Hindi for new strings:**
  - *Assumption:* the Hindi given in C4.3 is proposed and pending native review; the frontend task enters it in the strings file and marks it unverified, as in OQ8.
- **OQ-C4-2. Which plan the animal cards show:**
  - *Resolved (orchestrator, 2026-10-15, per the user's rule "practical, for farmers, not analysts"):* the cards and the list show `F`, and the steps give the buying order and the milk gain. The main view shows only `F` (cards, "What to buy", total line, "Not needed today", copy summary). The former "Buy first" and "If you have more money" sections are merged into one list, "What to buy", with a "Buy first" group and "Then, if you can" lines. The per-step per-animal split is dropped. See AC-C4-1.13, AC-C4-1.14, AC-C4-1.14a and AC-C4-2.6.
- **OQ-C4-3. Label numbering after a removal:**
  - *Assumption:* labels are stable and never renumbered (removing "Cow 1" leaves "Cow 2"), so a label on screen 3 always means the same animal as on screen 1.
- **OQ-C4-4. "Desi / don't know" label source:**
  - *Question:* `data/breeds.csv` names the row "Non-descript" / "Desi / Non-descript" / "देशी (नस्ल तय नहीं)", while AC-L1.7 requires breed names from the data file.
  - *Assumption:* the data task adds or updates the display name for both non-descript rows to "Desi / don't know" / "देशी / पता नहीं" in `data/breeds.csv`. No figure or citation changes.
- **OQ-C4-5. Partly filled add card when tapping Next:**
  - *Assumption:* only listed animals count. An unsaved card does not block **Next**, and its values are kept if the user comes back.
- **OQ-C4-6. A step whose milk gain rounds to 0.0 L:**
  - *Assumption (adopted by the orchestrator, see AC-C4-1.14):* the line reads "→ same milk" (Hindi "→ उतना ही दूध", pending native review) instead of "+0.0 L".
- **OQ-C4-7. Budget when home feed alone is enough:**
  - *Assumption:* the budget must still be greater than `0` (approved rule). If `M_H = 0` and the plan buys nothing, "What to buy" shows "Nothing to buy today".
- **OQ-C4-8. Breed benchmark on the add card:**
  - *Assumption:* the add card does not show the benchmark (it uses technical labels). It appears in "Details (for paravet)" and in the breed's audit.
- **OQ-C4-9. Examples in C4-M1:**
  - *Assumption:* C4-M1 ships three one-animal examples (AC-C4-1.25), and C4-M2 replaces them with the three herd examples (AC-C4-2.11).
- **OQ-C4-10. Explain in C4-M2 (superseded by [FEEDBACK.md](internal/FEEDBACK.md) Round 6, item 1):**
  - *Superseded:* the default "Explain is shown only for a one-animal herd" no longer holds. Explain covers the whole herd plan `F` (AC-C4-2.12), and the non-goal "whole-herd explanation" is removed.
- **OQ-C4-11. Supplement minimums per animal:**
  - *Assumption:* the ADR-0012 fixed minimums for `mineral_mix` and `common_salt` apply per animal, as in the single-animal solver, so a herd of `n` buys `n` times the minimum.
- **OQ-C4-12. Several animals described in the C4-M1 build:**
  - *Assumption:* the C4-M1 helper adds only the first animal named, as the C4-M1 list holds one animal, and shows "Only one animal can be added in this version" (pending native review). C4-M2 adds them all (AC-C4-2.13).
- **OQ-C4-13. Months offered by "Change month" (removed, user decision 2026-10-15):**
  - *Resolution:* there is no month control. The planning month is the month of today's device date, read again at each calculation (shared definitions, AC-C4-1.30).
- **OQ-C4-14. Herd explanation length (resolved, user decision 2026-10-15):**
  - *Resolution:* the herd explanation is never cut. Every animal is covered, and the full text is shown with no truncation (AC-C4-2.12). The prompt may still ask the model to be brief, but no animal is dropped or grouped away, and the template lists every animal.
- **OQ-C4-15. Feed amounts with no stated kg in the description:**
  - *Assumption:* the feed is added as a home row with a blank kg/day, so the row is invalid (AC-C4-E4) and the user must type an amount before **Calculate ration**. No amount is guessed.
- **OQ-C4-16. Number matching in the explanation verifier (resolved, user decision 2026-10-15):**
  - *Resolution:* matching is unitless, as it is now. A number counts as verified when its value matches an authorized value within the OQ11 tolerance, whatever unit word follows it (AC-C4-1.29).
- **Note on OQ-C4-10, OQ-C4-12, OQ-C4-14, OQ-C4-15 and OQ-C4-16:** these concern the AI layers. They are on hold with C4.8 (user decision 2026-10-15) and apply only if those layers return.

### C4.8 Deferred: AI layers (user decision 2026-10-15)

The user decided on 2026-10-15 ([FEEDBACK.md](internal/FEEDBACK.md) Round 6 item 5): "remove the AI options completely, lets just add the core app features now ill decide upon the AI features later." The criteria below are **not active**. They are kept word for word, IDs included, so they can return later. While deferred:

- AC-C4-1.34 and AC-C4-E8 hold: no AI control appears on screens 1–3.
- AC-C4-R7 holds: the AI endpoint and its code are unchanged and unused.
- The non-goal "no unit-aware number matching" (user decision 2026-10-15) applies to the explanation verifier if these return.

Some deferred criteria cite each other, or cite active criteria whose AI parts have been removed (AC-C4-1.24, AC-C4-E8, AC-C4-R6, AC-C4-R7). Those references are to the versions kept here.

#### Deferred journeys

- **[Deferred] Journey C4-A, step 9:** "Online, the user taps "Explain in simple words" and reads a short English explanation with a verification badge. Offline, a deterministic template explanation is shown instead."
- **[Deferred] Journey C4-B, step 6:** "Online, "Explain in simple words" explains the herd plan: what to buy first and why, what each animal gets, and what limits milk."
- **[Deferred] Journey C4-C: Start with a description (C4-M1 for one animal, C4-M2 for several; alternative to steps 2–6 of C4-A)**
  1. Online, on screen 1, the user expands the collapsed "Describe your animals and feed" helper, reads the privacy notice, and types, for example, *"2 Murrah bhains 8 aur 6 litre, ek gir gaay sukhi, 20 kilo bhusa ghar pe hai, 300 rupaye roz"*.
  2. The user taps **Fill from description**. The animals appear in the list with a "check" mark. The home feeds and the budget are filled in, and weight and fat come from the breed prefill unless they were stated.
  3. **Next** and **Calculate ration** stay blocked until the user taps **Values are right**. **Discard** clears everything the helper filled in.
  4. Unmatched feed names must be mapped to a library feed or dropped. The flow then continues as in C4-A.

#### Deferred acceptance criteria

- **[Deferred] AC-C4-1.23 ("Describe your animals and feed" helper: placement) [C4-M1]:**
  - **Given** screen 1,
  - **When** it renders,
  - **Then** a helper titled "Describe your animals and feed" (Hindi "अपनी गाय-भैंस और चारे के बारे में लिखें", pending native review) is collapsed by default; when expanded it shows the privacy notice of AC-2.2, a free-text box that accepts Hindi, Hinglish or English, and **Fill from description**; and the manual add-animal card stays fully usable whether or not the helper is used.
- **[Deferred] AC-C4-1.26 (Helper extracts one animal, home feeds and budget) [C4-M1]:**
  - **Given** the device is online and the helper is expanded,
  - **When** the user enters a description naming one cow or buffalo, home feeds with amounts, and a daily spend (in Hindi, Hinglish or English) and taps **Fill from description**,
  - **Then** one animal is listed with a "check" mark (Hindi "जाँचें", pending native review), holding its species, its breed only if it matches the breed list for that species (otherwise the breed is blank and required), its today's milk, and its weight or fat only if stated (otherwise the breed prefill of AC-C4-1.3 and AC-C4-1.4 applies); each matched home feed becomes a screen-2 row with its stated kg/day (blank and invalid per AC-C4-E4 when no amount was stated); the stated budget fills the herd budget; and the same description in Hindi, Hinglish and English gives the same prefill (AC-L1.5).
- **[Deferred] AC-C4-1.27 (Prefill must be confirmed) [C4-M1]:**
  - **Given** an unconfirmed prefill from the helper,
  - **When** the user looks at screens 1 and 2,
  - **Then** **Next** and **Calculate ration** are disabled with the line "Check the filled values, then tap Values are right" (Hindi "भरे गए मान जाँचें, फिर 'मान सही हैं' दबाएँ", pending native review); the user can edit any prefilled value; tapping **Values are right** (Hindi "मान सही हैं") removes the "check" marks and unblocks **Next** and **Calculate ration** (subject to AC-C4-1.8 and AC-C4-1.10); tapping **Discard** (Hindi "रद्द करें") removes every animal, home-feed row and budget value the helper filled in and keeps values the user entered before the extraction; and the solver never runs on unconfirmed values.
- **[Deferred] AC-C4-1.28 (Unmatched feeds and LLM numbers) [C4-M1]:**
  - **Given** an extraction naming a feed not in the library,
  - **When** the prefill is shown,
  - **Then** the feed appears under "Unmatched feeds" and must be mapped to a library feed or dropped before **Values are right** is enabled (AC-E5.1); and nothing from the LLM except species, breed name, today's milk, stated weight, stated fat, feed names, feed kg/day and the budget is used (AC-C4-E11).
- **[Deferred] AC-C4-1.29 ("Explain in simple words") [C4-M1]:**
  - **Given** a feasible plan for one animal and the device online,
  - **When** the user taps "Explain in simple words" (Hindi "आसान शब्दों में समझाएँ", pending native review),
  - **Then** the app requests a short plain-English explanation of `F` covering what to buy first and why, what the animal gets, and what limits milk; the explanation body is English in both language modes and the badge is in the active language (AC-L1.6); every number in the body is checked against `F`, the shopping list (kg, ₹, `ΔL`), the per-animal solution (`S_i`, ration lines, `t*`, the limit named per AC-5.5 or AC-C4-2.10), the inputs and the cited rows. Matching is unitless (user decision 2026-10-15): a number in the text is verified when its value matches an authorized value within the OQ11 tolerance, whatever unit word follows it, and there is no unit-aware matching. When all numbers trace, the badge reads "All N numbers verified" (AC-7.1).
- **[Deferred] AC-C4-1.33 (Explain fallback) [C4-M1]:**
  - **Given** a feasible plan,
  - **When** the user taps "Explain in simple words" and the device is offline, the server has no LLM key, or the request fails or times out or is rate limited,
  - **Then** the app shows the deterministic template explanation in the active language (AC-E4.2), built only from `F`, the shopping list, the per-animal solution and cited rows, covering the same three topics, with the template badge; offline it makes no network request; and when the LLM text has an untraced number, AC-E6.1 applies (at most one regeneration, then the template).
- **[Deferred] AC-C4-2.12 (Copy and Explain for a herd) [C4-M2]:** (its Copy summary part is active as AC-C4-2.14)
  - **Given** a plan for 2 or more animals,
  - **When** the user taps **Copy summary** or "Explain in simple words",
  - **Then** **Copy summary** copies the herd plan per AC-C4-1.24 with every animal card; the explanation covers the herd plan `F`: what to buy first and why (herd totals), what each animal gets (by label), and what limits milk (AC-C4-2.10); every number traces per AC-C4-1.29 to `F`, the shopping list, the per-animal solutions (each animal's `S_i`, ration lines and `t*`), the inputs or cited rows; AC-C4-1.33 applies with a deterministic herd template that names every animal by label; and the explanation is never cut (user decision 2026-10-15). The verified LLM text or the template is shown in full for any herd of up to 10 animals, with no truncation, "show more" cut-off or dropped animal, and the screen scrolls to fit it.
- **[Deferred] AC-C4-2.13 (Helper extracts several animals) [C4-M2]:**
  - **Given** the device is online,
  - **When** the description names several animals (for example "2 Murrah buffaloes giving 8 and 6 litres, one dry Gir cow"),
  - **Then** each animal is listed separately with a "check" mark and its own label per species ("Buffalo 1", "Buffalo 2", "Cow 1"), with the AC-C4-1.26 rules applied to each; "2 Murrah buffaloes" with one milk figure gives two animals with that milk; a dry animal gets milk `0`; and AC-C4-1.27 and AC-C4-1.28 hold for the whole prefill.
- **[Deferred] AC-C4-E8, AI version (Online-only helper while offline) [C4-M1]:** (active AC-C4-E8 replaces it)
  - **Given** the device is offline,
  - **When** the user uses screens 1–3, the examples and the audits,
  - **Then** all work with no network request; the helper can still be expanded, but its **Fill from description** is disabled with "Needs internet" (AC-E3.1) and manual entry works fully; "Explain in simple words" stays enabled and shows the deterministic template per AC-C4-1.33 (this replaces AC-E3.1's disabled Explain for Change 4); and the planning month is still read from the device date offline.
- **[Deferred] AC-C4-E10 (LLM returns more than 10 animals) [C4-M2]:**
  - **Given** the device is online and the extraction returns more than 10 animals, or more than fit beside the animals already listed,
  - **When** the prefill is shown,
  - **Then** only the first animals in the order returned are added, up to 10 in the list in total; the message "Only 10 animals can be added; the rest were left out" (Hindi "सिर्फ़ 10 गाय-भैंस जोड़ी जा सकती हैं; बाकी छोड़ दी गईं", pending native review) is shown; and AC-C4-1.27 applies to those added.
- **[Deferred] AC-C4-E11 (LLM returns a nutrient or a price) [C4-M1]:**
  - **Given** an extraction response that contains nutrient values (for example `CP`, `ME`, `TDN`), feed prices, breed caps, season months or any field outside the allowed list of AC-C4-1.28,
  - **When** the prefill is built,
  - **Then** those fields are ignored: no value from them reaches the library, the breed table, the buy set `C`, a prefill field or the solver; the feed library's nutrients and cited prices are unchanged; and the plan equals the plan from the same confirmed inputs entered by hand.
- **[Deferred] AC-C4-R6, AI version (Offline core):** (active AC-C4-R6 replaces it)
  - **Given** the app was loaded once or installed,
  - **When** it opens offline,
  - **Then** AC-1.1 holds for all 3 screens, and AC-E3.1 holds as amended by AC-C4-E8.
- **[Deferred] AC-C4-R7, AI version (LLM safety):** (active AC-C4-R7 replaces it)
  - **Given** the device is online,
  - **When** the helper or Explain is used,
  - **Then** these hold with the extraction schema extended to an animals array, home feeds with kg/day, and the budget:
    - AC-2.2 (privacy notice);
    - the confirm-before-use rule of AC-2.3 (AC-C4-1.27);
    - AC-E4.1 (extraction failure keeps manual entry usable);
    - AC-E4.2, AC-E5.1, AC-E6.1, AC-7.1, AC-L1.5 and AC-L1.6;
    - AC-C3-R6, with Explain per AC-C4-1.29, AC-C4-1.33 and AC-C4-2.12.

    The LLM never supplies a nutrient value, a price, a breed figure or a season (AC-C4-E11).
- **[Deferred] Language-list items** (removed from active AC-C4-L1 and AC-C4-R9):
  - From AC-C4-L1: "the helper with its "check" marks, **Values are right** and **Discard**, the Explain action, badge and template".
  - From AC-C4-R9: "screen 1 helper with an unconfirmed prefill, unmatched feeds and the 10-animal cut message" and "the verified explanation and the template explanation".
