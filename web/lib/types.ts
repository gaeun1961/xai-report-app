export type ShapReport = {
  domain: string;
  modelAccuracy: number;
  // Human-friendly names for the two outcomes. Presets fill these with nice
  // Korean labels ("생존"/"사망"); for an arbitrary uploaded CSV they fall
  // back to the target column's own values. Optional so old JSON still loads.
  positiveLabel?: string;
  negativeLabel?: string;
  // Model's prior P(positive) before any feature is considered — lets the
  // report explain why the top-5 factors alone don't always match the
  // final prediction. Optional so old JSON still loads.
  baseValue?: number;
  // Plain-language check on whether the model actually beats a majority-class
  // guess. Optional so old JSON still loads.
  modelQuality?: {
    // good = beats baseline & predicts both classes
    // fair = accuracy ~matches baseline but still catches the rare class
    // weak = no better than guessing the majority class
    verdict: "good" | "fair" | "weak";
    message: string;
    baselineAccuracy: number;
    minorityRecall?: number;
    minorityLabel?: string;
  };
  // Pairwise correlations between the numeric columns (model-independent —
  // just how the raw data moves together). Optional so old JSON still loads.
  correlations?: { columns: string[]; matrix: number[][] };
  // Per-feature-column missing-value count/share in the raw (pre-imputation)
  // data. Optional so old JSON still loads.
  missingness?: { column: string; missingCount: number; missingPct: number }[];
  // Per-numeric-column IQR-outlier count/share. Optional so old JSON still loads.
  outliers?: { column: string; outlierCount: number; outlierPct: number }[];
  featureImportance: { feature: string; importance: number }[];
  cases: {
    id: string;
    // Raw target value from the CSV (e.g. "1", "Yes").
    prediction: string;
    predictedPositive: boolean;
    // Model's P(positive) for this case (0–1). Optional so old JSON still loads.
    probaPositive?: number;
    // The row's true label from the CSV, and whether the prediction matched it.
    // Optional so old JSON still loads.
    actualLabel?: string;
    actualPositive?: boolean;
    isCorrect?: boolean;
    explanation: string;
    topFeatures: { feature: string; value: string | number; contribution: number }[];
  }[];
};
