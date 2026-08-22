"""Shared training + SHAP pipeline for all binary-classification domains.

Every function takes the target column name as an argument so no dataset's
column names are ever hardcoded here.
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
import shap
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split

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


def load_and_preprocess(csv_path: str, target_column: str):
    """Load a CSV and split it into a model-ready feature matrix and target.

    Returns:
        X: numeric-encoded feature DataFrame ready for RandomForest/SHAP.
        y: 0/1 target Series.
        display_df: same rows/columns as X, but with human-readable values
            (pre-encoding) for use when rendering individual case reports.
    """
    df = pd.read_csv(csv_path)
    df.columns = df.columns.str.strip()

    if target_column not in df.columns:
        raise ValueError(
            f"target_column '{target_column}' not found in {csv_path}. "
            f"Available columns: {list(df.columns)}"
        )

    y = _encode_binary_target(df[target_column])
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

    return X, y, display_df


def train_model(X: pd.DataFrame, y: pd.Series):
    """Train a baseline RandomForest classifier and report holdout accuracy."""
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_STATE, stratify=y
    )
    model = RandomForestClassifier(n_estimators=300, random_state=RANDOM_STATE)
    model.fit(X_train, y_train)
    accuracy = accuracy_score(y_test, model.predict(X_test))
    return model, accuracy


def compute_shap(model, X: pd.DataFrame):
    """Compute SHAP values for the positive class plus a ranked feature-
    importance table."""
    explainer = shap.TreeExplainer(model)
    raw = explainer.shap_values(X)

    if isinstance(raw, list):
        shap_values = raw[1] if len(raw) > 1 else raw[0]
    else:
        arr = np.asarray(raw)
        shap_values = arr[:, :, 1] if arr.ndim == 3 and arr.shape[2] > 1 else arr

    feature_importance_df = (
        pd.DataFrame({"feature": X.columns, "importance": np.abs(shap_values).mean(axis=0)})
        .sort_values("importance", ascending=False)
        .reset_index(drop=True)
    )
    return shap_values, feature_importance_df


def _pick_case_indices(y: pd.Series, predictions: np.ndarray, n_cases: int) -> list:
    """Sample a representative mix of predicted-positive and predicted-negative
    cases so the report doesn't show only one outcome."""
    rng = np.random.default_rng(RANDOM_STATE)
    positive_idx = np.where(predictions == 1)[0]
    negative_idx = np.where(predictions == 0)[0]

    half = n_cases // 2
    chosen = []
    for pool, count in ((positive_idx, half), (negative_idx, n_cases - half)):
        if len(pool) == 0:
            continue
        take = min(count, len(pool))
        chosen.extend(rng.choice(pool, size=take, replace=False))

    remaining = n_cases - len(chosen)
    if remaining > 0:
        leftover = [i for i in range(len(predictions)) if i not in chosen]
        chosen.extend(rng.choice(leftover, size=min(remaining, len(leftover)), replace=False))

    return sorted(int(i) for i in chosen)


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
    n_cases: int = 8,
    top_features_per_case: int = 5,
    top_features_overall: int = 15,
):
    """Assemble a ShapReport-shaped dict (see web/lib/types.ts) and write it
    to output_path as JSON."""
    predictions = model.predict(X)
    feature_names = list(X.columns)

    case_indices = _pick_case_indices(y, predictions, n_cases)

    cases = []
    for idx in case_indices:
        row_shap = shap_values[idx]
        ranked = np.argsort(-np.abs(row_shap))[:top_features_per_case]
        top_features = [
            {
                "feature": feature_names[j],
                "value": display_df.iloc[idx][feature_names[j]],
                "contribution": float(row_shap[j]),
            }
            for j in ranked
        ]
        prediction_label = "Yes" if predictions[idx] == 1 else "No"
        feature_summary = ", ".join(
            f"{tf['feature']}={tf['value']} (기여도 {tf['contribution']:+.3f})" for tf in top_features
        )
        explanation = (
            f"모델은 이 케이스를 '{prediction_label}'로 예측했습니다. "
            f"주요 근거: {feature_summary}."
        )
        cases.append(
            {
                "id": str(display_df.index[idx]),
                "prediction": prediction_label,
                "explanation": explanation,
                "topFeatures": top_features,
            }
        )

    report = {
        "domain": domain,
        "modelAccuracy": float(model_accuracy),
        "featureImportance": [
            {"feature": row.feature, "importance": float(row.importance)}
            for row in feature_importance_df.head(top_features_overall).itertuples()
        ],
        "cases": cases,
    }

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
