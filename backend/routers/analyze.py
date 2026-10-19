"""CSV upload -> real-time analysis, reusing analysis/scripts/common.py as-is.

No modeling logic lives here — this module only validates the upload,
strips columns common.py isn't meant to handle, and calls the same
load_and_preprocess -> train_model -> sample_for_shap -> compute_shap ->
export_report_json pipeline the preset domains use.
"""
import io
import json
import logging
import pickle
import sys
import threading
import time
import tempfile
import uuid
from collections import OrderedDict
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from sklearn.model_selection import train_test_split
from sklearn.ensemble import (
    ExtraTreesClassifier,
    GradientBoostingClassifier,
    RandomForestClassifier,
    RandomForestRegressor,
)

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "analysis" / "scripts"))
import common  # noqa: E402

from . import label_suggest

log = logging.getLogger(__name__)

router = APIRouter()

MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_ROWS = 50_000

# Upload-only caps, so a 20k-row file finishes on a free Render instance
# (~5-8x slower than a laptop). Presets (analysis/scripts/train_*.py) don't go
# through here and keep their own settings.
# - TRAIN_MAX_ROWS: CV + the explained model use at most this many rows
#   (stratified for classification). Measured on California housing (20,640
#   rows): CV+fit 188s -> 23s, R² 0.753 -> 0.738 / accuracy 0.871 -> 0.859.
#   Rows left out are still explained/judged as held-out cases.
# - SHAP_MAX_ROWS: rows SHAP explains (the case pool); SHAP cost is ~linear.
# - N_TREES: same for CV and the explained model, so the quality score
#   describes the model being explained.
TRAIN_MAX_ROWS = 5_000
SHAP_MAX_ROWS = 1_000
N_TREES = 100
# the base analysis model's tree shape - also /retrain's default for the
# bagging models, so "baseline vs another model" compares like with like
BASE_MAX_DEPTH = 8
BASE_MIN_SAMPLES_LEAF = 4
HIGH_CARDINALITY_THRESHOLD = 50
LONG_TEXT_CHARS = 30

# What-if: /analyze keeps the trained model around (briefly, in memory) so a
# follow-up /whatif call can re-predict a tweaked row without re-training.
# ponytail: single-process in-memory OrderedDict as an LRU, no TTL - good
# enough for a demo app on a single Render instance; a restart (free-tier
# idle spindown) just empties it, and /whatif reports that as a plain error
# rather than crashing. Not shared across multiple server instances.
ANALYSIS_CACHE_MAX = 30
# ...and a memory budget on top of the count: one entry holds the full
# upload (X + display copy) and its model, ~25MB for a 5MB CSV and up to
# ~70MB more for a max-size retrained forest - 30 of those could exceed the
# free instance's 512MB by themselves (the process is ~270MB before any
# work). Oldest entries go first until the total fits; the newest is
# always kept so the request that just made it can still use it.
ANALYSIS_CACHE_BUDGET_MB = 120
_ANALYSIS_CACHE: "OrderedDict[str, dict]" = OrderedDict()


def _entry_mb(entry: dict) -> float:
    """Rough size of a cache entry: its DataFrames (deep, so string columns
    count) plus the model's pickled size (tree arrays dominate)."""
    frames = sum(
        # DataFrame.memory_usage is per column, Series' is already a total
        float(pd.Series(entry[k].memory_usage(deep=True)).sum())
        for k in ("X_full", "y_full", "display_full")
        if hasattr(entry.get(k), "memory_usage")
    )
    return (frames + len(pickle.dumps(entry["model"]))) / 2**20


def _cache_analysis(entry: dict) -> str:
    analysis_id = uuid.uuid4().hex
    entry["_mb"] = _entry_mb(entry)
    _ANALYSIS_CACHE[analysis_id] = entry
    while len(_ANALYSIS_CACHE) > 1 and (
        len(_ANALYSIS_CACHE) > ANALYSIS_CACHE_MAX
        or sum(e["_mb"] for e in _ANALYSIS_CACHE.values()) > ANALYSIS_CACHE_BUDGET_MB
    ):
        _ANALYSIS_CACHE.popitem(last=False)
    return analysis_id


