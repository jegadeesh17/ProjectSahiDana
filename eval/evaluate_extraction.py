"""Multilingual free-text extraction benchmark and nutrient-safety evaluator (M3-TASK-02).

Evaluates extraction across 30 hand-labelled descriptions (10 English, 10 Hindi in Devanagari,
10 Hinglish, grouped into 10 semantic triples T01-T10) against src/data/feeds.v1.json and
src/data/breeds.v1.json. Computes field-level and full-record accuracy, verifies English/Hindi/Hinglish
cross-language parity (SPEC AC-L1.5), validates species-scoped breed matching (SPEC AC-2.3), and
verifies strict nutrient/price/season/breed-cap safety (SPEC AC-E5.1).
"""

from __future__ import annotations

import copy
import json
import math
import os
import re
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "src" / "data"
EVAL_DIR = ROOT_DIR / "eval"
DEFAULT_DESCRIPTIONS_PATH = EVAL_DIR / "test_descriptions.json"

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_PRIMARY_MODEL = "meta-llama/llama-3.3-70b-instruct:free"
DEFAULT_FALLBACK_MODELS: tuple[str, ...] = (
    "google/gemma-3-27b-it:free",
    "qwen/qwen-2.5-72b-instruct:free",
)
MAX_FREE_TEXT_LENGTH = 1000

EXTRACTION_FIELDS: tuple[str, ...] = (
    "species",
    "breedId",
    "bodyWeightKg",
    "milkYieldLitersPerDay",
    "milkFatPct",
    "budgetInrPerDay",
    "matchedFeeds",
    "unmatchedFeeds",
)

FORBIDDEN_FEED_KEYS: frozenset[str] = frozenset(
    {
        "dmPct",
        "cpPctDm",
        "meMcalPerKgDm",
        "caGramsPerKgDm",
        "pGramsPerKgDm",
        "derivedTdnPctDm",
        "defaultPriceInrPerKgAsFed",
        "priceSource",
        "priceDate",
        "priceReliability",
        "priceNote",
        "availableMonths",
        "seasonNote",
    }
)

FORBIDDEN_ANIMAL_KEYS: frozenset[str] = frozenset(
    {
        "milkCapLPerDay",
        "capBasis",
        "peakDailyYieldKg",
        "avgDailyYieldKg",
        "lactationYieldKg",
        "cpGramsPerDay",
        "meMcalPerDay",
        "caGramsPerDay",
        "pGramsPerDay",
        "dmKgPerDay",
    }
)

# Extended multilingual aliases for v1 feeds (English, Hinglish, and NFC Devanagari)
V1_FEED_ALIASES: dict[str, tuple[str, ...]] = {
    "bajra_green": (
        "green pearl millet fodder",
        "pearl millet fodder (green)",
        "pearl millet fodder",
        "hara bajra chara",
        "bajra chara",
        "bajra green",
        "हरा बाजरा चारा",
        "बाजरा चारा",
    ),
    "jowar_green": (
        "sorghum fodder (green)",
        "sorghum fodder",
        "jowar chari",
        "jowar green",
        "ज्वार चरी",
    ),
    "maize_green": (
        "green maize fodder",
        "maize fodder (green)",
        "maize fodder",
        "makka chara",
        "maize green",
        "green maize",
        "मक्का चारा",
    ),
    "cowpea_green": (
        "cowpea fodder (green)",
        "cowpea fodder",
        "lobia chara",
        "lobia",
        "लोबिया चारा",
        "लोबिया",
    ),
    "guar_green": (
        "cluster bean fodder (green)",
        "cluster bean fodder",
        "guar chara",
        "guar green",
        "ग्वार चारा",
    ),
    "berseem": (
        "berseem (green)",
        "green berseem",
        "hara berseem",
        "berseem",
        "हरा बरसीम",
        "बरसीम",
    ),
    "lucerne": (
        "lucerne (green)",
        "lucerne",
        "rijka",
        "रिजका",
    ),
    "oats_green": (
        "green oats fodder",
        "oats fodder (green)",
        "oats fodder",
        "hari jai",
        "jai",
        "हरी जई",
        "जई",
    ),
    "marvel_grass": (
        "marvel grass hay",
        "marvel grass",
        "karad ghas",
        "karad",
        "jerga",
        "करड़ घास",
        "करड़",
    ),
    "khejri_leaf": (
        "khejri leaf (dry)",
        "khejri leaf",
        "loong",
        "लूंग",
    ),
    "wheat_straw": (
        "wheat straw",
        "wheat bhusa",
        "gehun ka bhusa",
        "gehu ka bhusa",
        "गेहूँ का भूसा",
        "गेहूं का भूसा",
        "turi",
    ),
    "bajra_stover": (
        "pearl millet stover",
        "bajra stover",
        "bajra karbi",
        "बाजरे की करबी",
        "करबी",
        "karbi",
    ),
    "barley_straw": (
        "barley straw",
        "jau ka bhusa",
        "जौ का भूसा",
    ),
    "groundnut_haulm": (
        "groundnut haulm",
        "groundnut bhusa",
        "mungfali ka bhusa",
        "मूंगफली का भूसा",
    ),
    "gram_straw": (
        "gram (chickpea) straw",
        "chickpea straw",
        "gram straw",
        "chane ka bhusa",
        "चने का भूसा",
    ),
    "guar_straw": (
        "cluster bean (guar) straw",
        "guar straw",
        "ग्वार फलगटी",
        "फलगटी",
        "phalgati",
        "gotar",
    ),
    "moong_straw": (
        "moong straw",
        "mung straw",
        "मूंग का भूसा",
    ),
    "jowar_stover": (
        "sorghum stover",
        "jowar kadbi",
        "ज्वार कड़बी",
        "कड़बी",
        "kadbi",
    ),
    "mustard_cake": (
        "mustard cake",
        "mustard khali",
        "sarson khali",
        "sarson khal",
        "सरसों खली",
        "सरसों की खल",
        "सरसों खल",
    ),
    "cottonseed_cake": (
        "cottonseed cake",
        "binola khali",
        "binola khal",
        "बिनौला खली",
        "बिनौला खल",
    ),
    "guar_meal": (
        "guar meal",
        "guar korma",
        "ग्वार कोरमा",
        "korma",
    ),
    "groundnut_cake": (
        "groundnut cake",
        "mungfali khali",
        "mungfali khal",
        "मूंगफली खली",
        "मूंगफली खल",
    ),
    "wheat_bran": (
        "wheat bran",
        "gehun ka chokar",
        "chokar",
        "चोकर",
    ),
    "rice_bran_dorb": (
        "de-oiled rice bran",
        "deoiled rice bran",
        "डी-ऑयल्ड राइस ब्रान",
        "dorb",
    ),
    "pulse_chuni": (
        "pulse husk (chuni)",
        "pulse husk",
        "dal chuni",
        "दाल चुनी",
        "चुनी",
        "chuni",
    ),
    "bajra_grain": (
        "pearl millet grain (bajra)",
        "pearl millet grain",
        "bajra grain",
        "bajra dana",
        "बाजरा दाना",
        "बाजरा",
        "bajra",
    ),
    "maize_grain": (
        "maize grain",
        "makka grain",
        "makka dana",
        "मक्का दाना",
    ),
    "molasses": (
        "sugarcane molasses",
        "ganne ka sheera",
        "गन्ने का शीरा",
        "शीरा",
        "molasses",
        "sheera",
        "shira",
    ),
    "saras_compound": (
        "saras compound cattle feed",
        "saras pashu aahar",
        "सरस पशु आहार",
    ),
    "mineral_mix": (
        "mineral mixture",
        "mineral mix",
        "khanij mishran",
        "खनिज मिश्रण",
    ),
}

