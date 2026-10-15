"""Independent Python/SciPy two-stage LP solver cross-check (docs/ARCHITECTURE.md sections 5 & 7).

Rebuilds the exact two-stage linear program (Maintenance at Y=0, Stage 1 max milk Y* <= max(cap, T),
Stage 2 min cost at Y* and at S = floor(10*Y* + 1e-7)/10, Stage 2' at T without budget cap,
homogeneous roughage row rho(x) >= 0, and no 85% DM floor) directly from src/data/*.v1.json using
scipy.optimize.linprog(method='highs') and cross-checks against eval/out/browser_results.json.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import numpy as np
from scipy.optimize import linprog

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "src" / "data"
EVAL_DIR = ROOT_DIR / "eval"
DEFAULT_ANIMALS_PATH = EVAL_DIR / "test_animals.json"
DEFAULT_BROWSER_RESULTS_PATH = EVAL_DIR / "out" / "browser_results.json"

BINDING_ORDER: tuple[str, ...] = (
    "budget",
    "breed_cap",
    "intake",
    "roughage",
    "CP",
    "ME",
    "Ca",
    "P",
)
MIN_NUTRIENTS: tuple[str, ...] = ("CP", "ME", "Ca", "P")
TOL = 1e-6


def rel_tol(rhs: float) -> float:
    return TOL * max(1.0, abs(float(rhs)))


def load_v1_data() -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    feeds = json.loads((DATA_DIR / "feeds.v1.json").read_text(encoding="utf-8"))
    breeds = json.loads((DATA_DIR / "breeds.v1.json").read_text(encoding="utf-8"))
    requirements = json.loads((DATA_DIR / "requirements.v1.json").read_text(encoding="utf-8"))
    return feeds, breeds, requirements


def is_roughage(feed: dict[str, Any]) -> bool:
    return feed["vertical"] in ("indigenous_forage", "crop_residue")


def per_kg_fed(feed: dict[str, Any]) -> dict[str, float]:
    dm = float(feed["dmPct"]) / 100.0
    return {
        "dm": dm,
        "cp": float(feed["cpPctDm"]) * 10.0 * dm,
        "me": float(feed["meMcalPerKgDm"]) * dm,
        "ca": float(feed["caGramsPerKgDm"]) * dm,
        "p": float(feed["pGramsPerKgDm"]) * dm,
    }


def resolve_fat_pct(animal: dict[str, Any]) -> float:
    raw = animal.get("milkFatPct")
    if isinstance(raw, (int, float)) and math.isfinite(raw) and raw > 0:
        return float(raw)
    return 6.0 if animal.get("species") == "buffalo" else 4.0


def build_requirement_model(animal: dict[str, Any], req_data: dict[str, Any]) -> dict[str, Any]:
    dmi = req_data["dmi"]
    maint = req_data["maintenance"]
    lact = req_data["lactation"]
    roughage_min = float(req_data["roughageMinShareOfDm"]["value"])

    bw = max(0.0, float(animal.get("bodyWeightKg", 0.0)))
    f = resolve_fat_pct(animal)
    bw075 = bw ** 0.75
    wol = float(dmi["defaultWeekOfLactation"])
    lag_factor = 1.0 - math.exp(-float(dmi["lagRate"]) * (wol + float(dmi["lagOffset"])))
    fcm_per_litre = float(dmi["fcmMilkCoeff"]) + float(dmi["fcmFatCoeff"]) * (f / 100.0)
    k0 = float(dmi["bw075Coeff"]) * lag_factor * bw075
    k_y = float(dmi["fcmCoeff"]) * lag_factor * fcm_per_litre
    f_above = max(0.0, f - float(lact["caFatBaselinePct"]))

    return {
        "CP": {
            "maintenance": float(maint["cpPerKgBw075"]) * bw075,
            "perLitre": float(lact["cpBaseGramsPerL"]) + float(lact["cpPerFatPctGramsPerL"]) * f,
        },
        "ME": {
            "maintenance": float(maint["meMcalPerKgBw075"]) * bw075,
            "perLitre": float(lact["meBaseMcalPerL"]) + float(lact["mePerFatPctMcalPerL"]) * f,
        },
        "Ca": {
            "maintenance": float(maint["caGramsPerKgBw"]) * bw,
            "perLitre": float(lact["caBaseGramsPerL"]) + float(lact["caPerFatPctAbove35GramsPerL"]) * f_above,
        },
        "P": {
            "maintenance": float(maint["pGramsPerKgBw"]) * bw,
            "perLitre": float(lact["pGramsPerL"]),
        },
        "dmMax": {
            "maintenance": k0,
            "perLitre": k_y,
        },
        "dmi": {
            "weekOfLactation": int(wol),
            "lagFactor": lag_factor,
            "bw075": bw075,
            "fcmPerLitre": fcm_per_litre,
        },
        "roughageMinShare": roughage_min,
        "mineralSupplement": req_data.get("mineralSupplement", {}),
        "calciumMax": req_data.get("calciumMaxRatioOfRequirement", {}),
        "fatPctUsed": f,
    }


def evaluate_requirements_at_milk(req_model: dict[str, Any], milk_yield_l_per_day: float) -> dict[str, float]:
    y = max(0.0, float(milk_yield_l_per_day) if math.isfinite(milk_yield_l_per_day) else 0.0)
    return {
        "dmKgPerDay": req_model["dmMax"]["maintenance"] + req_model["dmMax"]["perLitre"] * y,
        "cpGramsPerDay": req_model["CP"]["maintenance"] + req_model["CP"]["perLitre"] * y,
        "meMcalPerDay": req_model["ME"]["maintenance"] + req_model["ME"]["perLitre"] * y,
        "caGramsPerDay": req_model["Ca"]["maintenance"] + req_model["Ca"]["perLitre"] * y,
        "pGramsPerDay": req_model["P"]["maintenance"] + req_model["P"]["perLitre"] * y,
    }


def round_supported_milk_down(y_star: float) -> float:
    if not math.isfinite(y_star) or y_star <= 0.0:
        return 0.0
    return math.floor(y_star * 10.0 + 1e-7) / 10.0


def build_feed_lines_and_totals(
    inputs: list[dict[str, Any]],
    x_vals: list[float],
) -> dict[str, Any]:
    lines: list[dict[str, Any]] = []
    total_kg_as_fed = 0.0
    total_cost = 0.0
    roughage_dm_kg = 0.0
    supplied = {
        "dmKgPerDay": 0.0,
        "cpGramsPerDay": 0.0,
        "meMcalPerDay": 0.0,
        "caGramsPerDay": 0.0,
        "pGramsPerDay": 0.0,
    }

    for item, raw_kg in zip(inputs, x_vals):
        inp = item["input"]
        feed = item["feed"]
        kg = float(raw_kg) if raw_kg > 1e-9 else 0.0
        c = per_kg_fed(feed)
        dm_kg = kg * c["dm"]
        price = float(inp["priceInrPerKgAsFed"])
        cost_inr = kg * price
        max_cap = inp.get("maxKgAsFedPerDay")
        at_cap = max_cap is not None and kg >= float(max_cap) - rel_tol(float(max_cap))

        if kg > 0.0:
            lines.append(
                {
                    "feedId": feed["id"],
                    "kgAsFed": kg,
                    "dmKg": dm_kg,
                    "costInr": cost_inr,
                    "priceInrPerKg": price,
                    "atCap": at_cap,
                }
            )

        total_kg_as_fed += kg
        total_cost += cost_inr
        supplied["dmKgPerDay"] += dm_kg
        supplied["cpGramsPerDay"] += kg * c["cp"]
        supplied["meMcalPerDay"] += kg * c["me"]
        supplied["caGramsPerDay"] += kg * c["ca"]
        supplied["pGramsPerDay"] += kg * c["p"]
        if is_roughage(feed):
            roughage_dm_kg += dm_kg

    roughage_share = supplied["dmKgPerDay"] > 0.0 and (roughage_dm_kg / supplied["dmKgPerDay"]) or 0.0
    return {
        "lines": lines,
        "totalKgAsFed": total_kg_as_fed,
        "totalCost": total_cost,
        "supplied": supplied,
        "roughageDmKg": roughage_dm_kg,
        "roughageShare": roughage_share,
        "roughageSharePct": roughage_share * 100.0,
    }


def solve_fixed_milk(
    inputs: list[dict[str, Any]],
    req_model: dict[str, Any],
    milk_yield_l_per_day: float,
    budget_cap: float | None = None,
    include_roughage: bool = True,
) -> dict[str, Any] | None:
    """Solve fixed-milk LP (Maintenance at y=0, Stage 2 at y=Y* or S, Stage 2' at y=T) using SciPy HiGHS."""
    if not inputs:
        return None

    req_at_y = evaluate_requirements_at_milk(req_model, milk_yield_l_per_day)
    r = float(req_model["roughageMinShare"])
    k = len(inputs)

    c_obj = np.array([float(item["input"]["priceInrPerKgAsFed"]) for item in inputs], dtype=float)
    bounds = []
    for item in inputs:
        max_cap = (
            float(item["input"]["maxKgAsFedPerDay"])
            if item["input"].get("maxKgAsFedPerDay") is not None
            else None
        )
        min_cap = 0.0
        feed_id = item["feed"]["id"]
        if feed_id == "mineral_mix":
            mm_cfg = req_model.get("mineralSupplement", {}).get("mineralMixMinKgPerDay", {})
            min_mm = float(mm_cfg.get("lactating" if milk_yield_l_per_day > 0 else "dry", 0.10 if milk_yield_l_per_day > 0 else 0.05))
            min_cap = min(min_mm, max_cap) if max_cap is not None else min_mm
        elif feed_id == "common_salt":
            salt_cfg = req_model.get("mineralSupplement", {}).get("saltMinKgPerDay", {})
            min_salt = float(salt_cfg.get("lactating" if milk_yield_l_per_day > 0 else "dry", 0.05 if milk_yield_l_per_day > 0 else 0.03))
            min_cap = min(min_salt, max_cap) if max_cap is not None else min_salt
        bounds.append((min_cap, max_cap))

    rows: list[list[float]] = []
    rhs: list[float] = []

    # 1. DM ceiling: sum_i d_i x_i <= DM_max(y)  (NO 85% DM floor per ARCHITECTURE.md section 5)
    rows.append([per_kg_fed(item["feed"])["dm"] for item in inputs])
    rhs.append(req_at_y["dmKgPerDay"])

    # 2. Nutrient minimums: -sum_i a_{n,i} x_i <= -req_n(y)
    req_field_map = {
        "CP": ("cp", "cpGramsPerDay"),
        "ME": ("me", "meMcalPerDay"),
        "Ca": ("ca", "caGramsPerDay"),
        "P": ("p", "pGramsPerDay"),
    }
    for n in MIN_NUTRIENTS:
        c_key, r_key = req_field_map[n]
        rows.append([-per_kg_fed(item["feed"])[c_key] for item in inputs])
        rhs.append(-req_at_y[r_key])

    # 2b. Ca upper bound (2.5x requirement or 1.5% DM maximum tolerable level)
    ca_ratio = float(req_model.get("calciumMax", {}).get("value", 2.5))
    ca_dm_max = float(req_model.get("calciumMax", {}).get("maxGramsPerKgDm", 15.0))
    rows.append([per_kg_fed(item["feed"])["ca"] for item in inputs])
    rhs.append(max(req_at_y["caGramsPerDay"] * ca_ratio, req_at_y["dmKgPerDay"] * ca_dm_max))

    # 3. Homogeneous roughage row: -sum_i rho_i x_i <= 0
    if include_roughage:
        rho_row: list[float] = []
        for item in inputs:
            dm_i = per_kg_fed(item["feed"])["dm"]
            coeff = (1.0 - r) * dm_i if is_roughage(item["feed"]) else -r * dm_i
            rho_row.append(-coeff)
        rows.append(rho_row)
        rhs.append(0.0)

    # 4. Optional budget cap: sum_i p_i x_i <= budget_cap
    if budget_cap is not None:
        rows.append([float(item["input"]["priceInrPerKgAsFed"]) for item in inputs])
        rhs.append(float(budget_cap))

    res = linprog(
        c=c_obj,
        A_ub=np.array(rows, dtype=float),
        b_ub=np.array(rhs, dtype=float),
        bounds=bounds,
        method="highs",
    )
    if not res.success or res.x is None:
        return None

    built = build_feed_lines_and_totals(inputs, [max(0.0, float(v)) for v in res.x[:k]])

    # Double-precision verification within 1e-6
    if built["supplied"]["dmKgPerDay"] > req_at_y["dmKgPerDay"] + rel_tol(req_at_y["dmKgPerDay"]):
        return None
    for _, r_key in req_field_map.values():
        if built["supplied"][r_key] + rel_tol(req_at_y[r_key]) < req_at_y[r_key]:
            return None
    if include_roughage:
        rho_val = built["roughageDmKg"] - r * built["supplied"]["dmKgPerDay"]
        if rho_val < -rel_tol(built["supplied"]["dmKgPerDay"]):
            return None
    if budget_cap is not None and built["totalCost"] > budget_cap + rel_tol(budget_cap):
        return None

    return built


def max_single_nutrient_supply(
    inputs: list[dict[str, Any]],
    dm_max: float,
    nutrient: str,
) -> float:
    if not inputs:
        return 0.0
    field_map = {"CP": "cp", "ME": "me", "Ca": "ca", "P": "p"}
    f_key = field_map[nutrient]

    c_obj = np.array([-per_kg_fed(item["feed"])[f_key] for item in inputs], dtype=float)
    A_ub = np.array([[per_kg_fed(item["feed"])["dm"] for item in inputs]], dtype=float)
    b_ub = np.array([dm_max], dtype=float)
    bounds = [
        (
            0.0,
            float(item["input"]["maxKgAsFedPerDay"])
            if item["input"].get("maxKgAsFedPerDay") is not None
            else None,
        )
        for item in inputs
    ]
    res = linprog(c=c_obj, A_ub=A_ub, b_ub=b_ub, bounds=bounds, method="highs")
    if not res.success or res.x is None:
        return 0.0
    return float(
        sum(max(0.0, float(x_i)) * per_kg_fed(item["feed"])[f_key] for item, x_i in zip(inputs, res.x))
    )


def compute_max_roughage_share_pct(
    inputs: list[dict[str, Any]],
    req_model: dict[str, Any],
    milk_yield_l_per_day: float,
) -> float:
    roughage_inputs = [item for item in inputs if is_roughage(item["feed"])]
    if not roughage_inputs:
        return 0.0

    req_at_y = evaluate_requirements_at_milk(req_model, milk_yield_l_per_day)
    r = float(req_model["roughageMinShare"])

    c_obj: list[float] = []
    for item in inputs:
        dm_i = per_kg_fed(item["feed"])["dm"]
        rho_i = (1.0 - r) * dm_i if is_roughage(item["feed"]) else -r * dm_i
        c_obj.append(-rho_i)

    rows = [
        [per_kg_fed(item["feed"])["dm"] for item in inputs],
        [-per_kg_fed(item["feed"])["cp"] for item in inputs],
        [-per_kg_fed(item["feed"])["me"] for item in inputs],
        [-per_kg_fed(item["feed"])["ca"] for item in inputs],
        [-per_kg_fed(item["feed"])["p"] for item in inputs],
    ]
    rhs = [
        req_at_y["dmKgPerDay"],
        -req_at_y["cpGramsPerDay"],
        -req_at_y["meMcalPerDay"],
        -req_at_y["caGramsPerDay"],
        -req_at_y["pGramsPerDay"],
    ]
    bounds = [
        (
            0.0,
            float(item["input"]["maxKgAsFedPerDay"])
            if item["input"].get("maxKgAsFedPerDay") is not None
            else None,
        )
        for item in inputs
    ]
    res = linprog(
        c=np.array(c_obj, dtype=float),
        A_ub=np.array(rows, dtype=float),
        b_ub=np.array(rhs, dtype=float),
        bounds=bounds,
        method="highs",
    )
    if res.success and res.x is not None:
        built = build_feed_lines_and_totals(inputs, [max(0.0, float(v)) for v in res.x])
        if built["supplied"]["dmKgPerDay"] > 0.0:
            return min(r * 100.0 - 0.1, float(built["roughageSharePct"]))

    max_roughage_dm = 0.0
    for item in roughage_inputs:
        feed = item["feed"]
        dm_frac = float(feed["dmPct"]) / 100.0
        cap_kg = (
            float(item["input"]["maxKgAsFedPerDay"])
            if item["input"].get("maxKgAsFedPerDay") is not None
            else req_at_y["dmKgPerDay"] / dm_frac
        )
        max_roughage_dm += cap_kg * dm_frac
    clamped_roughage_dm = min(req_at_y["dmKgPerDay"], max_roughage_dm)
    max_me_density = max([float(item["feed"]["meMcalPerKgDm"]) for item in inputs] + [1.5])
    min_dm_needed = min(req_at_y["dmKgPerDay"], max(req_at_y["meMcalPerDay"] / max_me_density, 1.0))
    return min(100.0, (clamped_roughage_dm / min_dm_needed) * 100.0)


def diagnose_at_milk(
    inputs: list[dict[str, Any]],
    req_model: dict[str, Any],
    milk_yield_l_per_day: float,
    feed_library: list[dict[str, Any]],
) -> dict[str, Any]:
    req_at_y = evaluate_requirements_at_milk(req_model, milk_yield_l_per_day)
    r = float(req_model["roughageMinShare"])
    limiting_nutrients: list[dict[str, Any]] = []

    req_field_map = {
        "CP": "cpGramsPerDay",
        "ME": "meMcalPerDay",
        "Ca": "caGramsPerDay",
        "P": "pGramsPerDay",
    }
    for n in MIN_NUTRIENTS:
        required = req_at_y[req_field_map[n]]
        max_supply = max_single_nutrient_supply(inputs, req_at_y["dmKgPerDay"], n)
        if max_supply + rel_tol(required) < required:
            limiting_nutrients.append(
                {
                    "nutrient": n,
                    "required": required,
                    "maxSupply": max_supply,
                }
            )

    roughage_inputs = [item for item in inputs if is_roughage(item["feed"])]
    feasible_without_roughage = (
        solve_fixed_milk(inputs, req_model, milk_yield_l_per_day, None, include_roughage=False) is not None
        if roughage_inputs
        else False
    )

    if not roughage_inputs or feasible_without_roughage:
        max_supply = compute_max_roughage_share_pct(inputs, req_model, milk_yield_l_per_day)
        limiting_nutrients.append(
            {
                "nutrient": "roughage",
                "required": r * 100.0,
                "maxSupply": max_supply,
            }
        )
    else:
        max_share_pct = compute_max_roughage_share_pct(inputs, req_model, milk_yield_l_per_day)
        if max_share_pct + TOL < r * 100.0:
            limiting_nutrients.append(
                {
                    "nutrient": "roughage",
                    "required": r * 100.0,
                    "maxSupply": max_share_pct,
                }
            )

    dm_conflict = len(limiting_nutrients) == 0

    selected_ids = {item["feed"]["id"] for item in inputs}
    unselected = [f for f in feed_library if f["id"] not in selected_ids]
    unselected_priced = [f for f in unselected if f.get("defaultPriceInrPerKgAsFed") is not None]
    pool_for_nutrients = unselected_priced if unselected_priced else unselected

    density_field = {
        "CP": "cpPctDm",
        "ME": "meMcalPerKgDm",
        "Ca": "caGramsPerKgDm",
        "P": "pGramsPerKgDm",
        "DM": "dmPct",
    }

    suggestion_map: dict[str, list[str]] = {}

    def add_suggestion(feed_id: str, key: str) -> None:
        prev = suggestion_map.setdefault(feed_id, [])
        if key not in prev:
            prev.append(key)

    if dm_conflict:
        if pool_for_nutrients:
            best_me = max(pool_for_nutrients, key=lambda f: float(f["meMcalPerKgDm"]))
            best_cp = max(pool_for_nutrients, key=lambda f: float(f["cpPctDm"]))
            add_suggestion(best_me["id"], "ME")
            add_suggestion(best_cp["id"], "CP")
    else:
        for lim in limiting_nutrients:
            nut = lim["nutrient"]
            if nut == "roughage":
                priced_roughage = [
                    f for f in unselected if is_roughage(f) and f.get("defaultPriceInrPerKgAsFed") is not None
                ]
                if priced_roughage:
                    best_rough = min(
                        priced_roughage,
                        key=lambda f: float(f["defaultPriceInrPerKgAsFed"]) / (float(f["dmPct"]) / 100.0),
                    )
                    add_suggestion(best_rough["id"], "roughage")
            else:
                if pool_for_nutrients:
                    f_col = density_field[nut]
                    best = max(pool_for_nutrients, key=lambda f: float(f[f_col]))
                    add_suggestion(best["id"], nut)

    suggested_feeds = [{"feedId": fid, "nutrients": nuts} for fid, nuts in suggestion_map.items()]
    return {
        "limitingNutrients": limiting_nutrients,
        "dmConflict": dm_conflict,
        "suggestedFeeds": suggested_feeds,
    }


def is_nutrient_bottleneck_at_y_star(
    inputs: list[dict[str, Any]],
    req_model: dict[str, Any],
    y_star: float,
    target_nutrient: str,
    enforce_dm_and_roughage: bool,
) -> bool:
    req_at_y = evaluate_requirements_at_milk(req_model, y_star)
    r = float(req_model["roughageMinShare"])
    field_map = {"CP": "cp", "ME": "me", "Ca": "ca", "P": "p"}
    req_field_map = {
        "CP": "cpGramsPerDay",
        "ME": "meMcalPerDay",
        "Ca": "caGramsPerDay",
        "P": "pGramsPerDay",
    }
    target_field = field_map[target_nutrient]
    req_val = req_at_y[req_field_map[target_nutrient]]

    if not enforce_dm_and_roughage:
        has_uncapped = any(
            item["input"].get("maxKgAsFedPerDay") is None
            and per_kg_fed(item["feed"])[target_field] > 1e-9
            for item in inputs
        )
        if has_uncapped:
            return False

    c_obj = np.array([-per_kg_fed(item["feed"])[target_field] for item in inputs], dtype=float)
    rows: list[list[float]] = []
    rhs: list[float] = []

    for n in MIN_NUTRIENTS:
        if n != target_nutrient:
            rows.append([-per_kg_fed(item["feed"])[field_map[n]] for item in inputs])
            rhs.append(-req_at_y[req_field_map[n]])

    if enforce_dm_and_roughage:
        rows.append([per_kg_fed(item["feed"])["dm"] for item in inputs])
        rhs.append(req_at_y["dmKgPerDay"])
        rho_row: list[float] = []
        for item in inputs:
            dm_i = per_kg_fed(item["feed"])["dm"]
            coeff = (1.0 - r) * dm_i if is_roughage(item["feed"]) else -r * dm_i
            rho_row.append(-coeff)
        rows.append(rho_row)
        rhs.append(0.0)

    bounds = [
        (
            0.0,
            float(item["input"]["maxKgAsFedPerDay"])
            if item["input"].get("maxKgAsFedPerDay") is not None
            else None,
        )
        for item in inputs
    ]

    res = linprog(
        c=c_obj,
        A_ub=np.array(rows, dtype=float) if rows else None,
        b_ub=np.array(rhs, dtype=float) if rhs else None,
        bounds=bounds,
        method="highs",
    )
    if not res.success or res.x is None:
        return False

    max_target = sum(
        max(0.0, float(x_i)) * per_kg_fed(item["feed"])[target_field]
        for item, x_i in zip(inputs, res.x)
    )
    return max_target <= req_val + rel_tol(req_val)


def detect_tight_constraints_at_y_star(
    inputs: list[dict[str, Any]],
    req_model: dict[str, Any],
    y_star: float,
    effective_cap: float,
    budget: float,
    stage2_at_y_star: dict[str, Any],
) -> list[str]:
    req_at_y_star = evaluate_requirements_at_milk(req_model, y_star)
    r = float(req_model["roughageMinShare"])
    tight_set: set[str] = set()

    budget_tight = stage2_at_y_star["totalCost"] >= budget - rel_tol(budget)
    if budget_tight:
        tight_set.add("budget")

    breed_cap_tight = y_star >= effective_cap - rel_tol(effective_cap)
    if breed_cap_tight:
        tight_set.add("breed_cap")

    intake_tight = stage2_at_y_star["supplied"]["dmKgPerDay"] >= req_at_y_star["dmKgPerDay"] - rel_tol(
        req_at_y_star["dmKgPerDay"]
    )
    if intake_tight:
        tight_set.add("intake")

    rho = stage2_at_y_star["roughageDmKg"] - r * stage2_at_y_star["supplied"]["dmKgPerDay"]
    roughage_tight = stage2_at_y_star["supplied"]["dmKgPerDay"] > TOL and abs(rho) <= rel_tol(
        stage2_at_y_star["supplied"]["dmKgPerDay"]
    )
    if roughage_tight:
        tight_set.add("roughage")

    top_level_tight = budget_tight or breed_cap_tight or intake_tight or roughage_tight
    enforce_dm_and_roughage = not intake_tight and not roughage_tight

    req_field_map = {
        "CP": "cpGramsPerDay",
        "ME": "meMcalPerDay",
        "Ca": "caGramsPerDay",
        "P": "pGramsPerDay",
    }
    for n in MIN_NUTRIENTS:
        req_val = req_at_y_star[req_field_map[n]]
        sup_val = stage2_at_y_star["supplied"][req_field_map[n]]
        if sup_val <= req_val + rel_tol(req_val):
            if is_nutrient_bottleneck_at_y_star(inputs, req_model, y_star, n, enforce_dm_and_roughage):
                tight_set.add(n)

    if not tight_set and not top_level_tight:
        for n in MIN_NUTRIENTS:
            req_val = req_at_y_star[req_field_map[n]]
            sup_val = stage2_at_y_star["supplied"][req_field_map[n]]
            if sup_val <= req_val + rel_tol(req_val):
                tight_set.add(n)
    if not tight_set:
        tight_set.add("budget")

    return [c for c in BINDING_ORDER if c in tight_set]


def select_verdict(
    today_milk: float,
    breed_cap: float,
    y_star: float,
    supported_milk: float,
    reference_cost: float,
    cost_at_today_milk: float | None,
    limiting_at_today: list[str],
) -> dict[str, Any]:
    if today_milk <= 0.0:
        return {"kind": "dry_animal"}

    if y_star < today_milk - 1e-6:
        limits = list(limiting_at_today) if cost_at_today_milk is None else []
        return {
            "kind": "below_today",
            "todayMilkLPerDay": today_milk,
            "keepCostInrPerDay": cost_at_today_milk,
            "costToKeepTodayInrPerDay": cost_at_today_milk,
            "limitingNutrients": limits,
            "limitingAtToday": limits,
        }

    saving_inr = (
        reference_cost - cost_at_today_milk
        if cost_at_today_milk is not None and (reference_cost - cost_at_today_milk) > 1e-6
        else None
    )

    if today_milk > breed_cap + 1e-6:
        return {"kind": "above_breed_level", "savingInrPerDay": saving_inr}

    if abs(today_milk - breed_cap) <= 1e-6:
        return {"kind": "at_breed_level", "savingInrPerDay": saving_inr}

    gain = math.floor((supported_milk - today_milk) * 10.0 + 1e-7) / 10.0
    if gain >= 0.1 - 1e-9:
        return {"kind": "gain", "gainLPerDay": round(gain, 1)}

    return {"kind": "same_as_today"}


def verify_ration_solution_scipy(
    solution: dict[str, Any],
    animal: dict[str, Any],
    selected_feeds: list[dict[str, Any]],
    feed_library: list[dict[str, Any]],
    req_data: dict[str, Any],
) -> None:
    """Double-precision constraint verification within 1e-6 (ARCHITECTURE.md section 5 'Numerical guard')."""
    req_model = build_requirement_model(animal, req_data)
    milk_level = 0.0 if float(animal["milkYieldLitersPerDay"]) <= 0.0 else float(solution["supportedMilkLPerDay"])
    req_at_milk = evaluate_requirements_at_milk(req_model, milk_level)
    r = float(req_model["roughageMinShare"])

    feed_map = {f["id"]: f for f in feed_library}
    input_map = {s["feedId"]: s for s in selected_feeds}

    total_cost = 0.0
    total_dm = 0.0
    roughage_dm = 0.0
    total_cp = 0.0
    total_me = 0.0
    total_ca = 0.0
    total_p = 0.0

    for line in solution["feeds"]:
        kg = float(line["kgAsFed"])
        if not math.isfinite(kg) or kg < -TOL:
            raise ValueError(f"Negative or non-finite feed amount for {line['feedId']}: {kg}")
        feed = feed_map[line["feedId"]]
        sel = input_map.get(line["feedId"])
        if sel and sel.get("maxKgAsFedPerDay") is not None:
            cap = float(sel["maxKgAsFedPerDay"])
            if kg > cap + rel_tol(cap):
                raise ValueError(f"Feed {line['feedId']} amount {kg} exceeds cap {cap}")
        c = per_kg_fed(feed)
        price = float(sel["priceInrPerKgAsFed"]) if sel else float(line["priceInrPerKg"])
        total_cost += kg * price
        total_dm += kg * c["dm"]
        if is_roughage(feed):
            roughage_dm += kg * c["dm"]
        total_cp += kg * c["cp"]
        total_me += kg * c["me"]
        total_ca += kg * c["ca"]
        total_p += kg * c["p"]

    budget = float(animal["budgetInrPerDay"])
    if total_cost > budget + rel_tol(budget):
        raise ValueError(f"Ration cost {total_cost} exceeds budget {budget}")
    if total_dm > req_at_milk["dmKgPerDay"] + rel_tol(req_at_milk["dmKgPerDay"]):
        raise ValueError(f"Supplied DM {total_dm} exceeds ceiling {req_at_milk['dmKgPerDay']}")
    if total_cp + rel_tol(req_at_milk["cpGramsPerDay"]) < req_at_milk["cpGramsPerDay"]:
        raise ValueError(f"Supplied CP {total_cp} below requirement {req_at_milk['cpGramsPerDay']}")
    if total_me + rel_tol(req_at_milk["meMcalPerDay"]) < req_at_milk["meMcalPerDay"]:
        raise ValueError(f"Supplied ME {total_me} below requirement {req_at_milk['meMcalPerDay']}")
    if total_ca + rel_tol(req_at_milk["caGramsPerDay"]) < req_at_milk["caGramsPerDay"]:
        raise ValueError(f"Supplied Ca {total_ca} below requirement {req_at_milk['caGramsPerDay']}")
    ca_ratio = float(req_model.get("calciumMax", {}).get("value", 2.5))
    ca_dm_max = float(req_model.get("calciumMax", {}).get("maxGramsPerKgDm", 15.0))
    max_ca = max(req_at_milk["caGramsPerDay"] * ca_ratio, req_at_milk["dmKgPerDay"] * ca_dm_max)
    if total_ca > max_ca + rel_tol(max_ca):
        raise ValueError(f"Supplied Ca {total_ca} exceeds maximum tolerable ceiling {max_ca}")
    if total_p + rel_tol(req_at_milk["pGramsPerDay"]) < req_at_milk["pGramsPerDay"]:
        raise ValueError(f"Supplied P {total_p} below requirement {req_at_milk['pGramsPerDay']}")
    if roughage_dm + rel_tol(total_dm) < r * total_dm:
        raise ValueError(f"Roughage DM {roughage_dm} below minimum share {r} * {total_dm}")


def solve_ration_scipy(
    animal: dict[str, Any],
    selected_feeds: list[dict[str, Any]],
    feed_library: list[dict[str, Any]],
    breed_library: list[dict[str, Any]],
    req_data: dict[str, Any],
) -> dict[str, Any]:
    """Full 7-step two-stage LP solver in Python using scipy.optimize.linprog(method='highs')."""
    breed = next(
        (b for b in breed_library if b["id"] == animal["breedId"]),
        next(b for b in breed_library if b["species"] == animal["species"]),
    )
    feed_map = {f["id"]: f for f in feed_library}
    inputs: list[dict[str, Any]] = []
    for s in selected_feeds:
        feed = feed_map.get(s["feedId"])
        if not feed:
            continue
        price = s.get("priceInrPerKgAsFed")
        if price is None or not math.isfinite(float(price)) or float(price) < 0.0:
            continue
        max_cap = s.get("maxKgAsFedPerDay")
        if max_cap is not None and float(max_cap) <= 0.0:
            continue
        inputs.append({"input": s, "feed": feed})

    entered_current = [
        s for s in selected_feeds if s.get("currentKgAsFedPerDay") is not None and float(s["currentKgAsFedPerDay"]) > 0.0
    ]
    current_cost_inr = (
        sum(float(s["currentKgAsFedPerDay"]) * float(s["priceInrPerKgAsFed"]) for s in entered_current)
        if entered_current
        else None
    )

    budget = float(animal["budgetInrPerDay"])
    reference_cost = current_cost_inr if current_cost_inr is not None else budget
    req_model = build_requirement_model(animal, req_data)
    r = float(req_model["roughageMinShare"])

    # Step 1: Maintenance LP at Y = 0 (no budget limit).
    maint = solve_fixed_milk(inputs, req_model, 0.0, None)
    if maint is None:
        diag = diagnose_at_milk(inputs, req_model, 0.0, feed_library)
        return {
            "status": "infeasible",
            "limitingNutrients": diag["limitingNutrients"],
            "dmConflict": diag["dmConflict"],
            "suggestedFeeds": diag["suggestedFeeds"],
        }

    maintenance_cost = float(maint["totalCost"])

    # Step 2: Budget below maintenance check (AC-E7.1).
    if budget < maintenance_cost - TOL:
        selected_ids = {item["feed"]["id"] for item in inputs}
        fix_feed_id: str | None = None
        maint_with_fix: float | None = None
        for cand in feed_library:
            if cand["id"] in selected_ids:
                continue
            if cand.get("defaultPriceInrPerKgAsFed") is None:
                continue
            trial_inputs = inputs + [
                {
                    "input": {
                        "feedId": cand["id"],
                        "priceInrPerKgAsFed": float(cand["defaultPriceInrPerKgAsFed"]),
                        "maxKgAsFedPerDay": None,
                        "currentKgAsFedPerDay": None,
                    },
                    "feed": cand,
                }
            ]
            trial = solve_fixed_milk(trial_inputs, req_model, 0.0, None)
            if trial is not None and trial["totalCost"] <= budget + TOL:
                if maint_with_fix is None or trial["totalCost"] < maint_with_fix - TOL:
                    fix_feed_id = cand["id"]
                    maint_with_fix = float(trial["totalCost"])

        fix_feed = (
            {"feedId": fix_feed_id, "maintenanceCostInrPerDay": maint_with_fix}
            if fix_feed_id is not None and maint_with_fix is not None
            else None
        )
        return {
            "status": "budget_below_maintenance",
            "verdict": {
                "kind": "budget_below_maintenance",
                "maintenanceCostInrPerDay": maintenance_cost,
                "budgetInrPerDay": budget,
            },
            "budgetInrPerDay": budget,
            "fixFeedId": fix_feed_id,
            "maintenanceWithFixInrPerDay": maint_with_fix,
            "fixFeed": fix_feed,
        }

    today_milk = max(0.0, float(animal.get("milkYieldLitersPerDay", 0.0)))
    breed_cap = float(breed["milkCapLPerDay"])

    # Step 3: Dry animal short-circuit (T = 0; AC-5.13).
    if today_milk <= 0.0:
        req_at_0 = evaluate_requirements_at_milk(req_model, 0.0)
        savings_inr = (current_cost_inr - maint["totalCost"]) if current_cost_inr is not None else None
        savings_pct = (
            (savings_inr / current_cost_inr) * 100.0
            if savings_inr is not None and current_cost_inr and current_cost_inr > 0.0
            else None
        )
        dry_sol = {
            "status": "optimal",
            "breedId": breed["id"],
            "supportedMilkLPerDay": 0.0,
            "supportedMilkExactLPerDay": 0.0,
            "milkCapLPerDay": breed_cap,
            "capBasis": breed["capBasis"],
            "effectiveCapLPerDay": breed_cap,
            "effectiveCapSource": "breed",
            "bindingConstraint": "breed_cap",
            "tightConstraints": [],
            "feedLimitIds": [l["feedId"] for l in maint["lines"] if l["atCap"]],
            "verdict": {"kind": "dry_animal"},
            "costAtTodayMilkInrPerDay": maintenance_cost,
            "costAtCapInrPerDay": None,
            "maintenanceCostInrPerDay": maintenance_cost,
            "stage2CostAtYStarInrPerDay": maintenance_cost,
            "stage2CostAtSInrPerDay": maint["totalCost"],
            "budgetInrPerDay": budget,
            "referenceCostInrPerDay": reference_cost,
            "underBudgetInr": max(0.0, budget - maint["totalCost"]),
            "feeds": maint["lines"],
            "totalKgAsFed": maint["totalKgAsFed"],
            "totalCostInr": maint["totalCost"],
            "requirementsAtS": req_at_0,
            "supplied": maint["supplied"],
            "roughageMinShare": r,
            "roughageShareAchieved": maint["roughageShare"],
            "roughageSharePct": maint["roughageSharePct"],
            "roughageMinSharePct": r * 100.0,
            "currentCostInr": current_cost_inr,
            "savingsInr": savings_inr,
            "savingsPct": savings_pct,
        }
        verify_ration_solution_scipy(dry_sol, animal, selected_feeds, feed_library, req_data)
        return dry_sol

    # Step 4: Stage 1 — Maximize milk Y <= effectiveCap = max(breedCap, T).
    effective_cap = max(breed_cap, today_milk)
    effective_cap_source = "today_milk" if today_milk > breed_cap + TOL else "breed"

    k = len(inputs)
    # Variables: [x_0, ..., x_{k-1}, Y]
    c_stage1 = np.zeros(k + 1, dtype=float)
    c_stage1[k] = -1.0  # Maximize Y <=> Minimize -Y

    s1_rows: list[list[float]] = []
    s1_rhs: list[float] = []

    # Nutrient rows: -sum_i a_{n,i} x_i + l_n Y <= -m_n
    field_map = {"CP": "cp", "ME": "me", "Ca": "ca", "P": "p"}
    for n in MIN_NUTRIENTS:
        f_key = field_map[n]
        row = [-per_kg_fed(item["feed"])[f_key] for item in inputs] + [float(req_model[n]["perLitre"])]
        s1_rows.append(row)
        s1_rhs.append(-float(req_model[n]["maintenance"]))

    # Ca upper bound (1.5% DM maximum tolerable level): sum_i a_{Ca,i} x_i - l_DM Y <= m_DM
    ca_dm_max = float(req_model.get("calciumMax", {}).get("maxGramsPerKgDm", 15.0))
    s1_rows.append(
        [per_kg_fed(item["feed"])["ca"] for item in inputs]
        + [-ca_dm_max * float(req_model["dmMax"]["perLitre"])]
    )
    s1_rhs.append(ca_dm_max * float(req_model["dmMax"]["maintenance"]))

    # Intake ceiling: sum_i d_i x_i - k_Y Y <= k_0
    s1_rows.append([per_kg_fed(item["feed"])["dm"] for item in inputs] + [-float(req_model["dmMax"]["perLitre"])])
    s1_rhs.append(float(req_model["dmMax"]["maintenance"]))

    # Roughage minimum: -sum_i rho_i x_i + 0 * Y <= 0
    rho_row = []
    for item in inputs:
        dm_i = per_kg_fed(item["feed"])["dm"]
        coeff = (1.0 - r) * dm_i if is_roughage(item["feed"]) else -r * dm_i
        rho_row.append(-coeff)
    rho_row.append(0.0)
    s1_rows.append(rho_row)
    s1_rhs.append(0.0)

    # Budget: sum_i p_i x_i + 0 * Y <= budget
    s1_rows.append([float(item["input"]["priceInrPerKgAsFed"]) for item in inputs] + [0.0])
    s1_rhs.append(budget)

    s1_bounds = []
    for item in inputs:
        max_cap = (
            float(item["input"]["maxKgAsFedPerDay"])
            if item["input"].get("maxKgAsFedPerDay") is not None
            else None
        )
        min_cap = 0.0
        feed_id = item["feed"]["id"]
        if feed_id == "mineral_mix":
            mm_cfg = req_model.get("mineralSupplement", {}).get("mineralMixMinKgPerDay", {})
            min_mm = float(mm_cfg.get("lactating" if today_milk > 0 else "dry", 0.10 if today_milk > 0 else 0.05))
            min_cap = min(min_mm, max_cap) if max_cap is not None else min_mm
        elif feed_id == "common_salt":
            salt_cfg = req_model.get("mineralSupplement", {}).get("saltMinKgPerDay", {})
            min_salt = float(salt_cfg.get("lactating" if today_milk > 0 else "dry", 0.05 if today_milk > 0 else 0.03))
            min_cap = min(min_salt, max_cap) if max_cap is not None else min_salt
        s1_bounds.append((min_cap, max_cap))
    s1_bounds.append((0.0, effective_cap))

    s1_res = linprog(
        c=c_stage1,
        A_ub=np.array(s1_rows, dtype=float),
        b_ub=np.array(s1_rhs, dtype=float),
        bounds=s1_bounds,
        method="highs",
    )

    raw_y_star = float(s1_res.x[k]) if (s1_res.success and s1_res.x is not None) else 0.0
    y_star = min(effective_cap, max(0.0, raw_y_star))

    # Step 5: Stage 2 at Y* (binding constraint detection) and Stage 2 at S (displayed ration).
    stage2_at_y_star = (
        solve_fixed_milk(inputs, req_model, y_star, budget)
        or solve_fixed_milk(inputs, req_model, y_star, None)
        or build_feed_lines_and_totals(inputs, [max(0.0, float(v)) for v in s1_res.x[:k]])
    )

    tight_constraints = detect_tight_constraints_at_y_star(
        inputs,
        req_model,
        y_star,
        effective_cap,
        budget,
        stage2_at_y_star,
    )
    binding_constraint = tight_constraints[0] if tight_constraints else "budget"
    feed_limit_ids = [l["feedId"] for l in stage2_at_y_star["lines"] if l["atCap"]]

    s = round_supported_milk_down(y_star)
    stage2_at_s = (
        stage2_at_y_star
        if abs(s - y_star) <= TOL and stage2_at_y_star["totalCost"] <= budget + rel_tol(budget)
        else solve_fixed_milk(inputs, req_model, s, budget)
    )
    if stage2_at_s is None and s >= 0.1 - 1e-9:
        s = max(0.0, round((s - 0.1) * 10.0) / 10.0)
        stage2_at_s = solve_fixed_milk(inputs, req_model, s, budget)
    if stage2_at_s is None:
        s = 0.0
        stage2_at_s = maint

    # Step 6: Stage 2' at today's milk T (no budget limit, no breed cap).
    stage2_at_t = solve_fixed_milk(inputs, req_model, today_milk, None)
    cost_at_today_milk = float(stage2_at_t["totalCost"]) if stage2_at_t is not None else None
    stage2_at_cap = solve_fixed_milk(inputs, req_model, effective_cap, None)
    cost_at_cap = float(stage2_at_cap["totalCost"]) if stage2_at_cap is not None else None
    limiting_at_today: list[str] = []
    if y_star < today_milk - TOL and cost_at_today_milk is None:
        diag_t = diagnose_at_milk(inputs, req_model, today_milk, feed_library)
        limiting_at_today = [l["nutrient"] for l in diag_t["limitingNutrients"]]
        if not limiting_at_today:
            limiting_at_today = ["DM"]

    # Step 7: Verdict selection and double-precision verification.
    verdict = select_verdict(
        today_milk=today_milk,
        breed_cap=breed_cap,
        y_star=y_star,
        supported_milk=s,
        reference_cost=reference_cost,
        cost_at_today_milk=cost_at_today_milk,
        limiting_at_today=limiting_at_today,
    )

    req_at_s = evaluate_requirements_at_milk(req_model, s)
    savings_inr = (current_cost_inr - stage2_at_s["totalCost"]) if current_cost_inr is not None else None
    savings_pct = (
        (savings_inr / current_cost_inr) * 100.0
        if savings_inr is not None and current_cost_inr and current_cost_inr > 0.0
        else None
    )

    solution = {
        "status": "optimal",
        "breedId": breed["id"],
        "supportedMilkLPerDay": s,
        "supportedMilkExactLPerDay": y_star,
        "milkCapLPerDay": breed_cap,
        "capBasis": breed["capBasis"],
        "effectiveCapLPerDay": effective_cap,
        "effectiveCapSource": effective_cap_source,
        "bindingConstraint": binding_constraint,
        "tightConstraints": tight_constraints,
        "feedLimitIds": feed_limit_ids,
        "verdict": verdict,
        "costAtTodayMilkInrPerDay": cost_at_today_milk,
        "costAtCapInrPerDay": cost_at_cap,
        "maintenanceCostInrPerDay": maintenance_cost,
        "stage2CostAtYStarInrPerDay": float(stage2_at_y_star["totalCost"]),
        "stage2CostAtSInrPerDay": float(stage2_at_s["totalCost"]),
        "budgetInrPerDay": budget,
        "referenceCostInrPerDay": reference_cost,
        "underBudgetInr": max(0.0, budget - stage2_at_s["totalCost"]),
        "feeds": stage2_at_s["lines"],
        "totalKgAsFed": stage2_at_s["totalKgAsFed"],
        "totalCostInr": stage2_at_s["totalCost"],
        "requirementsAtS": req_at_s,
        "supplied": stage2_at_s["supplied"],
        "roughageMinShare": r,
        "roughageShareAchieved": stage2_at_s["roughageShare"],
        "roughageSharePct": stage2_at_s["roughageSharePct"],
        "roughageMinSharePct": r * 100.0,
        "currentCostInr": current_cost_inr,
        "savingsInr": savings_inr,
        "savingsPct": savings_pct,
    }
    verify_ration_solution_scipy(solution, animal, selected_feeds, feed_library, req_data)
    return solution


def cross_check_all(
    animals_path: Path = DEFAULT_ANIMALS_PATH,
    browser_results_path: Path = DEFAULT_BROWSER_RESULTS_PATH,
) -> dict[str, Any]:
    feeds, breeds, requirements = load_v1_data()
    animals = json.loads(animals_path.read_text(encoding="utf-8"))
    browser_dump = json.loads(browser_results_path.read_text(encoding="utf-8"))
    browser_by_id = {r["id"]: r for r in browser_dump["results"]}

    comparisons: list[dict[str, Any]] = []
    max_diffs = {
        "M": 0.0,
        "Y_star": 0.0,
        "S": 0.0,
        "stage2_cost_at_Y_star": 0.0,
        "stage2_cost_at_S": 0.0,
        "B": 0.0,
        "Z": 0.0,
        "cost_at_cap": 0.0,
    }

    for entry in animals:
        aid = entry["id"]
        b_rec = browser_by_id[aid]
        b_out = b_rec["outcome"]
        s_out = solve_ration_scipy(entry["animal"], entry["selectedFeeds"], feeds, breeds, requirements)

        comp: dict[str, Any] = {
            "id": aid,
            "status_browser": b_out["status"],
            "status_scipy": s_out["status"],
            "status_match": b_out["status"] == s_out["status"],
            "scipy_outcome": s_out,
            "browser_record": b_rec,
        }

        if s_out["status"] == "optimal" and b_out["status"] == "optimal":
            diff_m = abs(float(s_out["maintenanceCostInrPerDay"]) - float(b_out["maintenanceCostInrPerDay"]))
            diff_y_star = abs(
                float(s_out["supportedMilkExactLPerDay"]) - float(b_out["supportedMilkExactLPerDay"])
            )
            diff_s = abs(float(s_out["supportedMilkLPerDay"]) - float(b_out["supportedMilkLPerDay"]))
            diff_c_y_star = abs(
                float(s_out["stage2CostAtYStarInrPerDay"]) - float(b_rec["stage2CostAtYStarInrPerDay"])
            )
            diff_c_s = abs(float(s_out["totalCostInr"]) - float(b_out["totalCostInr"]))

            b_val_s = s_out["costAtTodayMilkInrPerDay"]
            b_val_b = b_out["costAtTodayMilkInrPerDay"]
            diff_b = (
                abs(float(b_val_s) - float(b_val_b))
                if (b_val_s is not None and b_val_b is not None)
                else 0.0
            )

            z_val_s = s_out["verdict"].get("savingInrPerDay")
            z_val_b = b_out["verdict"].get("savingInrPerDay")
            diff_z = (
                abs(float(z_val_s) - float(z_val_b))
                if (z_val_s is not None and z_val_b is not None)
                else 0.0
            )

            cap_val_s = s_out.get("costAtCapInrPerDay")
            cap_val_b = b_out.get("costAtCapInrPerDay")
            diff_cap = (
                abs(float(cap_val_s) - float(cap_val_b))
                if (cap_val_s is not None and cap_val_b is not None)
                else 0.0
            )

            max_diffs["M"] = max(max_diffs["M"], diff_m)
            max_diffs["Y_star"] = max(max_diffs["Y_star"], diff_y_star)
            max_diffs["S"] = max(max_diffs["S"], diff_s)
            max_diffs["stage2_cost_at_Y_star"] = max(max_diffs["stage2_cost_at_Y_star"], diff_c_y_star)
            max_diffs["stage2_cost_at_S"] = max(max_diffs["stage2_cost_at_S"], diff_c_s)
            max_diffs["B"] = max(max_diffs["B"], diff_b)
            max_diffs["Z"] = max(max_diffs["Z"], diff_z)
            max_diffs["cost_at_cap"] = max(max_diffs["cost_at_cap"], diff_cap)

            comp.update(
                {
                    "diff_M": diff_m,
                    "diff_Y_star": diff_y_star,
                    "diff_S": diff_s,
                    "diff_stage2_cost_at_Y_star": diff_c_y_star,
                    "diff_stage2_cost_at_S": diff_c_s,
                    "diff_B": diff_b,
                    "diff_Z": diff_z,
                    "diff_cost_at_cap": diff_cap,
                    "cost_at_cap_null_match": (cap_val_s is None) == (cap_val_b is None),
                    "verdict_match": s_out["verdict"]["kind"] == b_out["verdict"]["kind"],
                    "binding_match": s_out["bindingConstraint"] == b_out["bindingConstraint"],
                }
            )
        elif s_out["status"] == "budget_below_maintenance" and b_out["status"] == "budget_below_maintenance":
            diff_m = abs(
                float(s_out["verdict"]["maintenanceCostInrPerDay"])
                - float(b_out["verdict"]["maintenanceCostInrPerDay"])
            )
            max_diffs["M"] = max(max_diffs["M"], diff_m)
            comp.update(
                {
                    "diff_M": diff_m,
                    "fix_feed_match": s_out["fixFeedId"] == b_out["fixFeedId"],
                }
            )
        elif s_out["status"] == "infeasible" and b_out["status"] == "infeasible":
            s_lims = [l["nutrient"] for l in s_out["limitingNutrients"]]
            b_lims = [l["nutrient"] for l in b_out["limitingNutrients"]]
            comp.update(
                {
                    "limiting_match": s_lims == b_lims,
                    "dm_conflict_match": s_out["dmConflict"] == b_out["dmConflict"],
                }
            )

        comparisons.append(comp)

    return {
        "totalAnimals": len(animals),
        "browserSummary": browser_dump["summary"],
        "maxAbsDiffs": max_diffs,
        "overallMaxAbsDiff": max(max_diffs.values()),
        "comparisons": comparisons,
    }


if __name__ == "__main__":
    report = cross_check_all()
    print(
        f"Cross-checked {report['totalAnimals']} animals with SciPy HiGHS: "
        f"overallMaxAbsDiff={report['overallMaxAbsDiff']:.3e}, "
        f"maxDiffs={report['maxAbsDiffs']}"
    )
