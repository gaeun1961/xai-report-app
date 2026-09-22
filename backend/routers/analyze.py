"""CSV upload -> real-time analysis, reusing analysis/scripts/common.py as-is.

No modeling logic lives here — this module only validates the upload,
strips columns common.py isn't meant to handle, and calls the same
load_and_preprocess -> train_model -> sample_for_shap -> compute_shap ->
export_report_json pipeline the preset domains use.
"""
import io
import json
import sys
import tempfile
import uuid
from collections import OrderedDict
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sklearn.ensemble import (
    ExtraTreesClassifier,
    GradientBoostingClassifier,
    RandomForestClassifier,
    RandomForestRegressor,
)

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "analysis" / "scripts"))
import common  # noqa: E402

from . import label_suggest

router = APIRouter()

MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_ROWS = 50_000
HIGH_CARDINALITY_THRESHOLD = 50
LONG_TEXT_CHARS = 30

# What-if: /analyze keeps the trained model around (briefly, in memory) so a
# follow-up /whatif call can re-predict a tweaked row without re-training.
# ponytail: single-process in-memory OrderedDict as an LRU, no TTL - good
# enough for a demo app on a single Render instance; a restart (free-tier
# idle spindown) just empties it, and /whatif reports that as a plain error
# rather than crashing. Not shared across multiple server instances.
ANALYSIS_CACHE_MAX = 30
_ANALYSIS_CACHE: "OrderedDict[str, dict]" = OrderedDict()


def _cache_analysis(entry: dict) -> str:
    analysis_id = uuid.uuid4().hex
    _ANALYSIS_CACHE[analysis_id] = entry
    if len(_ANALYSIS_CACHE) > ANALYSIS_CACHE_MAX:
        _ANALYSIS_CACHE.popitem(last=False)
    return analysis_id


# /retrain: a fixed menu of tree-based scikit-learn classifiers, each with a
# fixed menu of numeric hyperparameters (type, min, max). This is never
# "run user code" — it's "call one of these known constructors with numbers
# we've range-checked ourselves" — so it needs no sandboxing beyond that
# validation. Kept tree-based only because SHAP explanation reuses
# shap.TreeExplainer (compute_shap); a linear/kernel model would need a
# different (and for KernelExplainer, much slower) explainer path - out of
# scope for now.
MODEL_WHITELIST = {
    "random_forest": {
        "cls": RandomForestClassifier,
        "label": "Random Forest",
        "fixed": {"class_weight": "balanced"},
        "params": {
            "n_estimators": (int, 10, 500),
            "max_depth": (int, 1, 20),
            "min_samples_leaf": (int, 1, 20),
        },
    },
    "gradient_boosting": {
        "cls": GradientBoostingClassifier,
        "label": "Gradient Boosting",
        "fixed": {},
        "params": {
            "n_estimators": (int, 10, 500),
            "max_depth": (int, 1, 10),
            "learning_rate": (float, 0.01, 1.0),
        },
    },
    "extra_trees": {
        "cls": ExtraTreesClassifier,
        "label": "Extra Trees",
        "fixed": {"class_weight": "balanced"},
        "params": {
            "n_estimators": (int, 10, 500),
            "max_depth": (int, 1, 20),
            "min_samples_leaf": (int, 1, 20),
        },
    },
}


def _validate_model_params(model_type: str, params: dict):
    spec = MODEL_WHITELIST.get(model_type)
    if spec is None:
        raise HTTPException(
            400, f"model_type은 {sorted(MODEL_WHITELIST)} 중 하나여야 해요."
        )
    allowed = spec["params"]
    unknown = set(params) - set(allowed)
    if unknown:
        raise HTTPException(400, f"허용되지 않는 파라미터예요: {sorted(unknown)}")

    validated = {}
    for key, (typ, lo, hi) in allowed.items():
        if key not in params:
            continue
        v = params[key]
        if not isinstance(v, (int, float)) or isinstance(v, bool):
            raise HTTPException(400, f"'{key}'는 숫자여야 해요.")
        if not (lo <= v <= hi):
            raise HTTPException(400, f"'{key}'는 {lo}~{hi} 범위여야 해요.")
        validated[key] = typ(v)

    return spec, validated


