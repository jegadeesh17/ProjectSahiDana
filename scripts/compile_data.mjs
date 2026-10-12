// Data compilation and provenance validation script (docs/ARCHITECTURE.md, "Data tasks and provenance workflow").
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VALID_VERTICALS = new Set(['indigenous_forage', 'crop_residue', 'agro_byproduct', 'mineral']);
export const VALID_RELIABILITIES = new Set(['mandi', 'trade_report', 'listing', 'team_estimate']);
export const VALID_PROVENANCES = new Set(['cited', 'team-asserted']);
export const VALID_SPECIES = new Set(['cow', 'buffalo']);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Normalize string to NFC and trim leading/trailing whitespace. */
export function normalizeNfc(value) {
  if (typeof value !== 'string') return '';
  return value.trim().normalize('NFC');
}

/** Deeply normalize all strings in a JSON-compatible value to NFC. */
export function deepNormalizeNfc(value) {
  if (typeof value === 'string') return value.normalize('NFC');
  if (Array.isArray(value)) return value.map(deepNormalizeNfc);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = deepNormalizeNfc(v);
    }
    return out;
  }
  return value;
}

/** Parse RFC-4180 CSV text into an array of row objects keyed by header column names. */
export function parseCsv(csvText, sourceLabel = 'CSV') {
  if (typeof csvText !== 'string' || csvText.trim().length === 0) {
    throw new Error(`${sourceLabel}: CSV input is empty`);
  }
  const cleanText = csvText.replace(/^\uFEFF/, '');
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const ch = cleanText[i];
    if (inQuotes) {
      if (ch === '"') {
        if (cleanText[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(normalizeNfc(currentField));
      currentField = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && cleanText[i + 1] === '\n') i++;
      currentRow.push(normalizeNfc(currentField));
      currentField = '';
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += ch;
    }
  }
  if (inQuotes) {
    throw new Error(`${sourceLabel}: Unterminated quoted field in CSV`);
  }
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(normalizeNfc(currentField));
    if (currentRow.some((cell) => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  if (rows.length < 2) {
    throw new Error(`${sourceLabel}: CSV must contain a header row and at least one data row`);
  }

  const headers = rows[0];
  return rows.slice(1).map((cells, idx) => {
    if (cells.length !== headers.length) {
      throw new Error(
        `${sourceLabel} row ${idx + 2}: expected ${headers.length} columns (${headers.join(', ')}), got ${cells.length}`,
      );
    }
    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = cells[c];
    }
    return obj;
  });
}

/**
 * Parse available_months string (e.g. "1-12", "11-12,1-3", "7,8,9,10") into sorted unique months 1..12.
 * Rejects empty strings, out-of-range months (<1 or >12), non-integers, or inverted ranges (a > b).
 */
export function parseAvailableMonths(raw, context = 'row') {
  const str = normalizeNfc(raw);
  if (!str) {
    throw new Error(`${context}: available_months is required and cannot be empty`);
  }
  const months = new Set();
  const parts = str.split(',');
  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) {
      throw new Error(`${context}: invalid empty segment in available_months "${str}"`);
    }
    if (/^\d+$/.test(part)) {
      const m = Number(part);
      if (!Number.isInteger(m) || m < 1 || m > 12) {
        throw new Error(`${context}: month ${m} out of range 1..12 in available_months "${str}"`);
      }
      months.add(m);
    } else if (/^(\d+)-(\d+)$/.test(part)) {
      const [, startStr, endStr] = /^(\d+)-(\d+)$/.exec(part);
      const start = Number(startStr);
      const end = Number(endStr);
      if (start < 1 || start > 12 || end < 1 || end > 12 || start > end) {
        throw new Error(
          `${context}: invalid month range "${part}" in available_months "${str}" (must be 1..12 with start <= end)`,
        );
      }
      for (let m = start; m <= end; m++) {
        months.add(m);
      }
    } else {
      throw new Error(`${context}: malformed available_months token "${part}" in "${str}"`);
    }
  }
  if (months.size === 0) {
    throw new Error(`${context}: available_months produced no valid months`);
  }
  return [...months].sort((a, b) => a - b);
}

