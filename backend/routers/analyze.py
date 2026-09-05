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
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from sklearn.ensemble import RandomForestClassifier

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "analysis" / "scripts"))
import common  # noqa: E402

router = APIRouter()

MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_ROWS = 50_000
HIGH_CARDINALITY_THRESHOLD = 50
LONG_TEXT_CHARS = 30


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


@router.post("/columns")
async def get_columns(file: UploadFile = File(...)):
    df = _read_csv(await file.read())
    return {
        "columns": [
            {"name": col, "uniqueCount": int(df[col].nunique(dropna=True))}
            for col in df.columns
        ]
    }


@router.post("/analyze")
async def analyze(file: UploadFile = File(...), target_column: str = Form(...)):
    df = _read_csv(await file.read())

    if target_column not in df.columns:
        raise HTTPException(400, f"'{target_column}' 컬럼을 찾을 수 없어요.")

    n_unique = int(df[target_column].nunique(dropna=True))
    if n_unique != 2:
        raise HTTPException(
            400,
            f"'{target_column}' 컬럼은 이진분류 타겟이 아니에요 (고유값 {n_unique}개). "
            "값이 정확히 두 가지인 컬럼을 선택해주세요.",
        )

    df = _drop_unusable_columns(df, target_column)
    domain = Path(file.filename or "upload").stem

    with tempfile.TemporaryDirectory() as tmp:
        csv_path = Path(tmp) / "upload.csv"
        df.to_csv(csv_path, index=False)

        X, y, display_df, target_labels = common.load_and_preprocess(
            csv_path, target_column
        )
        if X.shape[1] == 0:
            raise HTTPException(400, "분석에 쓸 수 있는 컬럼이 남지 않았어요.")

        # bounded depth, same tuning as the preset train_*.py scripts — an
        # unbounded default RF makes SHAP's TreeExplainer minutes-slow even on
        # a ~1000-row CSV, which breaks the "real-time" promise of this endpoint.
        model, accuracy, eval_stats = common.train_model(
            X,
            y,
            RandomForestClassifier(
                n_estimators=300,
                max_depth=8,
                min_samples_leaf=4,
                class_weight="balanced",
                random_state=common.RANDOM_STATE,
            ),
        )
        X, y, display_df = common.sample_for_shap(X, y, display_df)
        shap_values, feature_importance_df, base_value = common.compute_shap(
            model, X
        )

        output_path = Path(tmp) / "report.json"
        common.export_report_json(
            domain=domain,
            target_labels=target_labels,
            model=model,
            X=X,
            y=y,
            shap_values=shap_values,
            feature_importance_df=feature_importance_df,
            display_df=display_df,
            model_accuracy=accuracy,
            eval_stats=eval_stats,
            base_value=base_value,
            output_path=output_path,
        )
        # read back the file export_report_json already wrote instead of
        # returning its in-memory dict: display_df keeps raw NaN for missing
        # numeric values (e.g. Titanic's missing Age), and since np.float64
        # subclasses float, json.dump serializes it as a bare `NaN` token
        # instead of routing through export_report_json's own null-converting
        # default=_json_default. parse_constant turns that (invalid-JSON)
        # token into None on the way back in, same as a clean value would get.
        with open(output_path, encoding="utf-8") as f:
            return json.load(f, parse_constant=lambda _: None)
