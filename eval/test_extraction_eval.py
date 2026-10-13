"""Pytest suite for the 30-description multilingual extraction benchmark (M3-TASK-02).

Verifies SPEC AC-2.3, AC-E5.1, and AC-L1.5:
- 30 labelled descriptions (10 English, 10 Hindi in Devanagari, 10 Hinglish) in 10 semantic triples
- Field-level and full-record extraction accuracy across all 30 descriptions
- Cross-language parity across English, Hindi (Devanagari), and Hinglish triples (AC-L1.5)
- Species-scoped breed validation (AC-2.3)
- Strict nutrient, price, season, and breed-cap safety and unmatched feed isolation (AC-E5.1)
"""

from __future__ import annotations

import copy
import io
import json
import unicodedata
import urllib.error
from typing import Any
from unittest.mock import patch

import pytest

from eval.evaluate_extraction import (
    DEFAULT_DESCRIPTIONS_PATH,
    EXTRACTION_FIELDS,
    FORBIDDEN_ANIMAL_KEYS,
    FORBIDDEN_FEED_KEYS,
    build_extract_messages,
    compare_extraction_with_expected,
    evaluate_all,
    extract_deterministic,
    extract_live_openrouter,
    load_test_descriptions,
    load_v1_catalogs,
    normalize_digits,
    normalize_extracted_record,
    sanitize_breeds_for_prompt,
    sanitize_catalog_for_prompt,
    sanitize_extract_response,
    verify_cross_language_parity,
)

DEVA_RE = r"[\u0900-\u097F]"


@pytest.fixture(scope="module")
def v1_catalogs() -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    return load_v1_catalogs()


@pytest.fixture(scope="module")
def test_descriptions() -> list[dict[str, Any]]:
    assert DEFAULT_DESCRIPTIONS_PATH.exists(), f"Missing {DEFAULT_DESCRIPTIONS_PATH}"
    data = load_test_descriptions(DEFAULT_DESCRIPTIONS_PATH)
    assert isinstance(data, list) and len(data) == 30
    return data


@pytest.fixture(scope="module")
def evaluation_report() -> dict[str, Any]:
    return evaluate_all(DEFAULT_DESCRIPTIONS_PATH, use_live_llm=False)


