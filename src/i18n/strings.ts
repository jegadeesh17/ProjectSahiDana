// The ONLY source file that may contain Devanagari (ADR-0005, SPEC AC-L1.1).
// Every visible string is a { hi, en } pair. The reader sees one language at a time (the app-bar toggle).
// All Hindi below is UNVERIFIED until the native-speaker review (see HINDI_REVIEW).
import { formatNumber, naturalDecimals } from './format';
import { getActiveLang } from './lang';

export type BiText = { readonly hi: string; readonly en: string };

export const strings = {
  // ---- connectivity, prototype strip ----------------------------------------------------------
  brand_tagline: { hi: 'सही दाना, हर नंबर का हिसाब।', en: 'Sahi dana, har number ka hisaab.' },
  label_language: { hi: 'भाषा', en: 'Language' },
  state_online: { hi: 'ऑनलाइन', en: 'Online' },
  state_offline: { hi: 'ऑफ़लाइन', en: 'Offline' },
  notice_needs_internet: { hi: 'इंटरनेट चाहिए', en: 'Needs internet' },
  label_prototype: { hi: 'प्रोटोटाइप', en: 'Prototype' },
  notice_prototype_fixture: {
    hi: 'प्रोटोटाइप: ये मान फ़िक्स्चर हैं, असली सॉल्वर या प्रमाणित फ़ीड सूची के नहीं।',
    en: 'Prototype: these figures are fixtures, not the real solver or the cited library.',
  },
  label_proto_states: { hi: 'प्रोटोटाइप स्थितियाँ', en: 'Prototype states' },
  label_proto_hint: {
    hi: 'समीक्षकों के लिए: अलग-अलग स्थितियाँ यहाँ से मजबूर करें।',
    en: 'For reviewers: force the states below.',
  },
  label_proto_connection: { hi: 'कनेक्शन', en: 'Connection' },
  proto_conn_auto: { hi: 'अपने-आप', en: 'Automatic' },
  proto_conn_online: { hi: 'ऑनलाइन करें', en: 'Force online' },
  proto_conn_offline: { hi: 'ऑफ़लाइन करें', en: 'Force offline' },
  label_proto_llm: { hi: 'AI सेवा', en: 'AI service' },
  proto_llm_ok: { hi: 'ठीक चल रही', en: 'Working' },
  proto_llm_error: { hi: 'सर्वर त्रुटि', en: 'Server error' },
  proto_llm_rate: { hi: 'सीमा पूरी (429)', en: 'Rate limited (429)' },
  proto_llm_timeout: { hi: 'समय समाप्त', en: 'Timeout' },
  label_proto_explain: { hi: 'व्याख्या का नतीजा', en: 'Explain outcome' },
  proto_explain_verified: { hi: 'सत्यापित', en: 'Verified' },
  proto_explain_regenerated: { hi: 'चिह्नित, फिर दोबारा बनी', en: 'Flagged, then regenerated' },
  proto_explain_fallback: { hi: 'दो बार चिह्नित, टेम्पलेट', en: 'Flagged twice, template' },
  label_proto_examples: { hi: 'उदाहरण विवरण भरें', en: 'Load an example description' },
  proto_example_english: { hi: 'अंग्रेज़ी', en: 'English' },
  proto_example_hinglish: { hi: 'हिंग्लिश', en: 'Hinglish' },
  proto_example_hindi: { hi: 'हिंदी', en: 'Hindi' },
  proto_example_unmatched: { hi: 'अनजान फ़ीड के साथ', en: 'With an unknown feed' },
  action_proto_reset: { hi: 'सब रीसेट करें', en: 'Reset everything' },

  // ---- wayfinding (next decision) -------------------------------------------------------------
  label_how_to_use: { hi: 'कैसे इस्तेमाल करें:', en: 'How to use:' },
  notice_how_to_use: {
    hi: 'पशु चुनें, फ़ीड और रोज़ का बजट भरें, फिर “राशन संतुलित करें” दबाएँ — किसी भी संख्या को दबाकर उसका स्रोत देखें।',
    en: 'Enter the animal, pick feeds and set a daily budget, then tap “Balance ration” — tap any number to see its source.',
  },
  notice_next_animal: { hi: 'अगला कदम: पशु की जानकारी भरें', en: 'Next: enter the animal details' },
  notice_next_fix: { hi: 'अगला कदम: लाल निशान वाले खाने ठीक करें', en: 'Next: fix the fields marked in red' },
  notice_next_feeds: { hi: 'अगला कदम: कम से कम एक फ़ीड जोड़ें', en: 'Next: add at least one feed' },
  notice_next_price: { hi: 'अगला कदम: हर फ़ीड की सही कीमत भरें', en: 'Next: enter a valid price for every feed' },
  notice_next_confirm: { hi: 'अगला कदम: भरे हुए मान की पुष्टि करें', en: 'Next: confirm the prefilled values' },
  notice_next_balance: { hi: 'तैयार: राशन संतुलित करें दबाएँ', en: 'Ready: tap Balance ration' },

  // ---- demo presets ---------------------------------------------------------------------------
  label_demo: { hi: 'एक-टैप डेमो', en: 'One-tap demo' },
  action_demo_buffalo: { hi: 'दुधारू भैंस', en: 'Lactating buffalo' },
  note_demo_solved: { hi: 'हल होता है', en: 'Solves' },
  action_demo_straw: { hi: 'सिर्फ़ भूसा', en: 'Straw only' },
  note_demo_infeasible: { hi: 'नहीं बनता', en: 'Infeasible' },

  // ---- animal ---------------------------------------------------------------------------------
  label_animal: { hi: 'पशु', en: 'Animal' },
  label_animal_line: { hi: 'पशु की जानकारी', en: 'Animal details' },
  label_animal_empty: { hi: 'पशु की जानकारी भरें', en: 'Enter the animal details' },
  label_species: { hi: 'पशु का प्रकार', en: 'Species' },
  label_cow: { hi: 'गाय', en: 'Cow' },
  label_buffalo: { hi: 'भैंस', en: 'Buffalo' },
  label_weight: { hi: 'शरीर का वज़न', en: 'Body weight' },
  label_milk: { hi: 'दूध उत्पादन', en: 'Milk yield' },
  label_fat: { hi: 'दूध में फैट', en: 'Milk fat' },
  label_fat_short: { hi: 'फैट', en: 'fat' },
  hint_range: { hi: 'सीमा {min}–{max} {unit}', en: 'Range {min}–{max} {unit}' },
  hint_dry_animal: {
    hi: 'दूध 0 L होने पर फैट अपने-आप भर जाता है',
    en: 'With 0 L milk the fat fills in by itself',
  },
  error_weight_range: { hi: 'वज़न {min}–{max} kg के बीच होना चाहिए', en: 'Body weight must be {min}–{max} kg' },
  error_milk_range: { hi: 'दूध {min}–{max} L/दिन के बीच होना चाहिए', en: 'Milk yield must be {min}–{max} L/day' },
  error_fat_range: { hi: 'फैट {min}–{max}% के बीच होना चाहिए', en: 'Milk fat must be {min}–{max}%' },
  error_species_required: { hi: 'गाय या भैंस चुनें', en: 'Choose cow or buffalo' },
  error_number_required: { hi: 'एक संख्या लिखें', en: 'Enter a number' },
  action_edit_animal: { hi: 'बदलें', en: 'Edit' },
  action_edit_feeds: { hi: 'बदलें', en: 'Edit' },
  action_done: { hi: 'हो गया', en: 'Done' },

  // ---- free-text extraction -------------------------------------------------------------------
  action_fill_from_description: { hi: 'विवरण से भरें', en: 'Fill from description' },
  label_describe: { hi: 'पशु और फ़ीड का विवरण', en: 'Describe the animal and feeds' },
  notice_openrouter: {
    hi: 'आपका लिखा विवरण OpenRouter को भेजा जाता है। मुफ़्त मॉडल प्रॉम्प्ट लॉग कर सकते हैं।',
    en: 'Your text is sent to OpenRouter. Free models may log prompts.',
  },
  hint_freetext: {
    hi: 'जैसे: 450 किलो की भैंस, 8 लीटर दूध, 6.5% फैट, भूसा और सरसों खली',
    en: 'e.g. 450 kg buffalo, 8 litres milk, 6.5% fat, bhusa and mustard cake',
  },
  error_text_required: { hi: 'पहले विवरण लिखें', en: 'Write a description first' },
  error_text_too_long: { hi: 'विवरण {max} अक्षरों से छोटा रखें', en: 'Keep the description under {max} characters' },
  state_extracting: { hi: 'विवरण पढ़ा जा रहा है…', en: 'Reading the description…' },
  error_llm_rate_limited: {
    hi: 'AI सेवा की मुफ़्त सीमा पूरी हो गई। थोड़ी देर बाद कोशिश करें। हाथ से भरना चालू है।',
    en: 'The AI service is rate limited. Try again in a minute. Manual entry still works.',
  },
  error_llm_upstream: {
    hi: 'AI सेवा अभी उपलब्ध नहीं है। हाथ से भरना चालू है।',
    en: 'The AI service is temporarily unavailable. Manual entry still works.',
  },
  error_llm_timeout: {
    hi: 'AI सेवा ने समय पर जवाब नहीं दिया। हाथ से भरना चालू है।',
    en: 'The AI service took too long to answer. Manual entry still works.',
  },
  error_llm_invalid_request: {
    hi: 'AI सेवा को यह विवरण समझ नहीं आया। इसे बदलें या हाथ से भरें।',
    en: 'The AI service could not use this description. Edit it or fill the form by hand.',
  },
  action_try_again: { hi: 'फिर कोशिश करें', en: 'Try again' },
  label_review_prefill: { hi: 'संतुलित करने से पहले जाँचें', en: 'Review before balancing' },
  notice_prefill_unconfirmed: {
    hi: 'ये मान AI ने भरे हैं। जाँचकर पुष्टि करें, तभी इनसे राशन बनेगा।',
    en: 'The AI filled these values. Check them and confirm before they are used.',
  },
  label_prefill_feeds: { hi: 'मिली हुई फ़ीड', en: 'Matched feeds' },
  label_unmatched_feeds: { hi: 'बिना मिलान वाली फ़ीड', en: 'Unmatched feeds' },
  notice_unmatched: {
    hi: 'ये नाम फ़ीड सूची में नहीं मिले। हर एक को सूची की फ़ीड से जोड़ें या हटाएँ। AI से कोई पोषक मान नहीं लिया जाता।',
    en: 'These names are not in the cited library. Map each to a library feed or drop it. No nutrient values are ever taken from the AI.',
  },
  label_map_to: { hi: 'सूची की फ़ीड चुनें', en: 'Map to a library feed' },
  option_choose_feed: { hi: 'फ़ीड चुनें…', en: 'Choose a feed…' },
  action_drop: { hi: 'हटाएँ', en: 'Drop' },
  action_undo: { hi: 'वापस लें', en: 'Undo' },
  state_dropped: { hi: 'हटाई गई', en: 'Dropped' },
  state_mapped: { hi: 'जोड़ी गई', en: 'Mapped' },
  action_confirm_prefill: { hi: 'मान सही हैं, पुष्टि करें', en: 'Values are right, confirm' },
  notice_resolve_unmatched: {
    hi: 'पहले हर बिना मिलान वाली फ़ीड जोड़ें या हटाएँ',
    en: 'Map or drop every unmatched feed first',
  },
  action_discard_prefill: { hi: 'भरे हुए मान हटाएँ', en: 'Discard prefilled values' },
  state_confirmed: { hi: 'पुष्टि हो गई', en: 'Confirmed' },

  // ---- feeds ----------------------------------------------------------------------------------
  label_feeds: { hi: 'फ़ीड', en: 'Feeds' },
  label_feed_search: { hi: 'फ़ीड खोजें', en: 'Search feeds' },
  hint_feed_search: { hi: 'जैसे: सरसों, भूसा, बाजरा', en: 'e.g. Mustard, Sarson, Bhusa' },
  label_library: { hi: 'फ़ीड सूची', en: 'Feed library' },
  label_selected_feeds: { hi: 'चुनी हुई फ़ीड', en: 'Selected feeds' },
  action_add_feed: { hi: 'जोड़ें', en: 'Add' },
  action_remove_feed: { hi: 'हटाएँ', en: 'Remove' },
  state_added: { hi: 'जुड़ी', en: 'Added' },
  label_price: { hi: 'कीमत ₹/kg', en: 'Price ₹/kg' },
  label_max_cap: { hi: 'अधिकतम kg/दिन', en: 'Max kg/day' },
  label_today_kg: { hi: 'आज kg/दिन', en: 'Today kg/day' },
  hint_optional: { hi: 'वैकल्पिक', en: 'optional' },
  error_price_invalid: { hi: 'कीमत 0 या उससे ज़्यादा लिखें', en: 'Enter a price of 0 or more' },
  error_qty_invalid: { hi: 'मात्रा 0 या उससे ज़्यादा लिखें', en: 'Enter 0 or more' },
  action_view_source: { hi: 'स्रोत देखें', en: 'View source' },
  state_no_results: { hi: 'इस नाम की कोई फ़ीड नहीं मिली', en: 'No feed matches this search' },
  state_no_feeds: {
    hi: 'अभी कोई फ़ीड नहीं चुनी। नीचे सूची से जोड़ें।',
    en: 'No feeds yet. Add feeds from the library below.',
  },
  label_price_date: { hi: 'कीमत की तारीख़', en: 'Price date' },
  category_dry_roughage: { hi: 'सूखा चारा', en: 'Dry roughage' },
  category_green_fodder: { hi: 'हरा चारा', en: 'Green fodder' },
  category_concentrate: { hi: 'दाना', en: 'Concentrate' },
  category_byproduct: { hi: 'खली और उप-उत्पाद', en: 'Cakes and by-products' },
  category_mineral: { hi: 'खनिज', en: 'Mineral' },
  label_team_asserted: { hi: 'टीम का दावा', en: 'team-asserted' },
  label_cited: { hi: 'प्रमाणित स्रोत', en: 'cited' },
  label_derived: { hi: 'व्युत्पन्न', en: 'derived' },
  note_team_asserted_name: {
    hi: 'देवनागरी नाम टीम ने लिखा है (टीम का दावा)',
    en: 'Devanagari spelling written by the team (team-asserted)',
  },

  // ---- balance bar ----------------------------------------------------------------------------
  action_balance_ration: { hi: 'राशन संतुलित करें', en: 'Balance ration' },
  label_skip: { hi: 'राशन विश्लेषण पर जाएँ', en: 'Skip to ration analysis' },

  // ---- analysis box ---------------------------------------------------------------------------
  label_ration_analysis: { hi: 'राशन विश्लेषण', en: 'Ration analysis' },
  label_feed: { hi: 'फ़ीड', en: 'Feed' },
  label_col_kg: { hi: 'kg/दिन, जैसी है वैसी', en: 'kg/day, as fed' },
  label_col_cost: { hi: '₹/दिन', en: '₹/day' },
  label_total: { hi: 'कुल', en: 'Total' },
  label_cost_per_day: { hi: 'रोज़ की लागत', en: 'Cost per day' },
  unit_inr_per_day: { hi: '₹/दिन', en: '₹/day' },
  label_max_set: { hi: 'अधिकतम {kg}/दिन', en: 'Max {kg}/day' },
  label_details_feeds: { hi: 'हर फ़ीड की अधिकतम सीमा', en: 'Max kg/day for each feed' },
  label_per_day: { hi: 'प्रति दिन', en: 'per day' },
  label_saves: { hi: 'आज के राशन से बचत', en: 'Saved against today’s ration' },
  label_extra: { hi: 'आज के राशन से ज़्यादा खर्च', en: 'More than today’s ration' },
  label_today_cost: { hi: 'आज के राशन की लागत', en: 'Today’s ration cost' },
  notice_no_today: {
    hi: 'बचत देखने के लिए फ़ीड में “आज kg/दिन” भरें',
    en: 'Fill “Today kg/day” on the feeds to see savings',
  },
  nutrient_dm: { hi: 'शुष्क पदार्थ', en: 'Dry matter' },
  nutrient_cp: { hi: 'क्रूड प्रोटीन', en: 'Crude protein' },
  nutrient_me: { hi: 'चयापचय ऊर्जा', en: 'Metabolizable energy' },
  nutrient_ca: { hi: 'कैल्शियम', en: 'Calcium' },
  nutrient_p: { hi: 'फ़ॉस्फ़ोरस', en: 'Phosphorus' },
  label_required: { hi: 'आवश्यक', en: 'Required' },
  label_limit: { hi: 'सीमा', en: 'Limit' },
  label_supplied: { hi: 'मिला', en: 'Supplied' },
  label_used: { hi: 'उपयोग', en: 'Used' },
  label_coverage: { hi: 'पूर्ति', en: 'Coverage' },
  label_over_limit: { hi: 'सीमा से ऊपर', en: 'Over the limit' },
  state_met: { hi: 'पूरा', en: 'Met' },
  state_short: { hi: 'कम', en: 'Short' },
  state_within_limit: { hi: 'सीमा में', en: 'Within limit' },
  status_line_optimal: {
    hi: 'एलपी इष्टतम · {met}/{total} पूरे · हल {date}',
    en: 'Optimal · {met} of {total} met · solved {date}',
  },
  status_line_infeasible: {
    hi: 'एलपी असंभव · {n} कम · जाँच {date}',
    en: 'Infeasible · {n} short · checked {date}',
  },
  status_line_idle: { hi: 'हल का इंतज़ार', en: 'Waiting for input' },
  stamp_balanced: { hi: 'संतुलित', en: 'Balanced' },
  stamp_infeasible: { hi: 'असंभव', en: 'Infeasible' },
  stamp_verified: { hi: 'सत्यापित', en: 'Verified' },
  stamp_template: { hi: 'टेम्पलेट', en: 'Template' },
  stamp_unconfirmed: { hi: 'अपुष्ट', en: 'Unconfirmed' },
  state_idle_title: { hi: 'अभी राशन नहीं बना', en: 'No ration yet' },
  notice_idle_body: {
    hi: 'पशु और फ़ीड भरें, फिर “राशन संतुलित करें” दबाएँ। नतीजा यहाँ छपेगा।',
    en: 'Fill in the animal and the feeds, then tap “Balance ration”. The analysis prints here.',
  },
  label_requirement_only: { hi: 'पशु की रोज़ की ज़रूरत', en: 'Daily requirement of this animal' },
  hint_tap_figure: {
    hi: 'किसी भी संख्या को दबाएँ: स्रोत या सॉल्वर की शर्त दिखेगी',
    en: 'Tap any figure to see its source or solver constraint',
  },

  // ---- infeasible -----------------------------------------------------------------------------
  label_infeasible_title: { hi: 'इन फ़ीड से राशन नहीं बन सकता', en: 'These feeds cannot meet the requirement' },
  notice_infeasible_body: {
    hi: 'कोई अधूरा राशन नहीं दिखाया जा रहा। कमी वाले पोषक नीचे हैं; उन्हें पूरा करने वाली फ़ीड जोड़ें।',
    en: 'No partial ration is shown. The limiting nutrients are below; add a feed that covers them.',
  },
  label_limiting: { hi: 'कमी वाले पोषक', en: 'Limiting nutrients' },
  label_need: { hi: 'ज़रूरत', en: 'Need' },
  label_can_supply: { hi: 'ये फ़ीड अधिकतम दे सकती हैं', en: 'These feeds supply at most' },
  label_suggested_feeds: { hi: 'ये फ़ीड जोड़कर देखें', en: 'Try adding one of these feeds' },
  label_rich_in: { hi: 'इसमें {nutrients} भरपूर', en: 'Rich in {nutrients}' },
  notice_dm_conflict: {
    hi: 'शुष्क पदार्थ की सीमा में सारी ज़रूरतें एक साथ पूरी नहीं हो रहीं। ज़्यादा घने पोषक वाली फ़ीड जोड़ें।',
    en: 'The needs cannot all be met within the dry matter limit. Add a more nutrient-dense feed.',
  },

  // ---- explain, copy --------------------------------------------------------------------------
  action_explain: { hi: 'समझाएँ', en: 'Explain' },
  action_copy_summary: { hi: 'सारांश कॉपी करें', en: 'Copy summary' },
  label_explanation: { hi: 'राशन की व्याख्या', en: 'Ration explanation' },
  state_explaining: { hi: 'व्याख्या तैयार हो रही है…', en: 'Writing the explanation…' },
  badge_all_verified: { hi: 'सभी {n} संख्याएँ सत्यापित', en: 'All {n} numbers verified' },
  badge_template_fallback: { hi: 'निश्चित टेम्पलेट, AI का लिखा पाठ नहीं', en: 'Fixed template, not AI-written text' },
  notice_explain_flagged: {
    hi: 'AI के पहले पाठ में एक संख्या का स्रोत नहीं मिला ({numbers}) और उसे हटाया गया। एक बार दोबारा बनवाया, तब सब संख्याएँ मिलीं।',
    en: 'One number in the first AI text could not be traced ({numbers}), so it was discarded. The text was regenerated once and every number now checks out.',
  },
  notice_explain_untraced: {
    hi: 'दोबारा बनाने पर भी AI के पाठ में बिना स्रोत की संख्या ({numbers}) रही, इसलिए AI पाठ हटाकर निश्चित टेम्पलेट दिखाया गया है।',
    en: 'The regenerated AI text still had an untraced number ({numbers}), so it was discarded and the fixed template is shown.',
  },
  notice_explain_unavailable: {
    hi: 'AI व्याख्या नहीं मिल सकी। नीचे सॉल्वर और स्रोतों से बना निश्चित टेम्पलेट है।',
    en: 'The live AI explanation could not be reached. Below is the fixed template built from the solver and cited sources.',
  },
  label_english_only: { hi: 'AI का पाठ सिर्फ़ अंग्रेज़ी में है', en: 'The AI text is in English only' },
  template_animal: {
    hi: 'पशु: {species}, वज़न {weight}, दूध {milk}/दिन, फैट {fat}।',
    en: 'Animal: {species}, body weight {weight}, milk {milk}/day, fat {fat}.',
  },
  template_feed_line: {
    hi: '{feed}: रोज़ {kg}, लागत {cost}।',
    en: '{feed}: {kg} per day as fed, cost {cost}.',
  },
  template_total: { hi: 'कुल लागत {cost} प्रति दिन।', en: 'Total cost is {cost} per day.' },
  template_coverage: {
    hi: 'पोषक पूर्ति: CP {cp}, ME {me}, Ca {ca}, P {p}। DM {dm} सीमा में से उपयोग हुआ।',
    en: 'Nutrient coverage: CP {cp}, ME {me}, Ca {ca}, P {p}. Dry matter used is {dm} of the limit.',
  },
  template_savings: {
    hi: 'आज के राशन से बचत {amount} प्रति दिन ({pct})।',
    en: 'This saves {amount} per day against today’s ration ({pct}).',
  },
  template_source: {
    hi: 'हर संख्या सॉल्वर आउटपुट या स्रोत सूची से ली गई है।',
    en: 'Every number comes from the solver output or the cited sources.',
  },
  toast_copied: { hi: 'सारांश कॉपी हो गया', en: 'Summary copied' },
  toast_copy_failed: {
    hi: 'कॉपी नहीं हो सका। पाठ चुनकर हाथ से कॉपी करें।',
    en: 'Could not copy. Select the text and copy it by hand.',
  },
  summary_title: { hi: 'सहीदाना राशन सारांश', en: 'SahiDana ration summary' },
  summary_ration: { hi: 'राशन (kg/दिन, जैसी है वैसी)', en: 'Ration (kg/day, as fed)' },
  summary_cost: { hi: 'कुल लागत', en: 'Total cost' },
  summary_sources: { hi: 'स्रोत', en: 'Sources' },
  summary_coverage: { hi: 'पोषक पूर्ति', en: 'Nutrient coverage' },

  // ---- audit sheet ("the fine print") ---------------------------------------------------------
  audit_title: { hi: 'छोटे अक्षरों में हिसाब', en: 'The fine print' },
  action_close: { hi: 'बंद करें', en: 'Close' },
  audit_value: { hi: 'मान', en: 'Value' },
  audit_origin: { hi: 'मान कहाँ से आया', en: 'Where it comes from' },
  audit_origin_cited: { hi: 'प्रकाशित स्रोत', en: 'Cited source' },
  audit_origin_solver: { hi: 'सॉल्वर आउटपुट', en: 'Solver output' },
  audit_origin_input: { hi: 'आपने भरा', en: 'Entered by you' },
  audit_source: { hi: 'स्रोत', en: 'Source' },
  audit_table: { hi: 'तालिका', en: 'Table' },
  audit_page: { hi: 'पृष्ठ', en: 'Page' },
  audit_formula: { hi: 'सूत्र', en: 'Formula' },
  audit_status: { hi: 'स्थिति', en: 'Status' },
  audit_role: { hi: 'सॉल्वर में भूमिका', en: 'Role in the solver' },
  audit_constraint: { hi: 'किस शर्त को पूरा करता है', en: 'Constraint it satisfies' },
  audit_breakdown: { hi: 'हिसाब', en: 'Breakdown' },
  audit_binding: { hi: 'बाधक शर्त', en: 'Binding constraint' },
  audit_binding_yes: {
    hi: 'हाँ: यही शर्त सबसे सस्ते राशन की हद तय करती है',
    en: 'Yes: this constraint sets the limit of the cheapest ration',
  },
  audit_binding_no: { hi: 'नहीं: इस शर्त में गुंजाइश बची है', en: 'No: this constraint has slack' },
  audit_fixture_key: { hi: 'फ़िक्स्चर कुंजी', en: 'Fixture key' },
  audit_fixture_note: {
    hi: 'प्रोटोटाइप फ़िक्स्चर: प्रमाणित सूची M1 में आएगी।',
    en: 'Prototype fixture. The cited library arrives in M1.',
  },
  audit_user_input: {
    hi: 'यह मान आपने भरा है; इसका कोई प्रकाशित स्रोत नहीं है।',
    en: 'You entered this value; it has no published source.',
  },
  audit_label_requirement: { hi: 'आवश्यकता: {nutrient}', en: 'Requirement: {nutrient}' },
  audit_label_supplied: { hi: 'मिला: {nutrient}', en: 'Supplied: {nutrient}' },
  audit_label_coverage: { hi: 'पूर्ति %: {nutrient}', en: 'Coverage: {nutrient}' },
  audit_label_feed_kg: { hi: '{feed}: मात्रा (kg/दिन)', en: '{feed}: amount (kg/day, as fed)' },
  audit_label_feed_cost: { hi: '{feed}: लागत (₹/दिन)', en: '{feed}: cost (₹/day)' },
  audit_label_price: { hi: '{feed}: कीमत (₹/kg)', en: '{feed}: price (₹/kg)' },
  audit_label_total_kg: { hi: 'कुल मात्रा (kg/दिन)', en: 'Total as fed (kg/day)' },
  audit_label_total_cost: { hi: 'कुल लागत (₹/दिन)', en: 'Total cost (₹/day)' },
  audit_label_savings: { hi: 'बचत (₹/दिन)', en: 'Savings (₹/day)' },
  audit_label_today_cost: { hi: 'आज के राशन की लागत (₹/दिन)', en: 'Today’s ration cost (₹/day)' },
  audit_label_max_supply: { hi: 'अधिकतम आपूर्ति: {nutrient}', en: 'Most these feeds can supply: {nutrient}' },
  audit_role_objective: { hi: 'लक्ष्य: कुल लागत घटाना', en: 'Objective: minimise total cost' },
  audit_role_decision: { hi: 'निर्णय चर: हर फ़ीड की मात्रा', en: 'Decision variable: amount of each feed' },
  audit_role_min: { hi: 'न्यूनतम शर्त: मिला ≥ आवश्यक', en: 'Minimum constraint: supplied ≥ required' },
  audit_role_dm: { hi: 'ऊपरी सीमा: उपयोग ≤ DM सीमा', en: 'Upper limit: used ≤ DM limit' },
  audit_role_derived: { hi: 'सॉल्वर के आउटपुट से निकला', en: 'Derived from solver outputs' },
  audit_role_diagnosis: { hi: 'निदान: सबसे अच्छी स्थिति में आपूर्ति', en: 'Diagnosis: supply in the best case' },
  audit_constraint_cost: { hi: 'न्यूनतम करें: Σ (कीमत × मात्रा)', en: 'Minimise: Σ (price × amount)' },
  audit_constraint_min: {
    hi: 'Σ (मात्रा × {nutrient} प्रति kg) ≥ {nutrient} की आवश्यकता',
    en: 'Σ (amount × {nutrient} per kg) ≥ {nutrient} requirement',
  },
  audit_constraint_dm: {
    hi: 'Σ (मात्रा × DM%) ≤ DM सीमा',
    en: 'Σ (amount × DM%) ≤ DM limit',
  },
  audit_constraint_cap: { hi: 'मात्रा ≤ आपकी तय अधिकतम सीमा', en: 'amount ≤ your max kg/day cap' },
  audit_constraint_none: { hi: 'कोई अलग शर्त नहीं, कीमत × मात्रा', en: 'No separate constraint: price × amount' },
  audit_constraint_savings: { hi: 'आज की लागत − संतुलित लागत', en: 'today’s cost − balanced cost' },
  audit_constraint_diagnosis: {
    hi: 'सबसे घने पोषक वाली चुनी फ़ीड से शुष्क पदार्थ की सीमा तक भरने पर',
    en: 'Filling the dry matter limit with the densest selected feeds first',
  },
  // ---- breed and benchmark (Round 3) ----------------------------------------------------------
  label_breed: { hi: 'नस्ल', en: 'Breed' },
  option_choose_breed: { hi: 'नस्ल चुनें…', en: 'Choose a breed…' },
  hint_breed_first: { hi: 'पहले गाय या भैंस चुनें', en: 'Choose cow or buffalo first' },
  error_breed_required: { hi: 'नस्ल चुनें', en: 'Select a breed' },
  label_benchmark_breed: { hi: 'नस्ल का मानक', en: 'Breed benchmark' },
  label_benchmark_national: { hi: 'राष्ट्रीय औसत (DAHD)', en: 'National average (DAHD)' },
  label_milk_cap: { hi: 'नस्ल का औसत दूध', en: 'Reported breed average' },
  label_milk_cap_benchmark: { hi: 'प्रकाशित नस्ल-मानक दूध', en: 'Cited breed benchmark' },
  label_milk_cap_national: { hi: 'राष्ट्रीय औसत दूध', en: 'National average' },
  label_breed_fat: { hi: 'नस्ल का फैट', en: 'Breed fat' },
  label_not_cited: { hi: 'उल्लेख नहीं', en: 'not cited' },
  hint_tap_benchmark: { hi: 'आँकड़े को दबाएँ: स्रोत और हिसाब दिखेगा', en: 'Tap a figure to see its source and working' },
  basis_cited_peak: { hi: 'स्रोत में दर्ज दैनिक उत्पादन', en: 'cited daily yield, as reported' },
  basis_range_top: { hi: 'ब्यांत का औसत (चरम दर्ज नहीं)', en: 'lactation average (no peak cited)' },
  basis_breed_average: { hi: 'ब्यांत का औसत (चरम दर्ज नहीं)', en: 'lactation average (no peak cited)' },
  basis_breed_average_calc: { hi: 'ब्यांत का औसत (चरम दर्ज नहीं)', en: 'lactation average (no peak cited)' },
  basis_dahd_average: { hi: 'राष्ट्रीय औसत (DAHD)', en: 'national average (DAHD)' },
  basis_cited_peak_explain: {
    hi: 'स्रोत में दर्ज नस्ल का दैनिक दूध (स्रोत-टिप्पणी देखें); इसे ही सीमा माना गया',
    en: 'The daily yield the source reports for the breed (see the source note), used as the cap',
  },
  basis_range_top_explain: {
    hi: 'प्रकाशित दुग्ध-उत्पादन सीमा का ऊपरी मान, दुग्ध-अवधि के दिनों से भाग दिया गया',
    en: 'Top of the cited lactation yield range, divided by the lactation length',
  },
  basis_breed_average_explain: {
    hi: 'नस्ल का प्रकाशित औसत दैनिक दूध',
    en: 'The breed’s cited average daily yield',
  },
  basis_breed_average_calc_explain: {
    hi: 'प्रकाशित दुग्ध-उत्पादन को दुग्ध-अवधि के दिनों से भाग दिया गया (हमारी अपनी गणना)',
    en: 'Cited lactation yield divided by the lactation length (our own division)',
  },
  basis_dahd_average_explain: {
    hi: 'प्रति दुधारू पशु राष्ट्रीय औसत (DAHD); नस्ल तय न होने पर यही लिया गया',
    en: 'National average per in-milk animal (DAHD), used because the breed is not known',
  },
  note_milk_kg_l: { hi: '1 kg दूध ≈ 1 L (मान्यता)', en: '1 kg of milk ≈ 1 L (assumption)' },
  audit_label_breed_cap: { hi: 'दूध की सीमा: {breed}', en: 'Milk cap: {breed}' },
  audit_label_breed_fat: { hi: 'नस्ल का फैट: {breed}', en: 'Breed fat: {breed}' },
  audit_cap_working: {
    hi: 'हिसाब: {yield} kg ÷ {days} दिन = {cap} L/दिन',
    en: 'Working: {yield} kg ÷ {days} days = {cap} L/day',
  },
  audit_cap_working_avg: { hi: 'प्रकाशित औसत: {cap} L/दिन', en: 'Cited average: {cap} L/day' },
  audit_cap_working_cited: { hi: 'प्रकाशित मान: {cap} L/दिन', en: 'Cited figure: {cap} L/day' },
  audit_expert_pending: { hi: 'विशेषज्ञ जाँच: बाकी', en: 'Expert check: pending' },
  audit_cap_basis: { hi: 'सीमा का आधार', en: 'How the cap is set' },
  audit_notes: { hi: 'टिप्पणी', en: 'Note' },
  audit_peak_note: { hi: 'उत्पादन पर टिप्पणी', en: 'Yield note' },
  audit_source_note: { hi: 'स्रोत पर टिप्पणी', en: 'Source note' },
  action_use_today_cost: { hi: 'आज की लागत लें', en: 'Use today’s cost' },
  status_line_budget_low: { hi: 'बजट कम · गुज़ारे से नीचे · जाँच {date}', en: 'Budget below maintenance · checked {date}' },

  // ---- daily budget ---------------------------------------------------------------------------
  label_budget: { hi: 'रोज़ का बजट', en: 'Daily budget' },
  label_budget_today_cost: { hi: 'आज की लागत', en: 'today’s cost' },
  hint_budget_default: {
    hi: 'आज का राशन भरने पर बजट अपने-आप आज की लागत हो जाता है। अपना बजट लिखकर बदलें।',
    en: 'Fills in as today’s cost when you enter today’s ration. Type to set your own.',
  },
  hint_budget_required: {
    hi: 'आज का राशन खाली है, इसलिए बजट लिखना ज़रूरी है',
    en: 'Today’s ration is blank, so a budget is needed',
  },
  error_budget_required: { hi: 'रोज़ का बजट लिखें', en: 'Enter a daily budget' },
  error_budget_invalid: {
    hi: 'बजट ₹/दिन में एक धनात्मक संख्या होना चाहिए',
    en: 'Budget must be a positive number in ₹/day',
  },
  notice_next_breed: { hi: 'अगला कदम: नस्ल चुनें', en: 'Next: choose the breed' },
  notice_next_budget: { hi: 'अगला कदम: रोज़ का बजट लिखें', en: 'Next: enter a daily budget' },

  // ---- feed picker: verticals, months, season, prices ------------------------------------------
  vertical_indigenous_forage: { hi: 'देशी चारा', en: 'Indigenous forage' },
  vertical_crop_residue: { hi: 'फसल अवशेष', en: 'Crop residues' },
  vertical_agro_byproduct: { hi: 'कृषि उप-उत्पाद', en: 'Agro-byproducts' },
  vertical_mineral: { hi: 'खनिज', en: 'Mineral' },
  label_month: { hi: 'महीना', en: 'Month' },
  hint_month: {
    hi: 'जयपुर के आसपास इस महीने कौन-सी फ़ीड मिलती है',
    en: 'Shows what is in season near Jaipur this month',
  },
  state_in_season: { hi: 'सीज़न में', en: 'In season' },
  state_out_of_season: { hi: 'सीज़न के बाहर', en: 'Out of season' },
  filter_in_season_only: { hi: 'केवल मौसमी चारा', en: 'In-season feeds only' },
  label_all_year: { hi: 'पूरे साल', en: 'All year' },
  label_months_available: { hi: 'उपलब्ध: {months}', en: 'Available: {months}' },
  action_show_details: { hi: 'विवरण दिखाएँ', en: 'Show details' },
  action_hide_details: { hi: 'विवरण छिपाएँ', en: 'Hide details' },
  reliability_mandi: { hi: 'मंडी भाव', en: 'mandi' },
  reliability_trade_report: { hi: 'व्यापार रिपोर्ट', en: 'trade report' },
  reliability_listing: { hi: 'सांकेतिक', en: 'indicative' },
  reliability_team_estimate: { hi: 'टीम का अनुमान', en: 'team estimate' },
  label_your_price: { hi: 'आपकी कीमत', en: 'your price' },
  audit_season: { hi: 'उपलब्ध महीने', en: 'Months available' },
  audit_season_note: { hi: 'मौसम पर टिप्पणी (स्रोत)', en: 'Season note (source)' },
  audit_price_reliability: { hi: 'कीमत कितनी भरोसेमंद', en: 'Price reliability' },
  audit_price_note: { hi: 'कीमत पर टिप्पणी (स्रोत)', en: 'Price note (source)' },
  audit_label_season: { hi: 'मौसम: {feed}', en: 'Season: {feed}' },
  audit_note_user_price: {
    hi: 'आपने यह कीमत बदली है; सॉल्वर इसी कीमत को लेता है।',
    en: 'You changed this price; the solver uses your value.',
  },
  count_in_group: { hi: '{n} फ़ीड', en: '{n} feeds' },

  // ---- result: supported milk, verdict, fat line, cost ----------------------------------------
  label_supports: { hi: 'यह बजट संभव करता है', en: 'This budget supports' },
  label_today_milk: { hi: 'आज', en: 'Today' },
  verdict_gain: { hi: '+{x}/दिन संभव', en: '+{x}/day possible' },
  verdict_at_level: { hi: 'पहले से नस्ल के स्तर पर', en: 'Already at the breed level' },
  verdict_at_level_saving: {
    hi: 'पहले से नस्ल के स्तर पर; इतना ही दूध {z} कम में',
    en: 'Already at the breed level; same milk for {z} less',
  },
  verdict_above: { hi: 'नस्ल के स्तर से ऊपर', en: 'Above the breed level' },
  verdict_above_saving: {
    hi: 'नस्ल के स्तर से ऊपर; इतना ही दूध {z} कम में',
    en: 'Above the breed level; same milk for {z} less',
  },
  audit_cap_today_higher: {
    hi: 'आज का दूध नस्ल की सीमा से ज़्यादा है, इसलिए वही सीमा के रूप में लिया गया',
    en: 'Today’s milk is higher, so it is used as the cap',
  },
  demo_above: { hi: 'नस्ल से ऊपर', en: 'Above breed level' },
  verdict_below: {
    hi: 'यह बजट {s}/दिन दूध संभव करता है, आज के {t}/दिन से कम। {t2} बनाए रखने के लिए {b}/दिन चाहिए।',
    en: 'This budget supports {s}/day, less than today’s {t}/day. Keeping {t2} needs {b}/day.',
  },
  verdict_below_no: {
    hi: 'यह बजट {s}/दिन दूध संभव करता है, आज के {t}/दिन से कम। इन फ़ीड से {t2} बनाए रखना संभव नहीं: {nutrients} रोकता है।',
    en: 'This budget supports {s}/day, less than today’s {t}/day. Keeping {t2} is not possible with these feeds: {nutrients} limits it.',
  },
  verdict_same: {
    hi: 'यह बजट {s}/दिन दूध संभव करता है, आज जितना ही।',
    en: 'This budget supports {s}/day, the same as today.',
  },
  verdict_shortfall: {
    hi: 'बजट गुज़ारे की लागत {m}/दिन से कम है',
    en: 'Budget below the maintenance cost {m}/day',
  },
  caveat_line: {
    hi: 'फ़ीड इतना दूध संभव करती है; असली बढ़त ब्यांत की अवस्था और सेहत पर निर्भर है।',
    en: 'Feed supports this milk; the actual gain depends on stage of lactation and health.',
  },
  fat_line_cited: {
    hi: 'आज का फैट {today}। नस्ल का फैट (प्रकाशित): {breed}।',
    en: 'Today’s fat {today}. Breed fat (cited): {breed}.',
  },
  fat_line_uncited: {
    hi: 'आज का फैट {today}। नस्ल का फैट %: उल्लेख नहीं।',
    en: 'Today’s fat {today}. Breed fat %: not cited.',
  },
  label_ration: { hi: 'राशन', en: 'Ration' },
  cost_under_budget: { hi: 'बजट {budget} से {amount} कम', en: '{amount} under your budget of {budget}' },
  cost_at_budget: { hi: 'पूरा बजट {budget} लगता है', en: 'Uses the whole budget of {budget}' },
  cost_vs_today_less: { hi: 'आज के {today} से {amount} ({pct}) कम', en: '{amount} ({pct}) less than today’s {today}' },
  cost_vs_today_more: { hi: 'आज के {today} से {amount} ({pct}) ज़्यादा', en: '{amount} ({pct}) more than today’s {today}' },
  label_full_audit: { hi: 'पूरा हिसाब', en: 'Full audit' },
  label_limited_by: { hi: 'सीमा तय करने वाली शर्त', en: 'Limited by' },
  bind_budget: { hi: 'बजट', en: 'budget' },
  bind_breed_cap: { hi: 'नस्ल की सीमा', en: 'breed cap' },
  bind_intake: { hi: 'खुराक की सीमा', en: 'intake limit' },
  bind_feed_limit: { hi: 'फ़ीड की सीमा: {feed}', en: 'feed limit: {feed}' },
  label_stage1: { hi: 'चरण 1: बजट में अधिकतम दूध', en: 'Stage 1: most milk within the budget' },
  label_stage2: { hi: 'चरण 2: उस दूध का सबसे सस्ता राशन', en: 'Stage 2: cheapest ration for that milk' },
  label_maintenance_cost: { hi: 'सिर्फ़ गुज़ारे की लागत (0 L)', en: 'Maintenance cost (0 L)' },
  label_cap_and_basis: { hi: 'नस्ल की सीमा और उसका आधार', en: 'Breed cap and its basis' },
  label_budget_used: { hi: 'आपका बजट', en: 'Your budget' },

  // ---- budget below maintenance (AC-E7.1) -----------------------------------------------------
  stamp_budget_low: { hi: 'बजट कम', en: 'Budget too low' },
  notice_shortfall_body: {
    hi: 'कोई राशन या दूध का आँकड़ा नहीं दिखाया जा रहा। गुज़ारे की लागत वह सबसे सस्ता राशन है जो इन फ़ीड से 0 L दूध पर पशु की ज़रूरतें पूरी करे।',
    en: 'No ration or milk figure is shown. Maintenance is the cheapest ration from these feeds that meets the animal’s needs at 0 L of milk.',
  },
  label_cheaper_feed: { hi: 'यह फ़ीड जोड़कर देखें', en: 'Try adding this feed' },
  notice_shortfall_fix: {
    hi: '{feed} को {price} पर जोड़ने से गुज़ारे की लागत {cost}/दिन हो जाती है, यानी बजट के अंदर।',
    en: 'Adding {feed} at {price} brings maintenance to {cost}/day, within your budget.',
  },
  notice_shortfall_nofix: {
    hi: 'सूची की कोई भी फ़ीड जोड़ने पर गुज़ारे की लागत इस बजट में नहीं आती।',
    en: 'No library feed brings maintenance within this budget.',
  },
  audit_label_maintenance: { hi: 'गुज़ारे की लागत (₹/दिन)', en: 'Maintenance cost (₹/day)' },

  // ---- audit labels and roles for the two-stage result ----------------------------------------
  audit_label_supported: { hi: 'बजट में संभव दूध (L/दिन)', en: 'Milk this budget supports (L/day)' },
  audit_label_gain: { hi: 'आज से संभावित बढ़त (L/दिन)', en: 'Possible gain over today (L/day)' },
  audit_label_saving: { hi: 'उतने ही दूध पर बचत (₹/दिन)', en: 'Saving for the same milk (₹/day)' },
  audit_label_keep_cost: { hi: 'आज का दूध बनाए रखने की लागत (₹/दिन)', en: 'Cost of keeping today’s milk (₹/day)' },
  audit_label_budget: { hi: 'रोज़ का बजट (₹/दिन)', en: 'Daily budget (₹/day)' },
  audit_label_today_milk: { hi: 'आज का दूध (L/दिन)', en: 'Today’s milk (L/day)' },
  audit_label_today_fat: { hi: 'आज का फैट (%)', en: 'Today’s fat (%)' },
  audit_role_stage1: { hi: 'चरण 1 का लक्ष्य: दूध अधिकतम करना', en: 'Stage 1 objective: maximise milk' },
  audit_role_stage2_s: { hi: 'चरण 2: इस दूध पर सबसे सस्ता राशन', en: 'Stage 2: cheapest ration at this milk' },
  audit_role_stage2_t: { hi: 'चरण 2: आज के दूध पर सबसे सस्ता राशन', en: 'Stage 2: cheapest ration at today’s milk' },
  audit_role_stage2_m: { hi: 'चरण 2: 0 L दूध पर सबसे सस्ता राशन', en: 'Stage 2: cheapest ration at 0 L of milk' },
  audit_constraint_stage1: {
    hi: 'दूध ≤ नस्ल की सीमा, लागत ≤ बजट, पोषक ≥ ज़रूरत, DM ≤ सीमा',
    en: 'milk ≤ breed cap, cost ≤ budget, nutrients ≥ requirement, DM ≤ limit',
  },
  audit_constraint_stage2_s: {
    hi: 'न्यूनतम करें Σ (कीमत × मात्रा), जहाँ पोषक ≥ ज़रूरत इसी दूध पर',
    en: 'Minimise Σ (price × amount), nutrients ≥ requirement at this milk',
  },
  audit_constraint_stage2_t: {
    hi: 'न्यूनतम करें Σ (कीमत × मात्रा), दूध = आज का दूध, बजट की कोई सीमा नहीं',
    en: 'Minimise Σ (price × amount), milk fixed at today’s milk, no budget limit',
  },
  audit_constraint_stage2_m: {
    hi: 'न्यूनतम करें Σ (कीमत × मात्रा), दूध = 0 L, बजट की कोई सीमा नहीं',
    en: 'Minimise Σ (price × amount), milk fixed at 0 L, no budget limit',
  },
  audit_constraint_gain: { hi: 'चरण 1 का दूध − आज का दूध', en: 'stage-1 milk − today’s milk' },
  audit_constraint_saving: {
    hi: 'संदर्भ लागत − आज के दूध पर चरण 2 की लागत',
    en: 'reference cost − stage-2 cost at today’s milk',
  },
  note_reference_cost: {
    hi: 'संदर्भ लागत: आज के राशन की लागत, और वह भरा न हो तो बजट',
    en: 'Reference cost: today’s ration cost, or the budget when it is blank',
  },

  // ---- prototype states: verdict cases --------------------------------------------------------
  label_demo_cases: { hi: 'नतीजे की स्थितियाँ', en: 'Verdict cases' },
  demo_gain: { hi: 'बढ़त की गुंजाइश', en: 'Room to improve' },
  demo_at_level: { hi: 'नस्ल के स्तर पर', en: 'At breed level' },
  demo_below_cost: { hi: 'आज से कम, लागत बताई', en: 'Below today, cost shown' },
  demo_below_no: { hi: 'आज से कम, संभव नहीं', en: 'Below today, not possible' },
  demo_same: { hi: 'आज जितना ही', en: 'Same as today' },
  demo_shortfall: { hi: 'बजट गुज़ारे से कम', en: 'Budget below maintenance' },
  demo_infeasible: { hi: 'फ़ीड से राशन नहीं बनता', en: 'Feeds cannot meet needs' },
  demo_nondescript: { hi: 'देशी गाय (DAHD औसत)', en: 'Non-descript cow (DAHD)' },
  demo_kankrej: { hi: 'बिना फैट % वाली नस्ल', en: 'Breed with no fat %' },

  // ---- copy summary and template ----------------------------------------------------------------
  summary_breed: { hi: 'नस्ल', en: 'Breed' },
  summary_supported: { hi: 'बजट में संभव दूध', en: 'Milk this budget supports' },
  summary_verdict: { hi: 'नतीजा', en: 'Verdict' },
  summary_budget: { hi: 'बजट', en: 'Budget' },
  template_supported: {
    hi: '{budget} प्रति दिन के बजट में {milk} दूध संभव है, नस्ल की सीमा {cap} से ऊपर नहीं।',
    en: 'A budget of {budget} per day supports {milk} of milk a day, never above the cap of {cap}.',
  },
  verdict_dry: { hi: 'सूखा पशु: गुज़ारे का राशन', en: 'Dry animal: maintenance ration' },
  nutrient_roughage: { hi: 'रेशेदार चारे का हिस्सा', en: 'Roughage share' },
  bind_roughage: { hi: 'रेशेदार चारे का न्यूनतम हिस्सा', en: 'roughage minimum' },
  label_roughage_row: { hi: 'रेशेदार चारे का हिस्सा (शुष्क पदार्थ में)', en: 'Roughage share of dry matter' },
  label_roughage_min: { hi: 'न्यूनतम {min}', en: 'minimum {min}' },
  audit_label_roughage: { hi: 'रेशेदार चारे का हिस्सा', en: 'Roughage share of dry matter' },
  audit_label_roughage_need: { hi: 'रेशेदार चारे का न्यूनतम हिस्सा', en: 'Minimum roughage share' },
  audit_label_roughage_max: { hi: 'इन फ़ीड से अधिकतम रेशेदार हिस्सा', en: 'Highest roughage share these feeds allow' },
  audit_role_roughage: { hi: 'न्यूनतम शर्त: रेशेदार चारा ≥ तय हिस्सा', en: 'Minimum constraint: roughage ≥ set share' },
  audit_constraint_roughage: {
    hi: 'देशी चारा + फ़सल अवशेष का शुष्क पदार्थ ≥ कुल शुष्क पदार्थ का न्यूनतम हिस्सा',
    en: 'Dry matter of indigenous forage + crop residue ≥ minimum share of total dry matter',
  },
  audit_roughage_fixture: { hi: 'प्रोटोटाइप का नमूना मान', en: 'PROTOTYPE FIXTURE' },
  note_roughage_fixture: {
    hi: 'न्यूनतम हिस्सा प्रोटोटाइप का नमूना मान है। ICAR/NDDB का प्रमाणित मान M1 में आएगा।',
    en: 'The minimum share is a prototype fixture. The cited ICAR/NDDB value arrives in M1.',
  },
  label_roughage_feed_why: { hi: 'रेशेदार चारा', en: 'A roughage feed' },
  demo_roughage: { hi: 'सिर्फ़ दाना (रेशा नहीं)', en: 'Concentrates only' },
  demo_dry: { hi: 'सूखा पशु', en: 'Dry animal' },
  template_verdict: { hi: 'नतीजा: {verdict}', en: 'Verdict: {verdict}' },
  warning_mineral_missing_title: {
    hi: 'सलाह: दैनिक खनिज मिश्रण एवं नमक शामिल नहीं है',
    en: 'Advisory: Daily mineral mixture and salt not included',
  },
  warning_mineral_missing_body: {
    hi: 'NDDB के दिशानिर्देशों के अनुसार दुधारू पशुओं को प्रतिदिन 100g खनिज मिश्रण और 50g साधारण नमक देना आवश्यक है ताकि सूक्ष्म पोषक तत्वों की कमी न हो। कृपया चारे की सूची में इन्हें जोड़ें।',
    en: 'NDDB RBP guidelines recommend daily basal supplementation of 100g mineral mixture and 50g common salt for milking animals to prevent trace mineral deficiencies. Please add them to your feed selection.',
  },
  action_add_mineral_salt: {
    hi: '+ खनिज मिश्रण और नमक जोड़ें',
    en: '+ Add mineral mixture & salt',
  },
} as const satisfies Record<string, BiText>;

