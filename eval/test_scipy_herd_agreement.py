"""Pytest suite verifying agreement between the browser joint herd LP solver and SciPy HiGHS."""

from __future__ import annotations

import json
import math
from typing import Any

import pytest

from eval.cross_check_herd import (
    DEFAULT_BROWSER_HERD_RESULTS_PATH,
    DEFAULT_HERD_ANIMALS_PATH,
    cross_check_herd_all,
    load_v1_data,
    solve_herd_scipy,
    verify_herd_solution_scipy,
)


@pytest.fixture(scope="module")
def v1_data() -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    return load_v1_data()


@pytest.fixture(scope="module")
def test_herds() -> list[dict[str, Any]]:
    assert DEFAULT_HERD_ANIMALS_PATH.exists(), f"Missing benchmark suite: {DEFAULT_HERD_ANIMALS_PATH}"
    herds = json.loads(DEFAULT_HERD_ANIMALS_PATH.read_text(encoding="utf-8"))
    assert isinstance(herds, list) and len(herds) >= 7
    return herds


@pytest.fixture(scope="module")
def browser_dump() -> dict[str, Any]:
    assert DEFAULT_BROWSER_HERD_RESULTS_PATH.exists(), (
        f"Missing {DEFAULT_BROWSER_HERD_RESULTS_PATH}; run `npx vite-node scripts/dump_solver_results.ts` first."
    )
    return json.loads(DEFAULT_BROWSER_HERD_RESULTS_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def herd_cross_check_report() -> dict[str, Any]:
    return cross_check_herd_all()


def test_herd_suite_coverage(test_herds: list[dict[str, Any]], browser_dump: dict[str, Any]) -> None:
    """Verify that the benchmark herd suite covers all 7 required scenarios (ARCHITECTURE.md line 1884-1891)."""
    assert len(test_herds) >= 7

    # 1. Cow and buffalo in the same herd
    has_cow_buffalo = any(
        len(h["animals"]) >= 2 and {a["species"] for a in h["animals"]} == {"cow", "buffalo"}
        for h in test_herds
    )
    assert has_cow_buffalo, "Suite must contain a herd with both cow and buffalo"

    # 2. Herd with a dry animal
    has_dry = any(any(a.get("milkYieldLitersPerDay", 0) == 0 for a in h["animals"]) for h in test_herds)
    assert has_dry, "Suite must contain a herd with a dry animal"

    # 3. Shared home stock that binds
    has_binding_home = any(
        any(l.get("kind") == "home_stock" for l in r.get("limits", []))
        or any(u.get("tight", False) for u in r.get("homeUse", []))
        for r in browser_dump["results"]
    )
    assert has_binding_home, "Suite must contain a case with binding shared home stock"

    # 4. Below maintenance
    has_below_maint = any(h["expected"]["status"] == "below_maintenance" for h in test_herds)
    assert has_below_maint, "Suite must contain a below-maintenance case"

    # 5. Infeasible, using restricted buyFeedIds
    has_infeasible_restricted = any(
        h["expected"]["status"] == "infeasible" and h.get("buyFeedIds") is not None
        for h in test_herds
    )
    assert has_infeasible_restricted, "Suite must contain an infeasible case using restricted buyFeedIds"

    # 6. t* = 1
    has_t_star_one = any(h["expected"].get("limitKind") == "milk_target" for h in test_herds)
    assert has_t_star_one, "Suite must contain a case where t* = 1 (limitKind='milk_target')"

    # 7. Budget-tight prompt
    has_tight_budget = any(h["expected"].get("limitKind") == "budget" for h in test_herds)
    assert has_tight_budget, "Suite must contain a budget-tight prompt case (limitKind='budget')"


def test_status_agreement_100_percent(
    test_herds: list[dict[str, Any]],
    herd_cross_check_report: dict[str, Any],
) -> None:
    """Assert 100% agreement on solve status across all benchmark herd cases."""
    comparisons = herd_cross_check_report["comparisons"]
    for comp in comparisons:
        assert comp["status_match"] is True, (
            f"Status mismatch for herd {comp['id']}: browser={comp['status_browser']}, scipy={comp['status_scipy']}"
        )


@pytest.mark.parametrize("herd_index", range(7))
def test_scipy_herd_agreement(
    herd_index: int,
    test_herds: list[dict[str, Any]],
    herd_cross_check_report: dict[str, Any],
    v1_data: tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]],
) -> None:
    """Assert agreement within 1e-4 on t*, P(F), M_H, costAtCap_H, Stage 3 home kg, and S_i formula."""
    feeds, breeds, requirements = v1_data
    entry = test_herds[herd_index]
    hid = entry["id"]
    comp = next(c for c in herd_cross_check_report["comparisons"] if c["id"] == hid)

    assert comp["status_match"] is True

    b_rec = comp["browser_record"]
    s_out = comp["scipy_outcome"]

    if b_rec["expected"]["status"] == "optimal":
        # 1. Agreement within 1e-4 on t*
        assert abs(float(b_rec["shareT"]) - float(s_out["shareT"])) <= 1e-4, (
            f"{hid}: shareT mismatch: browser={b_rec['shareT']}, scipy={s_out['shareT']}"
        )

        # 2. Agreement within 1e-4 on P(F)
        assert abs(float(b_rec["purchaseCostInrPerDay"]) - float(s_out["purchaseCostInrPerDay"])) <= 1e-4, (
            f"{hid}: purchaseCost mismatch: browser={b_rec['purchaseCostInrPerDay']}, scipy={s_out['purchaseCostInrPerDay']}"
        )

        # 3. Agreement within 1e-4 on M_H
        assert abs(float(b_rec["maintenanceCostInrPerDay"]) - float(s_out["maintenanceCostInrPerDay"])) <= 1e-4, (
            f"{hid}: M_H mismatch: browser={b_rec['maintenanceCostInrPerDay']}, scipy={s_out['maintenanceCostInrPerDay']}"
        )

        # 4. costAtCap_H (infeasible or null together, or agreement within 1e-4)
        if b_rec["costAtTargetInrPerDay"] is None:
            assert s_out["costAtTargetInrPerDay"] is None, (
                f"{hid}: browser costAtTarget is None but scipy={s_out['costAtTargetInrPerDay']}"
            )
        else:
            assert s_out["costAtTargetInrPerDay"] is not None, (
                f"{hid}: browser costAtTarget={b_rec['costAtTargetInrPerDay']} but scipy is None"
            )
            assert abs(float(b_rec["costAtTargetInrPerDay"]) - float(s_out["costAtTargetInrPerDay"])) <= 1e-4, (
                f"{hid}: costAtTarget mismatch: browser={b_rec['costAtTargetInrPerDay']}, scipy={s_out['costAtTargetInrPerDay']}"
            )

        # 5. Agreement within 1e-4 on Stage 3 total home kg
        if b_rec["totalHomeKg"] is not None:
            assert s_out["totalHomeKg"] is not None
            assert abs(float(b_rec["totalHomeKg"]) - float(s_out["totalHomeKg"])) <= 1e-4, (
                f"{hid}: totalHomeKg mismatch: browser={b_rec['totalHomeKg']}, scipy={s_out['totalHomeKg']}"
            )

        # 6. S_i = floor(10*t*g_i + 1e-7)/10 for every milking animal
        t_star = float(b_rec["shareT"])
        for a in b_rec["animals"]:
            a_key = a["key"]
            today_m = float(a.get("milkYieldLitersPerDay", 0))
            if today_m > 0:
                g_i = float(b_rec["milkTargetLPerDay"][a_key])
                expected_s = math.floor(10.0 * t_star * g_i + 1e-7) / 10.0
                actual_s = float(b_rec["milkLPerDay"][a_key])
                assert abs(actual_s - expected_s) <= 1e-6, (
                    f"{hid} animal {a_key}: S_i={actual_s} != floor(10*t*g_i)/10={expected_s} (t*={t_star}, g_i={g_i})"
                )
            else:
                assert float(b_rec["milkLPerDay"][a_key]) == 0.0

        # 7. Verification of all per-animal and shared constraints within 1e-6
        verify_herd_solution_scipy(
            b_rec,
            feeds,
            breeds,
            requirements,
            scipy_stage2_p_star=s_out["stage2PurchaseInrPerDay"],
        )

    elif b_rec["expected"]["status"] == "below_maintenance":
        assert s_out["status"] == "below_maintenance"
        assert abs(float(b_rec["maintenanceCostInrPerDay"]) - float(s_out["maintenanceCostInrPerDay"])) <= 1e-4

    elif b_rec["expected"]["status"] == "infeasible":
        assert s_out["status"] == "infeasible"
        assert s_out["maintenanceCostInrPerDay"] is None