def test_benchmark_dataset_structure_and_coverage(
    test_descriptions: list[dict[str, Any]],
    v1_catalogs: tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]],
) -> None:
    """Verify 30 labelled descriptions (10 EN, 10 HI Devanagari, 10 Hinglish) in 10 semantic triples."""
    feeds, breeds, _ = v1_catalogs
    feed_ids = {f["id"] for f in feeds}
    breed_by_id = {b["id"]: b for b in breeds}

    assert len(test_descriptions) == 30

    by_lang: dict[str, list[dict[str, Any]]] = {"en": [], "hi": [], "hinglish": []}
    by_triple: dict[str, dict[str, dict[str, Any]]] = {}

    for item in test_descriptions:
        lang = item["language"]
        assert lang in by_lang
        by_lang[lang].append(item)

        text = item["freeText"]
        assert isinstance(text, str) and 1 <= len(text) <= 1000
        assert unicodedata.normalize("NFC", text) == text, f"{item['id']} is not NFC-normalized"

        if lang == "hi":
            assert any("\u0900" <= ch <= "\u097F" for ch in text), f"{item['id']} must contain Devanagari"
        else:
            assert not any("\u0900" <= ch <= "\u097F" for ch in text), (
                f"{item['id']} ({lang}) must not contain Devanagari"
            )

        exp = item["expected"]
        assert set(exp.keys()) == set(EXTRACTION_FIELDS)
        assert exp["species"] in ("cow", "buffalo")
        if exp["breedId"] is not None:
            assert exp["breedId"] in breed_by_id
            assert breed_by_id[exp["breedId"]]["species"] == exp["species"]
        for fid in exp["matchedFeeds"]:
            assert fid in feed_ids, f"Unknown catalog feedId {fid} in {item['id']}"

        by_triple.setdefault(item["tripleId"], {})[lang] = item

    assert len(by_lang["en"]) == 10
    assert len(by_lang["hi"]) == 10
    assert len(by_lang["hinglish"]) == 10
    assert len(by_triple) == 10

    # Verify each triple has en, hi, hinglish with identical expected ground-truth labels
    for tid, group in by_triple.items():
        assert set(group.keys()) == {"en", "hi", "hinglish"}, f"Incomplete triple {tid}"
        assert group["en"]["expected"] == group["hi"]["expected"] == group["hinglish"]["expected"], (
            f"Ground-truth expected labels differ across languages in triple {tid}"
        )

    # Verify dataset diversity: both species, dry animal (T=0), null/non-null breedId, null/non-null budget, unmatchedFeeds
    species_seen = {d["expected"]["species"] for d in test_descriptions}
    assert species_seen == {"cow", "buffalo"}
    assert any(d["expected"]["milkYieldLitersPerDay"] == 0 for d in test_descriptions)
    assert any(d["expected"]["breedId"] is None for d in test_descriptions)
    assert any(d["expected"]["breedId"] is not None for d in test_descriptions)
    assert any(d["expected"]["budgetInrPerDay"] is None for d in test_descriptions)
    assert any(d["expected"]["budgetInrPerDay"] is not None for d in test_descriptions)
    assert any(len(d["expected"]["unmatchedFeeds"]) > 0 for d in test_descriptions)
    assert any(len(d["expected"]["unmatchedFeeds"]) == 0 for d in test_descriptions)
    # At least one Hindi description uses Devanagari digits
    assert any(
        any("\u0966" <= ch <= "\u096F" for ch in d["freeText"])
        for d in by_lang["hi"]
    )


@pytest.mark.parametrize("desc_index", range(30))
def test_individual_description_extraction(
    desc_index: int,
    evaluation_report: dict[str, Any],
) -> None:
    """Verify every one of the 30 descriptions extracts all 8 fields accurately."""
    rec = evaluation_report["records"][desc_index]
    did = rec["id"]
    comp = rec["comparison"]
    for field in EXTRACTION_FIELDS:
        assert comp["fieldMatches"][field] is True, (
            f"{did} ({rec['language']}) failed on field '{field}': "
            f"extracted={comp['normalizedExtracted'][field]!r}, expected={rec['expected'][field]!r}"
        )
    assert comp["fullMatch"] is True


def test_field_level_and_full_record_accuracy_metrics(evaluation_report: dict[str, Any]) -> None:
    """Verify field-level and full-record accuracy across all 30 descriptions."""
    assert evaluation_report["totalDescriptions"] == 30
    assert evaluation_report["fullRecordCorrect"] == 30
    assert evaluation_report["fullRecordAccuracy"] == pytest.approx(1.0)
    assert evaluation_report["meanMatchedFeedsF1"] == pytest.approx(1.0)

    for lang in ("en", "hi", "hinglish"):
        assert evaluation_report["languageCounts"][lang] == 10
        assert evaluation_report["languageAccuracy"][lang] == pytest.approx(1.0)

    for field in EXTRACTION_FIELDS:
        assert evaluation_report["fieldCorrectCounts"][field] == 30
        assert evaluation_report["fieldAccuracy"][field] == pytest.approx(1.0)


@pytest.mark.parametrize("triple_index", range(10))
def test_cross_language_parity_per_triple(
    triple_index: int,
    evaluation_report: dict[str, Any],
) -> None:
    """Verify English, Hindi (Devanagari), and Hinglish descriptions produce identical outputs (SPEC AC-L1.5)."""
    parity = evaluation_report["crossLanguageParity"]
    assert parity["totalTriples"] == 10
    assert parity["allTriplesParity"] is True
    assert parity["parityAccuracy"] == pytest.approx(1.0)

    triple = parity["triples"][triple_index]
    tid = triple["tripleId"]
    assert triple["languagesPresent"] == ["en", "hi", "hinglish"]
    assert triple["expectedParity"] is True, f"{tid} expected labels do not match"
    assert triple["extractedParity"] is True, f"{tid} extracted outputs differ across EN/HI/Hinglish"
    for field in EXTRACTION_FIELDS:
        assert triple["fieldParity"][field] is True, f"{tid} parity failed on {field}"
    assert triple["parityPassed"] is True


