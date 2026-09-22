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


if __name__ == "__main__":
    test_analyze_returns_report()
    test_columns_returns_row_count()
    test_analyze_drops_constant_column_from_raw()
    test_pick_case_indices_focus()
    test_case_focus_rejects_unknown_value()
    test_analyze_flags_suspect_zeros()
    print("ok")