export type StringId = keyof typeof strings;
export type BiParams = Record<string, number | string | BiText>;

/** Hindi strings stay unverified until native-speaker review is recorded (ADR-0005). */
export const HINDI_REVIEW = {
  status: 'unverified',
  reviewedBy: null,
  reviewedOn: null,
} as const;

function formatParam(value: number | string): string {
  return typeof value === 'number' ? formatNumber(value, naturalDecimals(value)) : value;
}

function interpolate(template: string, params: BiParams | undefined, half: 'hi' | 'en'): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    if (value === undefined) return match;
    if (typeof value === 'object') return value[half];
    return formatParam(value);
  });
}

/** Both halves of a string with its {placeholders} filled. */
export function t(id: StringId, params?: BiParams): BiText {
  const entry: BiText = strings[id];
  return { hi: interpolate(entry.hi, params, 'hi'), en: interpolate(entry.en, params, 'en') };
}

/** Plain text in the selected language, for aria-label, title, <option>, toast and the copied summary. */
export function bi(id: StringId, params?: BiParams): string {
  return t(id, params)[getActiveLang()];
}

/** A pair already built elsewhere (audit labels, template lines), as plain text in the selected language. */
export function biText(text: BiText): string {
  return text[getActiveLang()];
}

/** Language-toggle labels. Each names its own language, so neither follows the selected language. */
export const LANGUAGE_LABELS = { hi: 'हिंदी', en: 'English' } as const;