# /retrain: a fixed menu of tree-based scikit-learn classifiers, each with a
# fixed menu of numeric hyperparameters (type, min, max, default). This is never
# "run user code" — it's "call one of these known constructors with numbers
# we've range-checked ourselves" — so it needs no sandboxing beyond that
# validation. Kept tree-based only because SHAP explanation reuses
# shap.TreeExplainer (compute_shap); a linear/kernel model would need a
# different (and for KernelExplainer, much slower) explainer path - out of
# scope for now.
#
# Upper bounds keep one retrain inside the free instance's 512MB and a few
# minutes: measured on 5,000 training rows (the cap), a 500-tree depth-20
# Extra Trees peaked at 439MB process memory (the process is ~270MB before
# any work), took 187s locally (~5-8x that on Render) and left a 69MB model
# in the cache. At 200 trees / depth 12 (boosting: depth 6) the worst of the
# three peaked at 292MB, took 43s, and kept <=10MB.
MAX_TREES = 200
MAX_FOREST_DEPTH = 12
MAX_BOOSTING_DEPTH = 6
#
# default = what /retrain uses when a param isn't sent, and what the UI
# pre-fills. Random Forest / Extra Trees match the base analysis model (an
# unbounded depth grew Extra Trees to depth 29 on heart.csv: SHAP 1.2s ->
# 11.2s, accuracy no better). Gradient Boosting keeps sklearn's shallow depth
# 3 instead - boosting stacks shallow trees, and depth 8 measured both slower
# (9.3s vs 1.3s) and less accurate (0.836 vs 0.868) on heart.csv.
MODEL_WHITELIST = {
    "random_forest": {
        "cls": RandomForestClassifier,
        "label": "Random Forest",
        "note": "기본값은 기본 분석과 같은 조건(깊이 8, 트리 100개)이에요.",
        "fixed": {"class_weight": "balanced"},
        "params": {
            "n_estimators": (int, 10, MAX_TREES, N_TREES),
            "max_depth": (int, 1, MAX_FOREST_DEPTH, BASE_MAX_DEPTH),
            "min_samples_leaf": (int, 1, 20, BASE_MIN_SAMPLES_LEAF),
        },
    },
    "gradient_boosting": {
        "cls": GradientBoostingClassifier,
        "label": "Gradient Boosting",
        "note": "기본값은 트리 100개, 깊이 3이에요. 부스팅은 얕은 트리를 여러 번 쌓는 방식이라 기본 분석(깊이 8)보다 얕게 둬요 — 깊이 8로 두면 오히려 느리고 덜 정확했어요.",
        "fixed": {},
        "params": {
            "n_estimators": (int, 10, MAX_TREES, N_TREES),
            "max_depth": (int, 1, MAX_BOOSTING_DEPTH, 3),
            "learning_rate": (float, 0.01, 1.0, 0.1),
        },
    },
    "extra_trees": {
        "cls": ExtraTreesClassifier,
        "label": "Extra Trees",
        "note": "기본값은 기본 분석과 같은 조건(깊이 8, 트리 100개)이에요.",
        "fixed": {"class_weight": "balanced"},
        "params": {
            "n_estimators": (int, 10, MAX_TREES, N_TREES),
            "max_depth": (int, 1, MAX_FOREST_DEPTH, BASE_MAX_DEPTH),
            "min_samples_leaf": (int, 1, 20, BASE_MIN_SAMPLES_LEAF),
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
    for key, (typ, lo, hi, _default) in allowed.items():
        if key not in params:
            continue
        v = params[key]
        if not isinstance(v, (int, float)) or isinstance(v, bool):
            raise HTTPException(400, f"'{key}'는 숫자여야 해요.")
        if not (lo <= v <= hi):
            raise HTTPException(400, f"'{key}'는 {lo}~{hi} 범위여야 해요.")
        validated[key] = typ(v)

    return spec, validated


def _cap_training_rows(X: pd.DataFrame, y: pd.Series, task_type: str):
    """At most TRAIN_MAX_ROWS rows for CV + fitting, seeded so /retrain picks
    the exact same rows. Classification keeps the class ratio (stratified)."""
    if len(X) <= TRAIN_MAX_ROWS:
        return X, y
    if task_type == "classification":
        X_fit, _, y_fit, _ = train_test_split(
            X, y, train_size=TRAIN_MAX_ROWS, stratify=y, random_state=common.RANDOM_STATE
        )
        return X_fit, y_fit
    X_fit = X.sample(n=TRAIN_MAX_ROWS, random_state=common.RANDOM_STATE)
    return X_fit, y.loc[X_fit.index]


def _held_out_index(X: pd.DataFrame, X_fit: pd.DataFrame, eval_stats: dict):
    """Rows the explained model never trained on: train_model's own 20%
    holdout plus every row the cap left out entirely."""
    return X.index.difference(X_fit.index).union(eval_stats["holdout_index"])


def _shap_pool(X, y, display_df, held_index):
    """Rows SHAP explains (the case pool), at most SHAP_MAX_ROWS. A file under
    the cap is explained whole; a bigger one fills the pool with held-out
    rows first, so cases aren't starved. Picked explicitly rather than
    trusting two same-seed samples to land apart - X.sample(1000) and
    X.sample(5000) share a seed's permutation, so the pool sat inside the
    training cap and only ~20% of it was held out."""
    if len(X) <= SHAP_MAX_ROWS:
        return X, y, display_df
    held = X.index.intersection(held_index)
    if len(held) >= SHAP_MAX_ROWS:
        idx = X.loc[held].sample(n=SHAP_MAX_ROWS, random_state=common.RANDOM_STATE).index
    else:
        rest = X.index.difference(held)
        fill = X.loc[rest].sample(n=SHAP_MAX_ROWS - len(held), random_state=common.RANDOM_STATE)
        idx = held.append(fill.index)
    idx = idx.sort_values()
    return X.loc[idx], y.loc[idx], display_df.loc[idx]


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


# Heavy work (training, SHAP, Gemini) runs in a worker thread so the event
# loop - and with it /health and /columns - always answers. These endpoints
# used to be `async def` doing all of that inline on the loop: one slow
# request (a deep-tree SHAP, a hung Gemini call) froze the whole server,
# /health included.
# At most one heavy job at a time: a free Render instance has 512MB, and two
# trainings + SHAP side by side could run it out. A request that arrives
# while one is running waits up to HEAVY_WAIT_SECONDS for its turn (a quick
# /whatif behind another one just queues briefly), then gets a 503 with a
# "try again" message instead of hanging for minutes behind a long analysis.
# One-at-a-time also makes the in-memory _ANALYSIS_CACHE single-writer.
# A threading.Lock (not asyncio.Semaphore) so it isn't tied to one event
# loop - the waiting happens inside the worker thread, never on the loop.
# ponytail: a waiting request holds a threadpool thread (anyio's default 40)
# for up to HEAVY_WAIT_SECONDS - fine at demo traffic; a real job queue if
# many users ever pile up at once.
HEAVY_WAIT_SECONDS = 30
_HEAVY_LOCK = threading.Lock()
BUSY_MESSAGE = "다른 분석이 진행 중이에요. 잠시 후 다시 시도해주세요."


def _one_at_a_time(fn, *args):
    if not _HEAVY_LOCK.acquire(timeout=HEAVY_WAIT_SECONDS):
        log.warning("heavy job rejected: another one still running after %ss", HEAVY_WAIT_SECONDS)
        raise HTTPException(503, BUSY_MESSAGE, headers={"Retry-After": str(HEAVY_WAIT_SECONDS)})
    try:
        return fn(*args)
    finally:
        _HEAVY_LOCK.release()


async def _run_heavy(fn, *args):
    return await run_in_threadpool(_one_at_a_time, fn, *args)


@router.post("/columns")
async def get_columns(file: UploadFile = File(...)):
    # light (read + count) but still off the loop, and never queued behind
    # a heavy job - the upload flow's first step must stay instant
    return await run_in_threadpool(_columns_sync, await file.read())


def _columns_sync(content: bytes):
    df = _read_csv(content)
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
    content = await file.read()
    return await _run_heavy(
        _analyze_sync, content, file.filename, target_column, n_cases, case_focus, task_type
    )


def _analyze_sync(
    content: bytes,
    filename: str | None,
    target_column: str,
    n_cases: int,
    case_focus: str,
    task_type: str,
):
    if case_focus not in CASE_FOCUS_OPTIONS:
        raise HTTPException(
            400, f"case_focus는 {sorted(CASE_FOCUS_OPTIONS)} 중 하나여야 해요."
        )
    if task_type not in TASK_TYPE_OPTIONS:
        raise HTTPException(
            400, f"task_type은 {sorted(TASK_TYPE_OPTIONS)} 중 하나여야 해요."
        )
    df = _read_csv(content)

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
    t_start = time.perf_counter()
    original_df = df.copy()
    df = _drop_unusable_columns(df, target_column)
    domain = Path(filename or "upload").stem

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
        t_pre = time.perf_counter() - t_start

        t0 = time.perf_counter()
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
        t_gemini = time.perf_counter() - t0

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
                n_estimators=N_TREES,
                max_depth=BASE_MAX_DEPTH,
                min_samples_leaf=BASE_MIN_SAMPLES_LEAF,
                random_state=common.RANDOM_STATE,
            )
        else:
            base_model = RandomForestClassifier(
                n_estimators=N_TREES,
                max_depth=BASE_MAX_DEPTH,
                min_samples_leaf=BASE_MIN_SAMPLES_LEAF,
                class_weight="balanced",
                random_state=common.RANDOM_STATE,
            )
        X_fit, y_fit = _cap_training_rows(X, y, task_type)
        model, accuracy, eval_stats = common.train_model(
            X_fit, y_fit, base_model, task_type=task_type
        )
        eval_stats["holdout_index"] = _held_out_index(X, X_fit, eval_stats)
        X, y, display_df = _shap_pool(X, y, display_df, eval_stats["holdout_index"])
        t0 = time.perf_counter()
        shap_values, feature_importance_df, base_value = common.compute_shap(
            model, X
        )
        t_shap = time.perf_counter() - t0

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
        # (_shap_pool caps it — see SHAP_MAX_ROWS) so the two
        # only differ on a large file, where the frontend should say so.
        report["suspectZeros"] = suspect_zeros
        report["totalRows"] = len(original_df)
        report["sampledRows"] = len(X)
        # rows CV + the explained model used (capped) / rows SHAP explained
        report["trainedRows"] = len(X_fit)
        report["explainedRows"] = len(X)
        timing = eval_stats["timing"]
        log.info(
            "analyze timing rows=%d trained=%d explained=%d task=%s | "
            "preprocess=%.1fs gemini=%.1fs cv=%.1fs fit=%.1fs shap=%.1fs pdp=%.1fs total=%.1fs",
            len(original_df), len(X_fit), len(X), task_type,
            t_pre, t_gemini, timing["cv"], timing["fit"], t_shap,
            timing.get("pdp", 0.0), time.perf_counter() - t_start,
        )
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
    return await _run_heavy(_whatif_sync, payload)


def _whatif_sync(payload: WhatIfRequest):
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
            "note": spec["note"],
            "params": {
                k: {"type": t.__name__, "min": lo, "max": hi, "default": d}
                for k, (t, lo, hi, d) in spec["params"].items()
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
    return await _run_heavy(_retrain_sync, payload)


def _retrain_sync(payload: RetrainRequest):
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
    # a param left out falls back to the whitelist default (not sklearn's -
    # e.g. unbounded max_depth); anything the user sent wins
    defaults = {k: d for k, (_t, _lo, _hi, d) in spec["params"].items()}
    new_model = spec["cls"](
        random_state=common.RANDOM_STATE, **spec["fixed"], **{**defaults, **validated_params}
    )

    X_full, y_full, display_full = entry["X_full"], entry["y_full"], entry["display_full"]
    # same seeded cap + _shap_pool calls as /analyze used - deterministic,
    # so this reproduces the identical row subsets without re-caching them
    X_fit, y_fit = _cap_training_rows(X_full, y_full, "classification")
    new_model, accuracy, eval_stats = common.train_model(X_fit, y_fit, new_model)
    eval_stats["holdout_index"] = _held_out_index(X_full, X_fit, eval_stats)
    X_s, y_s, display_s = _shap_pool(X_full, y_full, display_full, eval_stats["holdout_index"])
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
    report["totalRows"] = len(X_full)
    report["sampledRows"] = len(X_s)
    report["trainedRows"] = len(X_fit)
    report["explainedRows"] = len(X_s)

    # same underlying data, just a different trained model - the rest of the
    # cached entry (X_full, encoders, ...) is still valid for this one
    new_entry = dict(entry)
    new_entry["model"] = new_model
    report["analysisId"] = _cache_analysis(new_entry)

    return report