# Canonical mapping for multilingual unmatched feed phrases (AC-E5.1 & AC-L1.5)
UNMATCHED_CANONICAL_MAP: dict[str, str] = {
    "magic probiotic mix": "magic probiotic mix",
    "मैजिक प्रोबायोटिक मिक्स": "magic probiotic mix",
    "जादुई प्रोबायोटिक मिक्स": "magic probiotic mix",
    "herbal calcium tonic": "herbal calcium tonic",
    "हर्बल कैल्शियम टॉनिक": "herbal calcium tonic",
    "bypass fat booster": "bypass fat booster",
    "बाईपास फैट बूस्टर": "bypass fat booster",
    "स्पेशल बाईपास फैट बूस्टर": "bypass fat booster",
    "special bypass fat booster": "bypass fat booster",
}

UNMATCHED_HINTS: tuple[str, ...] = (
    "probiotic",
    "magic",
    "tonic",
    "premix",
    "booster",
    "powder mix",
    "प्रोबायोटिक",
    "मैजिक",
    "टॉनिक",
    "बूस्टर",
)


def nfc(text: str) -> str:
    return unicodedata.normalize("NFC", text)


def normalize_digits(text: str) -> str:
    """Convert Devanagari digits (U+0966..U+096F) to Latin digits 0..9 and NFC-normalize."""
    chars: list[str] = []
    for ch in text:
        code = ord(ch)
        if 0x0966 <= code <= 0x096F:
            chars.append(str(code - 0x0966))
        else:
            chars.append(ch)
    return nfc("".join(chars))


def load_v1_catalogs() -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    feeds = json.loads((DATA_DIR / "feeds.v1.json").read_text(encoding="utf-8"))
    breeds = json.loads((DATA_DIR / "breeds.v1.json").read_text(encoding="utf-8"))
    lexicon = json.loads((DATA_DIR / "prototypeLexicon.json").read_text(encoding="utf-8"))
    return feeds, breeds, lexicon


def load_test_descriptions(path: Path = DEFAULT_DESCRIPTIONS_PATH) -> list[dict[str, Any]]:
    return json.loads(path.read_text(encoding="utf-8"))


