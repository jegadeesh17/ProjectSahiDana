---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: []
---

# Surface: SahiDana ration workspace (single page)

**Mode:** Operate. **Platform:** web PWA, mobile-first at 390×844, usable at 1280–1600 desktop.

## Audience, job, proof
- A paravet at the farmer's doorstep, often in direct sun, on a basic Android phone, often offline. The farmer may read the screen beside them.
- Job: animal → feeds on hand → **Balance ration** → a ration they can defend. Secondary: a vet or judge audits any number in 30 seconds.
- Proof: every figure carries a source key; tapping it opens the fine print (NDDB table/page, requirement standard/page, or "solver output" plus the constraint it satisfies).

## Constraints
- Every UI string is Hindi + English side by side via `<Bi>` / `src/i18n/strings.ts` (ADR-0005); numbers are Latin digits only, via `src/i18n/format.ts`.
- Fonts are fixed by the architecture: self-hosted Noto Sans + Noto Sans Devanagari, weights 400/600. No other faces.
- WCAG 2.2 AA in daylight; tap targets ≥ 44px; works fully offline.
- All states in docs/SPEC.md, including E1–E6 and L1, plus the two 1-tap demo presets (solved buffalo; straw-only infeasible).

## Direction contract

Replaces the Feed-Sack Analysis Panel direction after prototype feedback round 1 (docs/FEEDBACK.md): the user found it boxy, too bright and too high-contrast, took the familiar path, and named calm health apps (Apple Health, Google Fit) as the bar.

THESIS: A calm, trustworthy health-app reading of a ration. One soft card shows the answer with a big friendly ₹/day and gentle nutrient rings or bars, and every number is quietly tappable for its proof. It refuses heavy frames, hard rules, saturated blocks and stamp theatrics.

OWN-WORLD: Soft off-white ground (~#f6f7f5). White cards with 16–20px radius, no borders or a hairline at ~#e6e8e4, and a gentle low-spread shadow (e.g. 0 1px 2px rgba(0,0,0,.04), 0 4px 16px rgba(0,0,0,.04)). Text is deep slate (~#1f2a24), never pure black; secondary text is ~#5b6660 (AA on white). One muted sage/forest green accent (~#2f7d57) for primary actions, selected states and "met" coverage. A muted amber (~#b7791f) for warnings and a muted red (~#b4443a) for infeasible and errors, each on a soft tinted background (~8–10% tint), never a saturated block. Feed-class colour shows as a small soft dot only. Pills and segmented controls are fully rounded. Noto Sans 400/600 with Noto Sans Devanagari; sentence case, no all-caps headings. Large tabular numerals (₹/day ~40px, 600). Generous spacing on an 8px rhythm. All reading text ≥ 4.5:1.

STORY: The paravet sees a friendly next step, fills a short form, taps one rounded green button, and gets a clear summary card: cost per day, savings, and each nutrient shown as met or not met. An infeasible result is a calm but unmistakable red-tinted card that names the missing nutrient and offers a feed to add, never a ration. The judge taps any number to see its source in a bottom sheet.

FIRST VIEWPORT: Top: a slim white app bar (SahiDana wordmark in green, tagline in muted text, and a small online/offline pill on the right). Under it, two rounded demo chips. Then the "Animal" card (segmented Cow/Buffalo, three rounded inputs), then the "Feeds" card. After Balance, the result card leads: a big ₹/day with savings as a soft green pill, a feeds list with kg/day, then five nutrient rows with rounded progress bars and a met/short label. A status line in small muted text (e.g. "Optimal · 5 of 5 met"). The primary action, **Balance ration**, is a full-width rounded green button in a soft sticky bottom bar on phones. On desktop (≥1024px), the inputs sit in the left column and the result card sticks in the right column.

FORM: Calm health-app cards (canon path chosen by the user in feedback round 1; replaces seed 18e66e46). Named signature interaction: tapping any figure opens a rounded bottom sheet with a grab handle, holding the source citation or "solver output" plus the constraint, with a small "binding" chip. Motion grammar: the sheet slides up over 220ms with ease-out; the result card fades and rises 8px on solve; progress bars fill once over 400ms; nothing else animates; reduced-motion removes all three. States show as soft tinted pills or badges (Verified, Unconfirmed, Offline, Infeasible), never rotated stamps.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Anti-goals
- No boxy look: no thick or black borders, no hard 0px corners, no saturated yellow/green blocks, no pure black, no rotated stamps.
- No glassmorphism, gradients on text, neon or dashboard-template clutter.
- Contrast is softened on frames and fills only; reading text keeps WCAG AA.
- A partial ration never renders as valid.
