# Data sources: Jaipur regional feed library and breed standards

Web research done on 2026-10-12 for the Track 6 card. D.01 is an LP optimizer, D.02 a regional crop byproduct library, and D.03 an offline PWA for field paravets. This file is the hand-off for the M1 data tasks. Every value here must be checked against the primary document before it goes into `data/*.csv`, and that check is the human verification gate.

**Rule:** never invent a number. Where this file says "not found", the CSV cell stays empty, or the row is labelled `team_estimate` and carries a stated reason.

## 1. Primary nutrient source

NDDB, *Nutritive Value of Commonly Available Feeds and Fodders in India* (2012): https://www.nddb.coop/sites/default/files/pdfs/Animal-Nutrition-booklet.pdf. Keep a gitignored copy in `sources/`.

- **Page numbers:** printed page = PDF page − 12. All pages below are printed pages.
- **Tables:**
  - Table 1 (p.80): concentrates and byproducts.
  - Table 2 (pp.81–93): roughages (green fodders, grasses, hays, straws).
  - Table 3 (pp.94–95): unconventional feeds.
  - CP and ME are given in Mcal/kg on a DM basis.
- **No DM% and no TDN columns.** Take DM% from Feedipedia, the second cited source, and record it in `dm_source_citation`. TDN appears only as ranges in the text.
- **Ca and P:** not yet checked. Verify Tables 4/5 for Ca and P before use.
- **Suspect rows to confirm or drop:**
  - pearl millet green at full bloom, CP 2.4 (T2 p.84);
  - cowpea "mature", CP 25.5 (T2 p.87);
  - guar hay, CP 25.2;
  - fresh "lucerne" early vegetative, CP 25.8 (T2 p.91), whose species header was lost in extraction.

## 2. Vertical 1: indigenous forage

| Feed | Local name(s) in source | Season near Jaipur | Nutrients | Notes |
|---|---|---|---|---|
| Pearl millet (bajra) green | Bajara; "Raj bajra chari-2" (SKNAU Jobner variety) | Kharif | NDDB T2 p.84 (suspect CP) | Common |
| Sorghum (jowar) green | Jowar; "M.P. Chari" | Sown Apr and Aug, cut at 70–90 days | NDDB text p.37 (CP 4–5, TDN 58); hay T2 p.81 | Common |
| Maize green | Makka | Summer, rainy, early winter | NDDB T2 p.83 (CP 12.1, ME 2.2) | Moderate |
| Cowpea | Lobia, Barbati | Sown Feb–Mar or Jul, ready in about 3 months | NDDB T2 p.87 (suspect); text p.36 (CP 18, TDN 59) | Moderate |
| Cluster bean (guar) green | Guar | Sown end-Mar to mid-Jul, cut at 80–90 days | NDDB T2 p.85 (CP 18.1, ME 2.1) | Common |
| Berseem | Egyptian clover | Rabi, irrigated | NDDB T2 p.87 (CP 17.4, ME 2.3); text p.41 | Moderate |
| Lucerne | Lucerne ("rijka" is not in NDDB) | Rabi, perennial | NDDB T2 p.81 hay (CP 16, ME 2.0) | Moderate, irrigated |
| Oats | Oat, Jai | Green Jan to end-Apr (NDDB p.42) | NDDB T2 p.84 (CP 18.8, ME 2.3) | Common |
| Marvel grass | Karad; Jerga | Monsoon | NDDB T2 p.81 hay (CP 4.6, ME 2.1); p.85 fresh | Probably common (Sharma 2013) |
| Buffel grass | Anjan; roondar dhaman | Monsoon, perennial | NDDB T2 p.82 (CP 4.9, ME 1.9); Feedipedia hay | "Anjan" also names a tree in CAZRI papers |
| Sewan | Sewan; "Sewan kuttar" (dry) | Monsoon; hay in lean months | NDDB T2 p.91; Feedipedia node 421 | Niche in western Rajasthan |
| Khejri leaf | Loong; pods: khoka | Leaf Mar–Jun; lopped in winter | NDDB text p.56 (CP 15, TDN 40); Feedipedia node 261 | Common; contains tannins |
| Jharber leaf | Pala; bordi/jharberi | Lopped in winter | NDDB text p.58; CAZRI (CP 12.9–16.9) | Common |
| Ardu leaf | Ardu; Adusa | Lopped twice a year | NDDB text p.59 | Moderate |