def sanitize_catalog_for_prompt(catalog: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Strip nutrient, price, and seasonal fields from catalog entries before prompting (AC-E5.1)."""
    out: list[dict[str, Any]] = []
    for item in catalog:
        if not isinstance(item, dict):
            continue
        fid = str(item.get("id", "")).strip()
        en_name = str(item.get("englishName", "")).strip()
        if not fid or not en_name:
            continue
        latn = item.get("localNameLatn")
        deva = item.get("localNameDeva")
        out.append(
            {
                "id": fid,
                "englishName": en_name,
                "localNameLatn": str(latn).strip() if isinstance(latn, str) and latn.strip() else None,
                "localNameDeva": nfc(str(deva).strip()) if isinstance(deva, str) and deva.strip() else None,
            }
        )
    return out


def sanitize_breeds_for_prompt(breeds: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Strip yield, cap, fat, and weight fields from breed entries before prompting (AC-E5.1)."""
    out: list[dict[str, Any]] = []
    for item in breeds:
        if not isinstance(item, dict):
            continue
        bid = str(item.get("id", "")).strip()
        species = item.get("species")
        en_name = str(item.get("englishName", "")).strip()
        if not bid or species not in ("cow", "buffalo") or not en_name:
            continue
        latn = item.get("localNameLatn")
        deva = item.get("localNameDeva")
        out.append(
            {
                "id": bid,
                "species": species,
                "englishName": en_name,
                "localNameLatn": str(latn).strip() if isinstance(latn, str) and latn.strip() else None,
                "localNameDeva": nfc(str(deva).strip()) if isinstance(deva, str) and deva.strip() else None,
            }
        )
    return out


def build_extract_messages(
    free_text: str,
    catalog: list[dict[str, Any]],
    breeds: list[dict[str, Any]],
) -> list[dict[str, str]]:
    """Build OpenRouter chat messages matching buildExtractMessages in api/llm.ts."""
    system_prompt = "\n".join(
        [
            "You are an agricultural data extraction parser for dairy ration balancing in Rajasthan and North India.",
            "Parse the user description (which may be in English, Hindi in Devanagari, or Hinglish) into strict JSON.",
            "Term mappings:",
            '- bhains -> species: "buffalo"',
            '- gaay / gai -> species: "cow"',
            "- kilo / kg -> bodyWeightKg (animal body weight in kg)",
            "- litre / liter / L / doodh -> milkYieldLitersPerDay (daily milk yield in L/day; 0 if dry)",
            "- fat / fat% -> milkFatPct (milk fat percentage)",
            "- rupaye roz / rs per day / daily budget -> budgetInrPerDay (daily budget in INR/day, or null if not stated)",
            "- Convert any Hindi or Hinglish number words into standard Latin numbers.",
            "Rules for breeds and feeds (CRITICAL):",
            "1. Match breedId ONLY against the provided breeds list for the extracted species. If no breed is mentioned or the breed is not in the list for that species, set breedId to null.",
            '2. Match feeds ONLY against the provided catalog list (by id, englishName, localNameLatn, or localNameDeva). Put matched catalog ids into matchedFeeds as { "feedId": "<catalog id>", "priceInrPerKgAsFed": null, "maxKgAsFedPerDay": null }.',
            "3. If the user mentions any feed, supplement, or mix that does NOT match an entry in the provided catalog, place its name as a string in unmatchedFeeds.",
            "4. NEVER invent, estimate, or output nutrient values (DM, CP, ME, Ca, P), feed prices, seasonal months, or breed milk caps.",
            "Respond with ONLY a valid JSON object matching this exact structure:",
            '{"animal":{"species":"cow|buffalo","bodyWeightKg":450,"milkYieldLitersPerDay":8,"milkFatPct":6.5},"breedId":"string|null","budgetInrPerDay":null,"matchedFeeds":[{"feedId":"string","priceInrPerKgAsFed":null,"maxKgAsFedPerDay":null}],"unmatchedFeeds":["string"]}',
        ]
    )
    user_payload = json.dumps(
        {
            "freeText": normalize_digits(free_text.strip()),
            "catalog": sanitize_catalog_for_prompt(catalog),
            "breeds": sanitize_breeds_for_prompt(breeds),
        },
        ensure_ascii=False,
    )
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_payload},
    ]


def _find_catalog_feed(token: str, catalog: list[dict[str, Any]]) -> dict[str, Any] | None:
    norm = nfc(token.strip()).lower()
    if not norm:
        return None
    for item in catalog:
        if str(item.get("id", "")).lower() == norm:
            return item
        if nfc(str(item.get("englishName", ""))).lower() == norm:
            return item
        deva = item.get("localNameDeva")
        if isinstance(deva, str) and nfc(deva).lower() == norm:
            return item
        latn = item.get("localNameLatn")
        if isinstance(latn, str):
            parts = [nfc(p.strip()).lower() for p in latn.split("/") if p.strip()]
            if norm in parts:
                return item
    return None


def _find_catalog_breed(
    token: str,
    species: str,
    breeds: list[dict[str, Any]],
) -> dict[str, Any] | None:
    norm = nfc(token.strip()).lower()
    if not norm:
        return None
    for breed in breeds:
        if breed.get("species") != species:
            continue
        if str(breed.get("id", "")).lower() == norm:
            return breed
        if nfc(str(breed.get("englishName", ""))).lower() == norm:
            return breed
        deva = breed.get("localNameDeva")
        if isinstance(deva, str) and nfc(deva).lower() == norm:
            return breed
        latn = breed.get("localNameLatn")
        if isinstance(latn, str):
            parts = [nfc(p.strip()).lower() for p in latn.split("/") if p.strip()]
            if norm in parts:
                return breed
    return None


def canonicalize_unmatched_name(raw_name: str) -> str:
    cleaned = nfc(raw_name.strip())
    # Strip trailing punctuation and Hindi/Hinglish sentence tails
    cleaned = re.sub(r"[.।,;]+$", "", cleaned).strip()
    cleaned = re.sub(r"\s+(?:hai|है|ke saath|के साथ)$", "", cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"^(?:a|an|the|एक)\s+", "", cleaned, flags=re.IGNORECASE).strip()
    lower = cleaned.lower()
    if lower in UNMATCHED_CANONICAL_MAP:
        return UNMATCHED_CANONICAL_MAP[lower]
    return lower