def test_nutrient_and_breed_safety_invariants(
    evaluation_report: dict[str, Any],
    v1_catalogs: tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]],
) -> None:
    """Verify SPEC AC-2.3 and AC-E5.1 nutrient, price, season, and breed-cap safety."""
    safety = evaluation_report["nutrientSafety"]
    assert safety["promptCatalogClean"] is True
    assert safety["promptBreedsClean"] is True
    assert safety["outputsClean"] is True
    assert safety["unmatchedIsolated"] is True
    assert safety["breedSpeciesValid"] is True
    assert safety["adversarialProbePassed"] is True
    assert safety["catalogsUnmutated"] is True
    assert safety["nutrientSafetyPassed"] is True

    catalog, breeds, _ = v1_catalogs
    catalog_before = copy.deepcopy(catalog)
    breeds_before = copy.deepcopy(breeds)

    # Check prompt message payload contains zero nutrient, price, season, or breed-cap fields
    messages = build_extract_messages("450 kg Murrah buffalo, 8 L milk", catalog, breeds)
    assert len(messages) == 2
    user_payload = json.loads(messages[1]["content"])
    for c_item in user_payload["catalog"]:
        assert not (set(c_item.keys()) & FORBIDDEN_FEED_KEYS)
    for b_item in user_payload["breeds"]:
        assert not (set(b_item.keys()) & FORBIDDEN_ANIMAL_KEYS)

    # Check out-of-species breed rejection in both directions (AC-2.3):
    # 1. Cow breed ('sahiwal') on a buffalo -> breedId must become None
    res_buf = sanitize_extract_response(
        {
            "animal": {"species": "buffalo", "bodyWeightKg": 450, "milkYieldLitersPerDay": 8, "milkFatPct": 6.5},
            "breedId": "sahiwal",
            "matchedFeeds": ["wheat_straw"],
            "unmatchedFeeds": [],
        },
        catalog,
        breeds,
    )
    assert res_buf["breedId"] is None

    # 2. Buffalo breed ('murrah') on a cow -> breedId must become None
    res_cow = sanitize_extract_response(
        {
            "animal": {"species": "cow", "bodyWeightKg": 380, "milkYieldLitersPerDay": 10, "milkFatPct": 4.5},
            "breedId": "murrah",
            "matchedFeeds": ["berseem"],
            "unmatchedFeeds": [],
        },
        catalog,
        breeds,
    )
    assert res_cow["breedId"] is None

    # 3. Unknown breed ('ayrshire_elite') -> breedId must become None
    res_unk_breed = sanitize_extract_response(
        {
            "animal": {"species": "cow", "bodyWeightKg": 400, "milkYieldLitersPerDay": 12, "milkFatPct": 4.0},
            "breedId": "ayrshire_elite",
            "matchedFeeds": ["wheat_straw"],
            "unmatchedFeeds": [],
        },
        catalog,
        breeds,
    )
    assert res_unk_breed["breedId"] is None

    # Verify v1 catalogs remain completely untouched
    assert catalog == catalog_before
    assert breeds == breeds_before


