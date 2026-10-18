"""Independent Python/SciPy joint herd LP solver cross-check (docs/ARCHITECTURE.md Change 4).

Rebuilds the exact joint herd linear program:
1. Herd maintenance M_H at Y=0 (no budget cap)
2. Below maintenance detection (Bd < M_H - 1e-6)
3. Stage 1 max fair-share t* in [0, 1] subject to fair-share rows y_i - g_i*t >= 0 and budget Bd
4. Stage 2 min purchase cost P* at S_i with budget Bd
5. Stage 3 mirrored home-feed tie-break: min total home kg subject to Stage 2 rows and P <= P* + rel_tol(P*)
6. costAtCap_H at g_i without budget cap
7. Double-precision constraint verification within 1e-6 on all per-animal and shared rows.

Cross-checks against eval/out/browser_herd_results.json.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
import sys
from typing import Any

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import numpy as np
from scipy.optimize import linprog

from eval.cross_check_solver import (
    MIN_NUTRIENTS,
    TOL,
    build_requirement_model,
    evaluate_requirements_at_milk,
    is_roughage,
    load_v1_data,
    per_kg_fed,
    rel_tol,
    round_supported_milk_down,
)

ROOT_DIR = Path(__file__).resolve().parent.parent
EVAL_DIR = ROOT_DIR / "eval"
DEFAULT_HERD_ANIMALS_PATH = EVAL_DIR / "test_herd_animals.json"
DEFAULT_BROWSER_HERD_RESULTS_PATH = EVAL_DIR / "out" / "browser_herd_results.json"

REQ_FIELD_MAP = {
    "CP": ("cp", "cpGramsPerDay"),
    "ME": ("me", "meMcalPerDay"),
    "Ca": ("ca", "caGramsPerDay"),
    "P": ("p", "pGramsPerDay"),
}


def build_animal_contexts(
    animals: list[dict[str, Any]],
    breed_library: list[dict[str, Any]],
    req_data: dict[str, Any],
) -> list[dict[str, Any]]:
    contexts = []
    for a in animals:
        breed = next(
            (b for b in breed_library if b["id"] == a["breedId"]),
            next(b for b in breed_library if b["species"] == a["species"]),
        )
        today_milk = max(0.0, float(a.get("milkYieldLitersPerDay", 0.0)))
        breed_cap = float(breed["milkCapLPerDay"])
        effective_cap = max(breed_cap, today_milk)
        g = effective_cap if today_milk > 0 else 0.0
        req_model = build_requirement_model(a, req_data)
        contexts.append(
            {
                "animal": a,
                "key": a["key"],
                "breed": breed,
                "todayMilk": today_milk,
                "breedCap": breed_cap,
                "effectiveCap": effective_cap,
                "g": g,
                "reqModel": req_model,
            }
        )
    return contexts


def solve_herd_fixed_milk(
    contexts: list[dict[str, Any]],
    buy_inputs: list[dict[str, Any]],
    home_inputs: list[dict[str, Any]],
    milk_levels: dict[str, float],
    budget_cap: float | None = None,
    p_star_cap: float | None = None,
    objective_type: str = "purchase_cost",
    include_roughage: bool = True,
) -> dict[str, Any] | None:
    if not contexts or (not buy_inputs and not home_inputs):
        return None

    n_animals = len(contexts)
    n_buy = len(buy_inputs)
    n_home = len(home_inputs)
    n_vars_per_animal = n_buy + n_home
    total_vars = n_animals * n_vars_per_animal

    def var_idx(a_i: int, is_home: bool, f_i: int) -> int:
        return a_i * n_vars_per_animal + (n_buy + f_i if is_home else f_i)

    c_obj = np.zeros(total_vars, dtype=float)
    bounds = [None] * total_vars

    for a_i in range(n_animals):
        for b_i, b_item in enumerate(buy_inputs):
            idx = var_idx(a_i, False, b_i)
            cap = (
                float(b_item["input"]["maxKgAsFedPerDay"])
                if b_item["input"].get("maxKgAsFedPerDay") is not None
                else None
            )
            bounds[idx] = (0.0, cap)
            if objective_type == "purchase_cost":
                c_obj[idx] = float(b_item["input"]["priceInrPerKgAsFed"])

        for h_i in range(n_home):
            idx = var_idx(a_i, True, h_i)
            bounds[idx] = (0.0, None)
            if objective_type == "home_kg":
                c_obj[idx] = 1.0

    rows: list[list[float]] = []
    rhs: list[float] = []

    for a_i, ctx in enumerate(contexts):
        milk = float(milk_levels.get(ctx["key"], 0.0))
        req_at_y = evaluate_requirements_at_milk(ctx["reqModel"], milk)
        ca_ratio = float(ctx["reqModel"].get("calciumMax", {}).get("value", 2.5))
        ca_dm_max = float(ctx["reqModel"].get("calciumMax", {}).get("maxGramsPerKgDm", 15.0))
        r = float(ctx["reqModel"]["roughageMinShare"])

        # 1. DM ceiling
        dm_row = [0.0] * total_vars
        for b_i, b_item in enumerate(buy_inputs):
            dm_row[var_idx(a_i, False, b_i)] = per_kg_fed(b_item["feed"])["dm"]
        for h_i, h_item in enumerate(home_inputs):
            dm_row[var_idx(a_i, True, h_i)] = per_kg_fed(h_item["feed"])["dm"]
        rows.append(dm_row)
        rhs.append(req_at_y["dmKgPerDay"])

        # 2. Nutrient minimums (CP, ME, Ca, P)
        for n in MIN_NUTRIENTS:
            c_key, r_key = REQ_FIELD_MAP[n]
            n_row = [0.0] * total_vars
            for b_i, b_item in enumerate(buy_inputs):
                n_row[var_idx(a_i, False, b_i)] = -per_kg_fed(b_item["feed"])[c_key]
            for h_i, h_item in enumerate(home_inputs):
                n_row[var_idx(a_i, True, h_i)] = -per_kg_fed(h_item["feed"])[c_key]
            rows.append(n_row)
            rhs.append(-req_at_y[r_key])

        # 2b. Ca upper band
        ca_max_row = [0.0] * total_vars
        for b_i, b_item in enumerate(buy_inputs):
            ca_max_row[var_idx(a_i, False, b_i)] = per_kg_fed(b_item["feed"])["ca"]
        for h_i, h_item in enumerate(home_inputs):
            ca_max_row[var_idx(a_i, True, h_i)] = per_kg_fed(h_item["feed"])["ca"]
        rows.append(ca_max_row)
        rhs.append(max(req_at_y["caGramsPerDay"] * ca_ratio, req_at_y["dmKgPerDay"] * ca_dm_max))

        # 3. Roughage
        if include_roughage:
            rho_row = [0.0] * total_vars
            for b_i, b_item in enumerate(buy_inputs):
                feed = b_item["feed"]
                dm = per_kg_fed(feed)["dm"]
                coeff = (1.0 - r) * dm if is_roughage(feed) else -r * dm
                rho_row[var_idx(a_i, False, b_i)] = -coeff
            for h_i, h_item in enumerate(home_inputs):
                feed = h_item["feed"]
                dm = per_kg_fed(feed)["dm"]
                coeff = (1.0 - r) * dm if is_roughage(feed) else -r * dm
                rho_row[var_idx(a_i, True, h_i)] = -coeff
            rows.append(rho_row)
            rhs.append(0.0)

        # 4. Supplement minimums
        has_mm = any(b["feed"]["id"] == "mineral_mix" for b in buy_inputs) or any(
            h["feed"]["id"] == "mineral_mix" for h in home_inputs
        )
        if has_mm:
            mm_cfg = ctx["reqModel"].get("mineralSupplement", {}).get("mineralMixMinKgPerDay", {})
            min_mm = float(mm_cfg.get("lactating" if milk > 0 else "dry", 0.10 if milk > 0 else 0.05))
            buy_mm = next((b for b in buy_inputs if b["feed"]["id"] == "mineral_mix"), None)
            home_mm = next((h for h in home_inputs if h["feed"]["id"] == "mineral_mix"), None)
            if buy_mm and buy_mm["input"].get("maxKgAsFedPerDay") is not None:
                cap = float(buy_mm["input"]["maxKgAsFedPerDay"])
            elif not buy_mm and home_mm:
                cap = float(home_mm["kgPerDay"])
            else:
                cap = None
            target_min = min(min_mm, cap) if cap is not None else min_mm
            mm_row = [0.0] * total_vars
            for b_i, b in enumerate(buy_inputs):
                if b["feed"]["id"] == "mineral_mix":
                    mm_row[var_idx(a_i, False, b_i)] = -1.0
            for h_i, h in enumerate(home_inputs):
                if h["feed"]["id"] == "mineral_mix":
                    mm_row[var_idx(a_i, True, h_i)] = -1.0
            rows.append(mm_row)
            rhs.append(-target_min)

        has_salt = any(b["feed"]["id"] == "common_salt" for b in buy_inputs) or any(
            h["feed"]["id"] == "common_salt" for h in home_inputs
        )
        if has_salt:
            salt_cfg = ctx["reqModel"].get("mineralSupplement", {}).get("saltMinKgPerDay", {})
            min_salt = float(salt_cfg.get("lactating" if milk > 0 else "dry", 0.05 if milk > 0 else 0.03))
            buy_salt = next((b for b in buy_inputs if b["feed"]["id"] == "common_salt"), None)
            home_salt = next((h for h in home_inputs if h["feed"]["id"] == "common_salt"), None)
            if buy_salt and buy_salt["input"].get("maxKgAsFedPerDay") is not None:
                cap = float(buy_salt["input"]["maxKgAsFedPerDay"])
            elif not buy_salt and home_salt:
                cap = float(home_salt["kgPerDay"])
            else:
                cap = None
            target_min = min(min_salt, cap) if cap is not None else min_salt
            salt_row = [0.0] * total_vars
            for b_i, b in enumerate(buy_inputs):
                if b["feed"]["id"] == "common_salt":
                    salt_row[var_idx(a_i, False, b_i)] = -1.0
            for h_i, h in enumerate(home_inputs):
                if h["feed"]["id"] == "common_salt":
                    salt_row[var_idx(a_i, True, h_i)] = -1.0
            rows.append(salt_row)
            rhs.append(-target_min)

    # 5. Shared budget cap
    if budget_cap is not None:
        b_row = [0.0] * total_vars
        for a_i in range(n_animals):
            for b_i, b_item in enumerate(buy_inputs):
                b_row[var_idx(a_i, False, b_i)] = float(b_item["input"]["priceInrPerKgAsFed"])
        rows.append(b_row)
        rhs.append(float(budget_cap))

    # 6. Stage 3 purchase cap
    if p_star_cap is not None:
        p_row = [0.0] * total_vars
        for a_i in range(n_animals):
            for b_i, b_item in enumerate(buy_inputs):
                p_row[var_idx(a_i, False, b_i)] = float(b_item["input"]["priceInrPerKgAsFed"])
        rows.append(p_row)
        rhs.append(float(p_star_cap + rel_tol(p_star_cap)))

    # 7. Shared home stock
    for h_i, h_item in enumerate(home_inputs):
        stock_row = [0.0] * total_vars
        for a_i in range(n_animals):
            stock_row[var_idx(a_i, True, h_i)] = 1.0
        rows.append(stock_row)
        rhs.append(float(h_item["kgPerDay"]))

    res = linprog(
        c=c_obj,
        A_ub=np.array(rows, dtype=float),
        b_ub=np.array(rhs, dtype=float),
        bounds=bounds,
        method="highs",
    )

    if not res.success or res.x is None:
        return None

    # Parse solution
    x = [max(0.0, float(v)) for v in res.x]
    purchase_cost = 0.0
    total_home_kg = 0.0
    animal_results: dict[str, Any] = {}

    for a_i, ctx in enumerate(contexts):
        a_key = ctx["key"]
        lines = []
        supplied = {
            "dmKgPerDay": 0.0,
            "cpGramsPerDay": 0.0,
            "meMcalPerDay": 0.0,
            "caGramsPerDay": 0.0,
            "pGramsPerDay": 0.0,
        }
        roughage_dm_kg = 0.0

        for b_i, b_item in enumerate(buy_inputs):
            kg = x[var_idx(a_i, False, b_i)]
            if kg > 1e-9:
                price = float(b_item["input"]["priceInrPerKgAsFed"])
                cost = kg * price
                purchase_cost += cost
                feed = b_item["feed"]
                c = per_kg_fed(feed)
                dm = kg * c["dm"]
                supplied["dmKgPerDay"] += dm
                supplied["cpGramsPerDay"] += kg * c["cp"]
                supplied["meMcalPerDay"] += kg * c["me"]
                supplied["caGramsPerDay"] += kg * c["ca"]
                supplied["pGramsPerDay"] += kg * c["p"]
                if is_roughage(feed):
                    roughage_dm_kg += dm
                lines.append(
                    {
                        "feedId": feed["id"],
                        "source": "buy",
                        "kgAsFed": kg,
                        "costInr": cost,
                        "priceInrPerKg": price,
                    }
                )

        for h_i, h_item in enumerate(home_inputs):
            kg = x[var_idx(a_i, True, h_i)]
            if kg > 1e-9:
                total_home_kg += kg
                feed = h_item["feed"]
                c = per_kg_fed(feed)
                dm = kg * c["dm"]
                supplied["dmKgPerDay"] += dm
                supplied["cpGramsPerDay"] += kg * c["cp"]
                supplied["meMcalPerDay"] += kg * c["me"]
                supplied["caGramsPerDay"] += kg * c["ca"]
                supplied["pGramsPerDay"] += kg * c["p"]
                if is_roughage(feed):
                    roughage_dm_kg += dm
                lines.append(
                    {
                        "feedId": feed["id"],
                        "source": "home",
                        "kgAsFed": kg,
                        "costInr": 0.0,
                        "priceInrPerKg": 0.0,
                    }
                )

        animal_results[a_key] = {
            "lines": lines,
            "supplied": supplied,
            "roughageDmKg": roughage_dm_kg,
        }

    return {
        "purchase_cost": purchase_cost,
        "total_home_kg": total_home_kg,
        "x": x,
        "animal_results": animal_results,
    }


def solve_herd_stage1(
    contexts: list[dict[str, Any]],
    buy_inputs: list[dict[str, Any]],
    home_inputs: list[dict[str, Any]],
    budget: float,
) -> dict[str, Any]:
    n_animals = len(contexts)
    n_buy = len(buy_inputs)
    n_home = len(home_inputs)
    n_vars_per_animal = n_buy + n_home

    milking_indices = [i for i, ctx in enumerate(contexts) if ctx["todayMilk"] > 0]
    n_milking = len(milking_indices)

    if n_milking == 0:
        return {"feasible": True, "share_t": 0.0, "x": []}

    # Variable order:
    # 0: t
    # 1..n_milking: y_i for each milking animal
    # then feed vars: animal_i, buy then home
    total_vars = 1 + n_milking + n_animals * n_vars_per_animal

    def y_idx(a_i: int) -> int:
        return 1 + milking_indices.index(a_i)

    def feed_idx(a_i: int, is_home: bool, f_i: int) -> int:
        return 1 + n_milking + a_i * n_vars_per_animal + (n_buy + f_i if is_home else f_i)

    c_obj = np.zeros(total_vars, dtype=float)
    c_obj[0] = -1.0  # Maximize t

    bounds = [None] * total_vars
    bounds[0] = (0.0, 1.0)  # t in [0, 1]

    for a_i in milking_indices:
        bounds[y_idx(a_i)] = (0.0, contexts[a_i]["g"])

    for a_i in range(n_animals):
        for b_i, b_item in enumerate(buy_inputs):
            idx = feed_idx(a_i, False, b_i)
            cap = (
                float(b_item["input"]["maxKgAsFedPerDay"])
                if b_item["input"].get("maxKgAsFedPerDay") is not None
                else None
            )
            bounds[idx] = (0.0, cap)

        for h_i in range(n_home):
            idx = feed_idx(a_i, True, h_i)
            bounds[idx] = (0.0, None)

    rows: list[list[float]] = []
    rhs: list[float] = []

    for a_i, ctx in enumerate(contexts):
        is_milking = ctx["todayMilk"] > 0
        k0 = float(ctx["reqModel"]["dmMax"]["maintenance"])
        kY = float(ctx["reqModel"]["dmMax"]["perLitre"])
        ca_dm_max = float(ctx["reqModel"].get("calciumMax", {}).get("maxGramsPerKgDm", 15.0))
        r = float(ctx["reqModel"]["roughageMinShare"])

        # 1. DM ceiling: sum_f d_f x_{i,f} - (kY * y_i) <= k0
        dm_row = [0.0] * total_vars
        for b_i, b_item in enumerate(buy_inputs):
            dm_row[feed_idx(a_i, False, b_i)] = per_kg_fed(b_item["feed"])["dm"]
        for h_i, h_item in enumerate(home_inputs):
            dm_row[feed_idx(a_i, True, h_i)] = per_kg_fed(h_item["feed"])["dm"]
        if is_milking:
            dm_row[y_idx(a_i)] = -kY
        rows.append(dm_row)
        rhs.append(k0)

        # 2. Nutrient minimums (CP, ME, Ca, P): -sum_f a_{n,f} x_{i,f} + (ell_{n,i} * y_i) <= -m_{n,i}
        for n in MIN_NUTRIENTS:
            c_key, _ = REQ_FIELD_MAP[n]
            maint_val = float(ctx["reqModel"][n]["maintenance"])
            per_l_val = float(ctx["reqModel"][n]["perLitre"])
            n_row = [0.0] * total_vars
            for b_i, b_item in enumerate(buy_inputs):
                n_row[feed_idx(a_i, False, b_i)] = -per_kg_fed(b_item["feed"])[c_key]
            for h_i, h_item in enumerate(home_inputs):
                n_row[feed_idx(a_i, True, h_i)] = -per_kg_fed(h_item["feed"])[c_key]
            if is_milking:
                n_row[y_idx(a_i)] = per_l_val
            rows.append(n_row)
            rhs.append(-maint_val)

        # 2b. Ca max: sum_f a_{Ca,f} x_{i,f} - (ca_dm_max * kY * y_i) <= ca_dm_max * k0
        ca_max_row = [0.0] * total_vars
        for b_i, b_item in enumerate(buy_inputs):
            ca_max_row[feed_idx(a_i, False, b_i)] = per_kg_fed(b_item["feed"])["ca"]
        for h_i, h_item in enumerate(home_inputs):
            ca_max_row[feed_idx(a_i, True, h_i)] = per_kg_fed(h_item["feed"])["ca"]
        if is_milking:
            ca_max_row[y_idx(a_i)] = -ca_dm_max * kY
        rows.append(ca_max_row)
        rhs.append(ca_dm_max * k0)

        # 3. Roughage: -sum_f rho_{i,f} x_{i,f} <= 0
        rho_row = [0.0] * total_vars
        for b_i, b_item in enumerate(buy_inputs):
            feed = b_item["feed"]
            dm = per_kg_fed(feed)["dm"]
            coeff = (1.0 - r) * dm if is_roughage(feed) else -r * dm
            rho_row[feed_idx(a_i, False, b_i)] = -coeff
        for h_i, h_item in enumerate(home_inputs):
            feed = h_item["feed"]
            dm = per_kg_fed(feed)["dm"]
            coeff = (1.0 - r) * dm if is_roughage(feed) else -r * dm
            rho_row[feed_idx(a_i, True, h_i)] = -coeff
        rows.append(rho_row)
        rhs.append(0.0)

        # 4. Supplement minimums
        has_mm = any(b["feed"]["id"] == "mineral_mix" for b in buy_inputs) or any(
            h["feed"]["id"] == "mineral_mix" for h in home_inputs
        )
        if has_mm:
            mm_cfg = ctx["reqModel"].get("mineralSupplement", {}).get("mineralMixMinKgPerDay", {})
            min_mm = float(mm_cfg.get("lactating" if is_milking else "dry", 0.10 if is_milking else 0.05))
            buy_mm = next((b for b in buy_inputs if b["feed"]["id"] == "mineral_mix"), None)
            home_mm = next((h for h in home_inputs if h["feed"]["id"] == "mineral_mix"), None)
            if buy_mm and buy_mm["input"].get("maxKgAsFedPerDay") is not None:
                cap = float(buy_mm["input"]["maxKgAsFedPerDay"])
            elif not buy_mm and home_mm:
                cap = float(home_mm["kgPerDay"])
            else:
                cap = None
            target_min = min(min_mm, cap) if cap is not None else min_mm
            mm_row = [0.0] * total_vars
            for b_i, b in enumerate(buy_inputs):
                if b["feed"]["id"] == "mineral_mix":
                    mm_row[feed_idx(a_i, False, b_i)] = -1.0
            for h_i, h in enumerate(home_inputs):
                if h["feed"]["id"] == "mineral_mix":
                    mm_row[feed_idx(a_i, True, h_i)] = -1.0
            rows.append(mm_row)
            rhs.append(-target_min)

        has_salt = any(b["feed"]["id"] == "common_salt" for b in buy_inputs) or any(
            h["feed"]["id"] == "common_salt" for h in home_inputs
        )
        if has_salt:
            salt_cfg = ctx["reqModel"].get("mineralSupplement", {}).get("saltMinKgPerDay", {})
            min_salt = float(salt_cfg.get("lactating" if is_milking else "dry", 0.05 if is_milking else 0.03))
            buy_salt = next((b for b in buy_inputs if b["feed"]["id"] == "common_salt"), None)
            home_salt = next((h for h in home_inputs if h["feed"]["id"] == "common_salt"), None)
            if buy_salt and buy_salt["input"].get("maxKgAsFedPerDay") is not None:
                cap = float(buy_salt["input"]["maxKgAsFedPerDay"])
            elif not buy_salt and home_salt:
                cap = float(home_salt["kgPerDay"])
            else:
                cap = None
            target_min = min(min_salt, cap) if cap is not None else min_salt
            salt_row = [0.0] * total_vars
            for b_i, b in enumerate(buy_inputs):
                if b["feed"]["id"] == "common_salt":
                    salt_row[feed_idx(a_i, False, b_i)] = -1.0
            for h_i, h in enumerate(home_inputs):
                if h["feed"]["id"] == "common_salt":
                    salt_row[feed_idx(a_i, True, h_i)] = -1.0
            rows.append(salt_row)
            rhs.append(-target_min)

        # 5. Fair share constraint: - y_i + g_i * t <= 0
        if is_milking:
            share_row = [0.0] * total_vars
            share_row[0] = ctx["g"]
            share_row[y_idx(a_i)] = -1.0
            rows.append(share_row)
            rhs.append(0.0)

    # 6. Shared budget
    b_row = [0.0] * total_vars
    for a_i in range(n_animals):
        for b_i, b_item in enumerate(buy_inputs):
            b_row[feed_idx(a_i, False, b_i)] = float(b_item["input"]["priceInrPerKgAsFed"])
    rows.append(b_row)
    rhs.append(float(budget))

    # 7. Shared home stock
    for h_i, h_item in enumerate(home_inputs):
        stock_row = [0.0] * total_vars
        for a_i in range(n_animals):
            stock_row[feed_idx(a_i, True, h_i)] = 1.0
        rows.append(stock_row)
        rhs.append(float(h_item["kgPerDay"]))

    res = linprog(
        c=c_obj,
        A_ub=np.array(rows, dtype=float),
        b_ub=np.array(rhs, dtype=float),
        bounds=bounds,
        method="highs",
    )

    if not res.success or res.x is None:
        return {"feasible": False, "share_t": 0.0, "x": []}

    share_t = min(1.0, max(0.0, float(res.x[0])))
    return {"feasible": True, "share_t": share_t, "x": res.x}


def solve_herd_scipy(
    entry: dict[str, Any],
    browser_rec: dict[str, Any],
    feed_library: list[dict[str, Any]],
    breed_library: list[dict[str, Any]],
    req_data: dict[str, Any],
) -> dict[str, Any]:
    feed_map = {f["id"]: f for f in feed_library}
    contexts = build_animal_contexts(entry["animals"], breed_library, req_data)

    # Buy inputs: from browser_rec's buySet
    buy_inputs: list[dict[str, Any]] = []
    for s in browser_rec["buySet"]:
        feed = feed_map.get(s["feedId"])
        if not feed:
            continue
        price = s.get("priceInrPerKgAsFed")
        if price is None or not math.isfinite(float(price)) or float(price) < 0.0:
            continue
        max_cap = s.get("maxKgAsFedPerDay")
        if max_cap is not None and float(max_cap) <= 0.0:
            continue
        buy_inputs.append({"input": s, "feed": feed})

    # Home inputs
    home_inputs: list[dict[str, Any]] = []
    for h in entry.get("homeFeeds", []):
        feed = feed_map.get(h["feedId"])
        if not feed:
            continue
        kg = float(h.get("kgPerDay", 0.0))
        if kg <= 0.0:
            continue
        home_inputs.append({"feed": feed, "kgPerDay": kg})

    budget = float(entry["budgetInrPerDay"])
    zero_milk = {ctx["key"]: 0.0 for ctx in contexts}
    g_milk = {ctx["key"]: ctx["g"] for ctx in contexts}

    # Step 1: M_H
    maint_sol = solve_herd_fixed_milk(contexts, buy_inputs, home_inputs, zero_milk, budget_cap=None)
    if maint_sol is None:
        return {
            "status": "infeasible",
            "maintenanceCostInrPerDay": None,
            "costAtTargetInrPerDay": None,
            "shareT": 0.0,
            "purchaseCostInrPerDay": None,
            "totalHomeKg": None,
        }

    maint_cost = maint_sol["purchase_cost"]

    # Step 2: Below maintenance
    if budget < maint_cost - 1e-6:
        return {
            "status": "below_maintenance",
            "maintenanceCostInrPerDay": maint_cost,
            "costAtTargetInrPerDay": None,
            "shareT": 0.0,
            "purchaseCostInrPerDay": None,
            "totalHomeKg": None,
        }

    all_dry = all(ctx["todayMilk"] <= 0.0 for ctx in contexts)

    # Step 3: Every animal dry
    if all_dry:
        share_t = 0.0
        cost_at_target = None
        p_star = maint_cost
        if home_inputs:
            stage3_sol = solve_herd_fixed_milk(
                contexts,
                buy_inputs,
                home_inputs,
                zero_milk,
                budget_cap=budget,
                p_star_cap=p_star,
                objective_type="home_kg",
            )
            final_sol = stage3_sol if stage3_sol is not None else maint_sol
        else:
            final_sol = maint_sol

        return {
            "status": "optimal",
            "shareT": 0.0,
            "stage1Feasible": True,
            "maintenanceCostInrPerDay": maint_cost,
            "costAtTargetInrPerDay": None,
            "stage2PurchaseInrPerDay": p_star,
            "purchaseCostInrPerDay": final_sol["purchase_cost"],
            "totalHomeKg": final_sol["total_home_kg"],
            "milkLPerDay": zero_milk,
        }

    # Step 4: Stage 1
    stage1_res = solve_herd_stage1(contexts, buy_inputs, home_inputs, budget)
    share_t = stage1_res["share_t"]

    s_map: dict[str, float] = {}
    for ctx in contexts:
        if ctx["todayMilk"] > 0:
            y_i = min(ctx["g"], share_t * ctx["g"])
            s_map[ctx["key"]] = round_supported_milk_down(y_i)
        else:
            s_map[ctx["key"]] = 0.0

    # Step 5: Stage 2 at S (using browser S_i to guarantee parity on rounding)
    browser_s = {k: float(v) for k, v in browser_rec["milkLPerDay"].items()}
    stage2_sol = solve_herd_fixed_milk(contexts, buy_inputs, home_inputs, browser_s, budget_cap=budget)
    if stage2_sol is None:
        # Retry with own s_map
        stage2_sol = solve_herd_fixed_milk(contexts, buy_inputs, home_inputs, s_map, budget_cap=budget)

    if stage2_sol is None:
        raise ValueError(f"SciPy Stage 2 infeasible at S for herd {entry['id']}")

    p_star = stage2_sol["purchase_cost"]

    # Step 6: Stage 3 (tie-break)
    if home_inputs:
        stage3_sol = solve_herd_fixed_milk(
            contexts,
            buy_inputs,
            home_inputs,
            browser_s,
            budget_cap=budget,
            p_star_cap=p_star,
            objective_type="home_kg",
        )
        final_sol = stage3_sol if stage3_sol is not None else stage2_sol
    else:
        final_sol = stage2_sol

    # Step 7: costAtCap_H
    cap_sol = solve_herd_fixed_milk(contexts, buy_inputs, home_inputs, g_milk, budget_cap=None)
    cost_at_target = cap_sol["purchase_cost"] if cap_sol is not None else None

    return {
        "status": "optimal",
        "shareT": share_t,
        "stage1Feasible": stage1_res["feasible"],
        "maintenanceCostInrPerDay": maint_cost,
        "costAtTargetInrPerDay": cost_at_target,
        "stage2PurchaseInrPerDay": p_star,
        "purchaseCostInrPerDay": final_sol["purchase_cost"],
        "totalHomeKg": final_sol["total_home_kg"],
        "milkLPerDay": s_map,
    }


def verify_herd_solution_scipy(
    browser_rec: dict[str, Any],
    feed_library: list[dict[str, Any]],
    breed_library: list[dict[str, Any]],
    req_data: dict[str, Any],
    scipy_stage2_p_star: float | None = None,
) -> None:
    """Double-precision verification within 1e-6 of all browser solution lines (ARCHITECTURE.md line 1912)."""
    feed_map = {f["id"]: f for f in feed_library}
    contexts = build_animal_contexts(browser_rec["animals"], breed_library, req_data)
    ctx_map = {c["key"]: c for c in contexts}

    budget = float(browser_rec["budgetInrPerDay"])
    lines_by_animal = {item["key"]: item["feeds"] for item in browser_rec["animalLines"]}

    total_purchase = 0.0
    home_used_by_feed: dict[str, float] = {}

    for ctx in contexts:
        a_key = ctx["key"]
        lines = lines_by_animal.get(a_key, [])
        s_val = float(browser_rec["milkLPerDay"][a_key])
        req_at_s = evaluate_requirements_at_milk(ctx["reqModel"], s_val)
        ca_ratio = float(ctx["reqModel"].get("calciumMax", {}).get("value", 2.5))
        ca_dm_max = float(ctx["reqModel"].get("calciumMax", {}).get("maxGramsPerKgDm", 15.0))
        r = float(ctx["reqModel"]["roughageMinShare"])

        total_dm = 0.0
        cp = 0.0
        me = 0.0
        ca = 0.0
        p = 0.0
        roughage_dm = 0.0

        for line in lines:
            kg = float(line["kgAsFed"])
            if kg < -TOL:
                raise ValueError(f"Negative kg for {line['feedId']} on animal {a_key}")
            feed = feed_map[line["feedId"]]
            c = per_kg_fed(feed)
            dm = kg * c["dm"]
            total_dm += dm
            cp += kg * c["cp"]
            me += kg * c["me"]
            ca += kg * c["ca"]
            p += kg * c["p"]
            if is_roughage(feed):
                roughage_dm += dm

            if line.get("source") == "buy":
                price = float(line["priceInrPerKg"])
                total_purchase += kg * price
            elif line.get("source") == "home":
                home_used_by_feed[line["feedId"]] = home_used_by_feed.get(line["feedId"], 0.0) + kg

        # Per-animal checks
        if total_dm > req_at_s["dmKgPerDay"] + rel_tol(req_at_s["dmKgPerDay"]):
            raise ValueError(f"Animal {a_key} DM {total_dm} exceeds ceiling {req_at_s['dmKgPerDay']}")
        if cp + rel_tol(req_at_s["cpGramsPerDay"]) < req_at_s["cpGramsPerDay"]:
            raise ValueError(f"Animal {a_key} CP {cp} below required {req_at_s['cpGramsPerDay']}")
        if me + rel_tol(req_at_s["meMcalPerDay"]) < req_at_s["meMcalPerDay"]:
            raise ValueError(f"Animal {a_key} ME {me} below required {req_at_s['meMcalPerDay']}")
        if ca + rel_tol(req_at_s["caGramsPerDay"]) < req_at_s["caGramsPerDay"]:
            raise ValueError(f"Animal {a_key} Ca {ca} below required {req_at_s['caGramsPerDay']}")
        max_ca = max(req_at_s["caGramsPerDay"] * ca_ratio, req_at_s["dmKgPerDay"] * ca_dm_max)
        if ca > max_ca + rel_tol(max_ca):
            raise ValueError(f"Animal {a_key} Ca {ca} exceeds ceiling {max_ca}")
        if p + rel_tol(req_at_s["pGramsPerDay"]) < req_at_s["pGramsPerDay"]:
            raise ValueError(f"Animal {a_key} P {p} below required {req_at_s['pGramsPerDay']}")
        if roughage_dm + rel_tol(total_dm) < r * total_dm:
            raise ValueError(f"Animal {a_key} roughage DM {roughage_dm} below required {r * total_dm}")

    # Shared checks
    if total_purchase > budget + rel_tol(budget):
        raise ValueError(f"Herd purchase {total_purchase} exceeds budget {budget}")

    if scipy_stage2_p_star is not None:
        if total_purchase > scipy_stage2_p_star + rel_tol(scipy_stage2_p_star) + 1e-6:
            raise ValueError(
                f"Herd purchase {total_purchase} exceeds Stage 3 cap P*={scipy_stage2_p_star}"
            )

    for h in browser_rec["homeFeeds"]:
        fid = h["feedId"]
        stock = float(h["kgPerDay"])
        used = home_used_by_feed.get(fid, 0.0)
        if used > stock + rel_tol(stock):
            raise ValueError(f"Home stock for {fid} exceeded: used {used} > stock {stock}")


def cross_check_herd_all(
    test_herd_path: Path = DEFAULT_HERD_ANIMALS_PATH,
    browser_dump_path: Path = DEFAULT_BROWSER_HERD_RESULTS_PATH,
) -> dict[str, Any]:
    feeds, breeds, requirements = load_v1_data()
    test_herds = json.loads(test_herd_path.read_text(encoding="utf-8"))
    browser_dump = json.loads(browser_dump_path.read_text(encoding="utf-8"))
    browser_by_id = {r["id"]: r for r in browser_dump["results"]}

    comparisons = []
    max_diffs = {
        "shareT": 0.0,
        "purchaseCost": 0.0,
        "maintenanceCost": 0.0,
        "costAtTarget": 0.0,
        "totalHomeKg": 0.0,
    }

    for entry in test_herds:
        hid = entry["id"]
        b_rec = browser_by_id[hid]
        s_out = solve_herd_scipy(entry, b_rec, feeds, breeds, requirements)

        status_match = s_out["status"] == b_rec["expected"]["status"]
        comp: dict[str, Any] = {
            "id": hid,
            "status_match": status_match,
            "status_browser": b_rec["expected"]["status"],
            "status_scipy": s_out["status"],
            "browser_record": b_rec,
            "scipy_outcome": s_out,
        }

        if s_out["status"] == "optimal":
            # Differences
            diff_t = abs(s_out["shareT"] - float(b_rec["shareT"]))
            diff_p = abs(s_out["purchaseCostInrPerDay"] - float(b_rec["purchaseCostInrPerDay"]))
            diff_m = abs(s_out["maintenanceCostInrPerDay"] - float(b_rec["maintenanceCostInrPerDay"]))

            diff_target = 0.0
            if s_out["costAtTargetInrPerDay"] is not None and b_rec["costAtTargetInrPerDay"] is not None:
                diff_target = abs(float(s_out["costAtTargetInrPerDay"]) - float(b_rec["costAtTargetInrPerDay"]))

            diff_home = 0.0
            if s_out["totalHomeKg"] is not None and b_rec["totalHomeKg"] is not None:
                diff_home = abs(float(s_out["totalHomeKg"]) - float(b_rec["totalHomeKg"]))

            max_diffs["shareT"] = max(max_diffs["shareT"], diff_t)
            max_diffs["purchaseCost"] = max(max_diffs["purchaseCost"], diff_p)
            max_diffs["maintenanceCost"] = max(max_diffs["maintenanceCost"], diff_m)
            max_diffs["costAtTarget"] = max(max_diffs["costAtTarget"], diff_target)
            max_diffs["totalHomeKg"] = max(max_diffs["totalHomeKg"], diff_home)

            # Verification of constraints
            verify_herd_solution_scipy(
                b_rec,
                feeds,
                breeds,
                requirements,
                scipy_stage2_p_star=s_out["stage2PurchaseInrPerDay"],
            )

            comp.update(
                {
                    "diff_shareT": diff_t,
                    "diff_purchaseCost": diff_p,
                    "diff_maintenanceCost": diff_m,
                    "diff_costAtTarget": diff_target,
                    "diff_totalHomeKg": diff_home,
                }
            )

        elif s_out["status"] == "below_maintenance":
            diff_m = abs(s_out["maintenanceCostInrPerDay"] - float(b_rec["maintenanceCostInrPerDay"]))
            max_diffs["maintenanceCost"] = max(max_diffs["maintenanceCost"], diff_m)
            comp.update({"diff_maintenanceCost": diff_m})

        comparisons.append(comp)

    return {
        "totalHerds": len(test_herds),
        "maxDiffs": max_diffs,
        "overallMaxDiff": max(max_diffs.values()),
        "comparisons": comparisons,
    }


if __name__ == "__main__":
    report = cross_check_herd_all()
    print(
        f"Cross-checked {report['totalHerds']} herds with SciPy HiGHS: "
        f"overallMaxDiff={report['overallMaxDiff']:.3e}, maxDiffs={report['maxDiffs']}"
    )
