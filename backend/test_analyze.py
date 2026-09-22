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
    assert len(body["cases"]) == 5
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
    # caseStats is over the full analyzed pool, not just the 5 loaded cards
    stats = body["caseStats"]
    assert stats["total"] == 10
    assert 0 <= stats["wrong"] <= 10
    assert 0 <= stats["borderline"] <= 10


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
    print("ok")
