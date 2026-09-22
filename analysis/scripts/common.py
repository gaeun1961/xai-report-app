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
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.inspection import partial_dependence
from sklearn.metrics import accuracy_score, r2_score, recall_score
from sklearn.model_selection import (
    KFold,
    StratifiedKFold,
    cross_val_predict,
    train_test_split,
)

RANDOM_STATE = 42


def _is_id_like(series: pd.Series, n_rows: int) -> bool:
    """Every row has a distinct value - the hallmark of an identifier column
    (PassengerId, CustomerID, ...) that carries no learnable signal itself.

    Only meaningful for non-numeric columns: a numeric column that happens to
    be all-unique (Fare with cents, a precise measurement, ...) is still a
    perfectly informative continuous feature - dropping it here would silently
    cripple exactly the columns regression targets tend to correlate with
    most, and already quietly did the same to classification on small
    datasets where a numeric feature coincidentally had no duplicate values.
    """
    if pd.api.types.is_numeric_dtype(series):
        return False
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


def load_and_preprocess(csv_path: str, target_column: str, task_type: str = "classification"):
    """Load a CSV and split it into a model-ready feature matrix and target.

    Returns:
        X: numeric-encoded feature DataFrame ready for RandomForest/SHAP.
        y: 0/1 target Series for classification, plain numeric Series for
            regression (task_type="regression" - target_column's own values,
            coerced to numeric, no binary encoding).
        display_df: same rows/columns as X, but with human-readable values
            (pre-encoding) for use when rendering individual case reports.
        target_labels: (negative_label, positive_label) as they appeared in
            the CSV, for showing the dataset's own wording in the report.
            None for regression (there's no fixed pair of classes).
        raw_df: the unmodified CSV as loaded (columns stripped only), for
            callers that need missingness/outlier stats on the original
            data — avoids re-reading the same CSV a second time.
    """
    df = pd.read_csv(csv_path)
    df.columns = df.columns.str.strip()

    if target_column not in df.columns:
        raise ValueError(
            f"target_column '{target_column}' not found in {csv_path}. "
            f"Available columns: {list(df.columns)}"
        )

    if task_type == "regression":
        y = pd.to_numeric(df[target_column], errors="coerce")
        if y.isna().any():
            raise ValueError(
                f"target_column '{target_column}' has non-numeric values, "
                "can't use it as a regression target."
            )
        target_labels = None
    else:
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

    return X, y, display_df, target_labels, df


def train_model(X: pd.DataFrame, y: pd.Series, model=None, task_type: str = "classification"):
    """Fit `model` (default: a 300-tree RandomForest) and score it.

    Classification: accuracy and minority-class recall via 5-fold stratified
    CV (a single 80/20 split is too noisy at this dataset size to trust the
    reported number). Regression: R² and RMSE via plain 5-fold CV - R²'s own
    baseline is exactly 0 (the score a model that always predicts the mean
    gets, by construction), so no separate baseline model is needed the way
    classification needs the majority-class baseline.

    The returned model itself is fit on an 80% train split in both cases -
    that's the one SHAP explains and cases are drawn from.

    Returns (model, cv_score, eval_stats). cv_score is accuracy for
    classification, R² for regression.
    """
    if task_type == "regression":
        if model is None:
            model = RandomForestRegressor(n_estimators=300, random_state=RANDOM_STATE)

        cv = KFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
        oof = cross_val_predict(clone(model), X, y, cv=cv)
        r2 = float(r2_score(y, oof))
        rmse = float(np.sqrt(np.mean((y.to_numpy() - oof) ** 2)))

        X_train, _, y_train, _ = train_test_split(
            X, y, test_size=0.2, random_state=RANDOM_STATE
        )
        model.fit(X_train, y_train)

        eval_stats = {"r2": r2, "rmse": rmse}
        return model, r2, eval_stats

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