def _read_csv(content: bytes) -> pd.DataFrame:
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(
            400, f"파일이 너무 커요 (최대 {MAX_FILE_BYTES // (1024 * 1024)}MB)."
        )
    try:
        df = pd.read_csv(io.BytesIO(content))
    except Exception:
        raise HTTPException(400, "CSV 파일을 읽을 수 없어요. 형식을 확인해주세요.")

    df.columns = df.columns.str.strip()
    if len(df) == 0:
        raise HTTPException(400, "빈 CSV 파일이에요.")
    if len(df) > MAX_ROWS:
        raise HTTPException(400, f"행 수가 너무 많아요 (최대 {MAX_ROWS:,}행).")
    return df


def _is_date_like(series: pd.Series) -> bool:
    non_null = series.notna().sum()
    if non_null == 0:
        return False
    parsed = pd.to_datetime(series, errors="coerce", format="mixed")
    return parsed.notna().sum() / non_null >= 0.95


def _is_long_text(series: pd.Series) -> bool:
    lengths = series.dropna().astype(str).str.len()
    return len(lengths) > 0 and lengths.mean() > LONG_TEXT_CHARS


def _drop_unusable_columns(df: pd.DataFrame, target_column: str) -> pd.DataFrame:
    """Auto-exclude columns common.py's preprocessing isn't meant to handle:
    high-cardinality categoricals, free text, and dates. Numeric columns are
    always kept regardless of cardinality (e.g. Age/Fare are legitimately
    high-cardinality numeric features, not IDs)."""
    drop = []
    for col in df.columns:
        if col == target_column or pd.api.types.is_numeric_dtype(df[col]):
            continue
        series = df[col]
        if _is_date_like(series):
            drop.append(col)
        elif series.nunique(dropna=True) >= HIGH_CARDINALITY_THRESHOLD:
            drop.append(col)
        elif _is_long_text(series):
            drop.append(col)
    return df.drop(columns=drop)


# a numeric column needs at least this many distinct values to be a sane
# regression target - otherwise it's really a coded category (e.g. a 0-3
# star rating), which classification handles better. Domain-agnostic, no
# per-dataset tuning.
MIN_REGRESSION_UNIQUE = 10


@router.post("/columns")
async def get_columns(file: UploadFile = File(...)):
    df = _read_csv(await file.read())
    return {
        "columns": [
            {
                "name": col,
                "uniqueCount": int(df[col].nunique(dropna=True)),
                "isNumeric": bool(pd.api.types.is_numeric_dtype(df[col])),
            }
            for col in df.columns
        ],
        "rowCount": len(df),
    }


MIN_CASES = 1
MAX_CASES = 100
CASE_FOCUS_OPTIONS = {"balanced", "wrong", "borderline"}
TASK_TYPE_OPTIONS = {"classification", "regression"}


