"""Pytest suite verifying agreement between the browser LP solver and SciPy HiGHS."""

from __future__ import annotations

import json
import math
from typing import Any

import pytest

from eval.cross_check_solver import (
    BINDING_ORDER,
    DEFAULT_ANIMALS_PATH,
    DEFAULT_BROWSER_RESULTS_PATH,
    cross_check_all,
    load_v1_data,
    solve_ration_scipy,
    verify_ration_solution_scipy,
)


@pytest.fixture(scope="module")
def v1_data() -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    return load_v1_data()


@pytest.fixture(scope="module")
def test_animals() -> list[dict[str, Any]]:
    assert DEFAULT_ANIMALS_PATH.exists(), f"Missing benchmark suite: {DEFAULT_ANIMALS_PATH}"
    animals = json.loads(DEFAULT_ANIMALS_PATH.read_text(encoding="utf-8"))
    assert isinstance(animals, list) and len(animals) >= 15
    return animals


@pytest.fixture(scope="module")
def browser_dump() -> dict[str, Any]:
    assert DEFAULT_BROWSER_RESULTS_PATH.exists(), (
        f"Missing {DEFAULT_BROWSER_RESULTS_PATH}; run `npx vite-node scripts/dump_solver_results.ts` first."
    )
    return json.loads(DEFAULT_BROWSER_RESULTS_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def cross_check_report() -> dict[str, Any]:
    return cross_check_all()


def test_suite_coverage(test_animals: list[dict[str, Any]], browser_dump: dict[str, Any]) -> None:
    """Verify the benchmark animal suite covers all required species, caps, verdicts, and constraints."""
    assert len(test_animals) >= 15

    outcomes_by_id = {entry["id"]: entry["outcome"] for entry in browser_dump["results"]}

    # 1. Both species (cow and buffalo)
    species_seen = {a["animal"]["species"] for a in test_animals}
    assert species_seen == {"cow", "buffalo"}

    # 2. All four capBasis rules
    cap_basis_seen = {
        out["capBasis"]
        for out in outcomes_by_id.values()
        if out["status"] == "optimal"
    }
    assert cap_basis_seen == {
        "cited_peak",
        "range_top",
        "breed_average_calc",
        "dahd_average",
    }

    # 3. Dry animal (T = 0)
    dry_animals = [a for a in test_animals if a["animal"]["milkYieldLitersPerDay"] == 0]
    assert len(dry_animals) >= 1

    # 4. All verdict kinds across optimal and budget_below_maintenance
    verdict_kinds_seen = {
        out["verdict"]["kind"]
        for out in outcomes_by_id.values()
        if "verdict" in out
    }
    expected_verdict_kinds = {
        "gain",
        "at_breed_level",
        "above_breed_level",
        "below_today",
        "same_as_today",
        "dry_animal",
        "budget_below_maintenance",
    }
    assert expected_verdict_kinds.issubset(verdict_kinds_seen)

    # Specifically verify below_today covers both feasible-at-T and infeasible-at-T cases
    below_today_outcomes = [
        out for out in outcomes_by_id.values()
        if out.get("verdict", {}).get("kind") == "below_today"
    ]
    assert any(out["verdict"].get("keepCostInrPerDay") is not None for out in below_today_outcomes)
    assert any(out["verdict"].get("keepCostInrPerDay") is None for out in below_today_outcomes)

    # Verify budget_below_maintenance covers both fixFeed present and fixFeed absent
    below_maint_outcomes = [
        out for out in outcomes_by_id.values()
        if out["status"] == "budget_below_maintenance"
    ]
    assert any(out["fixFeedId"] is not None for out in below_maint_outcomes)
    assert any(out["fixFeedId"] is None for out in below_maint_outcomes)

    # 5. All 8 binding constraints in BINDING_ORDER
    binding_seen = {
        out["bindingConstraint"]
        for out in outcomes_by_id.values()
        if out["status"] == "optimal"
    }
    assert set(BINDING_ORDER) == binding_seen

    # 6. Nutrient and roughage infeasibility cases
    infeasible_outcomes = [
        out for out in outcomes_by_id.values()
        if out["status"] == "infeasible"
    ]
    assert len(infeasible_outcomes) >= 2
    infeasible_limiting = {
        lim["nutrient"]
        for out in infeasible_outcomes
        for lim in out.get("limitingNutrients", [])
    }
    assert "roughage" in infeasible_limiting
    assert bool(infeasible_limiting & {"CP", "ME", "Ca", "P"})


@pytest.mark.parametrize("animal_index", range(18))
def test_animal_scipy_agreement(
    animal_index: int,
    test_animals: list[dict[str, Any]],
    cross_check_report: dict[str, Any],
) -> None:
    """Assert that browser LP solver and SciPy HiGHS agree within 1e-4 for every benchmark animal."""
    entry = test_animals[animal_index]
    aid = entry["id"]
    comp = next(c for c in cross_check_report["comparisons"] if c["id"] == aid)

    assert comp["status_match"] is True, (
        f"Status mismatch for {aid}: browser={comp['status_browser']}, scipy={comp['status_scipy']}"
    )

    s_out = comp["scipy_outcome"]
    b_rec = comp["browser_record"]
    b_out = b_rec["outcome"]
    expected = entry["expected"]

    assert s_out["status"] == expected["status"]

    if s_out["status"] == "optimal":
        assert comp["diff_M"] <= 1e-4, f"{aid}: M diff {comp['diff_M']} > 1e-4"
        assert comp["diff_Y_star"] <= 1e-4, f"{aid}: Y* diff {comp['diff_Y_star']} > 1e-4"
        assert comp["diff_S"] <= 1e-4, f"{aid}: S diff {comp['diff_S']} > 1e-4"
        assert comp["diff_stage2_cost_at_Y_star"] <= 1e-4, (
            f"{aid}: Stage 2 cost at Y* diff {comp['diff_stage2_cost_at_Y_star']} > 1e-4"
        )
        assert comp["diff_stage2_cost_at_S"] <= 1e-4, (
            f"{aid}: Stage 2 cost at S diff {comp['diff_stage2_cost_at_S']} > 1e-4"
        )
        assert comp["diff_B"] <= 1e-4, f"{aid}: Stage 2' cost at T (B) diff {comp['diff_B']} > 1e-4"
        assert comp["diff_Z"] <= 1e-4, f"{aid}: Saving Z diff {comp['diff_Z']} > 1e-4"

        # Exact costAtCap agreement and null-together check (AC-C3-2.13)
        assert comp["cost_at_cap_null_match"] is True, (
            f"{aid}: costAtCap null mismatch scipy={s_out.get('costAtCapInrPerDay')} vs browser={b_out.get('costAtCapInrPerDay')}"
        )
        if s_out.get("costAtCapInrPerDay") is not None:
            assert comp["diff_cost_at_cap"] <= 1e-4, (
                f"{aid}: costAtCap diff {comp['diff_cost_at_cap']} > 1e-4"
            )

        # Exact stage2 at T feasibility agreement
        assert (s_out["costAtTodayMilkInrPerDay"] is not None) == (
            b_out["costAtTodayMilkInrPerDay"] is not None
        )
        if "stage2AtTFeasible" in expected:
            assert (s_out["costAtTodayMilkInrPerDay"] is not None) is expected["stage2AtTFeasible"]

        # Exact verdict.kind and bindingConstraint agreement
        assert comp["verdict_match"] is True, (
            f"{aid}: verdict mismatch browser={b_out['verdict']['kind']} vs scipy={s_out['verdict']['kind']}"
        )
        assert comp["binding_match"] is True, (
            f"{aid}: bindingConstraint mismatch browser={b_out['bindingConstraint']} vs scipy={s_out['bindingConstraint']}"
        )

        if "capBasis" in expected:
            assert s_out["capBasis"] == expected["capBasis"]
        if "verdictKind" in expected:
            assert s_out["verdict"]["kind"] == expected["verdictKind"]
        if "bindingConstraint" in expected:
            assert s_out["bindingConstraint"] == expected["bindingConstraint"]

    elif s_out["status"] == "budget_below_maintenance":
        assert comp["diff_M"] <= 1e-4, f"{aid}: M diff {comp['diff_M']} > 1e-4"
        assert comp["fix_feed_match"] is True, (
            f"{aid}: fixFeedId mismatch browser={b_out['fixFeedId']} vs scipy={s_out['fixFeedId']}"
        )
        if s_out["maintenanceWithFixInrPerDay"] is not None:
            assert abs(
                float(s_out["maintenanceWithFixInrPerDay"])
                - float(b_out["maintenanceWithFixInrPerDay"])
            ) <= 1e-4
        if "hasFixFeed" in expected:
            assert (s_out["fixFeedId"] is not None) is expected["hasFixFeed"]

    elif s_out["status"] == "infeasible":
        assert comp["limiting_match"] is True, (
            f"{aid}: limitingNutrients mismatch browser={b_out['limitingNutrients']} vs scipy={s_out['limitingNutrients']}"
        )
        assert comp["dm_conflict_match"] is True
        if "limitingNutrientsInclude" in expected:
            actual_lims = {l["nutrient"] for l in s_out["limitingNutrients"]}
            for req_lim in expected["limitingNutrientsInclude"]:
                assert req_lim in actual_lims


def test_overall_max_diff_and_100_percent_constraint_satisfaction(
    test_animals: list[dict[str, Any]],
    browser_dump: dict[str, Any],
    cross_check_report: dict[str, Any],
    v1_data: tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]],
) -> None:
    """Verify overall max abs diff <= 1e-4 and 100% of optimal rations satisfy all constraints within 1e-6."""
    assert cross_check_report["overallMaxAbsDiff"] <= 1e-4

    feeds, breeds, req_data = v1_data
    browser_by_id = {r["id"]: r for r in browser_dump["results"]}

    optimal_count = 0
    for entry in test_animals:
        aid = entry["id"]
        b_rec = browser_by_id[aid]
        b_out = b_rec["outcome"]
        if b_out["status"] != "optimal":
            continue
        optimal_count += 1
        assert b_rec["constraintsVerified"] is True

        # Independently verify browser ration against Python domain constraint equations within 1e-6
        verify_ration_solution_scipy(
            b_out,
            entry["animal"],
            entry["selectedFeeds"],
            feeds,
            req_data,
        )

        # Independently verify SciPy ration against Python domain constraint equations within 1e-6
        s_out = solve_ration_scipy(
            entry["animal"],
            entry["selectedFeeds"],
            feeds,
            breeds,
            req_data,
        )
        verify_ration_solution_scipy(
            s_out,
            entry["animal"],
            entry["selectedFeeds"],
            feeds,
            req_data,
        )

    assert optimal_count == 14
    assert browser_dump["summary"]["constraintSatisfactionPct"] == 100.0


