from pathlib import Path

from common import compute_shap, export_report_json, load_and_preprocess, train_model

SCRIPTS_DIR = Path(__file__).resolve().parent
ANALYSIS_DIR = SCRIPTS_DIR.parent
ROOT_DIR = ANALYSIS_DIR.parent

CSV_PATH = ANALYSIS_DIR / "data" / "raw" / "titanic.csv"
OUTPUT_PATH = ROOT_DIR / "web" / "public" / "data" / "titanic.json"

# NOTE: this Kaggle export's target column is misspelled "2urvived" (not
# "Survived") and several columns are duplicated placeholder "zero" columns
# with no signal — both are handled generically by common.load_and_preprocess
# (constant/ID-like columns are dropped automatically).
TARGET_COLUMN = "2urvived"


def main():
    X, y, display_df = load_and_preprocess(CSV_PATH, TARGET_COLUMN)
    model, accuracy = train_model(X, y)
    shap_values, feature_importance_df = compute_shap(model, X)
    report = export_report_json(
        domain="titanic",
        model=model,
        X=X,
        y=y,
        shap_values=shap_values,
        feature_importance_df=feature_importance_df,
        display_df=display_df,
        model_accuracy=accuracy,
        output_path=OUTPUT_PATH,
    )
    print(f"titanic accuracy={accuracy:.4f} -> {OUTPUT_PATH}")
    return report


if __name__ == "__main__":
    main()