@router.post("/analyze")
async def analyze(
    file: UploadFile = File(...),
    target_column: str = Form(...),
    n_cases: int = Form(30),
    case_focus: str = Form("balanced"),
    task_type: str = Form("classification"),
):
    if case_focus not in CASE_FOCUS_OPTIONS:
        raise HTTPException(
            400, f"case_focus는 {sorted(CASE_FOCUS_OPTIONS)} 중 하나여야 해요."
        )
    if task_type not in TASK_TYPE_OPTIONS:
        raise HTTPException(
            400, f"task_type은 {sorted(TASK_TYPE_OPTIONS)} 중 하나여야 해요."
        )
    df = _read_csv(await file.read())

    if target_column not in df.columns:
        raise HTTPException(400, f"'{target_column}' 컬럼을 찾을 수 없어요.")

    n_unique = int(df[target_column].nunique(dropna=True))
    if task_type == "regression":
        if not pd.api.types.is_numeric_dtype(df[target_column]):
            raise HTTPException(
                400, f"'{target_column}' 컬럼은 숫자형이 아니라 회귀 타겟으로 쓸 수 없어요."
            )
        if n_unique < MIN_REGRESSION_UNIQUE:
            raise HTTPException(
                400,
                f"'{target_column}' 컬럼은 고유값이 {n_unique}개뿐이라 회귀 타겟으로 보기 "
                f"어려워요 (최소 {MIN_REGRESSION_UNIQUE}개). 분류 타겟이라면 고유값이 "
                "정확히 2개인 컬럼을 선택해주세요.",
            )
    elif n_unique != 2:
        raise HTTPException(
            400,
            f"'{target_column}' 컬럼은 이진분류 타겟이 아니에요 (고유값 {n_unique}개). "
            "값이 정확히 두 가지인 컬럼을 선택해주세요.",
        )

    n_cases = max(MIN_CASES, min(n_cases, MAX_CASES))
    # kept before column-dropping so case labels can use ID/name columns the
    # model itself excludes (high-cardinality columns aren't useful features,
    # but they're exactly what a human would want to label a case by).
    original_df = df.copy()
    df = _drop_unusable_columns(df, target_column)
    domain = Path(file.filename or "upload").stem

    with tempfile.TemporaryDirectory() as tmp:
        csv_path = Path(tmp) / "upload.csv"
        df.to_csv(csv_path, index=False)

        X, y, display_df, target_labels, _raw_df = common.load_and_preprocess(
            csv_path, target_column, task_type=task_type
        )
        if X.shape[1] == 0:
            raise HTTPException(400, "분석에 쓸 수 있는 컬럼이 남지 않았어요.")

        # for /whatif: captured before sample_for_shap subsets rows, so every
        # category a factorized column ever took is covered, not just the ones
        # in the (possibly smaller) SHAP sample
        feature_names = list(X.columns)
        numeric_cols = set(display_df.select_dtypes(include="number").columns)
        categorical_cols = [c for c in X.columns if c not in numeric_cols]
        label_to_code = {col: dict(zip(display_df[col], X[col])) for col in categorical_cols}
        # for /retrain: the full pre-sample data, so a different model can be
        # trained on the exact same rows without re-uploading the CSV. Kept as
        # plain references (sample_for_shap below returns new objects via
        # .loc[], never mutates these in place), so no extra copying needed.
        X_full, y_full, display_full = X, y, display_df

        # target_labels (and so a positive/negative value to guess a label
        # for) only exists for classification - regression's target is a
        # plain number, nothing to name
        label_suggestion = None
        if task_type == "classification":
            negative_raw, positive_raw = target_labels
            label_suggestion = label_suggest.suggest_value_labels(
                target_column, positive_raw, negative_raw, list(original_df.columns)
            )

        # real example values (not the imputed/encoded display_df) give the
        # glossary guess more to go on than a bare column name — e.g. seeing
        # "ATA, NAP, ASY" hints that ChestPainType is a coded category
        column_samples = {
            col: original_df[col].dropna().unique()[:3].tolist() for col in X.columns
        }
        column_glossary = label_suggest.suggest_column_glossary(
            list(X.columns), column_samples
        )

        missingness = common.compute_missingness(df, list(X.columns))
        outliers, outliers_excluded = common.compute_outliers(
            df, display_df.select_dtypes(include="number").columns.tolist()
        )

        # 0 recorded where a real value is implausible (heart.csv's
        # Cholesterol=0) — not NaN, so compute_missingness can't see it
        suspect_zeros = common.compute_suspect_zeros(
            df, display_df.select_dtypes(include="number").columns.tolist()
        )

        # bounded depth, same tuning as the preset train_*.py scripts — an
        # unbounded default RF makes SHAP's TreeExplainer minutes-slow even on
        # a ~1000-row CSV, which breaks the "real-time" promise of this endpoint.
        if task_type == "regression":
            base_model = RandomForestRegressor(
                n_estimators=300,
                max_depth=8,
                min_samples_leaf=4,
                random_state=common.RANDOM_STATE,
            )
        else:
            base_model = RandomForestClassifier(
                n_estimators=300,
                max_depth=8,
                min_samples_leaf=4,
                class_weight="balanced",
                random_state=common.RANDOM_STATE,
            )
        model, accuracy, eval_stats = common.train_model(
            X, y, base_model, task_type=task_type
        )
        X, y, display_df = common.sample_for_shap(X, y, display_df)
        shap_values, feature_importance_df, base_value = common.compute_shap(
            model, X
        )

        output_path = Path(tmp) / "report.json"
        common.export_report_json(
            domain=domain,
            target_labels=target_labels,
            target_column=target_column,
            model=model,
            X=X,
            y=y,
            shap_values=shap_values,
            feature_importance_df=feature_importance_df,
            display_df=display_df,
            model_accuracy=accuracy,
            eval_stats=eval_stats,
            base_value=base_value,
            missingness=missingness,
            outliers=outliers,
            outliers_excluded_columns=outliers_excluded,
            output_path=output_path,
            n_cases=n_cases,
            case_focus=case_focus,
            positive_label=label_suggestion[0] if label_suggestion else None,
            negative_label=label_suggestion[1] if label_suggestion else None,
            task_type=task_type,
        )
        # read back the file export_report_json already wrote instead of
        # returning its in-memory dict: display_df keeps raw NaN for missing
        # numeric values (e.g. Titanic's missing Age), and since np.float64
        # subclasses float, json.dump serializes it as a bare `NaN` token
        # instead of routing through export_report_json's own null-converting
        # default=_json_default. parse_constant turns that (invalid-JSON)
        # token into None on the way back in, same as a clean value would get.
        with open(output_path, encoding="utf-8") as f:
            report = json.load(f, parse_constant=lambda _: None)
        # tells the frontend positiveLabel/negativeLabel came from a Gemini
        # guess (still just a pre-filled default the user can overwrite),
        # so it can flag it as unverified instead of showing it as settled
        report["labelSuggested"] = label_suggestion is not None
        report["columnGlossary"] = column_glossary or {}
        report["columnGlossarySuggested"] = column_glossary is not None
        # totalRows is the upload as-is (before any dropping/sampling);
        # sampledRows is how many of those rows SHAP actually ran on
        # (common.sample_for_shap caps it — see SHAP_MAX_ROWS) so the two
        # only differ on a large file, where the frontend should say so.
        report["suspectZeros"] = suspect_zeros
        report["totalRows"] = len(original_df)
        report["sampledRows"] = len(X)
        report["analysisId"] = _cache_analysis(
            {
                "model": model,
                "task_type": task_type,
                "feature_names": feature_names,
                "numeric_cols": numeric_cols,
                "label_to_code": label_to_code,
                # absent on a regression report - no positive/negative class
                "pos_raw": report.get("positiveRaw"),
                "neg_raw": report.get("negativeRaw"),
                "pos_display": report.get("positiveLabel"),
                "neg_display": report.get("negativeLabel"),
                # for /retrain
                "X_full": X_full,
                "y_full": y_full,
                "display_full": display_full,
                "domain": domain,
                "target_column": target_column,
                "target_labels": target_labels,
                "missingness": missingness,
                "outliers": outliers,
                "outliers_excluded": outliers_excluded,
                "column_glossary": column_glossary,
                "n_cases": n_cases,
                "case_focus": case_focus,
            }
        )

        # case "id" is the row's position in the CSV as originally uploaded
        # (load_and_preprocess/sample_for_shap only ever drop columns or
        # .loc-filter rows, never reindex) — so it maps straight back to
        # original_df, letting the frontend label cases by any raw column.
        # Constant columns (same value on every row — junk one-hot padding
        # columns show up a lot on real-world exports) and the target column
        # itself (already shown via the 예측/실제 badges) carry no per-case
        # info, so they're left out rather than cluttering every case card.
        skip_cols = {target_column} | {
            col for col in original_df.columns
            if original_df[col].nunique(dropna=True) <= 1
        }
        for case in report["cases"]:
            row = original_df.iloc[int(case["id"])]
            case["raw"] = {
                col: (None if pd.isna(v) else v.item() if hasattr(v, "item") else v)
                for col, v in row.items()
                if col not in skip_cols
            }

        return report