**Prices:**
- Jaipur: one undated IndiaMART listing, "green fodder" at ₹3/kg (https://www.indiamart.com/proddetail/green-fodder-20033713355.html).
- Khejri dry leaf: ₹800/q (Bikaner, Patrika, 31 Jul 2025).
- Hadota (Chomu, Jaipur) is named as Rajasthan's largest wholesale fodder market (Down To Earth, 2010), but no prices were given.

**Sources:**
- Sharma 2013, *Annals of Arid Zone* 52(2): https://epubs.icar.org.in/index.php/AAZ/article/download/63283/25898
- CAZRI, *Indian Farming*, Jul 2020: https://epubs.icar.org.in/index.php/IndFarm/article/download/109547/43176/284153
- Feedipedia nodes: 421 (sewan), 261 (khejri), 79 (pala), 11900 (buffel hay)
- Patrika: https://www.patrika.com/bikaner-news/bikaner-news-khejri-tree-felling-triggers-fodder-crisis-sangri-soars-to-1400-rs-kg-19824084

## 3. Vertical 2: seasonal crop residues (Jaipur district)

Crop areas come from ICAR-CRIDA, *Jaipur District Agriculture Contingency Plan* (2011), Table 1.7 p.4 and Table 1.12 p.8: https://www.icar-crida.res.in/CP/Rajastan/RAU,%20Bikaner/RAJ1-Jaipur%203.2.2011.pdf. Jaipur has 889.4k buffalo and 397.1k cattle (p.6).

| Residue | Local name(s) | Crop area, Jaipur | Harvest → available | Nutrients | Importance |
|---|---|---|---|---|---|
| Wheat straw | Bhusa/bhoosa (NDDB); "tudi" (Business Standard) | 136.8k ha | Mar–Apr; stored all year | NDDB T2 p.83 (CP 3.0, ME 1.4); text p.33 | High |
| Bajra stover | Karbi (NDDB) | 295.7k ha (largest crop) | Sep–Oct; stored | Feedipedia node 12442 (DM 93.1, CP 5.2); not in the NDDB table | Very high |
| Barley straw | Bhusa | 51.6k ha | Mar–Apr | NDDB T2 p.83 (CP 4.0, ME 1.7) | High |
| Groundnut haulm | "Groundnut bhoosa" (NDDB) | 46.2k ha | Sep–Oct | NDDB T2 p.83 (CP 15.0, ME 1.9); Feedipedia 12167 | Medium-high |
| Gram (chickpea) straw | not found | 28.9k ha | Feb–Apr | NDDB T2 p.83 (CP 10.1, ME 1.7) | Medium |
| Guar straw | Phalgati, gotar (Feedipedia) | not given | Sep–Oct (not official) | Feedipedia node 311 (3 samples) | Rajasthan is the main guar region |
| Moong straw | not found | Part of 84.5k ha kharif pulses | Sep–Oct (not official) | Feedipedia node 12352 | Highly palatable (NDDB p.33) |
| Jowar stover | Kadbi (common usage, uncited) | not given | Oct–Nov | Feedipedia node 12618; NDDB text p.35 | Optional |
| Mustard straw | — | 137.9k ha | Feb–Apr | NDDB text p.34 | Feed only small amounts, to non-productive animals. Exclude it, or flag it. |

**Prices.** No Jaipur series exists, and none appears in Agmarknet.
- Rajasthan straw ₹2,500–3,000/q in the Apr 2024 shortage: https://www.kisantak.in/news/trending/story/chaff-becomes-more-expensive-than-wheat-in-rajasthan-993863-2024-04-29
- Bikaner up to ₹2,000/q, against a normal ₹400–500/q (May 2022): https://hindi.downtoearth.org.in/agriculture/fooder-is-being-sold-two-to-three-times-more-expensive-82835
- Bhilwara ₹12–13/kg plus ₹2/kg delivery (Apr 2022): https://www.etvbharat.com/hindi/rajasthan/city/bhilwara/straw-price-increased-in-bhilwara-cattle-owners-demand-subsidy-on-it/rj20220418192017725725531
- Harvest windows: RAJFED Rabi 2025-26 purchase guidelines: https://rajfed.in/pdf/Detailed_guidelines_for_purchase_of_gram_mustard_in%20RABI_2025_26.pdf

**Seasonality model:**
- Stored residues (bhusa, karbi) are available in all 12 months.
- Local pulse straws and haulms are available for the harvest month plus 3–4 months.
- The price stays editable on each run.

## 4. Vertical 3: local agro-byproducts and concentrates

| Feed | Local name(s) | Type | Local industry | Nutrients (NDDB) | Price ₹/kg (source, date, reliability) |
|---|---|---|---|---|---|
| Mustard/rapeseed cake | Sarson khal | Protein | Rajasthan has 44–46% of India's mustard; mills in Jaipur, Kotputli, Bharatpur | T1 p.80 (rape seed cake CP 38.0, ME 2.9) | 33 (IndiaMART Jaipur, Aug 2026, listing; range 19–45) |
| Cottonseed cake | Binola khal | Protein | NW Rajasthan cotton belt | T1 p.80 (undecorticated CP 22.8, ME 2.5) | 31–46 (IndiaMART Jaipur, Oct 2026, listing) |
| Guar meal | Korma, churi | Protein | Jodhpur guar-gum industry | T3 p.94 (CP 50.0, ME 2.9); text p.61 (residual gum, anti-trypsin) | 42 (NCDEX figure on IndiaMART Jodhpur, Jul 2026) |
| Groundnut cake | Mungfali khal | Protein | Mainly Gujarat | T1 p.80 (CP 40.0, ME 2.8); aflatoxin risk | Jaipur price not found; SEA Gujarat ₹37,000/MT (9 Oct 2026) |
| Wheat bran | Chokar | Energy/protein | Jaipur flour mills | T1 p.80 (CP 16.0, ME 2.7) | 16–25 (IndiaMART Jaipur, Oct 2026, listing) |
| De-oiled rice bran | DORB | Energy | Not verified as local | T1 p.80 (CP 17.0, ME 2.1) | 11–23 (IndiaMART Jaipur, Oct 2026, listing) |
| Pulse chuni | Churi, chunni (moong, moth, chana) | Protein/energy | Dal mills | Text p.15 only (CP 15–20, TDN 55–65) | 23 (moong churi, IndiaMART Merta City, undated) |
| Bajra grain | Bajra | Energy | Main kharif cereal | T1 p.80 (CP 12, ME 2.2) | 23.6–24.8 (data.gov.in mandi, Malpura/Dausa, 12 Oct 2026) |
| Maize grain | Makka | Energy | Rajasthan mandis | T1 p.80 (CP 9.0, ME 3.1) | 32 (data.gov.in, Malpura, 12 Oct 2026) |
| Barley grain | Jau | Energy | Rabi crop | T1 p.80 (CP 12, ME 2.8) | 29.5 (data.gov.in, Malpura, 12 Oct 2026) |
| Cane molasses | Sheera | Energy | Not verified | T1 p.80 (CP 2.0, ME 2.6); limit 10–15% | not found |
| Saras compound cattle feed | Saras pashu aahar | Balanced | RCDF plants (Kaladera in Jaipur, and others) | Not in the NDDB booklet | about 21–24 (third-party sources, low reliability) |
| Area-specific mineral mixture | — | Mineral | RCDF/NDDB | NDDB area-specific formulations: https://www.nddb.org/sites/default/files/pdfs/Area_Specific_Mineral_Mixture_Formulations_India_2026.pdf (not yet opened) | not found |

**Sources:**
- SEA prices: https://seaofindia.com/ (page layout was garbled; verify each pairing).
- IndiaMART directories: https://dir.indiamart.com/jaipur/mustard-cake.html, …/cottonseed-oil-cake.html, …/wheat-bran.html, …/de-oiled-rice-bran.html, https://dir.indiamart.com/jodhpur/guar-korma.html
- Rajasthan mustard share: https://www.outlookbusiness.com/amp/story/industry/indias-rapeseed-mustard-output-seen-up-35-pc-to-1194-lakh-tonne-in-2025-26-sea
- Cooperative feed plants: https://www.dairyknowledge.in/sites/default/files/8a.pdf

**data.gov.in mandi API** (resource 9ef84268-d588-465a-a308-a864a43d0070):
- Rajasthan commodity strings: `Mustard` (seed), `Maize`, `Bajra(Pearl Millet/Cumbu)`, `Barley(Jau)`, `Wheat`, `Guar`, `Guar Seed(Cluster Beans Seed)`, `Cotton`.
- No cakes, bran, chuni or molasses.
- Decision: no live price API (FEEDBACK Round 3 #1).

**Price reliability labels:**
- `mandi`: data.gov.in;
- `trade_report`: SEA, NCDEX, news;
- `listing`: IndiaMART/TradeIndia, shown as "indicative";
- `team_estimate`: stated reason required.

## 5. Breed milk potential

Wet average = lactation yield ÷ lactation length ("calc" means our own division of the cited figures).

| Breed | Sp. | Female BW kg | Lactation kg (range) / days | Wet avg kg/day | Fat % | Source |
|---|---|---|---|---|---|---|
| Rathi | Cattle | 295 | 1,560 (1,062–2,810) / 336 | 4.64 (calc) | 3.7–4.0 | [R] Table III.2.1 p.46 |
| Tharparkar | Cattle | 295 | 1,749 (913–2,147) / 285 | 6.14 (calc) | 4.9 | [R] p.46 |
| Nagori | Cattle | 318 | 603 (479–905) / 267 | 2.26 (calc) | 5.8 | [R] p.46 (mainly draught) |
| Gir | Cattle | 313 | 2,063 / 326 (breeding tract) | not given | 4.69–4.97 | [G1]; [GJ] p.42; NDDB DKP 2,110 kg, fat 4.6 |
| Kankrej | Cattle | not found | farm 1,954 / 314 | not given | not found | [GJ] p.42 |
| Sahiwal | Cattle | 298 | 2,325 (1,600–2,750) / 318 | 7.31 | 4.93 | [P] Table III.2.1 p.45; peak 11.15 [S] |
| Hariana | Cattle | 325 | 996 (693–1,754) / 272 | 3.66 | 4.5 | [P] p.45 |
| HF crossbred | Cattle | not found | 3,926–4,568 / 312–349 | 14.00 | not found | [P] p.45 |
| Jersey crossbred | Cattle | not found | 1,722–3,476 / 325–357 | 8.16 | not found | [P] p.45 |
| Murrah | Buffalo | 516 | 1,751 (1,003–2,057) / 299 | 5.85 | 7.34 | [P] p.45; peak 7.1–9.64 (range of study means; use 9.64) [BP] |
| Nili-Ravi | Buffalo | 454 | 1,850 / 294 | 6.3 | 6.8–6.9 | [P]; [BP] (peak 9.4 mean; individual range 7.2–11.8) |
| Bhadawari | Buffalo | 402 | 1,232 / 291 (IGFRI herd) | 4.23 (calc) | 8.09 (5.5–14) | [BP] (peak 6.93) |
| Surti | Buffalo | not found | 1,699 / 310 | not given | 7.85–8.10 | [GJ]; [BP] |
| Mehsana | Buffalo | not found | farm 1,840 / 315 | not given | 6.83 | [GJ]; NDDB DKP |

**Source key:**
- [R] NDDB, *Dairying in Rajasthan 2016*: https://nddb.coop/sites/default/files/NDDB_Rajasthan_21-9-16_Final.pdf
- [P] NDDB, *Dairying in Punjab 2014*: https://dairyknowledge.in/dkp/sites/default/files/performance_of_cattle_and_buffalo_breeds.pdf
- [GJ] NDDB, *Dairying in Gujarat 2013*: https://dairyknowledge.in/dkp/sites/default/files/3.2.pdf
- [G1] Gaur et al. 2003, *Animal Genetic Resources* 33:21–29
- [BP] ICAR-CIRB Buffalopedia: https://buffalopedianew.cirb.res.in/
- [S] Pantnagar Sahiwal study: https://krishikosh.egranth.ac.in/items/db0ab41b-307b-4096-a0f9-8355296f77a2

**Non-descript animals.** DAHD *Basic Animal Husbandry Statistics*, kg per in-milk animal per day. Both figures come from secondary summaries; verify against https://dahd.gov.in/sites/default/files/2026-02/BAHS2025.pdf.
- Indigenous/non-descript cattle: 3.86 (2024-25).
- Non-descript buffalo: 4.73 (2023-24).

**Method (FEEDBACK Round 3 #3):**
- Milk cap = top of the cited lactation range ÷ lactation length; otherwise the wet average; otherwise the DAHD average. Each case is labelled in the audit sheet.
- **No cited standard predicts milk from body weight.** Body weight sets the dry-matter intake ceiling only. The ICAR, NRC and NASEM standards estimate intake from body weight and milk.
- NRC 2001 DMI = (0.372 × FCM + 0.0968 × BW^0.75) × (1 − e^(−0.192 × (WOL + 3.67))). Verify the constant against the original.
- **Rejected:** RAJUVAS herd "peak day yield" (https://rajuvas.ac.in/?p=11068). It is the single best cow in each herd, not a breed standard.

## 6. Known gaps

- Jaipur prices: none for straw, green fodder or any cake.
- Harvest months: none official for guar, moong or moth.
- Local names: "khar", "chura", "patti" and "kadbi" are unconfirmed.
- DM% is missing from NDDB, so it comes from Feedipedia.
- Ca/P are not yet checked.
- Breed body weight: missing for Kankrej, Surti, Mehsana and the crossbreds.
- No Rajasthan-specific DAHD per-animal figures.
- NBAGR breed pages could not be reached.