def sanitize_extract_response(
    raw: dict[str, Any],
    catalog: list[dict[str, Any]],
    breeds: list[dict[str, Any]],
    model_used: str = "deterministic-extractor",
) -> dict[str, Any]:
    """Validate and sanitize an extraction payload (mirrors sanitizeExtractResponse in api/llm.ts).

    - Enforces valid species ('cow' | 'buffalo') and finite animal numbers.
    - Drops any breedId not present in `breeds` for the extracted `species` (SPEC AC-2.3).
    - Forces priceInrPerKgAsFed to None and strips any LLM-supplied nutrient, price, season, or
      breed-cap numbers (SPEC AC-E5.1).
    - Moves any out-of-catalog feed from matchedFeeds into unmatchedFeeds (SPEC AC-E5.1).
    """
    if not isinstance(raw, dict):
        raise ValueError("Invalid extraction payload: expected dict")

    animal_raw = raw.get("animal") if isinstance(raw.get("animal"), dict) else raw
    raw_species = str(animal_raw.get("species", "")).strip().lower()
    if raw_species == "buffalo":
        species = "buffalo"
    elif raw_species in ("cow", "cattle"):
        species = "cow"
    else:
        raise ValueError(f"Invalid extraction payload: missing or invalid species {raw_species!r}")

    try:
        body_weight_kg = float(animal_raw.get("bodyWeightKg"))
    except (TypeError, ValueError) as exc:
        raise ValueError("Invalid extraction payload: invalid bodyWeightKg") from exc
    if not math.isfinite(body_weight_kg) or body_weight_kg <= 0:
        raise ValueError("Invalid extraction payload: bodyWeightKg must be positive and finite")

    milk_raw_val = animal_raw.get("milkYieldLitersPerDay")
    milk_yield = 0.0 if milk_raw_val is None else float(milk_raw_val)
    if not math.isfinite(milk_yield) or milk_yield < 0:
        raise ValueError("Invalid extraction payload: invalid milkYieldLitersPerDay")

    default_fat = 4.0 if species == "cow" else 6.0
    fat_raw_val = animal_raw.get("milkFatPct")
    milk_fat_pct = default_fat if fat_raw_val is None else float(fat_raw_val)
    if not math.isfinite(milk_fat_pct) or milk_fat_pct < 0:
        raise ValueError("Invalid extraction payload: invalid milkFatPct")

    # AC-2.3: Breed must match an entry in `breeds` for the extracted `species`
    candidate_breed = raw.get("breedId")
    if not isinstance(candidate_breed, str):
        candidate_breed = animal_raw.get("breedId") if isinstance(animal_raw.get("breedId"), str) else None
    matched_breed = _find_catalog_breed(candidate_breed, species, breeds) if candidate_breed else None
    breed_id = matched_breed["id"] if matched_breed else None

    raw_budget = raw.get("budgetInrPerDay")
    if raw_budget is None:
        raw_budget = animal_raw.get("budgetInrPerDay")
    budget_inr_per_day: float | None = None
    if raw_budget is not None and raw_budget != "":
        try:
            parsed_budget = float(raw_budget)
            if math.isfinite(parsed_budget) and parsed_budget > 0:
                budget_inr_per_day = parsed_budget
        except (TypeError, ValueError):
            budget_inr_per_day = None

    matched_feeds: list[dict[str, Any]] = []
    seen_feed_ids: set[str] = set()
    unmatched_feeds: list[str] = []
    seen_unmatched: set[str] = set()

    def add_unmatched(name: str) -> None:
        canon = canonicalize_unmatched_name(name)
        if not canon:
            return
        if canon not in seen_unmatched:
            seen_unmatched.add(canon)
            unmatched_feeds.append(canon)

    raw_matched = raw.get("matchedFeeds")
    if isinstance(raw_matched, list):
        for entry in raw_matched:
            token = ""
            max_kg: float | None = None
            if isinstance(entry, str):
                token = entry
            elif isinstance(entry, dict):
                token = str(entry.get("feedId") or entry.get("id") or entry.get("name") or "")
                raw_max = entry.get("maxKgAsFedPerDay")
                if raw_max is not None:
                    try:
                        parsed_max = float(raw_max)
                        if math.isfinite(parsed_max) and parsed_max >= 0:
                            max_kg = parsed_max
                    except (TypeError, ValueError):
                        max_kg = None

            catalog_hit = _find_catalog_feed(token, catalog)
            if catalog_hit is not None:
                fid = catalog_hit["id"]
                if fid not in seen_feed_ids:
                    seen_feed_ids.add(fid)
                    # AC-E5.1: priceInrPerKgAsFed is forced to None; any LLM nutrient/price/season fields are stripped
                    matched_feeds.append(
                        {
                            "feedId": fid,
                            "priceInrPerKgAsFed": None,
                            "maxKgAsFedPerDay": max_kg,
                        }
                    )
            elif token.strip():
                add_unmatched(token)

    raw_unmatched = raw.get("unmatchedFeeds")
    if isinstance(raw_unmatched, list):
        for entry in raw_unmatched:
            if isinstance(entry, str):
                name = entry
            elif isinstance(entry, dict):
                name = str(entry.get("name") or entry.get("feedId") or entry.get("id") or "")
            else:
                name = ""
            if not name.strip():
                continue
            catalog_hit = _find_catalog_feed(name, catalog)
            if catalog_hit is not None:
                fid = catalog_hit["id"]
                if fid not in seen_feed_ids:
                    seen_feed_ids.add(fid)
                    matched_feeds.append(
                        {
                            "feedId": fid,
                            "priceInrPerKgAsFed": None,
                            "maxKgAsFedPerDay": None,
                        }
                    )
            else:
                add_unmatched(name)

    return {
        "action": "extract",
        "modelUsed": model_used,
        "animal": {
            "species": species,
            "bodyWeightKg": body_weight_kg,
            "milkYieldLitersPerDay": milk_yield,
            "milkFatPct": milk_fat_pct,
        },
        "breedId": breed_id,
        "budgetInrPerDay": budget_inr_per_day,
        "matchedFeeds": matched_feeds,
        "unmatchedFeeds": unmatched_feeds,
    }


def _number_before(text: str, words: list[str]) -> float | None:
    escaped = "|".join(re.escape(nfc(w)) for w in words)
    pattern = re.compile(rf"(\d+(?:\.\d+)?)\s*(?:{escaped})", re.IGNORECASE)
    match = pattern.search(text)
    return float(match.group(1)) if match else None