class WhatIfRequest(BaseModel):
    analysis_id: str
    # column -> value, as ShapReport['cases'][n]['raw'] shapes it (whatever
    # the CSV had, with any edited numeric fields already merged in by the
    # caller). Only keys matching the model's own feature names are used.
    row: dict


@router.post("/whatif")
async def whatif(payload: WhatIfRequest):
    entry = _ANALYSIS_CACHE.get(payload.analysis_id)
    if entry is None:
        raise HTTPException(
            404,
            "분석 기록을 찾을 수 없어요 (서버가 쉬었다 깨어났거나, 오래돼서 지워졌을 수 있어요). "
            "CSV를 다시 업로드해주세요.",
        )
    _ANALYSIS_CACHE.move_to_end(payload.analysis_id)  # LRU touch
    if entry.get("task_type") == "regression":
        raise HTTPException(400, "회귀 분석은 아직 값 바꿔보기를 지원하지 않아요.")

    model = entry["model"]
    feature_names = entry["feature_names"]
    numeric_cols = entry["numeric_cols"]
    label_to_code = entry["label_to_code"]

    display_row = {}
    encoded_row = {}
    for col in feature_names:
        raw_v = payload.row.get(col)
        display_row[col] = raw_v
        if col in numeric_cols:
            # ponytail: a missing/unset numeric value falls back to 0 rather
            # than the training-time median (not tracked in the cache) — a
            # real gap only if the caller sends an edited row with a field
            # left out entirely, which the frontend never does today
            encoded_row[col] = float(raw_v) if raw_v is not None else 0.0
        else:
            encoded_row[col] = label_to_code.get(col, {}).get(raw_v, -1)

    row_df = pd.DataFrame([encoded_row])[feature_names]
    proba_pos = float(model.predict_proba(row_df)[0, 1])
    predicted_positive = proba_pos >= 0.5

    shap_values, _, _ = common.compute_shap(model, row_df)
    row_shap = shap_values[0]
    ranked = sorted(range(len(feature_names)), key=lambda j: -abs(row_shap[j]))
    top_features = [
        {
            "feature": feature_names[j],
            "value": display_row[feature_names[j]],
            "contribution": round(float(row_shap[j]), 4),
        }
        for j in ranked
    ]

    prediction_raw = entry["pos_raw"] if predicted_positive else entry["neg_raw"]
    prediction_display = (
        entry["pos_display"] if predicted_positive else entry["neg_display"]
    ) or prediction_raw

    return {
        "predictedPositive": predicted_positive,
        "probaPositive": round(proba_pos, 4),
        "prediction": prediction_raw,
        "predictionDisplay": prediction_display,
        "topFeatures": top_features,
    }


