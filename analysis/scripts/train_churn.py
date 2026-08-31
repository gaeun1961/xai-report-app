from pathlib import Path

from sklearn.ensemble import RandomForestClassifier

from common import (
    RANDOM_STATE,
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
    # Same RF settings as Titanic/HR: bounding tree depth also softens the
    # k/300 probability quantization that pushed churn's predictions to the
    # 0.0 / 1.0 extremes.
    model, accuracy, eval_stats = train_model(
        X,
        y,
        RandomForestClassifier(
            n_estimators=500,
            max_depth=7,
            min_samples_leaf=4,
            random_state=RANDOM_STATE,
        ),
    )
    X, y, display_df = sample_for_shap(X, y, display_df)
    shap_values, feature_importance_df, base_value = compute_shap(model, X)
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
        base_value=base_value,
        output_path=OUTPUT_PATH,
    )
    print(f"telco_churn accuracy={accuracy:.4f} -> {OUTPUT_PATH}")
    return report


if __name__ == "__main__":
    main()