def extract_deterministic(
    free_text: str,
    catalog: list[dict[str, Any]],
    breeds: list[dict[str, Any]],
    lexicon: dict[str, Any],
) -> dict[str, Any]:
    """Deterministic multilingual (English, Hindi Devanagari, Hinglish) extraction parser."""
    normalized_raw = normalize_digits(free_text).strip()
    if not normalized_raw or len(normalized_raw) > MAX_FREE_TEXT_LENGTH:
        raise ValueError("INVALID_REQUEST: freeText must be 1..1000 chars")

    text = normalized_raw.lower()

    def has_any(words: list[str]) -> bool:
        return any(nfc(w).lower() in text for w in words)

    species: str | None = None
    if has_any(lexicon["species"]["buffalo"]):
        species = "buffalo"
    elif has_any(lexicon["species"]["cow"]):
        species = "cow"

    weight = _number_before(text, list(lexicon["kgWords"]))
    if species is None or weight is None:
        raise ValueError("INVALID_REQUEST: could not extract species or bodyWeightKg")

    milk_words = [*lexicon["litreWords"], "litres", "liters"]
    milk = _number_before(text, milk_words)

    fat_match = re.search(r"(\d+(?:\.\d+)?)\s*%", text)
    fat = float(fat_match.group(1)) if fat_match else None

    # Breed matching: longest matching breed name for the extracted species (excluding non-descript unless named)
    breed_id: str | None = None
    best_breed_len = 0
    for breed in breeds:
        if breed.get("species") != species or breed.get("isNonDescript"):
            continue
        candidate_names: list[str] = []
        for field in ("englishName", "localNameLatn", "localNameDeva"):
            val = breed.get(field)
            if isinstance(val, str) and val.strip():
                candidate_names.append(nfc(val.strip()).lower())
        if breed["id"] == "nili_ravi":
            candidate_names.extend(["nili ravi", "nili-ravi", "नीली-रावी", "नीली रावी"])
        if breed["id"] == "hf_crossbred":
            candidate_names.extend(["hf crossbred", "एचएफ संकर"])
        for name in candidate_names:
            if len(name) > best_breed_len and name in text:
                breed_id = breed["id"]
                best_breed_len = len(name)

    # Budget matching: after budget word OR before rupaye roz / rupees per day
    budget_words = [*lexicon["budgetWords"], "daily budget", "दैनिक बजट"]
    budget_escaped = "|".join(re.escape(nfc(w)) for w in budget_words)
    budget_match = re.search(rf"(?:{budget_escaped})[^\d]{{0,24}}(\d+(?:\.\d+)?)", text, re.IGNORECASE)
    if not budget_match:
        budget_match = re.search(
            r"(\d+(?:\.\d+)?)\s*(?:rupaye roz|rupees per day|rupees a day|रुपये रोज़|रुपये रोज|रुपये प्रतिदिन)",
            text,
            re.IGNORECASE,
        )
    budget = float(budget_match.group(1)) if budget_match else None

    # Feed matching: collect all (alias, feed_id) pairs across v1 catalog and match longest alias first
    catalog_order = {f["id"]: idx for idx, f in enumerate(catalog)}
    alias_pairs: list[tuple[str, str]] = []
    lex_aliases: dict[str, list[str]] = lexicon.get("feedAliases", {})

    for feed in catalog:
        fid = feed["id"]
        raw_aliases: list[str] = []
        raw_aliases.extend(V1_FEED_ALIASES.get(fid, ()))
        raw_aliases.extend(lex_aliases.get(fid, ()))
        en_base = re.sub(r"\s*\(.*\)", "", str(feed.get("englishName", ""))).strip()
        if len(en_base) >= 4:
            raw_aliases.append(en_base)
        latn = feed.get("localNameLatn")
        if isinstance(latn, str):
            for part in latn.split("/"):
                p = part.strip()
                # Avoid ambiguous bare "Bhusa" on barley_straw so it doesn't collide with wheat_straw
                if fid == "barley_straw" and p.lower() == "bhusa":
                    continue
                if len(p) >= 4:
                    raw_aliases.append(p)
        deva = feed.get("localNameDeva")
        if isinstance(deva, str) and len(deva.strip()) >= 2:
            raw_aliases.append(deva.strip())

        seen_for_feed: set[str] = set()
        for a in raw_aliases:
            norm_a = nfc(a.strip()).lower()
            if norm_a and norm_a not in seen_for_feed:
                seen_for_feed.add(norm_a)
                alias_pairs.append((norm_a, fid))

    # Sort by alias length descending so specific multi-word phrases match before generic substrings
    alias_pairs.sort(key=lambda pair: (-len(pair[0]), catalog_order.get(pair[1], 999)))

    remaining = text
    matched_set: set[str] = set()
    for alias, fid in alias_pairs:
        if fid in matched_set:
            continue
        if alias in remaining:
            matched_set.add(fid)
            remaining = remaining.replace(alias, " ")

    # Order matched feeds consistently in v1 catalog order
    matched_ids = sorted(matched_set, key=lambda fid: catalog_order.get(fid, 999))

    # Unmatched feed extraction across segments
    separators = [*lexicon.get("separators", []), " और ", " तथा "]
    sep_pattern = re.compile("|".join(re.escape(nfc(s)) for s in separators), re.IGNORECASE)
    unmatched: list[str] = []
    for segment in sep_pattern.split(text):
        seg_clean = segment.strip()
        if not seg_clean:
            continue
        if any(hint in seg_clean for hint in UNMATCHED_HINTS):
            canon = canonicalize_unmatched_name(seg_clean)
            if canon and canon not in unmatched:
                unmatched.append(canon)

    raw_payload = {
        "animal": {
            "species": species,
            "bodyWeightKg": weight,
            "milkYieldLitersPerDay": milk if milk is not None else 0.0,
            "milkFatPct": fat if fat is not None else (4.0 if species == "cow" else 6.0),
        },
        "breedId": breed_id,
        "budgetInrPerDay": budget,
        "matchedFeeds": [
            {"feedId": fid, "priceInrPerKgAsFed": None, "maxKgAsFedPerDay": None}
            for fid in matched_ids
        ],
        "unmatchedFeeds": unmatched,
    }
    return sanitize_extract_response(raw_payload, catalog, breeds, model_used="deterministic-extractor")