@router.get("/model-types")
async def model_types():
    """The whitelist itself, so the frontend renders the right inputs
    (and their min/max) without duplicating this list by hand."""
    return {
        key: {
            "label": spec["label"],
            "params": {
                k: {"type": t.__name__, "min": lo, "max": hi}
                for k, (t, lo, hi) in spec["params"].items()
            },
        }
        for key, spec in MODEL_WHITELIST.items()
    }


class RetrainRequest(BaseModel):
    analysis_id: str
    model_type: str
    params: dict = {}


@router.post("/retrain")
async def retrain(payload: RetrainRequest):
    entry = _ANALYSIS_CACHE.get(payload.analysis_id)
    if entry is None or "X_full" not in entry:
        raise HTTPException(
            404,
            "분석 기록을 찾을 수 없어요 (서버가 쉬었다 깨어났거나, 오래돼서 지워졌을 수 있어요). "
            "CSV를 다시 업로드해주세요.",
        )
    _ANALYSIS_CACHE.move_to_end(payload.analysis_id)
    if entry.get("task_type") == "regression":
        raise HTTPException(400, "회귀 분석은 아직 다른 모델로 비교해보기를 지원하지 않아요.")

    spec, validated_params = _validate_model_params(payload.model_type, payload.params)
    new_model = spec["cls"](
        random_state=common.RANDOM_STATE, **spec["fixed"], **validated_params
    )

    X_full, y_full, display_full = entry["X_full"], entry["y_full"], entry["display_full"]
    new_model, accuracy, eval_stats = common.train_model(X_full, y_full, new_model)
    # same seeded sample_for_shap call as /analyze used - deterministic, so
    # this reproduces the identical row subset without re-caching it
    X_s, y_s, display_s = common.sample_for_shap(X_full, y_full, display_full)
    shap_values, feature_importance_df, base_value = common.compute_shap(new_model, X_s)

    with tempfile.TemporaryDirectory() as tmp:
        output_path = Path(tmp) / "report.json"
        common.export_report_json(
            domain=entry["domain"],
            target_labels=entry["target_labels"],
            target_column=entry["target_column"],
            model=new_model,
            X=X_s,
            y=y_s,
            shap_values=shap_values,
            feature_importance_df=feature_importance_df,
            display_df=display_s,
            model_accuracy=accuracy,
            eval_stats=eval_stats,
            base_value=base_value,
            missingness=entry["missingness"],
            outliers=entry["outliers"],
            outliers_excluded_columns=entry["outliers_excluded"],
            output_path=output_path,
            n_cases=entry["n_cases"],
            case_focus=entry["case_focus"],
            positive_label=entry["pos_display"],
            negative_label=entry["neg_display"],
        )
        with open(output_path, encoding="utf-8") as f:
            report = json.load(f, parse_constant=lambda _: None)

    report["columnGlossary"] = entry["column_glossary"] or {}
    report["columnGlossarySuggested"] = bool(entry["column_glossary"])
    report["modelType"] = payload.model_type
    report["modelLabel"] = spec["label"]

    # same underlying data, just a different trained model - the rest of the
    # cached entry (X_full, encoders, ...) is still valid for this one
    new_entry = dict(entry)
    new_entry["model"] = new_model
    report["analysisId"] = _cache_analysis(new_entry)

    return report