def _judge_model_quality_regression(r2: float, rmse: float):
    """Regression counterpart of _judge_model_quality. R²'s own baseline is
    exactly 0 (a model that always predicts the mean scores R²=0 by
    construction) so, unlike classification, no separate baseline model needs
    computing.

    ponytail: the 0.7/0.3 cutoffs are a common rule-of-thumb, not yet
    calibrated against a real dataset the way classification's
    "baseline + 2%p" threshold was checked against this project's actual
    presets - worth revisiting once a real regression dataset is in hand.
    """
    common = {"rmse": rmse}
    if r2 >= 0.7:
        return {
            "verdict": "good",
            "message": f"이 모델은 평균으로만 예측하는 것보다 훨씬 정확해요 (R²={r2:.2f}).",
            **common,
        }
    if r2 >= 0.3:
        return {
            "verdict": "fair",
            "message": f"이 모델은 평균으로만 예측하는 것보다는 낫지만, 오차가 꽤 있어요 (R²={r2:.2f}).",
            **common,
        }
    return {
        "verdict": "weak",
        "message": f"이 모델은 평균으로 찍는 것과 큰 차이가 없어요 (R²={r2:.2f}).",
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


OUTLIER_SAMPLE_CAP = 20


def compute_outliers(raw_df: pd.DataFrame, numeric_cols) -> tuple:
    """Per-numeric-feature outlier stats via the classic IQR fence (outside
    Q1 - 1.5*IQR .. Q3 + 1.5*IQR). A light, well-known heuristic — no model
    involved, just a description of the raw column's own spread. Returns the
    five-number summary plus whisker bounds (the most extreme non-outlier
    values) so the frontend can draw an actual box plot instead of just a
    count; outlierSample caps how many raw outlier values it ships (a column
    that's mostly outliers — e.g. a near-constant binary column — shouldn't
    balloon the JSON).

    Columns with at most 2 distinct values (a 0/1 flag, or nothing valid at
    all) are skipped entirely: a box plot has nothing meaningful to show for
    them — depending on the split it either fills the whole box (both
    quartiles land on the same two values) or collapses to a point with the
    minority class flagged as a bogus "outlier". Neither is a real
    data-quality signal, so rather than show a technically-correct-but-
    misleading chart, we just don't report on those columns here.

    Returns (rows, excluded_columns) — excluded_columns lists exactly which
    ones got skipped for that reason, so a caller can explain the omission
    instead of silently dropping them."""
    n = len(raw_df)
    rows = []
    excluded = []
    for col in numeric_cols:
        series = pd.to_numeric(raw_df[col], errors="coerce").dropna()
        if series.nunique() <= 2:
            excluded.append(col)
            continue
        q1, med, q3 = series.quantile([0.25, 0.5, 0.75])
        iqr = q3 - q1
        lo, hi = q1 - IQR_MULTIPLIER * iqr, q3 + IQR_MULTIPLIER * iqr
        is_outlier = (series < lo) | (series > hi)
        inliers = series[~is_outlier]
        outlier_vals = series[is_outlier]
        n_out = int(is_outlier.sum())
        sample = (
            outlier_vals.sample(
                n=min(OUTLIER_SAMPLE_CAP, n_out), random_state=RANDOM_STATE
            ).tolist()
            if n_out
            else []
        )
        rows.append(
            {
                "column": col,
                "outlierCount": n_out,
                "outlierPct": round(n_out / n, 4) if n else 0.0,
                "min": round(float(series.min()), 4),
                "q1": round(float(q1), 4),
                "median": round(float(med), 4),
                "q3": round(float(q3), 4),
                "max": round(float(series.max()), 4),
                "whiskerLow": round(
                    float(inliers.min()) if len(inliers) else float(series.min()), 4
                ),
                "whiskerHigh": round(
                    float(inliers.max()) if len(inliers) else float(series.max()), 4
                ),
                "outlierSample": [round(float(v), 4) for v in sample],
            }
        )
    return rows, excluded


SUSPECT_ZERO_MIN_NONZERO = 10
SUSPECT_ZERO_MIN_MEDIAN = 10


def compute_suspect_zeros(raw_df: pd.DataFrame, numeric_cols) -> list:
    """Numeric columns where 0 looks like a "not measured" placeholder rather
    than a real value — e.g. heart.csv's Cholesterol=0 / RestingBP=0, which
    isn't NaN so compute_missingness can't see it.

    The test is domain-agnostic: drop the zeros, then ask whether 0 sits
    below the IQR lower fence (Q1 - 1.5*IQR) of what's left. Cholesterol's
    other values run ~130-600, so a 0 is far outside; but a column where 0 is
    a plain real value (Oldpeak, Titanic Fare, years-at-company) has a fence
    at or below 0, so it isn't flagged. Binary columns are skipped (0/1 flags
    are legitimately zero). Only a hint — nothing is imputed or excluded."""
    n = len(raw_df)
    rows = []
    for col in numeric_cols:
        series = pd.to_numeric(raw_df[col], errors="coerce").dropna()
        if series.nunique() <= 2:
            continue
        zeros = int((series == 0).sum())
        nonzero = series[series != 0]
        if zeros == 0 or len(nonzero) < SUSPECT_ZERO_MIN_NONZERO:
            continue
        q1, q3 = nonzero.quantile([0.25, 0.75])
        iqr = q3 - q1
        fence = q1 - IQR_MULTIPLIER * iqr
        # two extra guards against small-integer columns where 0 is just the
        # bottom of a scale (category codes, "times trained last year"): the
        # smallest non-zero value must sit more than one IQR away from 0
        # (a real gap, not the next step up), and typical values must be big
        # enough (median >= 10) for a 0 to be implausible rather than ordinary
        if (
            fence > 0
            and nonzero.min() > iqr
            and nonzero.median() >= SUSPECT_ZERO_MIN_MEDIAN
        ):
            rows.append(
                {
                    "column": col,
                    "zeroCount": zeros,
                    "zeroPct": round(zeros / n, 4) if n else 0.0,
                    "lowerFence": round(float(fence), 4),
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
    """Compute SHAP values (for the positive class on a classifier, or the
    predicted value itself on a regressor), a ranked feature-importance
    table, and the model's base value (E[prediction] before any feature is
    considered — the report uses it to explain why the top-5 factors alone
    don't always match the final prediction)."""
    is_classifier = hasattr(model, "predict_proba")
    explainer = shap.TreeExplainer(model)
    raw = explainer.shap_values(X, check_additivity=False)

    if not is_classifier:
        # regressor: shap_values(X) is already a plain (n_samples, n_features)
        # array - no per-class dimension to pick out
        shap_values = np.asarray(raw)
    elif isinstance(raw, list):
        shap_values = raw[1] if len(raw) > 1 else raw[0]
    else:
        arr = np.asarray(raw)
        shap_values = arr[:, :, 1] if arr.ndim == 3 and arr.shape[2] > 1 else arr

    ev = np.atleast_1d(explainer.expected_value)
    base_value = float(ev[1] if is_classifier and len(ev) > 1 else ev[0])

    feature_importance_df = (
        pd.DataFrame({"feature": X.columns, "importance": np.abs(shap_values).mean(axis=0)})
        .sort_values("importance", ascending=False)
        .reset_index(drop=True)
    )
    return shap_values, feature_importance_df, base_value


PDP_TOP_N = 6
PDP_GRID_POINTS = 8


def compute_partial_dependence(
    model, X: pd.DataFrame, display_df: pd.DataFrame, feature_importance_df: pd.DataFrame
) -> list:
    """For each of the top PDP_TOP_N features (by SHAP importance), compute
    how the average predicted P(positive) moves as that feature's value
    changes, holding every other feature at its observed value (a standard
    partial dependence plot, via sklearn - no new dependency).

    Categorical columns are label-encoded (factorized) in X but shown to the
    reader via display_df's original strings, so the encoded grid points are
    mapped back through a code->label dict built by zipping the two - no
    encoder object needs to be threaded through from load_and_preprocess.
    """
    numeric_cols = set(display_df.select_dtypes(include="number").columns)
    top_features = list(feature_importance_df["feature"].head(PDP_TOP_N))
    # float dtype avoids a scikit-learn FutureWarning (and future ValueError)
    # about integer-dtype columns in partial_dependence
    X_float = X.astype(float)

    results = []
    for feat in top_features:
        idx = list(X.columns).index(feat)
        is_categorical = feat not in numeric_cols
        # categorical: cap resolution at the category count so sklearn
        # returns the exact codes instead of interpolating between them
        resolution = (
            min(PDP_GRID_POINTS, X[feat].nunique()) if is_categorical else PDP_GRID_POINTS
        )
        pdp = partial_dependence(model, X_float, [idx], grid_resolution=resolution, kind="average")
        grid = pdp["grid_values"][0]
        avg = pdp["average"][0]

        if is_categorical:
            code_to_label = dict(zip(X[feat], display_df[feat]))
            points = [
                {"value": code_to_label.get(int(round(g)), str(g)), "proba": round(float(a), 4)}
                for g, a in zip(grid, avg)
            ]
        else:
            points = [
                {"value": round(float(g), 4), "proba": round(float(a), 4)}
                for g, a in zip(grid, avg)
            ]
        results.append({"feature": feat, "points": points})

    return results


TYPICAL_SHARE = 0.8  # per class: 80% confident/typical rows, 20% borderline


def _pick_case_indices(
    predictions: np.ndarray,
    proba_pos: np.ndarray,
    n_cases: int,
    actual: np.ndarray = None,
    focus: str = "balanced",
) -> list:
    """Pick which rows become cases in the report.

    focus="balanced" (default): an even split across predicted classes, and
    within each class ~80% of the slots go to 'typical' rows the model is
    most confident about, ~20% to 'borderline' rows whose probability sits
    nearest 0.5 (so the default view reads as trustworthy as the accuracy
    implies; the borderline ones stay reachable via the confidence filter).
    Deterministic (sorted by confidence, no sampling).

    focus="wrong": the model's mistakes first (most-confidently-wrong first —
    those are the most worth auditing), topped up with the balanced mix if
    there aren't n_cases wrong predictions. Requires `actual`; silently falls
    back to "balanced" if `actual` is omitted or nothing was wrong (e.g. a
    perfect model).

    focus="borderline": probability nearest 50% first, regardless of
    predicted class or correctness — the "model couldn't decide" cases.
    """
    if focus == "borderline":
        order = np.argsort(np.abs(proba_pos - 0.5))
        return sorted(int(i) for i in order[:n_cases])

    if focus == "wrong" and actual is not None:
        wrong = np.where(predictions != actual)[0]
        if len(wrong) > 0:
            order = wrong[np.argsort(-np.abs(proba_pos[wrong] - 0.5))]
            chosen = [int(i) for i in order[:n_cases]]
            if len(chosen) < n_cases:
                for i in np.argsort(np.abs(proba_pos - 0.5)):
                    if int(i) not in chosen:
                        chosen.append(int(i))
                    if len(chosen) >= n_cases:
                        break
            return sorted(set(chosen))[:n_cases]
        # no wrong predictions at all — fall through to "balanced" below

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


def _pick_case_indices_regression(
    predictions: np.ndarray, actual: np.ndarray, n_cases: int, focus: str = "balanced"
) -> list:
    """Regression counterpart of _pick_case_indices.

    focus="wrong": worst-residual (|predicted - actual| largest) first - the
    biggest misses, most worth auditing.
    focus="balanced"/"borderline": borderline has no real regression analogue
    (there's no probability to sit near 50%) so both fall back to the same
    thing - rows spread evenly across the actual value's range, so the case
    list represents the whole target range rather than clustering at one end.
    """
    if focus == "wrong":
        order = np.argsort(-np.abs(predictions - actual))
        return sorted(int(i) for i in order[:n_cases])

    order = np.argsort(actual)
    n = len(order)
    if n <= n_cases:
        return sorted(int(i) for i in order)
    step = n / n_cases
    picks = [order[int(i * step)] for i in range(n_cases)]
    return sorted(int(i) for i in picks)


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
    target_column: str = None,
    positive_label: str = None,
    negative_label: str = None,
    eval_stats: dict = None,
    base_value: float = None,
    n_cases: int = 30,
    case_focus: str = "balanced",
    corr_max_cols: int = 12,
    missingness: list = None,
    outliers: list = None,
    outliers_excluded_columns: list = None,
    task_type: str = "classification",
):
    """Assemble a ShapReport-shaped dict (see web/lib/types.ts) and write it
    to output_path as JSON.

    target_labels is (negative, positive) as they appeared in the CSV and is
    stored verbatim in each case's `prediction`. positive_label/negative_label
    are optional human-friendly overrides (e.g. '생존'/'사망' for a known
    preset); when omitted, a bare raw value like '1' means nothing to a
    reader, so it's prefixed with the target column name ('Survived=1')
    instead — target_column is only used for that fallback. None of this
    (target_labels/positive_label/negative_label) applies when
    task_type="regression" - there's no fixed pair of classes, so those
    report fields are simply omitted.
    """
    if task_type == "regression":
        return _export_regression_report(
            domain=domain,
            model=model,
            X=X,
            y=y,
            shap_values=shap_values,
            feature_importance_df=feature_importance_df,
            display_df=display_df,
            model_r2=model_accuracy,
            output_path=output_path,
            target_column=target_column,
            eval_stats=eval_stats,
            base_value=base_value,
            n_cases=n_cases,
            case_focus=case_focus,
            corr_max_cols=corr_max_cols,
            missingness=missingness,
            outliers=outliers,
            outliers_excluded_columns=outliers_excluded_columns,
        )

    predictions = model.predict(X)
    proba_pos = model.predict_proba(X)[:, 1]
    feature_names = list(X.columns)

    neg_raw, pos_raw = target_labels
    fallback = (lambda raw: f"{target_column}={raw}") if target_column else (lambda raw: raw)
    pos_display = positive_label or fallback(pos_raw)
    neg_display = negative_label or fallback(neg_raw)

    # counts over the whole pool cases are drawn from (not just the n_cases
    # actually returned as cards) - lets the frontend say "틀린 예측 12개"
    # even though only e.g. 30 case cards were loaded. 40-60% matches the
    # case_focus="borderline" wording ("확신도 애매한(40~60%) 케이스 위주")
    # elsewhere in the app, so "borderline" means the same threshold everywhere.
    actual_arr = y.to_numpy()
    case_stats = {
        "total": int(len(predictions)),
        "wrong": int((predictions != actual_arr).sum()),
        "borderline": int(((proba_pos >= 0.4) & (proba_pos <= 0.6)).sum()),
    }

    case_indices = _pick_case_indices(
        predictions, proba_pos, n_cases, actual=y.to_numpy(), focus=case_focus
    )

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
        "taskType": "classification",
        "modelAccuracy": float(model_accuracy),
        "positiveLabel": pos_display,
        "negativeLabel": neg_display,
        # raw target column/values regardless of override — lets a caller
        # build its own persistent value->meaning mapping (e.g. "Survived"
        # + "1" -> a user-typed "생존") and reuse it across uploads
        "targetColumn": target_column,
        "positiveRaw": pos_raw,
        "negativeRaw": neg_raw,
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

    report.update(
        _correlations_block(X, display_df, feature_importance_df, corr_max_cols)
    )

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

    if outliers_excluded_columns:
        report["outliersExcludedColumns"] = outliers_excluded_columns

    report["caseStats"] = case_stats

    report["partialDependence"] = compute_partial_dependence(
        model, X, display_df, feature_importance_df
    )

    # feature importance recomputed over only the wrong predictions - lets a
    # reader see "what SHAP leaned on when the model got it wrong" (may differ
    # from the overall ranking). Omitted for a perfect model (nothing wrong).
    wrong_mask = predictions != actual_arr
    if wrong_mask.any():
        wrong_importance = np.abs(shap_values[wrong_mask]).mean(axis=0)
        wrong_fi = sorted(zip(feature_names, wrong_importance), key=lambda t: -t[1])
        report["wrongFeatureImportance"] = [
            {"feature": f, "importance": round(float(v), 5)} for f, v in wrong_fi
        ]

    _write_report_json(report, output_path)
    return report


def _correlations_block(X, display_df, feature_importance_df, corr_max_cols):
    """Shared by both the classification and regression report paths —
    correlations are model-independent (just how the raw numeric columns
    move together), so nothing here depends on task_type."""
    numeric_cols = display_df.select_dtypes(include="number").columns.tolist()
    fi_order = list(feature_importance_df["feature"])
    corr_cols = [c for c in fi_order if c in numeric_cols][:corr_max_cols]
    corr_cols += [c for c in numeric_cols if c not in corr_cols][
        : max(0, corr_max_cols - len(corr_cols))
    ]
    if len(corr_cols) < 2:
        return {}
    corr = X[corr_cols].corr().round(3)
    return {
        "correlations": {
            "columns": corr_cols,
            "matrix": [[float(v) for v in row] for row in corr.to_numpy()],
        }
    }


def _write_report_json(report: dict, output_path: str):
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2, default=_json_default)


def _export_regression_report(
    domain,
    model,
    X,
    y,
    shap_values,
    feature_importance_df,
    display_df,
    model_r2,
    output_path,
    target_column,
    eval_stats,
    base_value,
    n_cases,
    case_focus,
    corr_max_cols,
    missingness,
    outliers,
    outliers_excluded_columns,
):
    """Regression counterpart of export_report_json's classification path.
    No positive/negative classes, no probability - cases carry a predicted
    value, the actual value, and their residual instead.

    ponytail: "large error" (case_stats.wrong / wrongFeatureImportance) uses
    the same IQR-outlier rule as compute_outliers, applied to |residual|
    across the whole pool - reused rather than inventing a second threshold
    rule, but not yet validated against a real regression dataset the way
    the classification thresholds were checked against this project's
    presets. "borderline" has no regression analogue (there's no probability
    to sit near 50%), so it's always 0 for now.
    """
    predictions = np.asarray(model.predict(X), dtype=float)
    feature_names = list(X.columns)
    actual_arr = y.to_numpy(dtype=float)
    residual = predictions - actual_arr
    abs_residual = np.abs(residual)

    q1, q3 = np.percentile(abs_residual, [25, 75])
    iqr = q3 - q1
    large_error_threshold = q3 + IQR_MULTIPLIER * iqr
    wrong_mask = abs_residual > large_error_threshold if iqr > 0 else np.zeros_like(abs_residual, dtype=bool)

    case_stats = {
        "total": int(len(predictions)),
        "wrong": int(wrong_mask.sum()),
        "borderline": 0,
    }

    case_indices = _pick_case_indices_regression(
        predictions, actual_arr, n_cases, focus=case_focus if case_focus != "borderline" else "balanced"
    )

    cases = []
    for idx in case_indices:
        row_shap = shap_values[idx]
        ranked = np.argsort(-np.abs(row_shap))
        top_features = [
            {
                "feature": feature_names[j],
                "value": display_df.iloc[idx][feature_names[j]],
                "contribution": round(float(row_shap[j]), 4),
            }
            for j in ranked
        ]
        pred_v, actual_v = float(predictions[idx]), float(actual_arr[idx])
        explanation = (
            f"모델은 이 케이스의 값을 {pred_v:.3g}(으)로 예측했습니다 "
            f"(실제값 {actual_v:.3g})."
        )
        cases.append(
            {
                "id": str(display_df.index[idx]),
                "predictedValue": round(pred_v, 4),
                "actualValue": round(actual_v, 4),
                "residual": round(pred_v - actual_v, 4),
                "isCorrect": not bool(wrong_mask[idx]),
                "explanation": explanation,
                "topFeatures": top_features,
            }
        )

    report = {
        "domain": domain,
        "taskType": "regression",
        "modelAccuracy": float(model_r2),
        "targetColumn": target_column,
        "featureImportance": [
            {"feature": row.feature, "importance": round(float(row.importance), 5)}
            for row in feature_importance_df.itertuples()
        ],
        "cases": cases,
    }

    if base_value is not None:
        report["baseValue"] = round(float(base_value), 4)

    report.update(
        _correlations_block(X, display_df, feature_importance_df, corr_max_cols)
    )

    if eval_stats is not None:
        report["modelQuality"] = _judge_model_quality_regression(
            float(model_r2), eval_stats["rmse"]
        )

    if missingness is not None:
        report["missingness"] = missingness

    if outliers is not None:
        report["outliers"] = outliers

    if outliers_excluded_columns:
        report["outliersExcludedColumns"] = outliers_excluded_columns

    report["caseStats"] = case_stats

    report["partialDependence"] = compute_partial_dependence(
        model, X, display_df, feature_importance_df
    )

    if wrong_mask.any():
        wrong_importance = np.abs(shap_values[wrong_mask]).mean(axis=0)
        wrong_fi = sorted(zip(feature_names, wrong_importance), key=lambda t: -t[1])
        report["wrongFeatureImportance"] = [
            {"feature": f, "importance": round(float(v), 5)} for f, v in wrong_fi
        ]

    _write_report_json(report, output_path)
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
    # a numeric column that's all-unique (a real, informative continuous
    # feature) must survive; a non-numeric all-unique column (a genuine ID)
    # should still be dropped
    assert _is_id_like(pd.Series([1.1, 2.2, 3.3, 4.4]), 4) is False
    assert _is_id_like(pd.Series(["a", "b", "c", "d"]), 4) is True

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

    outliers, excluded = compute_outliers(df, ["a"])
    o = outliers[0]
    assert o["outlierCount"] == 1
    assert o["min"] == 1 and o["max"] == 100
    assert o["q1"] == 1.75 and o["q3"] == 28
    # 100 is the outlier, so the whisker high is the most extreme non-outlier (4)
    assert o["whiskerHigh"] == 4, o
    assert o["outlierSample"] == [100], o
    assert excluded == []

    # binary numeric columns (e.g. a 0/1 flag) are skipped entirely — a box
    # plot can't show anything meaningful for only 2 distinct values — but
    # reported back in excluded_columns so a caller can explain the omission
    df_binary = pd.DataFrame({"flag": [0, 0, 0, 1, 1]})
    rows_b, excluded_b = compute_outliers(df_binary, ["flag"])
    assert rows_b == [] and excluded_b == ["flag"], (rows_b, excluded_b)

    # blank-string "missing" (Telco's TotalCharges quirk): a mostly-clean
    # numeric column (>=95% parse rate) should get its blanks coerced to NaN
    # and counted, not silently ignored by isna() on the raw object dtype.
    df2 = pd.DataFrame({"c": [str(i) + ".5" for i in range(20)] + [""]})
    counts2 = {r["column"]: r["missingCount"] for r in compute_missingness(df2, ["c"])}
    assert counts2 == {"c": 1}, counts2
    # hidden missing: 0 far below the non-zero values (Cholesterol-style) is
    # flagged, but a column where 0 is an ordinary value (Oldpeak/Fare-style)
    # and a 0/1 flag are not
    chol = [0] * 6 + [200, 210, 220, 230, 240, 250, 260, 270, 280, 290, 300, 310]
    fare = [0, 0, 5, 7, 8, 9, 10, 12, 15, 20, 30, 50, 80, 120, 60, 25, 18, 40]
    flag = [0, 1] * 9
    dfz = pd.DataFrame({"chol": chol, "fare": fare, "flag": flag})
    sz = {r["column"]: r for r in compute_suspect_zeros(dfz, ["chol", "fare", "flag"])}
    assert set(sz) == {"chol"}, sz
    assert sz["chol"]["zeroCount"] == 6

    # partial dependence: "num" is numeric (should get PDP_GRID_POINTS grid
    # points), "cat" is a 3-category factorized column (should get exactly
    # its 3 codes back, mapped to their original string labels via display_df)
    from sklearn.ensemble import RandomForestClassifier as _RFC

    rng = np.random.RandomState(0)
    n = 120
    num = rng.rand(n) * 10
    cat_labels = rng.choice(["red", "green", "blue"], size=n)
    cat_codes, cat_uniques = pd.factorize(cat_labels)
    Xd = pd.DataFrame({"num": num, "cat": cat_codes})
    y_pdp = pd.Series((num > 5).astype(int))
    m = _RFC(n_estimators=20, random_state=0).fit(Xd, y_pdp)
    display_pdp = pd.DataFrame({"num": num, "cat": cat_labels})
    fi_pdp = pd.DataFrame({"feature": ["num", "cat"], "importance": [1.0, 0.5]})
    pdp = {r["feature"]: r["points"] for r in compute_partial_dependence(m, Xd, display_pdp, fi_pdp)}
    assert set(pdp) == {"num", "cat"}, pdp
    assert len(pdp["num"]) == PDP_GRID_POINTS, pdp["num"]
    assert len(pdp["cat"]) == 3, pdp["cat"]
    assert set(p["value"] for p in pdp["cat"]) == set(cat_uniques), pdp["cat"]
    assert all(0.0 <= p["proba"] <= 1.0 for p in pdp["num"] + pdp["cat"])

    # regression: end-to-end train_model -> compute_shap -> export_report_json
    # on a synthetic dataset with a clear linear-ish signal, so R² should
    # come back high and the report shape should be regression's, not
    # classification's (no positiveLabel, cases carry predictedValue instead)
    import tempfile as _tempfile

    rng_r = np.random.RandomState(1)
    n_r = 200
    a = rng_r.rand(n_r) * 10
    b = rng_r.rand(n_r) * 5
    target = 3 * a - 2 * b + rng_r.normal(0, 0.5, n_r)
    X_r = pd.DataFrame({"a": a, "b": b})
    y_r = pd.Series(target, name="target")
    display_r = X_r.copy()

    model_r, r2, eval_stats_r = train_model(X_r, y_r, task_type="regression")
    assert r2 > 0.8, r2  # near-linear synthetic signal - should fit easily
    assert "rmse" in eval_stats_r

    shap_r, fi_r, base_r = compute_shap(model_r, X_r)
    assert shap_r.shape == (n_r, 2), shap_r.shape

    with _tempfile.TemporaryDirectory() as tmp_r:
        out_r = Path(tmp_r) / "r.json"
        report_r = export_report_json(
            domain="reg-demo",
            model=model_r,
            X=X_r,
            y=y_r,
            shap_values=shap_r,
            feature_importance_df=fi_r,
            display_df=display_r,
            model_accuracy=r2,
            output_path=out_r,
            eval_stats=eval_stats_r,
            base_value=base_r,
            n_cases=5,
            task_type="regression",
        )
    assert report_r["taskType"] == "regression"
    assert "positiveLabel" not in report_r
    assert len(report_r["cases"]) == 5
    c0 = report_r["cases"][0]
    assert {"predictedValue", "actualValue", "residual"} <= set(c0)
    assert report_r["modelQuality"]["verdict"] in {"good", "fair", "weak"}

    print("common._demo: ok")


if __name__ == "__main__":
    _demo()