def test_boundary_validation_and_live_fallback_chain(
    v1_catalogs: tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]],
) -> None:
    """Verify input validation at boundaries and live OpenRouter fallback chain handling."""
    catalog, breeds, lexicon = v1_catalogs

    # Digit normalization
    assert normalize_digits("४५० किलो ९ लीटर ६.८%") == "450 किलो 9 लीटर 6.8%"

    # Boundary validation on extract_deterministic
    with pytest.raises(ValueError, match="INVALID_REQUEST"):
        extract_deterministic("   ", catalog, breeds, lexicon)

    with pytest.raises(ValueError, match="INVALID_REQUEST"):
        extract_deterministic("a" * 1001, catalog, breeds, lexicon)

    with pytest.raises(ValueError, match="INVALID_REQUEST"):
        extract_deterministic("no animal or weight mentioned here", catalog, breeds, lexicon)

    # Boundary validation on sanitize_extract_response
    with pytest.raises(ValueError, match="species"):
        sanitize_extract_response({"animal": {"species": "goat", "bodyWeightKg": 50}}, catalog, breeds)

    with pytest.raises(ValueError, match="bodyWeightKg"):
        sanitize_extract_response({"animal": {"species": "cow", "bodyWeightKg": -10}}, catalog, breeds)

    # Mocked live OpenRouter fallback chain: primary returns HTTP 429, fallback succeeds
    calls: list[str] = []

    def fake_urlopen(req: Any, timeout: float = 15.0) -> Any:
        body = json.loads(req.data.decode("utf-8"))
        model = body["model"]
        calls.append(model)
        if model == "primary/model:free":
            raise urllib.error.HTTPError(
                req.full_url, 429, "Rate limited", hdrs=None, fp=io.BytesIO(b"{}")
            )
        resp_payload = {
            "choices": [
                {
                    "message": {
                        "content": json.dumps(
                            {
                                "animal": {
                                    "species": "buffalo",
                                    "bodyWeightKg": 450,
                                    "milkYieldLitersPerDay": 8,
                                    "milkFatPct": 6.5,
                                    "cpPctDm": 99.9,
                                },
                                "breedId": "murrah",
                                "budgetInrPerDay": 220,
                                "matchedFeeds": [
                                    {"feedId": "wheat_straw", "priceInrPerKgAsFed": 55},
                                    {"feedId": "magic probiotic mix", "cpPctDm": 50},
                                ],
                                "unmatchedFeeds": [],
                            }
                        )
                    }
                }
            ]
        }
        raw_bytes = json.dumps(resp_payload).encode("utf-8")
        mock_resp = io.BytesIO(raw_bytes)
        mock_resp. __enter__ = lambda s: s  # type: ignore[attr-defined]
        mock_resp.__exit__ = lambda s, *args: None  # type: ignore[attr-defined]
        return mock_resp

    with patch("urllib.request.urlopen", side_effect=fake_urlopen):
        live_res = extract_live_openrouter(
            "450 kg Murrah buffalo giving 8 L milk at 6.5% fat, budget 220, wheat straw and magic probiotic mix",
            catalog,
            breeds,
            api_key="test-key",
            primary_model="primary/model:free",
            fallback_models=["fallback/model:free"],
        )

    assert calls == ["primary/model:free", "fallback/model:free"]
    assert live_res["modelUsed"] == "fallback/model:free"
    assert normalize_extracted_record(live_res) == {
        "species": "buffalo",
        "breedId": "murrah",
        "bodyWeightKg": 450.0,
        "milkYieldLitersPerDay": 8.0,
        "milkFatPct": 6.5,
        "budgetInrPerDay": 220.0,
        "matchedFeeds": ["wheat_straw"],
        "unmatchedFeeds": ["magic probiotic mix"],
    }


