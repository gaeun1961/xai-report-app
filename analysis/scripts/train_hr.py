from pathlib import Path

import pandas as pd
from sklearn.ensemble import RandomForestClassifier

from common import (
    RANDOM_STATE,
    compute_missingness,
    compute_outliers,
    compute_shap,
    export_report_json,
    load_and_preprocess,
    sample_for_shap,
    train_model,
)

SCRIPTS_DIR = Path(__file__).resolve().parent
ANALYSIS_DIR = SCRIPTS_DIR.parent
ROOT_DIR = ANALYSIS_DIR.parent

CSV_PATH = ANALYSIS_DIR / "data" / "raw" / "HR-Employee-Attrition.csv"
OUTPUT_PATH = ROOT_DIR / "web" / "public" / "data" / "hr_attrition.json"
TARGET_COLUMN = "Attrition"


def main():
    X, y, display_df, target_labels = load_and_preprocess(CSV_PATH, TARGET_COLUMN)
    raw_df = pd.read_csv(CSV_PATH)
    missingness = compute_missingness(raw_df, list(X.columns))
    outliers = compute_outliers(
        raw_df, display_df.select_dtypes(include="number").columns.tolist()
    )
    model, accuracy, eval_stats = train_model(
        X,
        y,
        RandomForestClassifier(
            n_estimators=500,
            max_depth=8,
            min_samples_leaf=4,
            class_weight="balanced",
            random_state=RANDOM_STATE,
        ),
    )
    X, y, display_df = sample_for_shap(X, y, display_df)
    shap_values, feature_importance_df, base_value = compute_shap(model, X)
    report = export_report_json(
        domain="hr_attrition",
        target_labels=target_labels,
        positive_label="퇴사",
        negative_label="잔류",
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
        output_path=OUTPUT_PATH,
    )
    print(f"hr_attrition accuracy={accuracy:.4f} -> {OUTPUT_PATH}")
    return report


if __name__ == "__main__":
    main()