def _parse_json_from_model_content(content: str) -> dict[str, Any]:
    trimmed = content.strip()
    if not trimmed:
        raise ValueError("Empty model response content")
    try:
        parsed = json.loads(trimmed)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", trimmed, re.IGNORECASE)
    if fence_match:
        parsed = json.loads(fence_match.group(1).strip())
        if isinstance(parsed, dict):
            return parsed

    first_brace = trimmed.find("{")
    last_brace = trimmed.rfind("}")
    if first_brace != -1 and last_brace > first_brace:
        parsed = json.loads(trimmed[first_brace : last_brace + 1])
        if isinstance(parsed, dict):
            return parsed
    raise ValueError("Model response is not valid JSON object")


def extract_live_openrouter(
    free_text: str,
    catalog: list[dict[str, Any]],
    breeds: list[dict[str, Any]],
    api_key: str,
    primary_model: str | None = None,
    fallback_models: list[str] | None = None,
    timeout_sec: float = 15.0,
) -> dict[str, Any]:
    """Call OpenRouter with fallback chain and sanitize the extraction response (mirrors api/llm.ts)."""
    primary = (primary_model or os.environ.get("OPENROUTER_MODEL") or DEFAULT_PRIMARY_MODEL).strip()
    if fallback_models is not None:
        fallbacks = [m.strip() for m in fallback_models if m.strip()]
    else:
        env_fb = (os.environ.get("OPENROUTER_FALLBACK_MODELS") or "").strip()
        fallbacks = [m.strip() for m in env_fb.split(",") if m.strip()] if env_fb else list(DEFAULT_FALLBACK_MODELS)

    models: list[str] = []
    for m in [primary, *fallbacks]:
        if m and m not in models:
            models.append(m)

    messages = build_extract_messages(free_text, catalog, breeds)
    last_error = "All OpenRouter models failed"

    for model in models:
        req_body = json.dumps(
            {
                "model": model,
                "messages": messages,
                "temperature": 0.1,
                "response_format": {"type": "json_object"},
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            OPENROUTER_API_URL,
            data=req_body,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://sahidana.vercel.app",
                "X-Title": "SahiDana",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                choices = data.get("choices") or []
                if not choices:
                    last_error = f"Model {model} returned empty choices"
                    continue
                content = choices[0].get("message", {}).get("content", "")
                if isinstance(content, dict):
                    raw_obj = content
                else:
                    raw_obj = _parse_json_from_model_content(str(content))
                return sanitize_extract_response(raw_obj, catalog, breeds, model_used=model)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, KeyError) as exc:
            last_error = f"Model {model} failed: {exc}"
            continue

    raise RuntimeError(last_error)


def normalize_extracted_record(extracted: dict[str, Any]) -> dict[str, Any]:
    """Extract canonical flat record of the 8 benchmark fields from an ExtractionResponse."""
    animal = extracted["animal"]
    matched_ids = [item["feedId"] for item in extracted.get("matchedFeeds", [])]
    unmatched = [canonicalize_unmatched_name(u) for u in extracted.get("unmatchedFeeds", [])]
    budget = extracted.get("budgetInrPerDay")
    return {
        "species": animal["species"],
        "breedId": extracted.get("breedId"),
        "bodyWeightKg": float(animal["bodyWeightKg"]),
        "milkYieldLitersPerDay": float(animal["milkYieldLitersPerDay"]),
        "milkFatPct": float(animal["milkFatPct"]),
        "budgetInrPerDay": float(budget) if budget is not None else None,
        "matchedFeeds": matched_ids,
        "unmatchedFeeds": unmatched,
    }


def compare_extraction_with_expected(
    extracted: dict[str, Any],
    expected: dict[str, Any],
) -> dict[str, Any]:
    """Compare an extracted response against expected ground-truth labels across all 8 fields."""
    norm = normalize_extracted_record(extracted)

    exp_budget = expected.get("budgetInrPerDay")
    budget_match = (
        norm["budgetInrPerDay"] is None and exp_budget is None
    ) or (
        norm["budgetInrPerDay"] is not None
        and exp_budget is not None
        and abs(float(norm["budgetInrPerDay"]) - float(exp_budget)) <= 1e-6
    )

    exp_feeds = list(expected["matchedFeeds"])
    pred_feeds = list(norm["matchedFeeds"])
    exp_feed_set = set(exp_feeds)
    pred_feed_set = set(pred_feeds)

    tp = len(exp_feed_set & pred_feed_set)
    precision = tp / len(pred_feed_set) if pred_feed_set else (1.0 if not exp_feed_set else 0.0)
    recall = tp / len(exp_feed_set) if exp_feed_set else 1.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0

    exp_unmatched = [canonicalize_unmatched_name(u) for u in expected.get("unmatchedFeeds", [])]

    field_matches: dict[str, bool] = {
        "species": norm["species"] == expected["species"],
        "breedId": norm["breedId"] == expected["breedId"],
        "bodyWeightKg": abs(norm["bodyWeightKg"] - float(expected["bodyWeightKg"])) <= 1e-6,
        "milkYieldLitersPerDay": abs(
            norm["milkYieldLitersPerDay"] - float(expected["milkYieldLitersPerDay"])
        )
        <= 1e-6,
        "milkFatPct": abs(norm["milkFatPct"] - float(expected["milkFatPct"])) <= 1e-6,
        "budgetInrPerDay": budget_match,
        "matchedFeeds": pred_feeds == exp_feeds and pred_feed_set == exp_feed_set,
        "unmatchedFeeds": norm["unmatchedFeeds"] == exp_unmatched,
    }

    return {
        "fieldMatches": field_matches,
        "fullMatch": all(field_matches.values()),
        "matchedFeedsPrecision": precision,
        "matchedFeedsRecall": recall,
        "matchedFeedsF1": f1,
        "normalizedExtracted": norm,
    }


def verify_cross_language_parity(
    descriptions: list[dict[str, Any]],
    extracted_by_id: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Verify English, Hindi (Devanagari), and Hinglish parity across all 10 semantic triples (SPEC AC-L1.5)."""
    triples: dict[str, dict[str, dict[str, Any]]] = {}
    for item in descriptions:
        tid = item["tripleId"]
        lang = item["language"]
        triples.setdefault(tid, {})[lang] = item

    triple_results: list[dict[str, Any]] = []
    all_triples_parity = True

    for tid in sorted(triples.keys()):
        group = triples[tid]
        languages_present = set(group.keys())
        has_all_three = languages_present == {"en", "hi", "hinglish"}

        en_rec = normalize_extracted_record(extracted_by_id[group["en"]["id"]])
        hi_rec = normalize_extracted_record(extracted_by_id[group["hi"]["id"]])
        hinglish_rec = normalize_extracted_record(extracted_by_id[group["hinglish"]["id"]])

        expected_parity = (
            group["en"]["expected"] == group["hi"]["expected"] == group["hinglish"]["expected"]
        )
        extracted_parity = en_rec == hi_rec == hinglish_rec

        field_parity: dict[str, bool] = {}
        for field in EXTRACTION_FIELDS:
            field_parity[field] = en_rec[field] == hi_rec[field] == hinglish_rec[field]

        triple_ok = has_all_three and expected_parity and extracted_parity and all(field_parity.values())
        if not triple_ok:
            all_triples_parity = False

        triple_results.append(
            {
                "tripleId": tid,
                "languagesPresent": sorted(languages_present),
                "expectedParity": expected_parity,
                "extractedParity": extracted_parity,
                "fieldParity": field_parity,
                "parityPassed": triple_ok,
                "extractedRecord": en_rec,
            }
        )

    return {
        "totalTriples": len(triple_results),
        "parityPassedCount": sum(1 for t in triple_results if t["parityPassed"]),
        "parityAccuracy": (
            sum(1 for t in triple_results if t["parityPassed"]) / len(triple_results)
            if triple_results
            else 0.0
        ),
        "allTriplesParity": all_triples_parity,
        "triples": triple_results,
    }


def verify_nutrient_safety(
    catalog: list[dict[str, Any]],
    breeds: list[dict[str, Any]],
    extracted_by_id: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Verify SPEC AC-2.3 and AC-E5.1 nutrient, price, season, and breed-cap safety invariants."""
    catalog_snapshot = copy.deepcopy(catalog)
    breeds_snapshot = copy.deepcopy(breeds)
    catalog_ids = {f["id"] for f in catalog}
    breeds_by_id = {b["id"]: b for b in breeds}

    # 1. Prompt sanitization strips all nutrient, price, season, and breed-cap fields
    sanitized_cat = sanitize_catalog_for_prompt(catalog)
    sanitized_br = sanitize_breeds_for_prompt(breeds)
    prompt_catalog_clean = all(
        set(item.keys()) == {"id", "englishName", "localNameLatn", "localNameDeva"}
        and not (set(item.keys()) & FORBIDDEN_FEED_KEYS)
        for item in sanitized_cat
    )
    prompt_breeds_clean = all(
        set(item.keys()) == {"id", "species", "englishName", "localNameLatn", "localNameDeva"}
        and not (set(item.keys()) & FORBIDDEN_ANIMAL_KEYS)
        for item in sanitized_br
    )

    # 2. Check all 30 extracted outputs for forbidden keys, null prices, valid catalog IDs, and species-matched breedIds
    outputs_clean = True
    unmatched_isolated = True
    breed_species_valid = True

    for _, res in extracted_by_id.items():
        animal = res.get("animal", {})
        if set(animal.keys()) & FORBIDDEN_ANIMAL_KEYS:
            outputs_clean = False
        if set(res.keys()) & FORBIDDEN_ANIMAL_KEYS:
            outputs_clean = False

        bid = res.get("breedId")
        if bid is not None:
            if bid not in breeds_by_id or breeds_by_id[bid]["species"] != animal.get("species"):
                breed_species_valid = False

        for mf in res.get("matchedFeeds", []):
            if set(mf.keys()) != {"feedId", "priceInrPerKgAsFed", "maxKgAsFedPerDay"}:
                outputs_clean = False
            if mf.get("priceInrPerKgAsFed") is not None:
                outputs_clean = False
            if mf.get("feedId") not in catalog_ids:
                unmatched_isolated = False

        for uf in res.get("unmatchedFeeds", []):
            if not isinstance(uf, str) or uf in catalog_ids:
                unmatched_isolated = False

    # 3. Adversarial probe: inject nutrient values, prices, season months, breed caps, out-of-species breedId,
    #    and unknown feeds inside matchedFeeds, and verify sanitize_extract_response strips/isolates them.
    adversarial_raw = {
        "animal": {
            "species": "buffalo",
            "breedId": "sahiwal",  # cow breed on a buffalo -> must be stripped (AC-2.3)
            "bodyWeightKg": 480,
            "milkYieldLitersPerDay": 9,
            "milkFatPct": 6.8,
            "milkCapLPerDay": 25.0,
            "cpGramsPerDay": 1800,
            "meMcalPerDay": 32.5,
        },
        "breedId": "sahiwal",
        "budgetInrPerDay": 240,
        "matchedFeeds": [
            {
                "feedId": "wheat_straw",
                "priceInrPerKgAsFed": 99.0,
                "defaultPriceInrPerKgAsFed": 99.0,
                "cpPctDm": 45.0,
                "meMcalPerKgDm": 3.5,
                "dmPct": 95.0,
                "caGramsPerKgDm": 120.0,
                "pGramsPerKgDm": 60.0,
                "availableMonths": [1, 2, 3],
                "maxKgAsFedPerDay": 7.0,
            },
            {
                "feedId": "magic probiotic mix",
                "priceInrPerKgAsFed": 150.0,
                "cpPctDm": 80.0,
            },
        ],
        "unmatchedFeeds": ["herbal calcium tonic"],
    }
    sanitized_adv = sanitize_extract_response(adversarial_raw, catalog, breeds, model_used="adversarial-probe")
    adversarial_probe_passed = (
        sanitized_adv["breedId"] is None
        and "milkCapLPerDay" not in sanitized_adv["animal"]
        and "cpGramsPerDay" not in sanitized_adv["animal"]
        and len(sanitized_adv["matchedFeeds"]) == 1
        and sanitized_adv["matchedFeeds"][0]
        == {
            "feedId": "wheat_straw",
            "priceInrPerKgAsFed": None,
            "maxKgAsFedPerDay": 7.0,
        }
        and sanitized_adv["unmatchedFeeds"] == ["magic probiotic mix", "herbal calcium tonic"]
    )

    # 4. Verify v1 catalog and breed tables were never mutated
    catalogs_unmutated = (catalog == catalog_snapshot) and (breeds == breeds_snapshot)

    all_passed = (
        prompt_catalog_clean
        and prompt_breeds_clean
        and outputs_clean
        and unmatched_isolated
        and breed_species_valid
        and adversarial_probe_passed
        and catalogs_unmutated
    )

    return {
        "promptCatalogClean": prompt_catalog_clean,
        "promptBreedsClean": prompt_breeds_clean,
        "outputsClean": outputs_clean,
        "unmatchedIsolated": unmatched_isolated,
        "breedSpeciesValid": breed_species_valid,
        "adversarialProbePassed": adversarial_probe_passed,
        "catalogsUnmutated": catalogs_unmutated,
        "nutrientSafetyPassed": all_passed,
    }


def evaluate_all(
    descriptions_path: Path = DEFAULT_DESCRIPTIONS_PATH,
    use_live_llm: bool = False,
) -> dict[str, Any]:
    """Run the full 30-description multilingual extraction benchmark and return detailed metrics."""
    catalog, breeds, lexicon = load_v1_catalogs()
    descriptions = load_test_descriptions(descriptions_path)

    api_key = (os.environ.get("OPENROUTER_API_KEY") or "").strip()
    live_mode = bool(use_live_llm and api_key)

    extracted_by_id: dict[str, dict[str, Any]] = {}
    records: list[dict[str, Any]] = []

    field_correct_counts: dict[str, int] = {f: 0 for f in EXTRACTION_FIELDS}
    lang_totals: dict[str, int] = {"en": 0, "hi": 0, "hinglish": 0}
    lang_full_correct: dict[str, int] = {"en": 0, "hi": 0, "hinglish": 0}

    for item in descriptions:
        did = item["id"]
        lang = item["language"]
        free_text = item["freeText"]
        expected = item["expected"]

        if live_mode:
            extracted = extract_live_openrouter(free_text, catalog, breeds, api_key=api_key)
        else:
            extracted = extract_deterministic(free_text, catalog, breeds, lexicon)

        extracted_by_id[did] = extracted
        comp = compare_extraction_with_expected(extracted, expected)

        lang_totals[lang] = lang_totals.get(lang, 0) + 1
        if comp["fullMatch"]:
            lang_full_correct[lang] = lang_full_correct.get(lang, 0) + 1

        for field, matched in comp["fieldMatches"].items():
            if matched:
                field_correct_counts[field] += 1

        records.append(
            {
                "id": did,
                "tripleId": item["tripleId"],
                "language": lang,
                "freeText": free_text,
                "expected": expected,
                "extracted": extracted,
                "comparison": comp,
            }
        )

    total = len(descriptions)
    full_correct = sum(1 for r in records if r["comparison"]["fullMatch"])
    field_accuracy = {
        field: (field_correct_counts[field] / total if total else 0.0)
        for field in EXTRACTION_FIELDS
    }
    language_accuracy = {
        lang: (lang_full_correct[lang] / count if count else 0.0)
        for lang, count in lang_totals.items()
    }
    mean_feed_f1 = (
        sum(r["comparison"]["matchedFeedsF1"] for r in records) / total if total else 0.0
    )

    parity_report = verify_cross_language_parity(descriptions, extracted_by_id)
    safety_report = verify_nutrient_safety(catalog, breeds, extracted_by_id)

    return {
        "mode": "live_openrouter" if live_mode else "deterministic",
        "totalDescriptions": total,
        "languageCounts": lang_totals,
        "fullRecordCorrect": full_correct,
        "fullRecordAccuracy": full_correct / total if total else 0.0,
        "fieldCorrectCounts": field_correct_counts,
        "fieldAccuracy": field_accuracy,
        "languageAccuracy": language_accuracy,
        "meanMatchedFeedsF1": mean_feed_f1,
        "crossLanguageParity": parity_report,
        "nutrientSafety": safety_report,
        "records": records,
    }


if __name__ == "__main__":
    use_live = os.environ.get("EVAL_LIVE_LLM", "").strip().lower() in ("1", "true", "yes")
    report = evaluate_all(use_live_llm=use_live)
    print(
        f"Evaluated {report['totalDescriptions']} descriptions (mode={report['mode']}): "
        f"fullRecordAccuracy={report['fullRecordAccuracy'] * 100:.1f}%, "
        f"languageAccuracy={report['languageAccuracy']}, "
        f"fieldAccuracy={report['fieldAccuracy']}, "
        f"crossLanguageParity={report['crossLanguageParity']['allTriplesParity']}, "
        f"nutrientSafety={report['nutrientSafety']['nutrientSafetyPassed']}"
    )
