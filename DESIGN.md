---
name: SahiDana
description: A calm, health-app reading of a dairy ration in which every figure can be traced to its source.
colors:
  ground: "#f6f7f5"
  surface: "#ffffff"
  sunken: "#f1f4f1"
  track: "#e3e8e3"
  line: "#e6e8e4"
  line-strong: "#cdd5ce"
  control: "#858f88"
  text: "#1f2a24"
  text-2: "#5b6660"
  accent: "#12804a"
  accent-hover: "#0e6b3d"
  accent-ink: "#0b5a33"
  accent-tint: "#e3f4ea"
  accent-tint-2: "#c8ebd8"
  warn: "#a8680f"
  warn-ink: "#704708"
  warn-tint: "#fbf3e1"
  danger: "#b4443a"
  danger-ink: "#8c3128"
  danger-tint: "#faeceb"
  danger-line: "#efd3d0"
  fill-limit: "#5f7a70"
  dot-dry: "#c19a62"
  dot-green: "#7fa86a"
  dot-conc: "#7c9cc9"
  dot-byp: "#c28aa9"
  dot-min: "#6aafb7"
typography:
  display:
    fontFamily: "Noto Sans, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  head:
    fontFamily: "Noto Sans, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Noto Sans, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Noto Sans, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.3
rounded:
  card: "20px"
  inner: "14px"
  control: "12px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    height: "56px"
  button-secondary:
    backgroundColor: "{colors.accent-tint}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.pill}"
    height: "48px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
  input:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    height: "48px"
---

# Design System: SahiDana

## Overview

**Creative North Star: "The Calm Health Card"**

A ration is read the way a health app reads a day: one soft card with one big friendly number, and every supporting figure a quiet tap away from its proof. The reference is Apple Health and Google Fit, chosen by the user in prototype feedback round 1 after the first direction (a printed feed-sack panel) was rejected as boxy, too bright and too high in contrast.

The scene is unchanged: a paravet at a farmer's doorstep, often in direct sun, on a basic Android phone, the farmer reading along. So softness is spent on frames, fills and shadows, never on reading text. Body and label text stays at WCAG 2.2 AA or better (4.5:1 and up; the lowest text pair in the build is 4.8:1).

The system rejects heavy black frames, 0px corners, saturated yellow or green blocks, pure black, rotated stamps, all-caps heads and a dot-matrix status line. It also rejects the dashboard-template look: no glass, no gradients, no neon, no progress-ring clutter. Mode: Operate. The personality lives in the large tabular ₹/day figure, the green accent and the rounded bottom sheet.

**Key characteristics:**
- Soft off-white ground, white cards with 20px radius and a gentle two-layer shadow, no borders on cards.
- One clear, saturated green accent (user round 2: the first sage read dull) for primary actions, selected states and "met". Amber for caution and red for infeasible, each on a soft tinted background, never a saturated block.
- One language at a time. A Hindi / English toggle in the app bar (default English, saved per device) replaces the old side-by-side text.
- Every figure is a button with a quiet dotted underline. Tapping it opens a rounded bottom sheet with its source or its solver constraint.
- A partial ration never renders as valid.

## Colors

One neutral ramp tinted toward green, one accent, two semantic hues. All values are CSS custom properties in `src/index.css`; no component hard-codes a colour.

- **Ground** (`#f6f7f5`): the page.
- **Surface** (`#ffffff`): cards, app bar, bottom bar, sheet.
- **Sunken** (`#f1f4f1`) and **Track** (`#e3e8e3`): input fill, segmented trays, bar tracks, disabled fills.
- **Line** (`#e6e8e4`) and **Line strong** (`#cdd5ce`): hairline separators and decorative edges. **Control** (`#858f88`): the 1px input border, 3.3:1 on white, so a field is identifiable as a control.
- **Text** (`#1f2a24`, deep slate, 14.8:1 on white) and **Text 2** (`#5b6660`, 6.0:1 on white, 5.6:1 on ground, 4.8:1 on the track). Never pure black.
- **Accent** (`#12804a`, a vivid mid green): primary button fill (white text 5.0:1, 6.6:1 on hover `#0e6b3d`), selected segment, coverage bars, the wordmark (5.0:1 on white). **Accent ink** (`#0b5a33`) is the text colour on accent tints (7.3:1 on `#e3f4ea`, 6.5:1 on `#c8ebd8`); the accent itself is not used for text on a tint (4.4:1). **Accent tint** (`#e3f4ea`) fills secondary buttons, "met" and "balanced" pills and the savings pill.
- **Warn** (`#a8680f`, fill only) with **Warn ink** (`#704708`) on **Warn tint** (`#fbf3e1`, 7.3:1): offline, unconfirmed, a shortfall, AI-prefilled values.
- **Danger** (`#b4443a`) with **Danger ink** (`#8c3128`) on **Danger tint** (`#faeceb`, 7.1:1): the infeasible card and form errors only.
- **Feed-class dots** (dry `#c19a62`, green `#7fa86a`, concentrate `#7c9cc9`, by-product `#c28aa9`, mineral `#6aafb7`): a 10px soft dot beside a feed name. Never a fill, text or accent. The class is also in the dot's title and screen-reader text.

