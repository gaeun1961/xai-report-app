"""Regression check: /analyze must not break when common.load_and_preprocess's
return signature changes (it grew a 5th value, raw_df, in the memory-optimization
pass; this endpoint's unpacking has to track it). Run: python test_analyze.py
"""
import numpy as np
from fastapi.testclient import TestClient

from main import app  # import first: inserts analysis/scripts onto sys.path

import common

CSV = b"""Survived,Pclass,Sex,Age,Fare
0,3,male,22,7.25
1,1,female,38,71.28
1,3,female,26,7.92
1,1,female,35,53.1
0,3,male,35,8.05
0,3,male,28,8.46
0,1,male,54,51.86
0,3,male,2,21.08
1,3,female,27,11.13
1,2,female,14,30.07
"""


def test_analyze_returns_report():
    client = TestClient(app)
    res = client.post(
        "/analyze",
        files={"file": ("t.csv", CSV, "text/csv")},
        data={"target_column": "Survived", "n_cases": "5"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert "featureImportance" in body
    # cases only come from rows the explained model never trained on (the
    # 20% holdout): 10 rows -> 2 held out, so asking for 5 still yields 2
    assert len(body["cases"]) == 2
    # raw echoes original CSV columns dropped as unusable for modeling too
    # (so the frontend can label a case by any of them), but not the target
    # column itself (already shown via the 예측/실제 badges) or constant
    # columns (carry no per-case info)
    assert set(body["cases"][0]["raw"].keys()) == {"Pclass", "Sex", "Age", "Fare"}
    # no domain override for an upload, so a bare "1"/"0" gets prefixed with
    # the target column name instead of being shown unexplained
    assert body["positiveLabel"] == "Survived=1"
    assert body["negativeLabel"] == "Survived=0"
    # raw target column/values exposed regardless of override, so the
    # frontend can build a persistent, reusable value->meaning mapping
    assert body["targetColumn"] == "Survived"
    assert body["positiveRaw"] == "1"
    assert body["negativeRaw"] == "0"
    # 10 data rows in CSV, well under SHAP_MAX_ROWS - no sampling needed
    assert body["totalRows"] == 10
    assert body["sampledRows"] == 10
    # caseStats counts every held-out row in the pool, not just loaded cards
    stats = body["caseStats"]
    assert stats["heldOut"] is True
    assert stats["total"] == 2
    assert 0 <= stats["wrong"] <= 2
    assert 0 <= stats["borderline"] <= 2


def test_columns_returns_row_count():
    client = TestClient(app)
    res = client.post("/columns", files={"file": ("t.csv", CSV, "text/csv")})
    assert res.status_code == 200, res.text
    assert res.json()["rowCount"] == 10


CSV_WITH_CONSTANT_COL = b"""Survived,Pclass,Sex,Age,Fare,zero
0,3,male,22,7.25,0
1,1,female,38,71.28,0
1,3,female,26,7.92,0
1,1,female,35,53.1,0
0,3,male,35,8.05,0
0,3,male,28,8.46,0
0,1,male,54,51.86,0
0,3,male,2,21.08,0
1,3,female,27,11.13,0
1,2,female,14,30.07,0
"""


def test_analyze_drops_constant_column_from_raw():
    client = TestClient(app)
    res = client.post(
        "/analyze",
        files={"file": ("t.csv", CSV_WITH_CONSTANT_COL, "text/csv")},
        data={"target_column": "Survived", "n_cases": "3"},
    )
    assert res.status_code == 200, res.text
    assert "zero" not in res.json()["cases"][0]["raw"]


def test_pick_case_indices_focus():
    # idx1 and idx4 are the model's mistakes; distances from 0.5 are all
    # distinct by construction so ordering is unambiguous.
    predictions = np.array([1, 1, 1, 0, 0, 0])
    actual = np.array([1, 0, 1, 0, 1, 0])
    proba_pos = np.array([0.95, 0.6, 0.52, 0.10, 0.47, 0.15])

    # "wrong": most-confidently-wrong first (idx1, dist 0.10, before idx4, dist 0.03)
    assert common._pick_case_indices(
        predictions, proba_pos, 1, actual=actual, focus="wrong"
    ) == [1]
    assert common._pick_case_indices(
        predictions, proba_pos, 2, actual=actual, focus="wrong"
    ) == [1, 4]

    # "borderline": closest to 0.5 first, regardless of correctness
    assert common._pick_case_indices(
        predictions, proba_pos, 2, focus="borderline"
    ) == [2, 4]


def test_case_focus_rejects_unknown_value():
    client = TestClient(app)
    res = client.post(
        "/analyze",
        files={"file": ("t.csv", CSV, "text/csv")},
        data={"target_column": "Survived", "case_focus": "nonsense"},
    )
    assert res.status_code == 400, res.text


def test_analyze_flags_suspect_zeros():
    # Chol=0 on 12 rows while every other value is 180-300: a "not measured"
    # placeholder, not NaN. Age has a genuine 0-free spread, so only Chol flags.
    rows = ["y,Age,Chol"]
    for i in range(60):
        chol = 0 if i % 5 == 0 else 180 + (i * 7) % 120
        rows.append(f"{i % 2},{30 + i % 40},{chol}")
    CHOL_CSV = chr(10).join(rows).encode()
    res = TestClient(app).post(
        "/analyze",
        files={"file": ("z.csv", CHOL_CSV, "text/csv")},
        data={"target_column": "y", "n_cases": "3"},
    )
    assert res.status_code == 200, res.text
    flagged = {r["column"]: r for r in res.json()["suspectZeros"]}
    assert set(flagged) == {"Chol"}, flagged
    assert flagged["Chol"]["zeroCount"] == 12


def test_wrong_feature_importance_matches_wrong_count():
    client = TestClient(app)
    res = client.post(
        "/analyze",
        files={"file": ("t.csv", CSV, "text/csv")},
        data={"target_column": "Survived", "n_cases": "5"},
    )
    body = res.json()
    same_features = {f["feature"] for f in body["featureImportance"]}
    if body["caseStats"]["wrong"] == 0:
        # a perfect model has no wrong predictions to rank features over
        assert "wrongFeatureImportance" not in body
    else:
        wrong_fi = body["wrongFeatureImportance"]
        assert {f["feature"] for f in wrong_fi} == same_features
        # descending order, same as featureImportance
        values = [f["importance"] for f in wrong_fi]
        assert values == sorted(values, reverse=True)


def test_partial_dependence_covers_top_features():
    client = TestClient(app)
    res = client.post(
        "/analyze",
        files={"file": ("t.csv", CSV, "text/csv")},
        data={"target_column": "Survived", "n_cases": "5"},
    )
    body = res.json()
    pdp = body["partialDependence"]
    top_features = [f["feature"] for f in body["featureImportance"][: len(pdp)]]
    assert [p["feature"] for p in pdp] == top_features
    for entry in pdp:
        assert len(entry["points"]) >= 2, entry
        for point in entry["points"]:
            assert 0.0 <= point["proba"] <= 1.0, point
    # Sex is categorical (male/female) - values should be the original
    # strings, not factorized codes
    sex_entry = next((p for p in pdp if p["feature"] == "Sex"), None)
    if sex_entry:
        values = {p["value"] for p in sex_entry["points"]}
        assert values <= {"male", "female"}, values


# bigger + a clean Sex->Survived split (with a little noise) than the 10-row
# CSV fixture above, whose model turns out too data-starved under production
# hyperparameters (max_depth=8, min_samples_leaf=4) to learn anything real -
# every SHAP value comes back 0 there, which would make this test meaningless
def _whatif_csv() -> bytes:
    rows = ["Survived,Pclass,Sex,Age,Fare"]
    for i in range(60):
        female = i % 2 == 0
        noise = i % 11 == 0  # occasional counter-example so it's not trivially separable
        survived = int(female != noise)
        sex = "female" if female else "male"
        rows.append(f"{survived},{1 + i % 3},{sex},{20 + i % 40},{10 + (i * 3) % 90}")
    return chr(10).join(rows).encode()


def test_whatif_updates_prediction_for_edited_row():
    client = TestClient(app)
    res = client.post(
        "/analyze",
        files={"file": ("w.csv", _whatif_csv(), "text/csv")},
        data={"target_column": "Survived", "n_cases": "5"},
    )
    body = res.json()
    assert "analysisId" in body
    case = body["cases"][0]

    # unmodified row: same features the model was trained on -> a real
    # prediction back, not an error
    same = client.post(
        "/whatif", json={"analysis_id": body["analysisId"], "row": case["raw"]}
    )
    assert same.status_code == 200, same.text
    same_body = same.json()
    assert 0.0 <= same_body["probaPositive"] <= 1.0
    assert {f["feature"] for f in same_body["topFeatures"]} == {
        f["feature"] for f in body["featureImportance"]
    }

    # Sex is the whole signal here by construction - flipping it should move
    # the probability by a large amount
    flipped_row = dict(case["raw"])
    flipped_row["Sex"] = "female" if flipped_row.get("Sex") == "male" else "male"
    flipped = client.post(
        "/whatif", json={"analysis_id": body["analysisId"], "row": flipped_row}
    )
    assert flipped.status_code == 200, flipped.text
    assert abs(flipped.json()["probaPositive"] - same_body["probaPositive"]) > 0.2


def test_whatif_unknown_analysis_id_404():
    res = TestClient(app).post(
        "/whatif", json={"analysis_id": "does-not-exist", "row": {}}
    )
    assert res.status_code == 404, res.text


def test_model_types_lists_whitelist():
    res = TestClient(app).get("/model-types")
    assert res.status_code == 200, res.text
    body = res.json()
    assert set(body) == {"random_forest", "gradient_boosting", "extra_trees"}
    for spec in body.values():
        assert "label" in spec
        assert "n_estimators" in spec["params"]
        assert spec["params"]["n_estimators"]["min"] < spec["params"]["n_estimators"]["max"]
        # every param carries the default the UI pre-fills / retrain falls back to
        assert all("default" in p for p in spec["params"].values())


def test_retrain_with_different_model():
    client = TestClient(app)
    res = client.post(
        "/analyze",
        files={"file": ("w.csv", _whatif_csv(), "text/csv")},
        data={"target_column": "Survived", "n_cases": "5"},
    )
    body = res.json()

    retrained = client.post(
        "/retrain",
        json={
            "analysis_id": body["analysisId"],
            "model_type": "gradient_boosting",
            "params": {"n_estimators": 50, "max_depth": 3},
        },
    )
    assert retrained.status_code == 200, retrained.text
    new_body = retrained.json()
    assert new_body["modelType"] == "gradient_boosting"
    assert new_body["modelLabel"] == "Gradient Boosting"
    assert 0.0 <= new_body["modelAccuracy"] <= 1.0
    assert len(new_body["featureImportance"]) > 0
    assert "caseStats" in new_body
    # a fresh analysis id for the retrained model too, distinct from the original
    assert new_body["analysisId"] != body["analysisId"]

    # the new model is itself usable for /whatif (chaining)
    case = new_body["cases"][0]
    whatif_res = client.post(
        "/whatif", json={"analysis_id": new_body["analysisId"], "row": case.get("raw") or {}}
    )
    assert whatif_res.status_code == 200, whatif_res.text


def test_retrain_rejects_unknown_model_type():
    client = TestClient(app)
    res = client.post(
        "/analyze",
        files={"file": ("w.csv", _whatif_csv(), "text/csv")},
        data={"target_column": "Survived", "n_cases": "3"},
    )
    analysis_id = res.json()["analysisId"]
    bad = client.post(
        "/retrain",
        json={"analysis_id": analysis_id, "model_type": "linear_regression", "params": {}},
    )
    assert bad.status_code == 400, bad.text


def test_retrain_rejects_out_of_range_param():
    client = TestClient(app)
    res = client.post(
        "/analyze",
        files={"file": ("w.csv", _whatif_csv(), "text/csv")},
        data={"target_column": "Survived", "n_cases": "3"},
    )
    analysis_id = res.json()["analysisId"]
    bad = client.post(
        "/retrain",
        json={
            "analysis_id": analysis_id,
            "model_type": "random_forest",
            "params": {"n_estimators": 100000},
        },
    )
    assert bad.status_code == 400, bad.text


def test_retrain_unknown_analysis_id_404():
    res = TestClient(app).post(
        "/retrain",
        json={"analysis_id": "does-not-exist", "model_type": "random_forest", "params": {}},
    )
    assert res.status_code == 404, res.text


def test_columns_flags_numeric():
    res = TestClient(app).post("/columns", files={"file": ("t.csv", CSV, "text/csv")})
    cols = {c["name"]: c["isNumeric"] for c in res.json()["columns"]}
    assert cols == {
        "Survived": True,
        "Pclass": True,
        "Sex": False,
        "Age": True,
        "Fare": True,
    }


# a numeric target with a clear near-linear signal (price ~ size + a bit of
# noise) and 60 distinct values - well above MIN_REGRESSION_UNIQUE
def _regression_csv() -> bytes:
    rows = ["Size,Rooms,Price"]
    for i in range(60):
        size = 20 + i * 3
        rooms = 1 + i % 5
        price = size * 1000 + rooms * 5000 + (i % 7) * 300
        rows.append(f"{size},{rooms},{price}")
    return chr(10).join(rows).encode()


def test_analyze_regression_target():
    client = TestClient(app)
    res = client.post(
        "/analyze",
        files={"file": ("house.csv", _regression_csv(), "text/csv")},
        data={"target_column": "Price", "n_cases": "5", "task_type": "regression"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["taskType"] == "regression"
    assert "positiveLabel" not in body
    assert 0.0 <= body["modelAccuracy"] <= 1.0  # R² on this near-linear signal
    assert body["modelQuality"]["verdict"] in {"good", "fair", "weak"}
    assert len(body["cases"]) == 5
    case = body["cases"][0]
    assert {"predictedValue", "actualValue", "residual"} <= set(case)
    assert "analysisId" in body
    assert "partialDependence" in body


def test_analyze_regression_rejects_low_cardinality_target():
    # Rooms only has 5 distinct values - too few to be a sane regression target
    res = TestClient(app).post(
        "/analyze",
        files={"file": ("house.csv", _regression_csv(), "text/csv")},
        data={"target_column": "Rooms", "task_type": "regression"},
    )
    assert res.status_code == 400, res.text


def test_analyze_regression_rejects_non_numeric_target():
    res = TestClient(app).post(
        "/analyze",
        files={"file": ("t.csv", CSV, "text/csv")},
        data={"target_column": "Sex", "task_type": "regression"},
    )
    assert res.status_code == 400, res.text


def test_analyze_rejects_unknown_task_type():
    res = TestClient(app).post(
        "/analyze",
        files={"file": ("t.csv", CSV, "text/csv")},
        data={"target_column": "Survived", "task_type": "nonsense"},
    )
    assert res.status_code == 400, res.text


def test_whatif_rejects_regression_analysis():
    client = TestClient(app)
    res = client.post(
        "/analyze",
        files={"file": ("house.csv", _regression_csv(), "text/csv")},
        data={"target_column": "Price", "task_type": "regression"},
    )
    analysis_id = res.json()["analysisId"]
    bad = client.post("/whatif", json={"analysis_id": analysis_id, "row": {}})
    assert bad.status_code == 400, bad.text


def test_retrain_rejects_regression_analysis():
    client = TestClient(app)
    res = client.post(
        "/analyze",
        files={"file": ("house.csv", _regression_csv(), "text/csv")},
        data={"target_column": "Price", "task_type": "regression"},
    )
    analysis_id = res.json()["analysisId"]
    bad = client.post(
        "/retrain",
        json={"analysis_id": analysis_id, "model_type": "random_forest", "params": {}},
    )
    assert bad.status_code == 400, bad.text


def test_cases_come_only_from_held_out_rows():
    # every case card, and caseStats, must be judged on rows the explained
    # model never trained on - for both task types
    import pandas as pd
    from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor

    rng = np.random.default_rng(0)
    X = pd.DataFrame({"a": rng.normal(size=300), "b": rng.normal(size=300)})
    for task, y, model in [
        ("classification", pd.Series((X["a"] > 0).astype(int)), RandomForestClassifier(n_estimators=20, random_state=0)),
        ("regression", X["a"] * 3 + rng.normal(size=300), RandomForestRegressor(n_estimators=20, random_state=0)),
    ]:
        model, score, stats = common.train_model(X, y, model, task_type=task)
        shap_values, fi, base = common.compute_shap(model, X)
        import tempfile, os
        with tempfile.TemporaryDirectory() as tmp:
            report = common.export_report_json(
                domain="t", target_labels=("0", "1"), model=model, X=X, y=y,
                shap_values=shap_values, feature_importance_df=fi, display_df=X,
                model_accuracy=score, eval_stats=stats, base_value=base,
                output_path=os.path.join(tmp, "r.json"), n_cases=30, task_type=task,
            )
        held = set(stats["holdout_index"])
        assert {int(c["id"]) for c in report["cases"]} <= held, task
        assert report["caseStats"]["total"] == len(held), task
        assert report["caseStats"]["heldOut"] is True


def test_training_rows_capped_and_stratified():
    # uploads train on at most TRAIN_MAX_ROWS rows (class ratio kept for
    # classification); every row outside the cap counts as held out
    import pandas as pd
    from routers import analyze as A

    n = A.TRAIN_MAX_ROWS + 1000
    X = pd.DataFrame({"a": np.arange(n) % 97})
    y = pd.Series((np.arange(n) % 10 == 0).astype(int))  # 10% positive
    X_fit, y_fit = A._cap_training_rows(X, y, "classification")
    assert len(X_fit) == A.TRAIN_MAX_ROWS
    assert abs(y_fit.mean() - 0.1) < 0.002
    held = A._held_out_index(X, X_fit, {"holdout_index": X_fit.index[:10]})
    assert len(held) == 1000 + 10

    X_r, y_r = A._cap_training_rows(X, X["a"].astype(float), "regression")
    assert len(X_r) == A.TRAIN_MAX_ROWS and (y_r.index == X_r.index).all()
    small = X.iloc[:100]
    assert A._cap_training_rows(small, y.iloc[:100], "classification")[0] is small

    # the SHAP pool is filled with held-out rows first (not left to two
    # same-seed samples overlapping)
    Xp, _, _ = A._shap_pool(X, y, X, held)
    assert len(Xp) == A.SHAP_MAX_ROWS
    assert Xp.index.isin(held).sum() == min(len(held), A.SHAP_MAX_ROWS)


def test_retrain_defaults_match_base_model_unless_sent():
    # a param left out uses the whitelist default (depth 8 like the base
    # analysis, not sklearn's unbounded depth); a sent value is kept as-is
    from routers import analyze as A

    client = TestClient(app)
    body = client.post(
        "/analyze",
        files={"file": ("w.csv", _whatif_csv(), "text/csv")},
        data={"target_column": "Survived", "n_cases": "5"},
    ).json()

    def retrained_model(model_type, params):
        res = client.post("/retrain", json={"analysis_id": body["analysisId"], "model_type": model_type, "params": params})
        assert res.status_code == 200, res.text
        return A._ANALYSIS_CACHE[res.json()["analysisId"]]["model"]

    et = retrained_model("extra_trees", {"n_estimators": 20})
    assert (et.max_depth, et.min_samples_leaf) == (A.BASE_MAX_DEPTH, A.BASE_MIN_SAMPLES_LEAF)
    assert retrained_model("extra_trees", {"n_estimators": 20, "max_depth": 11}).max_depth == 11
    # above the memory-safe cap (MAX_FOREST_DEPTH) is refused, not silently clamped
    over = client.post("/retrain", json={"analysis_id": body["analysisId"], "model_type": "extra_trees",
                                         "params": {"max_depth": A.MAX_FOREST_DEPTH + 1}})
    assert over.status_code == 400, over.text
    assert retrained_model("gradient_boosting", {"n_estimators": 20}).max_depth == 3


def _slow_csv(n=3000) -> bytes:
    rng = np.random.default_rng(1)
    rows = ["a,b,c,d,y"]
    for _ in range(n):
        a, b, c, d = rng.normal(size=4)
        rows.append(f"{a:.4f},{b:.4f},{c:.4f},{d:.4f},{int(a + b > 0)}")
    return chr(10).join(rows).encode()


def test_health_answers_while_two_analyses_run():
    # heavy work runs off the event loop (one job at a time), so /health
    # keeps answering instantly even with two /analyze requests in flight
    import asyncio
    import time as _time
    import httpx

    async def main():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://t", timeout=300) as c:
            def analyze():
                return c.post(
                    "/analyze",
                    files={"file": ("s.csv", _slow_csv(), "text/csv")},
                    data={"target_column": "y", "n_cases": "5"},
                )

            jobs = [asyncio.create_task(analyze()), asyncio.create_task(analyze())]
            await asyncio.sleep(0.5)  # both submitted, the first is training
            latencies = []
            while not all(j.done() for j in jobs):
                t0 = _time.perf_counter()
                r = await c.get("/health")
                assert r.status_code == 200
                latencies.append(_time.perf_counter() - t0)
                await asyncio.sleep(0.2)
            results = [j.result() for j in jobs]
            return latencies, results

    latencies, results = asyncio.run(main())
    assert len(latencies) >= 3, latencies  # we really polled during the work
    assert max(latencies) < 1.0, max(latencies)
    # second one waited its turn (well under HEAVY_WAIT_SECONDS) and succeeded
    assert [r.status_code for r in results] == [200, 200], [r.text[:200] for r in results]


def test_heavy_request_gets_busy_message_when_slot_stays_taken():
    import asyncio
    from routers import analyze as A

    async def main():
        orig = A.HEAVY_WAIT_SECONDS
        A.HEAVY_WAIT_SECONDS = 0.2
        A._HEAVY_LOCK.acquire()  # someone else's long job
        try:
            async with httpx_client() as c:
                return await c.post("/whatif", json={"analysis_id": "x", "row": {}})
        finally:
            A._HEAVY_LOCK.release()
            A.HEAVY_WAIT_SECONDS = orig

    def httpx_client():
        import httpx
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t")

    res = asyncio.run(main())
    assert res.status_code == 503, res.text
    assert res.json()["detail"] == A.BUSY_MESSAGE
    assert res.headers.get("retry-after")


def test_analysis_cache_evicts_oldest_over_memory_budget():
    # a few big entries must push old ones out by size, not only by count;
    # the newest one always survives
    import pandas as pd
    from routers import analyze as A

    saved = A._ANALYSIS_CACHE.copy()
    A._ANALYSIS_CACHE.clear()
    try:
        big = pd.DataFrame({"a": np.zeros(2_000_000)})  # ~15MB
        ids = [A._cache_analysis({"model": None, "X_full": big}) for _ in range(12)]
        total = sum(e["_mb"] for e in A._ANALYSIS_CACHE.values())
        assert total <= A.ANALYSIS_CACHE_BUDGET_MB, total
        assert ids[-1] in A._ANALYSIS_CACHE and ids[0] not in A._ANALYSIS_CACHE
    finally:
        A._ANALYSIS_CACHE.clear()
        A._ANALYSIS_CACHE.update(saved)
def test_distributions_cover_every_row():
    # data tab distributions: per feature, counts + missing = all rows, and
    # (classification) the per-class split adds back up to the counts
    body = TestClient(app).post(
        "/analyze",
        files={"file": ("t.csv", CSV, "text/csv")},
        data={"target_column": "Survived", "n_cases": "5"},
    ).json()
    dists = {d["feature"]: d for d in body["distributions"]}
    assert set(dists) == {f["feature"] for f in body["featureImportance"]}
    for d in dists.values():
        assert sum(d["counts"]) + d["missing"] == 10, d
        assert [a + b for a, b in zip(*d["byClass"])] == d["counts"], d
        assert d["kind"] in {"numeric", "category"}
    assert dists["Sex"]["kind"] == "category"


if __name__ == "__main__":
    test_analyze_returns_report()
    test_columns_returns_row_count()
    test_analyze_drops_constant_column_from_raw()
    test_pick_case_indices_focus()
    test_case_focus_rejects_unknown_value()
    test_analyze_flags_suspect_zeros()
    test_wrong_feature_importance_matches_wrong_count()
    test_partial_dependence_covers_top_features()
    test_whatif_updates_prediction_for_edited_row()
    test_whatif_unknown_analysis_id_404()
    test_model_types_lists_whitelist()
    test_retrain_with_different_model()
    test_retrain_rejects_unknown_model_type()
    test_retrain_rejects_out_of_range_param()
    test_retrain_unknown_analysis_id_404()
    test_columns_flags_numeric()
    test_analyze_regression_target()
    test_analyze_regression_rejects_low_cardinality_target()
    test_analyze_regression_rejects_non_numeric_target()
    test_analyze_rejects_unknown_task_type()
    test_whatif_rejects_regression_analysis()
    test_retrain_rejects_regression_analysis()
    test_cases_come_only_from_held_out_rows()
    test_training_rows_capped_and_stratified()
    test_retrain_defaults_match_base_model_unless_sent()
    test_health_answers_while_two_analyses_run()
    test_heavy_request_gets_busy_message_when_slot_stays_taken()
    test_analysis_cache_evicts_oldest_over_memory_budget()
    test_distributions_cover_every_row()
    print("ok")