function parseRequiredNumber(raw, fieldName, context, { min = -Infinity, max = Infinity, strictMin = false } = {}) {
  const str = normalizeNfc(String(raw ?? ''));
  if (!str) {
    throw new Error(`${context}: required numeric column "${fieldName}" is empty`);
  }
  const num = Number(str);
  if (!Number.isFinite(num)) {
    throw new Error(`${context}: "${fieldName}" must be a finite number, got "${str}"`);
  }
  if (strictMin ? num <= min : num < min) {
    throw new Error(`${context}: "${fieldName}" (${num}) violates minimum ${strictMin ? '>' : '>='} ${min}`);
  }
  if (num > max) {
    throw new Error(`${context}: "${fieldName}" (${num}) exceeds maximum <= ${max}`);
  }
  return num;
}

function parseOptionalNumber(raw, fieldName, context, { min = -Infinity, max = Infinity, strictMin = false } = {}) {
  if (raw === null || raw === undefined) return null;
  const str = normalizeNfc(String(raw));
  if (!str) return null;
  return parseRequiredNumber(str, fieldName, context, { min, max, strictMin });
}

function parseOptionalString(raw) {
  if (raw === null || raw === undefined) return null;
  const str = normalizeNfc(String(raw));
  return str.length > 0 ? str : null;
}