**The red rule.** Red appears only for infeasible results and errors, always on its soft tint.

## Typography

Noto Sans with Noto Sans Devanagari, self-hosted, weights 400 and 600 only. No other faces and no monospace: formulas use the same face with tabular numerals.

- Sentence case everywhere. No all-caps heads. Letter-spacing is never applied to Devanagari.
- Scale (about 1.2, rem): 0.8125, 0.9375, 1, 1.125, 1.375, 1.75, 2.5. Body is 16px. The ₹/day figure and the sheet's value are 40px at 600 with `-0.02em` tracking.
- Hierarchy: card titles 600 at 18px; field labels 400 at 15px in Text 2; values and figures 600.
- Devanagari carries its own line height (1.55) so matras are not clipped.
- Numbers always use Latin digits with `kg`, `L`, `₹` and `%`, in both languages. Figures use tabular numerals.

## Layout

Mobile first at 390px, one column on an 8px rhythm: slim white app bar (wordmark, tagline, language toggle, online pill), the one-line "How to use" banner, the animal spec row, two demo chips, the describe-in-words disclosure, the Animal card, the Feeds card, the Budget card, then the result card. After Balance, the form collapses to the spec row and feed chips and the result card scrolls into view.

On phones **Balance ration** is a full-width rounded green button in a soft white bottom bar pinned to the screen edge (rounded top corners, upward shadow).

At 1024px and above the one-line "How to use" banner spans the full width across the top (`grid-column: 1 / -1`), the inputs sit left (5fr) and the result card sits right (7fr). The result card flows with the page (no sticky, no inner scrollbar) and Balance scrolls it into view. **Balance ration** sits inline under the Feeds card; only phones get the pinned bottom bar.

The result card reads top to bottom: title, animal line with a status pill, the big ₹/day with a soft savings pill beside it, the feed table, five nutrient rows (name, tappable percentage, rounded bar with a 100% tick, required and supplied, met or short pill), a small muted status line, Explain and Copy summary, then the explanation.

## Elevation & Depth

Cards use `0 1px 2px` plus `0 4px 16px` at 5% slate. The bottom bar and the sheet use larger upward shadows. The scrim is slate at 34%. There is no glass, no blur and no gradient. Separators are 1px hairlines inside a card.

## Shapes

Cards 20px, inner panels and chips 14px, inputs 12px, buttons, pills, segmented controls and bars fully rounded. The sheet has 24px top corners and a 40×4 grab handle.

## Components

