from pathlib import Path

from common import (
    compute_shap,
    export_report_json,
    load_and_preprocess,
    sample_for_shap,
    train_model,
)

SCRIPTS_DIR = Path(__file__).resolve().parent
ANALYSIS_DIR = SCRIPTS_DIR.parent
ROOT_DIR = ANALYSIS_DIR.parent

CSV_PATH = ANALYSIS_DIR / "data" / "raw" / "Telco-Customer-Churn.csv"
OUTPUT_PATH = ROOT_DIR / "web" / "public" / "data" / "telco_churn.json"
TARGET_COLUMN = "Churn"


def main():
    X, y, display_df, target_labels = load_and_preprocess(CSV_PATH, TARGET_COLUMN)
    model, accuracy, eval_stats = train_model(X, y)
    X, y, display_df = sample_for_shap(X, y, display_df)
    shap_values, feature_importance_df = compute_shap(model, X)
    report = export_report_json(
        domain="telco_churn",
        target_labels=target_labels,
        positive_label="이탈",
        negative_label="유지",
        model=model,
        X=X,
        y=y,
        shap_values=shap_values,
        feature_importance_df=feature_importance_df,
        display_df=display_df,
        model_accuracy=accuracy,
        eval_stats=eval_stats,
        output_path=OUTPUT_PATH,
    )
    print(f"telco_churn accuracy={accuracy:.4f} -> {OUTPUT_PATH}")
    return report


if __name__ == "__main__":
    main()
