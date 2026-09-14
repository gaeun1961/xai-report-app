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
    # raw echoes every original CSV column (incl. ones dropped as unusable
    # for modeling), so the frontend can label a case by any of them
    assert set(body["cases"][0]["raw"].keys()) == {
        "Survived", "Pclass", "Sex", "Age", "Fare",
    }


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


if __name__ == "__main__":
    test_analyze_returns_report()
    test_pick_case_indices_focus()
    test_case_focus_rejects_unknown_value()
    print("ok")