function parseRequiredString(raw, fieldName, context) {
  const str = parseOptionalString(raw);
  if (!str) {
    throw new Error(`${context}: required column "${fieldName}" is empty`);
  }
  return str;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Compile and validate a single feed row from data/feeds.csv. */
export function compileFeedRow(rawRow, rowIndex = 0, warnings = []) {
  const id = parseRequiredString(rawRow.id, 'id', `feeds row ${rowIndex + 1}`);
  const context = `feed "${id}" (row ${rowIndex + 1})`;

  const englishName = parseRequiredString(rawRow.english_name, 'english_name', context);
  const vertical = parseRequiredString(rawRow.vertical, 'vertical', context);
  if (!VALID_VERTICALS.has(vertical)) {
    throw new Error(`${context}: invalid vertical "${vertical}" (expected one of ${[...VALID_VERTICALS].join(', ')})`);
  }

  const availableMonths = parseAvailableMonths(rawRow.available_months, context);
  const seasonNoteEn = parseRequiredString(rawRow.season_note_en, 'season_note_en', context);
  const seasonNoteHi = parseRequiredString(rawRow.season_note_hi, 'season_note_hi', context);
  const seasonCitation = parseRequiredString(rawRow.season_citation, 'season_citation', context);
  const seasonProvenance = parseRequiredString(rawRow.season_provenance, 'season_provenance', context);
  if (!VALID_PROVENANCES.has(seasonProvenance)) {
    throw new Error(`${context}: invalid season_provenance "${seasonProvenance}"`);
  }

  const localNameLatn = parseOptionalString(rawRow.local_name_latn);
  const localNameLatnCitation = parseOptionalString(rawRow.local_name_latn_citation);
  const localNameDeva = parseOptionalString(rawRow.local_name_deva);
  const localNameDevaProvenance = parseOptionalString(rawRow.local_name_deva_provenance);

  if (localNameDeva !== null) {
    if (!localNameDevaProvenance || !VALID_PROVENANCES.has(localNameDevaProvenance)) {
      throw new Error(`${context}: local_name_deva requires valid local_name_deva_provenance ('cited' | 'team-asserted')`);
    }
    if (localNameDevaProvenance === 'team-asserted' && !localNameLatn) {
      throw new Error(`${context}: team-asserted local_name_deva requires a non-empty local_name_latn`);
    }
  } else if (localNameDevaProvenance !== null) {
    throw new Error(`${context}: local_name_deva_provenance cannot be set when local_name_deva is empty`);
  }

  if ((localNameLatn !== null || localNameDevaProvenance === 'cited') && !localNameLatnCitation) {
    throw new Error(`${context}: local_name_latn_citation is required when local_name_latn or cited local_name_deva is set`);
  }

  const dmPct = parseRequiredNumber(rawRow.dm_pct, 'dm_pct', context, { min: 0, max: 100, strictMin: true });
  const cpPctDm = parseRequiredNumber(rawRow.cp_pct_dm, 'cp_pct_dm', context, { min: 0, max: 100 });
  const meMcalPerKgDm = parseRequiredNumber(rawRow.me_mcal_per_kg_dm, 'me_mcal_per_kg_dm', context, { min: 0, max: 10 });
  const caGramsPerKgDm = parseRequiredNumber(rawRow.ca_g_per_kg_dm, 'ca_g_per_kg_dm', context, { min: 0, max: 500 });
  const pGramsPerKgDm = parseRequiredNumber(rawRow.p_g_per_kg_dm, 'p_g_per_kg_dm', context, { min: 0, max: 500 });
  const derivedTdnPctDm = Math.round(meMcalPerKgDm * 27.7 * 10) / 10;

  const sourceDoc = parseRequiredString(rawRow.source_doc, 'source_doc', context);
  const sourceTable = parseRequiredString(rawRow.source_table, 'source_table', context);
  const sourcePage = parseRequiredString(rawRow.source_page, 'source_page', context);
  const dmSourceCitation = parseRequiredString(rawRow.dm_source_citation, 'dm_source_citation', context);
  const provenanceStatus = parseRequiredString(rawRow.provenance_status, 'provenance_status', context);
  if (!VALID_PROVENANCES.has(provenanceStatus)) {
    throw new Error(`${context}: invalid provenance_status "${provenanceStatus}"`);
  }
  const nutrientNote = parseOptionalString(rawRow.nutrient_note);
  if (provenanceStatus === 'team-asserted' && !nutrientNote) {
    throw new Error(`${context}: team-asserted provenance_status requires nutrient_note`);
  }

  const defaultPriceInrPerKgAsFed = parseOptionalNumber(
    rawRow.default_price_inr_per_kg_as_fed,
    'default_price_inr_per_kg_as_fed',
    context,
    { min: 0 },
  );
  const priceSource = parseOptionalString(rawRow.price_source);
  const priceSourceUrl = parseOptionalString(rawRow.price_source_url);
  const priceDate = parseOptionalString(rawRow.price_date);
  const priceReliability = parseOptionalString(rawRow.price_reliability);
  const priceNoteEn = parseOptionalString(rawRow.price_note_en);
  const priceNoteHi = parseOptionalString(rawRow.price_note_hi);

  let priceNote = null;
  if (defaultPriceInrPerKgAsFed !== null) {
    if (!priceReliability || !VALID_RELIABILITIES.has(priceReliability)) {
      throw new Error(
        `${context}: default price requires a valid price_reliability (${[...VALID_RELIABILITIES].join(', ')})`,
      );
    }
    if (!priceDate || !DATE_RE.test(priceDate)) {
      throw new Error(`${context}: default price requires price_date in YYYY-MM-DD format`);
    }
    if (!priceSource) {
      throw new Error(`${context}: default price requires price_source`);
    }
    if (priceReliability === 'team_estimate' && (!priceNoteEn || !priceNoteHi)) {
      throw new Error(`${context}: price_reliability "team_estimate" requires both price_note_en and price_note_hi`);
    }
    if ((priceNoteEn && !priceNoteHi) || (!priceNoteEn && priceNoteHi)) {
      throw new Error(`${context}: price_note_en and price_note_hi must both be provided when either is set`);
    }
    if (priceNoteEn && priceNoteHi) {
      priceNote = { en: priceNoteEn, hi: priceNoteHi };
    }
  } else {
    if (priceReliability || priceDate || priceSource || priceSourceUrl || priceNoteEn || priceNoteHi) {
      throw new Error(
        `${context}: price metadata (reliability/date/source/note) cannot be set when default_price_inr_per_kg_as_fed is empty`,
      );
    }
  }

  const verifiedOn = parseOptionalString(rawRow.verified_on);
  if (verifiedOn !== null && !DATE_RE.test(verifiedOn)) {
    throw new Error(`${context}: verified_on must be in YYYY-MM-DD format when set`);
  }
  if (verifiedOn === null) {
    warnings.push(`WARN [feeds]: ${id} has empty verified_on (pending human verification gate)`);
  }

  return {
    id,
    englishName,
    localNameLatn,
    localNameLatnCitation,
    localNameDeva,
    localNameDevaProvenance,
    vertical,
    availableMonths,
    seasonNote: { en: seasonNoteEn, hi: seasonNoteHi },
    seasonCitation,
    seasonProvenance,
    dmPct,
    cpPctDm,
    meMcalPerKgDm,
    caGramsPerKgDm,
    pGramsPerKgDm,
    derivedTdnPctDm,
    sourceDoc,
    sourceTable,
    sourcePage,
    dmSourceCitation,
    provenanceStatus,
    nutrientNote,
    defaultPriceInrPerKgAsFed,
    priceSource,
    priceSourceUrl,
    priceDate,
    priceReliability,
    priceNote,
    verifiedOn,
  };
}

/** Compile all feed rows from CSV string or array of raw row objects. */
export function compileFeeds(input, warnings = []) {
  const rows = typeof input === 'string' ? parseCsv(input, 'feeds.csv') : input;
  const seenIds = new Set();
  return rows.map((row, idx) => {
    const item = compileFeedRow(row, idx, warnings);
    if (seenIds.has(item.id)) {
      throw new Error(`feeds.csv: duplicate feed id "${item.id}" at row ${idx + 1}`);
    }
    seenIds.add(item.id);
    return item;
  });
}

/**
 * Compute milkCapLPerDay and capBasis in the exact SPEC priority order:
 * 1. isNonDescript -> dahd_average (avgDailyYieldKg)
 * 2. peakDailyYieldKg -> cited_peak (peakDailyYieldKg)
 * 3. lactationYieldHighKg -> range_top (lactationYieldHighKg / (lactationLengthMinDays ?? lactationLengthDays))
 * 4. avgDailyYieldKg -> breed_average (avgDailyYieldKg)
 * 5. lactationYieldKg & lactationLengthDays -> breed_average_calc (lactationYieldKg / lactationLengthDays)
 */
export function computeBreedCap(input, context = 'breed') {
  const isNonDescript =
    typeof input.isNonDescript === 'boolean'
      ? input.isNonDescript
      : String(input.is_non_descript ?? '').trim().toLowerCase() === 'true';

  const numOrNull = (camel, snake) => {
    const v = input[camel] !== undefined ? input[camel] : input[snake];
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const peakDailyYieldKg = numOrNull('peakDailyYieldKg', 'peak_daily_yield_kg');
  const lactationYieldHighKg = numOrNull('lactationYieldHighKg', 'lactation_yield_high_kg');
  const lactationLengthDays = numOrNull('lactationLengthDays', 'lactation_length_days');
  const lactationLengthMinDays = numOrNull('lactationLengthMinDays', 'lactation_length_min_days');
  const avgDailyYieldKg = numOrNull('avgDailyYieldKg', 'avg_daily_yield_kg');
  const lactationYieldKg = numOrNull('lactationYieldKg', 'lactation_yield_kg');

  if (isNonDescript) {
    if (avgDailyYieldKg === null || avgDailyYieldKg <= 0) {
      throw new Error(`${context}: non-descript row requires positive avg_daily_yield_kg`);
    }
    return { capBasis: 'dahd_average', milkCapLPerDay: round2(avgDailyYieldKg) };
  }

  if (peakDailyYieldKg !== null) {
    if (peakDailyYieldKg <= 0) {
      throw new Error(`${context}: peak_daily_yield_kg must be positive`);
    }
    return { capBasis: 'cited_peak', milkCapLPerDay: round2(peakDailyYieldKg) };
  }

  if (lactationYieldHighKg !== null) {
    const lengthDays = lactationLengthMinDays ?? lactationLengthDays;
    if (lengthDays === null || lengthDays <= 0) {
      throw new Error(`${context}: range_top rule requires positive lactation_length_days or lactation_length_min_days`);
    }
    return { capBasis: 'range_top', milkCapLPerDay: round2(lactationYieldHighKg / lengthDays) };
  }

  if (avgDailyYieldKg !== null) {
    if (avgDailyYieldKg <= 0) {
      throw new Error(`${context}: avg_daily_yield_kg must be positive`);
    }
    return { capBasis: 'breed_average', milkCapLPerDay: round2(avgDailyYieldKg) };
  }

  if (lactationYieldKg !== null && lactationLengthDays !== null) {
    if (lactationYieldKg <= 0 || lactationLengthDays <= 0) {
      throw new Error(`${context}: lactation_yield_kg and lactation_length_days must be positive`);
    }
    return { capBasis: 'breed_average_calc', milkCapLPerDay: round2(lactationYieldKg / lactationLengthDays) };
  }

  throw new Error(`${context}: breed matches none of the cap rules`);
}

/** Compile and validate a single breed row from data/breeds.csv. */
export function compileBreedRow(rawRow, rowIndex = 0, warnings = []) {
  const id = parseRequiredString(rawRow.id, 'id', `breeds row ${rowIndex + 1}`);
  const context = `breed "${id}" (row ${rowIndex + 1})`;

  const species = parseRequiredString(rawRow.species, 'species', context);
  if (!VALID_SPECIES.has(species)) {
    throw new Error(`${context}: invalid species "${species}" (expected 'cow' | 'buffalo')`);
  }

  const englishName = parseRequiredString(rawRow.english_name, 'english_name', context);
  const localNameLatn = parseOptionalString(rawRow.local_name_latn);
  const localNameDeva = parseOptionalString(rawRow.local_name_deva);
  const localNameDevaProvenance = parseOptionalString(rawRow.local_name_deva_provenance);

  if (localNameDeva !== null) {
    if (!localNameDevaProvenance || !VALID_PROVENANCES.has(localNameDevaProvenance)) {
      throw new Error(`${context}: local_name_deva requires valid local_name_deva_provenance ('cited' | 'team-asserted')`);
    }
    if (localNameDevaProvenance === 'team-asserted' && !localNameLatn) {
      throw new Error(`${context}: team-asserted local_name_deva requires a non-empty local_name_latn`);
    }
  } else if (localNameDevaProvenance !== null) {
    throw new Error(`${context}: local_name_deva_provenance cannot be set when local_name_deva is empty`);
  }

  const isNonDescriptRaw = parseRequiredString(rawRow.is_non_descript, 'is_non_descript', context).toLowerCase();
  if (isNonDescriptRaw !== 'true' && isNonDescriptRaw !== 'false') {
    throw new Error(`${context}: is_non_descript must be 'true' or 'false'`);
  }
  const isNonDescript = isNonDescriptRaw === 'true';

  const femaleBodyWeightKg = parseOptionalNumber(rawRow.female_body_weight_kg, 'female_body_weight_kg', context, {
    min: 0,
    strictMin: true,
  });
  const bodyWeightCitationStr = parseOptionalString(rawRow.body_weight_citation);
  if (femaleBodyWeightKg !== null && !bodyWeightCitationStr) {
    throw new Error(`${context}: female_body_weight_kg requires body_weight_citation`);
  }
  if (femaleBodyWeightKg === null && bodyWeightCitationStr) {
    throw new Error(`${context}: body_weight_citation cannot be set when female_body_weight_kg is empty`);
  }

  const lactationYieldKg = parseOptionalNumber(rawRow.lactation_yield_kg, 'lactation_yield_kg', context, {
    min: 0,
    strictMin: true,
  });
  const lactationYieldLowKg = parseOptionalNumber(rawRow.lactation_yield_low_kg, 'lactation_yield_low_kg', context, {
    min: 0,
    strictMin: true,
  });
  const lactationYieldHighKg = parseOptionalNumber(rawRow.lactation_yield_high_kg, 'lactation_yield_high_kg', context, {
    min: 0,
    strictMin: true,
  });
  if ((lactationYieldLowKg === null) !== (lactationYieldHighKg === null)) {
    throw new Error(`${context}: lactation_yield_low_kg and lactation_yield_high_kg must both be set or both be empty`);
  }
  if (lactationYieldLowKg !== null && lactationYieldHighKg !== null && lactationYieldLowKg > lactationYieldHighKg) {
    throw new Error(`${context}: lactation_yield_low_kg (${lactationYieldLowKg}) > lactation_yield_high_kg (${lactationYieldHighKg})`);
  }

  const lactationLengthDays = parseOptionalNumber(rawRow.lactation_length_days, 'lactation_length_days', context, {
    min: 0,
    strictMin: true,
  });
  const lactationLengthMinDaysRaw = parseOptionalNumber(
    rawRow.lactation_length_min_days,
    'lactation_length_min_days',
    context,
    { min: 0, strictMin: true },
  );
  if (lactationLengthMinDaysRaw !== null && lactationLengthDays === null) {
    throw new Error(`${context}: lactation_length_min_days requires lactation_length_days`);
  }
  if (
    lactationLengthMinDaysRaw !== null &&
    lactationLengthDays !== null &&
    lactationLengthMinDaysRaw > lactationLengthDays
  ) {
    throw new Error(
      `${context}: lactation_length_min_days (${lactationLengthMinDaysRaw}) > lactation_length_days (${lactationLengthDays})`,
    );
  }
  const lactationLengthMinDays =
    lactationLengthMinDaysRaw !== null ? lactationLengthMinDaysRaw : lactationLengthDays;

  const avgDailyYieldKg = parseOptionalNumber(rawRow.avg_daily_yield_kg, 'avg_daily_yield_kg', context, {
    min: 0,
    strictMin: true,
  });

  const peakDailyYieldKg = parseOptionalNumber(rawRow.peak_daily_yield_kg, 'peak_daily_yield_kg', context, {
    min: 0,
    strictMin: true,
  });
  const peakSourceDoc = parseOptionalString(rawRow.peak_source_doc);
  const peakSourceTable = parseOptionalString(rawRow.peak_source_table);
  const peakSourcePage = parseOptionalString(rawRow.peak_source_page);
  const peakSourceUrl = parseOptionalString(rawRow.peak_source_url);
  const peakNoteEn = parseOptionalString(rawRow.peak_note_en);
  const peakNoteHi = parseOptionalString(rawRow.peak_note_hi);

  let peakCitation = null;
  let peakNote = null;
  if (peakDailyYieldKg !== null) {
    if (!peakSourceDoc || !peakSourceTable || !peakSourcePage) {
      throw new Error(
        `${context}: peak_daily_yield_kg requires peak_source_doc, peak_source_table, and peak_source_page`,
      );
    }
    peakCitation = {
      doc: peakSourceDoc,
      table: peakSourceTable,
      page: peakSourcePage,
      url: peakSourceUrl,
    };
    if ((peakNoteEn && !peakNoteHi) || (!peakNoteEn && peakNoteHi)) {
      throw new Error(`${context}: peak_note_en and peak_note_hi must both be set when either is provided`);
    }
    if (peakNoteEn && peakNoteHi) {
      peakNote = { en: peakNoteEn, hi: peakNoteHi };
    }
  } else if (peakSourceDoc || peakSourceTable || peakSourcePage || peakSourceUrl || peakNoteEn || peakNoteHi) {
    throw new Error(`${context}: peak citation/note columns cannot be set when peak_daily_yield_kg is empty`);
  }

  const yieldSourceDoc = parseRequiredString(rawRow.yield_source_doc, 'yield_source_doc', context);
  const yieldSourceTable = parseRequiredString(rawRow.yield_source_table, 'yield_source_table', context);
  const yieldSourcePage = parseRequiredString(rawRow.yield_source_page, 'yield_source_page', context);
  const yieldSourceUrl = parseOptionalString(rawRow.yield_source_url);
  const yieldFigureYear = parseOptionalString(rawRow.yield_figure_year);

  if (isNonDescript && !yieldFigureYear) {
    throw new Error(`${context}: non-descript row requires yield_figure_year`);
  }

  const yieldCitation = {
    doc: yieldSourceDoc,
    table: yieldSourceTable,
    page: yieldSourcePage,
    url: yieldSourceUrl,
    year: yieldFigureYear,
  };

  const fatPctLow = parseOptionalNumber(rawRow.fat_pct_low, 'fat_pct_low', context, { min: 0, max: 20, strictMin: true });
  const fatPctHighRaw = parseOptionalNumber(rawRow.fat_pct_high, 'fat_pct_high', context, {
    min: 0,
    max: 20,
    strictMin: true,
  });
  const fatSourceDoc = parseOptionalString(rawRow.fat_source_doc);
  const fatSourceTable = parseOptionalString(rawRow.fat_source_table);
  const fatSourcePage = parseOptionalString(rawRow.fat_source_page);
  const fatSourceUrl = parseOptionalString(rawRow.fat_source_url);

  let fatCitation = null;
  let fatPctHigh = null;
  if (fatPctLow !== null) {
    if (fatPctHighRaw !== null && fatPctHighRaw < fatPctLow) {
      throw new Error(`${context}: fat_pct_high (${fatPctHighRaw}) < fat_pct_low (${fatPctLow})`);
    }
    fatPctHigh = fatPctHighRaw !== null && fatPctHighRaw > fatPctLow ? fatPctHighRaw : null;
    if (!fatSourceDoc || !fatSourceTable || !fatSourcePage) {
      throw new Error(`${context}: fat_pct_low requires fat_source_doc, fat_source_table, and fat_source_page`);
    }
    fatCitation = {
      doc: fatSourceDoc,
      table: fatSourceTable,
      page: fatSourcePage,
      url: fatSourceUrl,
    };
  } else {
    if (fatPctHighRaw !== null || fatSourceDoc || fatSourceTable || fatSourcePage || fatSourceUrl) {
      throw new Error(`${context}: fat_pct_high and fat citation columns must be empty when fat_pct_low is empty`);
    }
  }

  const { capBasis, milkCapLPerDay } = computeBreedCap(
    {
      isNonDescript,
      peakDailyYieldKg,
      lactationYieldHighKg,
      lactationLengthDays,
      lactationLengthMinDays,
      avgDailyYieldKg,
      lactationYieldKg,
    },
    context,
  );

  const verifiedOn = parseOptionalString(rawRow.verified_on);
  if (verifiedOn !== null && !DATE_RE.test(verifiedOn)) {
    throw new Error(`${context}: verified_on must be in YYYY-MM-DD format when set`);
  }
  if (verifiedOn === null) {
    warnings.push(`WARN [breeds]: ${id} has empty verified_on (pending human verification gate)`);
  }

  const primaryDoc =
    capBasis === 'cited_peak' && peakCitation
      ? peakCitation.doc
      : yieldFigureYear
        ? `${yieldSourceDoc} (${yieldFigureYear})`
        : yieldSourceDoc;
  const primaryTable = capBasis === 'cited_peak' && peakCitation ? peakCitation.table : yieldSourceTable;
  const primaryPage = capBasis === 'cited_peak' && peakCitation ? peakCitation.page : yieldSourcePage;
  const sourceNote =
    parseOptionalString(rawRow.source_note) ??
    (isNonDescript
      ? `DAHD national average (${yieldFigureYear}): ${milkCapLPerDay} kg/day. 1 kg of milk ≈ 1 L.`
      : `Breed sources give milk in kg; the app treats 1 kg of milk ≈ 1 L.`);

  return {
    id,
    species,
    englishName,
    localNameLatn,
    localNameDeva,
    localNameDevaProvenance,
    isNonDescript,
    femaleBodyWeightKg,
    bodyWeightCitation: bodyWeightCitationStr
      ? { doc: bodyWeightCitationStr, table: yieldSourceTable, page: yieldSourcePage, url: yieldSourceUrl }
      : null,
    lactationYieldKg,
    lactationYieldLowKg,
    lactationYieldHighKg,
    lactationLengthDays,
    lactationLengthMinDays,
    avgDailyYieldKg,
    peakDailyYieldKg,
    peakCitation,
    peakNote,
    fatPct: fatPctLow,
    fatPctLow,
    fatPctHigh,
    capBasis,
    milkCapLPerDay,
    yieldCitation,
    yieldFigureYear,
    fatCitation,
    sourceDoc: primaryDoc,
    sourceTable: primaryTable,
    sourcePage: primaryPage,
    sourceNote,
    provenanceStatus: 'cited',
    verifiedOn,
  };
}

/** Compile all breed rows from CSV string or array of raw row objects. */
export function compileBreeds(input, warnings = []) {
  const rows = typeof input === 'string' ? parseCsv(input, 'breeds.csv') : input;
  const seenIds = new Set();
  return rows.map((row, idx) => {
    const item = compileBreedRow(row, idx, warnings);
    if (seenIds.has(item.id)) {
      throw new Error(`breeds.csv: duplicate breed id "${item.id}" at row ${idx + 1}`);
    }
    seenIds.add(item.id);
    return item;
  });
}

/** Validate and normalize requirements.json into requirements.v1.json structure. */
export function compileRequirements(input, warnings = []) {
  const raw = typeof input === 'string' ? JSON.parse(input) : input;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('requirements.json: root must be a JSON object');
  }
  const normalized = deepNormalizeNfc(raw);

  const roughage = normalized.roughageMinShareOfDm;
  if (!roughage || typeof roughage !== 'object') {
    throw new Error('requirements.json: missing roughageMinShareOfDm object');
  }
  const rVal = roughage.value;
  if (typeof rVal !== 'number' || !Number.isFinite(rVal) || rVal <= 0 || rVal >= 1) {
    throw new Error(
      `requirements.json: roughageMinShareOfDm.value must be a finite number strictly in (0, 1), got ${String(rVal)}`,
    );
  }
  const rCit = roughage.citation;
  if (!rCit || typeof rCit !== 'object') {
    throw new Error('requirements.json: roughageMinShareOfDm.citation is required');
  }
  const rDoc = parseOptionalString(rCit.doc);
  const rPage = parseOptionalString(rCit.page);
  if (!rDoc || !rPage) {
    throw new Error('requirements.json: roughageMinShareOfDm.citation requires non-empty doc and page');
  }
  if (!/\b(ICAR|NDDB)\b/i.test(rDoc)) {
    throw new Error(
      `requirements.json: roughageMinShareOfDm.citation.doc must cite an ICAR or NDDB source, got "${rDoc}"`,
    );
  }

  const rVerifiedOn = parseOptionalString(roughage.verifiedOn);
  if (rVerifiedOn !== null && !DATE_RE.test(rVerifiedOn)) {
    throw new Error('requirements.json: roughageMinShareOfDm.verifiedOn must be in YYYY-MM-DD format when set');
  }
  if (rVerifiedOn === null) {
    warnings.push('WARN [requirements]: roughageMinShareOfDm has empty verifiedOn (pending human verification gate)');
  }

  return normalized;
}

/** Compile feeds.csv, breeds.csv, and requirements.json from disk and write src/data/*.v1.json. */
export function compileDataFiles({
  feedsCsvPath = 'data/feeds.csv',
  breedsCsvPath = 'data/breeds.csv',
  requirementsJsonPath = 'data/requirements.json',
  feedsOutPath = 'src/data/feeds.v1.json',
  breedsOutPath = 'src/data/breeds.v1.json',
  requirementsOutPath = 'src/data/requirements.v1.json',
  logger = console,
} = {}) {
  const warnings = [];
  const feedsCsv = readFileSync(feedsCsvPath, 'utf8');
  const breedsCsv = readFileSync(breedsCsvPath, 'utf8');
  const requirementsRaw = readFileSync(requirementsJsonPath, 'utf8');

  const feeds = compileFeeds(feedsCsv, warnings);
  const breeds = compileBreeds(breedsCsv, warnings);
  const requirements = compileRequirements(requirementsRaw, warnings);

  for (const outPath of [feedsOutPath, breedsOutPath, requirementsOutPath]) {
    const dir = dirname(outPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  writeFileSync(feedsOutPath, `${JSON.stringify(feeds, null, 2)}\n`, 'utf8');
  writeFileSync(breedsOutPath, `${JSON.stringify(breeds, null, 2)}\n`, 'utf8');
  writeFileSync(requirementsOutPath, `${JSON.stringify(requirements, null, 2)}\n`, 'utf8');

  for (const w of warnings) {
    logger.warn(w);
  }

  return { feeds, breeds, requirements, warnings };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const result = compileDataFiles();
    console.log(
      `Compiled ${result.feeds.length} feeds, ${result.breeds.length} breeds, and requirements (${result.warnings.length} verification warnings).`,
    );
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