def test_evaluator_detects_mismatches_and_all_models_failing(
    v1_catalogs: tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]],
    test_descriptions: list[dict[str, Any]],
) -> None:
    """Verify negative/invalid cases: evaluator flags field mismatches, parity breaks, and exhausted fallback chain."""
    catalog, breeds, _ = v1_catalogs

    # 1. Non-dict input and negative milk/fat values raise ValueError
    with pytest.raises(ValueError, match="expected dict"):
        sanitize_extract_response("not a dict", catalog, breeds)  # type: ignore[arg-type]

    with pytest.raises(ValueError, match="milkYieldLitersPerDay"):
        sanitize_extract_response(
            {"animal": {"species": "cow", "bodyWeightKg": 350, "milkYieldLitersPerDay": -2}},
            catalog,
            breeds,
        )

    with pytest.raises(ValueError, match="milkFatPct"):
        sanitize_extract_response(
            {"animal": {"species": "cow", "bodyWeightKg": 350, "milkYieldLitersPerDay": 5, "milkFatPct": -1}},
            catalog,
            breeds,
        )

    # 2. compare_extraction_with_expected flags mismatched fields and computes partial F1
    sample_expected = test_descriptions[0]["expected"]
    mismatched_extracted = {
        "action": "extract",
        "modelUsed": "test",
        "animal": {
            "species": "buffalo",
            "bodyWeightKg": 450,
            "milkYieldLitersPerDay": 7.0,  # wrong (expected 8)
            "milkFatPct": 6.5,
        },
        "breedId": "nili_ravi",  # wrong (expected murrah)
        "budgetInrPerDay": 220,
        "matchedFeeds": [{"feedId": "wheat_straw", "priceInrPerKgAsFed": None, "maxKgAsFedPerDay": None}],
        "unmatchedFeeds": ["extra unknown mix"],
    }
    comp = compare_extraction_with_expected(mismatched_extracted, sample_expected)
    assert comp["fullMatch"] is False
    assert comp["fieldMatches"]["breedId"] is False
    assert comp["fieldMatches"]["milkYieldLitersPerDay"] is False
    assert comp["fieldMatches"]["matchedFeeds"] is False
    assert comp["fieldMatches"]["unmatchedFeeds"] is False
    assert comp["matchedFeedsPrecision"] == pytest.approx(1.0)
    assert comp["matchedFeedsRecall"] == pytest.approx(1.0 / 3.0)
    assert comp["matchedFeedsF1"] == pytest.approx(0.5)

    # 3. verify_cross_language_parity detects when one language in a triple diverges
    triple_t01 = [d for d in test_descriptions if d["tripleId"] == "T01"]
    good_extracted = {
        "action": "extract",
        "modelUsed": "test",
        "animal": {"species": "buffalo", "bodyWeightKg": 450, "milkYieldLitersPerDay": 8, "milkFatPct": 6.5},
        "breedId": "murrah",
        "budgetInrPerDay": 220,
        "matchedFeeds": [
            {"feedId": "wheat_straw", "priceInrPerKgAsFed": None, "maxKgAsFedPerDay": None},
            {"feedId": "mustard_cake", "priceInrPerKgAsFed": None, "maxKgAsFedPerDay": None},
            {"feedId": "bajra_grain", "priceInrPerKgAsFed": None, "maxKgAsFedPerDay": None},
        ],
        "unmatchedFeeds": [],
    }
    parity_broken = verify_cross_language_parity(
        triple_t01,
        {
            "T01_en": good_extracted,
            "T01_hi": mismatched_extracted,
            "T01_hinglish": good_extracted,
        },
    )
    assert parity_broken["allTriplesParity"] is False
    assert parity_broken["parityPassedCount"] == 0
    assert parity_broken["triples"][0]["fieldParity"]["breedId"] is False

    # 4. Exhausted OpenRouter fallback chain raises RuntimeError
    def always_fail(req: Any, timeout: float = 15.0) -> Any:
        raise urllib.error.HTTPError(req.full_url, 502, "Bad Gateway", hdrs=None, fp=io.BytesIO(b"{}"))

    with patch("urllib.request.urlopen", side_effect=always_fail):
        with pytest.raises(RuntimeError, match="failed"):
            extract_live_openrouter(
                "450 kg Murrah buffalo giving 8 L milk",
                catalog,
                breeds,
                api_key="test-key",
                primary_model="primary/model:free",
                fallback_models=["fallback/model:free"],
            )