- **App bar:** white, hairline underneath. Wordmark in accent, tagline in Text 2, a Hindi / English segmented toggle (44px tall buttons, `aria-pressed`, each label written in its own script) and an online or offline pill.
- **How-to-use banner (Round 4):** a concise one-line white surface bar (`14px` radius, card shadow, `15px` text) at the top of `<main>` below the app bar and above the inputs (`grid-column: 1 / -1` on desktop). The lead label ("How to use:" / "कैसे इस्तेमाल करें:") is semibold in accent-ink (`#0b5a33`), followed by the plain one-sentence workflow and tap-to-audit reminder in the active language.
- **Cards:** the Animal and Feeds cards and the describe-in-words disclosure. Title 600, fields 16px apart.
- **Buttons:** pill-shaped. Secondary: accent tint with accent-ink text, 48px. Primary: accent with white text, 56px. Small: 44px. Disabled: sunken fill with Text 2, with the next step written above the primary button. Hover and pressed deepen the tint or the green.
- **Inputs:** 48px, sunken fill, 1px control border, 12px radius, label above in Text 2, range hint below, red border plus a tinted message on error, validated on blur. Focus is a 2px accent outline and a white fill. AI-prefilled values carry the warn tint.
- **Segmented control (Cow / Buffalo):** a sunken pill tray; the selected segment is accent with white text.
- **Feed row and chip:** a soft class dot, then one name in the selected language. Hindi: the Devanagari name, else the transliteration, else English. English: the English name. There is no second-language line; search still matches all three spellings. A team-asserted Devanagari name carries a dagger.
- **Figures:** tabular, 600, a 1.5px dotted underline, 44px target, a tint on hover.
- **Result card, pills and bars:** status pills (Balanced, Verified, Unconfirmed, Template, Met, Short, Within limit, Infeasible) are soft tinted pills with a dot and never rotated. Coverage bars are 8px rounded; the fill is accent when met and amber when short, and dry matter uses a muted limit tone.
- **Infeasible card:** a red-tinted panel inside the result card with an Infeasible pill, the limiting nutrients with need and best-case supply (both tappable) and library feeds to add with one tap. No ration table.
- **Fine-print sheet:** a rounded bottom sheet with a grab handle. It shows the value at 40px, then rows for origin, source or solver role, constraint, breakdown and fixture key, and a small "binding" chip with a check. Esc, the scrim and Close dismiss it; focus returns to the figure.
- **Explanation card:** The LLM text (English in both languages), a Verified pill and a verified-count badge; or the fixed template in the selected language with a Template pill and the reason.
- **Prototype strip:** a quiet sunken bar above the app bar. Its small outlined pill buttons force offline, AI errors, rate limit, timeout and the three Explain outcomes, and load example descriptions.
- **Toast:** a deep-slate rounded bar above the bottom bar on phones.
- **Breed benchmark (Round 3):** a sunken panel under the breed select with two tappable figures: the milk potential (with its basis in small Text 2 type: "cited peak daily yield", "lactation average (no peak cited)" or "national average (DAHD)") and the breed fat, or the words "not cited". The audit sheet names the source, the working and the note that 1 kg of milk is about 1 L.
- **Budget field:** its own card after Feeds. A 48px input with a ₹/day unit; while it follows today's ration it carries a neutral "today's cost" pill, once edited a "Use today's cost" quiet button appears next to the tappable today's cost figure. A blank budget with no ration is an error on blur and the next step above Balance says so.
- **Feed picker:** a month select (default the device's month) beside the search field; four groups (Indigenous forage, Crop residues, Agro-byproducts, Mineral) with sticky 14px-semibold headings on a track tint, inside one scrolling tray. A row is a class dot, the name, a price line (₹/kg, reliability word) and a separate Add button. In-season is quiet accent text in the price line; out-of-season is an amber pill button that opens the months and the source's note. Selected rows show price and today's kg; the per-feed maximum sits behind the card's Show details toggle and is echoed as small text when set. A price the user changed gets a neutral "your price" pill.
- **Supports headline:** two equal tiles side by side (also at 375 px): "Today" on a sunken fill and "This ration supports" on the accent tint with accent-ink text, each with its label in small type, the figure at 40px (the same size in both, so the comparison is fair) and "per day". Both figures are tappable. One small Text 2 line below the tiles gives the breed benchmark with its basis label, also tappable. Shown for every solved result except a dry cow or buffalo.
- **Verdict card:** one sentence at 18px semibold inside a tinted panel whose numbers are tappable figures. Green tint for a gain, amber for "less than today", sunken for everything else. A caveat line appears for a gain and for "already at the breed level" only; a "limited by" line appears for "the same as today". The fat comparison is the last line.
- **Cost notes:** under the ration table, two small lines: how far under the budget, and how far under or over today's cost (accent or amber text, never red).
- **Show details:** a quiet pill toggle (`aria-expanded`) under the result. Open, it lists stage 1 milk and what limits it, the breed cap and basis, the stage 2 cost, the maintenance cost, the budget used, the roughage share against its minimum (labelled PROTOTYPE FIXTURE until the cited value arrives) and today's cost, then the five nutrient bars.
- **Budget-below-maintenance card:** the infeasible panel in the amber tint with a "Budget too low" pill, the maintenance cost as a tappable figure and one feed to add; no ration and no milk figure. Red stays for infeasible and errors only.

**States.** Every control has default, hover, visible focus (2px accent outline), pressed and disabled. Data views have idle (requirements shown, supplied blank), loading (static skeleton bars shaped like the content), error (what happened, manual entry still works), infeasible and success.

**Motion.** Three moments only, all removed under `prefers-reduced-motion`: the sheet slides up over 220ms, the result card fades in and rises 8px over 260ms, and each bar fills once over 400ms. All use an exponential ease-out.

## Language

The toggle sets one language for every string, aria-label, toast, the copied summary, the tagline and the audit sheet. Nothing is shown in two languages at once. Default is English; the choice is saved in `localStorage` under `sahidana.lang` (reads and writes are guarded, falling back to English) and `<html lang>` follows it. Devanagari literals live only in `src/i18n/strings.ts`.

Deliberate exceptions: the toggle labels (`हिंदी` and `English`), the wordmark `SahiDana`, units and abbreviations (`kg`, `L`, `g`, `Mcal`, `₹`, `%`, `DM CP ME Ca P`) with Latin digits, source citations and fixture keys in the audit sheet, a feed with no Hindi name (shown in English), and the LLM explanation text, which stays English in both languages.

## Do's and Don'ts

**Do**
- Render strings through `<Bi>` or `bi()` so they follow the selected language, and never show two languages together.
- Make every figure a button that opens its source or its solver constraint.
- Keep reading text at 4.5:1 or better; spend softness on frames, fills and shadows.
- Keep the infeasible card and the limiting nutrient on screen until the inputs change.
- Label prototype fixtures where they appear (`PROTO-*` keys, the footer notice).

**Don't**
- Don't use black or heavy frames, 0px corners, saturated yellow or green blocks, rotated stamps, all-caps heads or a dot-matrix line.
- Don't use gradients, glass, glow or a progress-ring dashboard.
- Don't use red outside infeasible results and errors, or use a feed-class hue outside its dot.
- Don't render a digit outside `0`–`9`, or letter-space Devanagari.
- Don't show a partial or best-effort ration as valid.
- Don't animate anything beyond the three moments above.
