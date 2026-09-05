"""Shared training + SHAP pipeline for all binary-classification domains.

Every function takes the target column name as an argument so no dataset's
column names are ever hardcoded here.
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
import shap
from sklearn.base import clone
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, recall_score
from sklearn.model_selection import (
    StratifiedKFold,
    cross_val_predict,
    train_test_split,
)

RANDOM_STATE = 42


def _is_id_like(series: pd.Series, n_rows: int) -> bool:
    return series.nunique(dropna=True) == n_rows


def _is_constant(series: pd.Series) -> bool:
    return series.nunique(dropna=True) <= 1


def _coerce_numeric_like_strings(series: pd.Series) -> pd.Series:
    """Turn object columns that are 'really' numeric (e.g. numbers stored as
    strings with stray blanks) into numeric dtype. Non-numeric categorical
    columns are returned unchanged."""
    non_null = series.notna().sum()
    if non_null == 0:
        return series
    coerced = pd.to_numeric(series.astype(str).str.strip(), errors="coerce")
    if coerced.notna().sum() / non_null >= 0.95:
        return coerced
    return series


def _encode_binary_target(y_raw: pd.Series) -> pd.Series:
    if pd.api.types.is_numeric_dtype(y_raw):
        return y_raw.astype(int)

    normalized = y_raw.astype(str).str.strip().str.lower()
    positive = {"yes", "y", "1", "true", "survived"}
    negative = {"no", "n", "0", "false", "died"}

    if set(normalized.unique()) <= (positive | negative):
        return normalized.map(lambda v: 1 if v in positive else 0).astype(int)

    codes, _ = pd.factorize(normalized, sort=True)
    return pd.Series(codes, index=y_raw.index).astype(int)


def _raw_class_labels(y_raw: pd.Series, y_encoded: pd.Series) -> tuple:
    """Representative original (pre-encoding) label for class 0 and class 1,
    so a report can show the CSV's own words instead of a forced 'Yes'/'No'.
    Falls back to '0'/'1' if a class somehow has no rows."""
    raw = y_raw.astype(str).str.strip()
    mask = y_encoded.to_numpy()

    def pick(cls: int, fallback: str) -> str:
        vals = raw[mask == cls]
        return str(vals.mode().iloc[0]) if not vals.empty else fallback

    return pick(0, "0"), pick(1, "1")


def load_and_preprocess(csv_path: str, target_column: str):
    """Load a CSV and split it into a model-ready feature matrix and target.

    Returns:
        X: numeric-encoded feature DataFrame ready for RandomForest/SHAP.
        y: 0/1 target Series.
        display_df: same rows/columns as X, but with human-readable values
            (pre-encoding) for use when rendering individual case reports.
        target_labels: (negative_label, positive_label) as they appeared in
            the CSV, for showing the dataset's own wording in the report.
    """
    df = pd.read_csv(csv_path)
    df.columns = df.columns.str.strip()

    if target_column not in df.columns:
        raise ValueError(
            f"target_column '{target_column}' not found in {csv_path}. "
            f"Available columns: {list(df.columns)}"
        )

    y = _encode_binary_target(df[target_column])
    target_labels = _raw_class_labels(df[target_column], y)
    X = df.drop(columns=[target_column])
    n_rows = len(X)

    drop_cols = [c for c in X.columns if _is_id_like(X[c], n_rows) or _is_constant(X[c])]
    X = X.drop(columns=drop_cols)

    for col in X.select_dtypes(include="object").columns:
        X[col] = _coerce_numeric_like_strings(X[col])

    numeric_cols = X.select_dtypes(include="number").columns.tolist()
    categorical_cols = [c for c in X.columns if c not in numeric_cols]

    display_df = X.copy()

    for col in numeric_cols:
        X[col] = X[col].fillna(X[col].median())

    for col in categorical_cols:
        X[col] = X[col].astype(str).replace("nan", "missing").fillna("missing")
        display_df[col] = X[col]
        X[col], _ = pd.factorize(X[col])

    return X, y, display_df, target_labels


def train_model(X: pd.DataFrame, y: pd.Series, model=None):
    """Fit `model` (default: a 300-tree RandomForest) and score it.

    Accuracy and minority-class recall are estimated with 5-fold cross-
    validation (a single 80/20 split is too noisy at this dataset size to
    trust the reported number). The returned model itself is fit on an 80%
    train split — that's the one SHAP explains and cases are drawn from.

    Returns (model, cv_accuracy, eval_stats).
    """
    if model is None:
        model = RandomForestClassifier(n_estimators=300, random_state=RANDOM_STATE)

    pos_rate = float(y.mean())
    minority_cls = 1 if pos_rate < 0.5 else 0

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    oof = cross_val_predict(clone(model), X, y, cv=cv)
    accuracy = accuracy_score(y, oof)
    minority_recall = float(
        recall_score(y, oof, pos_label=minority_cls, zero_division=0)
    )

    X_train, _, y_train, _ = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_STATE, stratify=y
    )
    model.fit(X_train, y_train)

    eval_stats = {
        "baseline_accuracy": max(pos_rate, 1.0 - pos_rate),
        "minority_recall": minority_recall,
        "minority_is_positive": minority_cls == 1,
    }
    return model, accuracy, eval_stats


def _judge_model_quality(accuracy, baseline_accuracy, minority_recall, minority_label):
    """Plain-language verdict on whether the model is actually useful.

    good — beats the majority-class baseline and predicts both classes.
    fair — accuracy only ~matches the baseline, but it still catches a good
           share of the rare class (a deliberate recall-focused trade-off).
    weak — no better than guessing the majority class.
    Domain-agnostic: no column/label hardcoding.
    """
    common = {
        "baselineAccuracy": baseline_accuracy,
        "minorityRecall": minority_recall,
        "minorityLabel": minority_label,
    }
    if accuracy > baseline_accuracy + 0.02 and minority_recall >= 0.2:
        return {
            "verdict": "good",
            "message": "이 모델은 baseline보다 낫고, 두 클래스 모두 어느 정도 예측하고 있어요.",
            **common,
        }
    if minority_recall >= 0.4:
        return {
            "verdict": "fair",
            "message": f"전체 정확도는 다수 클래스로 찍는 것과 비슷하지만, '{minority_label}'는 어느 정도 잡아내요.",
            **common,
        }
    return {
        "verdict": "weak",
        "message": "이 모델은 그냥 다수 클래스로 찍는 것보다 나을 게 거의 없어요.",
        **common,
    }


def compute_missingness(raw_df: pd.DataFrame, feature_cols) -> list:
    """Per-feature missing count/share, computed from the raw (pre-imputation)
    data so it reflects what load_and_preprocess actually had to fill in —
    not the already-imputed X/display_df it returns. Runs object columns
    through the same numeric-like-string coercion load_and_preprocess uses,
    so e.g. Telco's blank-string TotalCharges rows count as missing here too
    (isna() alone misses them — they're "" , not NaN)."""
    n = len(raw_df)
    rows = []
    for col in feature_cols:
        series = raw_df[col]
        if series.dtype == object:
            series = _coerce_numeric_like_strings(series)
        n_missing = int(series.isna().sum())
        rows.append(
            {
                "column": col,
                "missingCount": n_missing,
                "missingPct": round(n_missing / n, 4) if n else 0.0,
            }
        )
    return rows


IQR_MULTIPLIER = 1.5


def compute_outliers(raw_df: pd.DataFrame, numeric_cols) -> list:
    """Per-numeric-feature outlier count/share via the classic IQR fence
    (outside Q1 - 1.5*IQR .. Q3 + 1.5*IQR). A light, well-known heuristic —
    no model involved, just a description of the raw column's own spread."""
    n = len(raw_df)
    rows = []
    for col in numeric_cols:
        series = pd.to_numeric(raw_df[col], errors="coerce").dropna()
        if len(series) == 0:
            rows.append({"column": col, "outlierCount": 0, "outlierPct": 0.0})
            continue
        q1, q3 = series.quantile([0.25, 0.75])
        iqr = q3 - q1
        lo, hi = q1 - IQR_MULTIPLIER * iqr, q3 + IQR_MULTIPLIER * iqr
        n_out = int(((series < lo) | (series > hi)).sum())
        rows.append(
            {
                "column": col,
                "outlierCount": n_out,
                "outlierPct": round(n_out / n, 4) if n else 0.0,
            }
        )
    return rows


SHAP_MAX_ROWS = 2000


def sample_for_shap(X, y, display_df, max_rows=SHAP_MAX_ROWS):
    """Cap the row count fed to SHAP. Exact TreeExplainer cost is roughly
    linear in rows and explodes with tree depth, so on a large dataset with
    deep unpruned trees (e.g. Telco Churn: ~24-deep trees, ~0.5s/row) the full
    pass takes ~1h. A seeded sub-sample keeps mean(|SHAP|) importance stable
    and the 8 case rows are a tiny slice anyway. Datasets already under the
    cap (Titanic, HR) are returned untouched, so their reports don't change.
    ponytail: row cap, not tree pruning — pruning would alter every domain's model.
    """
    if len(X) <= max_rows:
        return X, y, display_df
    idx = X.sample(n=max_rows, random_state=RANDOM_STATE).index
    return X.loc[idx], y.loc[idx], display_df.loc[idx]


def compute_shap(model, X: pd.DataFrame):
    """Compute SHAP values for the positive class, a ranked feature-importance
    table, and the model's base value (E[P(positive)] before any feature is
    considered — the report uses it to explain why the top-5 factors alone
    don't always match the final prediction)."""
    explainer = shap.TreeExplainer(model)
    raw = explainer.shap_values(X)

    if isinstance(raw, list):
        shap_values = raw[1] if len(raw) > 1 else raw[0]
    else:
        arr = np.asarray(raw)
        shap_values = arr[:, :, 1] if arr.ndim == 3 and arr.shape[2] > 1 else arr

    ev = np.atleast_1d(explainer.expected_value)
    base_value = float(ev[1] if len(ev) > 1 else ev[0])

    feature_importance_df = (
        pd.DataFrame({"feature": X.columns, "importance": np.abs(shap_values).mean(axis=0)})
        .sort_values("importance", ascending=False)
        .reset_index(drop=True)
    )
    return shap_values, feature_importance_df, base_value


TYPICAL_SHARE = 0.8  # per class: 80% confident/typical rows, 20% borderline


def _pick_case_indices(predictions: np.ndarray, proba_pos: np.ndarray, n_cases: int) -> list:
    """Pick a representative case mix: an even split across predicted classes,
    and within each class ~80% of the slots go to 'typical' rows the model is
    most confident about, ~20% to 'borderline' rows whose probability sits
    nearest 0.5 (so the default view reads as trustworthy as the accuracy
    implies; the borderline ones stay reachable via the confidence filter).
    Deterministic (sorted by confidence, no sampling)."""
    per_class = max(1, n_cases // 2)
    chosen: list = []

    for cls in (1, 0):
        pool = np.where(predictions == cls)[0]
        if len(pool) == 0:
            continue
        # ascending distance from 0.5 -> borderline first, typical last
        order = pool[np.argsort(np.abs(proba_pos[pool] - 0.5))]
        take = min(per_class, len(order))
        n_typical = min(take, max(1, round(take * TYPICAL_SHARE)))
        n_border = take - n_typical
        picks = list(order[:n_border])
        picks += list(order[len(order) - n_typical:])
        chosen.extend(int(i) for i in picks)

    # top up if a class was empty / too small, keeping n_cases stable
    if len(set(chosen)) < n_cases:
        for i in np.argsort(np.abs(proba_pos - 0.5)):
            if int(i) not in chosen:
                chosen.append(int(i))
            if len(set(chosen)) >= n_cases:
                break

    return sorted(set(chosen))[:n_cases]


def export_report_json(
    domain: str,
    model,
    X: pd.DataFrame,
    y: pd.Series,
    shap_values: np.ndarray,
    feature_importance_df: pd.DataFrame,
    display_df: pd.DataFrame,
    model_accuracy: float,
    output_path: str,
    target_labels: tuple = ("0", "1"),
    positive_label: str = None,
    negative_label: str = None,
    eval_stats: dict = None,
    base_value: float = None,
    n_cases: int = 30,
    corr_max_cols: int = 12,
    missingness: list = None,
    outliers: list = None,
):
    """Assemble a ShapReport-shaped dict (see web/lib/types.ts) and write it
    to output_path as JSON.

    target_labels is (negative, positive) as they appeared in the CSV and is
    stored verbatim in each case's `prediction`. positive_label/negative_label
    are optional human-friendly overrides (e.g. '생존'/'사망' for a known
    preset); when omitted the raw CSV labels are used everywhere.
    """
    predictions = model.predict(X)
    proba_pos = model.predict_proba(X)[:, 1]
    feature_names = list(X.columns)

    neg_raw, pos_raw = target_labels
    pos_display = positive_label or pos_raw
    neg_display = negative_label or neg_raw

    case_indices = _pick_case_indices(predictions, proba_pos, n_cases)

    cases = []
    for idx in case_indices:
        row_shap = shap_values[idx]
        # every feature, |contribution| descending — the frontend shows the
        # top few and lets the user search the rest
        ranked = np.argsort(-np.abs(row_shap))
        top_features = [
            {
                "feature": feature_names[j],
                "value": display_df.iloc[idx][feature_names[j]],
                "contribution": round(float(row_shap[j]), 4),
            }
            for j in ranked
        ]
        predicted_positive = bool(predictions[idx] == 1)
        prediction_raw = pos_raw if predicted_positive else neg_raw
        prediction_display = pos_display if predicted_positive else neg_display
        actual_positive = bool(y.iloc[idx] == 1)
        actual_raw = pos_raw if actual_positive else neg_raw
        is_correct = actual_positive == predicted_positive
        confidence = proba_pos[idx] if predicted_positive else 1 - proba_pos[idx]
        explanation = (
            f"모델은 이 케이스를 '{prediction_display}'(으)로 예측했습니다 "
            f"(확신도 {confidence * 100:.0f}%)."
        )
        cases.append(
            {
                "id": str(display_df.index[idx]),
                "prediction": prediction_raw,
                "predictedPositive": predicted_positive,
                "probaPositive": round(float(proba_pos[idx]), 4),
                "actualLabel": actual_raw,
                "actualPositive": actual_positive,
                "isCorrect": is_correct,
                "explanation": explanation,
                "topFeatures": top_features,
            }
        )

    report = {
        "domain": domain,
        "modelAccuracy": float(model_accuracy),
        "positiveLabel": pos_display,
        "negativeLabel": neg_display,
        # every feature, importance descending — the frontend caps the chart but
        # uses the full order for "this factor ranks Nth overall" in search
        "featureImportance": [
            {"feature": row.feature, "importance": round(float(row.importance), 5)}
            for row in feature_importance_df.itertuples()
        ],
        "cases": cases,
    }

    if base_value is not None:
        report["baseValue"] = round(float(base_value), 4)

    # correlations between the genuinely-numeric columns (categoricals are
    # strings in display_df, so select_dtypes cleanly excludes them — same
    # spirit as the constant/ID drop in load_and_preprocess). Ordered by
    # feature importance and capped so a 30-column domain stays legible.
    numeric_cols = display_df.select_dtypes(include="number").columns.tolist()
    fi_order = list(feature_importance_df["feature"])
    corr_cols = [c for c in fi_order if c in numeric_cols][:corr_max_cols]
    corr_cols += [c for c in numeric_cols if c not in corr_cols][
        : max(0, corr_max_cols - len(corr_cols))
    ]
    if len(corr_cols) >= 2:
        corr = X[corr_cols].corr().round(3)
        report["correlations"] = {
            "columns": corr_cols,
            "matrix": [[float(v) for v in row] for row in corr.to_numpy()],
        }

    if eval_stats is not None:
        minority_label = pos_display if eval_stats["minority_is_positive"] else neg_display
        report["modelQuality"] = _judge_model_quality(
            float(model_accuracy),
            eval_stats["baseline_accuracy"],
            eval_stats["minority_recall"],
            minority_label,
        )

    if missingness is not None:
        report["missingness"] = missingness

    if outliers is not None:
        report["outliers"] = outliers

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2, default=_json_default)

    return report


def _json_default(value):
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return float(value)
    if isinstance(value, np.ndarray):
        return value.tolist()
    if pd.isna(value):
        return None
    return str(value)


def _demo():
    df = pd.DataFrame(
        {
            "a": [1, 2, None, 4, 100],  # 1 missing, 100 is an IQR outlier
            "b": ["x", "y", "x", None, "x"],  # 1 missing, not numeric
        }
    )
    missingness = compute_missingness(df, ["a", "b"])
    counts = {r["column"]: r["missingCount"] for r in missingness}
    assert counts == {"a": 1, "b": 1}, counts
    assert missingness[0]["missingPct"] == round(1 / 5, 4)

    outliers = compute_outliers(df, ["a"])
    assert outliers[0]["outlierCount"] == 1

    # blank-string "missing" (Telco's TotalCharges quirk): a mostly-clean
    # numeric column (>=95% parse rate) should get its blanks coerced to NaN
    # and counted, not silently ignored by isna() on the raw object dtype.
    df2 = pd.DataFrame({"c": [str(i) + ".5" for i in range(20)] + [""]})
    counts2 = {r["column"]: r["missingCount"] for r in compute_missingness(df2, ["c"])}
    assert counts2 == {"c": 1}, counts2
    print("common._demo: ok")


if __name__ == "__main__":
    _demo()