def test_cost_savings_and_zero_unverified_explanation_numbers(browser_dump: dict[str, Any]) -> None:
    """Verify cost savings metrics and that 0 unverified numbers pass verifyExplanationNumbers."""
    summary = browser_dump["summary"]
    assert summary["unverifiedNumbersPassed"] == 0
    assert summary["meanCostSavedPct"] > 0.0
    assert summary["costSavingCasesCount"] >= 8

    for rec in browser_dump["results"]:
        if rec["outcome"]["status"] != "optimal":
            continue
        ver = rec["verification"]
        assert ver is not None
        assert ver["enVerified"] is True, f"EN template verification failed for {rec['id']}"
        assert ver["hiVerified"] is True, f"HI template verification failed for {rec['id']}"
        assert ver["enFlaggedNumbers"] == []
        assert ver["hiFlaggedNumbers"] == []
        assert ver["untracedProbeRejected"] is True, (
            f"Untraced number probe was not rejected for {rec['id']}"
        )
        assert ver["devanagariProbeRejected"] is True, (
            f"Devanagari-in-English probe was not rejected for {rec['id']}"
        )


def test_optimal_invariants_and_unpriced_feed_exclusion(
    test_animals: list[dict[str, Any]],
    browser_dump: dict[str, Any],
    v1_data: tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]],
) -> None:
    """Verify AC-5.1, AC-5.3, AC-5.12, AC-5.13, AC-E2.2, and AC-E7.1 invariants on both solvers."""
    feeds, breeds, req_data = v1_data
    feed_by_id = {f["id"]: f for f in feeds}
    browser_by_id = {r["id"]: r for r in browser_dump["results"]}

    for entry in test_animals:
        aid = entry["id"]
        animal = entry["animal"]
        b_out = browser_by_id[aid]["outcome"]
        s_out = solve_ration_scipy(animal, entry["selectedFeeds"], feeds, breeds, req_data)

        if b_out["status"] == "optimal":
            t_milk = float(animal["milkYieldLitersPerDay"])
            for label, out in (("browser", b_out), ("scipy", s_out)):
                y_star = float(out["supportedMilkExactLPerDay"])
                s_val = float(out["supportedMilkLPerDay"])
                eff_cap = float(out["effectiveCapLPerDay"])
                breed_cap = float(out["milkCapLPerDay"])
                r_min = float(out["roughageMinShare"])
                r_ach = float(out["roughageShareAchieved"])

                assert eff_cap == pytest.approx(max(breed_cap, t_milk), abs=1e-6), f"{aid} ({label})"
                assert 0.0 <= s_val <= y_star + 1e-6 <= eff_cap + 2e-6, f"{aid} ({label})"
                expected_s = 0.0 if t_milk <= 0.0 else math.floor(y_star * 10.0 + 1e-7) / 10.0
                assert s_val == pytest.approx(expected_s, abs=1e-6), f"{aid} ({label})"
                assert r_ach + 1e-6 >= r_min, f"{aid} ({label}): roughage share {r_ach} < {r_min}"
                assert float(out["totalCostInr"]) <= float(animal["budgetInrPerDay"]) + 1e-5

                if t_milk <= 0.0:
                    assert s_val == 0.0
                    assert y_star == 0.0
                    assert out["verdict"]["kind"] == "dry_animal"
                    assert float(out["totalCostInr"]) == pytest.approx(
                        float(out["maintenanceCostInrPerDay"]), abs=1e-6
                    )
                    assert out.get("costAtCapInrPerDay") is None
                else:
                    if out.get("effectiveCapSource") == "today_milk":
                        assert out.get("costAtCapInrPerDay") == pytest.approx(
                            float(out["costAtTodayMilkInrPerDay"]), abs=1e-6
                        )
                    if "budget" in out.get("tightConstraints", []) and out.get("costAtCapInrPerDay") is not None:
                        assert float(out["costAtCapInrPerDay"]) >= float(out["totalCostInr"]) - 1e-5

        elif b_out["status"] == "budget_below_maintenance":
            for label, out in (("browser", b_out), ("scipy", s_out)):
                if out["fixFeedId"] is not None:
                    fix_feed = feed_by_id[out["fixFeedId"]]
                    assert fix_feed["defaultPriceInrPerKgAsFed"] is not None, (
                        f"{aid} ({label}) suggested unpriced feed {out['fixFeedId']} in AC-E7.1"
                    )

        elif b_out["status"] == "infeasible":
            for label, out in (("browser", b_out), ("scipy", s_out)):
                for sug in out.get("suggestedFeeds", []):
                    sug_feed = feed_by_id[sug["feedId"]]
                    if "roughage" in sug.get("nutrients", []):
                        assert sug_feed["defaultPriceInrPerKgAsFed"] is not None, (
                            f"{aid} ({label}) suggested unpriced roughage feed {sug['feedId']} in AC-E2.2"
                        )


def test_invalid_inputs_and_tampered_solution_rejection(
    test_animals: list[dict[str, Any]],
    v1_data: tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]],
) -> None:
    """Verify invalid feed inputs return infeasible and verify_ration_solution_scipy rejects tampered rations."""
    feeds, breeds, req_data = v1_data
    base_entry = test_animals[0]
    animal = base_entry["animal"]

    # 1. Empty selected feeds -> infeasible
    out_empty = solve_ration_scipy(animal, [], feeds, breeds, req_data)
    assert out_empty["status"] == "infeasible"

    # 2. Invalid/unknown feedId, negative price, or non-positive maxKgAsFedPerDay -> filtered out -> infeasible
    invalid_feeds = [
        {"feedId": "non_existent_feed_id", "priceInrPerKgAsFed": 10, "maxKgAsFedPerDay": None},
        {"feedId": "berseem", "priceInrPerKgAsFed": -5, "maxKgAsFedPerDay": None},
        {"feedId": "wheat_straw", "priceInrPerKgAsFed": 6, "maxKgAsFedPerDay": 0},
    ]
    out_invalid = solve_ration_scipy(animal, invalid_feeds, feeds, breeds, req_data)
    assert out_invalid["status"] == "infeasible"

    # 3. Tampered optimal solution must be rejected by verify_ration_solution_scipy
    valid_sol = solve_ration_scipy(animal, base_entry["selectedFeeds"], feeds, breeds, req_data)
    assert valid_sol["status"] == "optimal"

    # Tamper 3a: negative feed kgAsFed
    bad_neg = {
        **valid_sol,
        "feeds": [{**valid_sol["feeds"][0], "kgAsFed": -0.5}, *valid_sol["feeds"][1:]],
    }
    with pytest.raises(ValueError, match="Negative or non-finite"):
        verify_ration_solution_scipy(bad_neg, animal, base_entry["selectedFeeds"], feeds, req_data)

    # Tamper 3b: exceed budget
    bad_budget = {
        **valid_sol,
        "feeds": [{**valid_sol["feeds"][0], "kgAsFed": valid_sol["feeds"][0]["kgAsFed"] + 50.0}],
    }
    with pytest.raises(ValueError, match="exceeds"):
        verify_ration_solution_scipy(bad_budget, animal, base_entry["selectedFeeds"], feeds, req_data)

    # Tamper 3c: zero out feeds so CP requirement fails
    bad_zero = {
        **valid_sol,
        "feeds": [{**valid_sol["feeds"][0], "kgAsFed": 0.01}],
    }
    with pytest.raises(ValueError, match="below requirement"):
        verify_ration_solution_scipy(bad_zero, animal, base_entry["selectedFeeds"], feeds, req_data)

