export type ShapReport = {
  domain: string;
  modelAccuracy: number;
  // Human-friendly names for the two outcomes. Presets fill these with nice
  // Korean labels ("생존"/"사망"); for an arbitrary uploaded CSV they fall
  // back to the target column's own values. Optional so old JSON still loads.
  positiveLabel?: string;
  negativeLabel?: string;
  // Plain-language check on whether the model actually beats a majority-class
  // guess. Optional so old JSON still loads.
  modelQuality?: {
    verdict: "good" | "weak";
    message: string;
    baselineAccuracy: number;
  };
  featureImportance: { feature: string; importance: number }[];
  cases: {
    id: string;
    // Raw target value from the CSV (e.g. "1", "Yes").
    prediction: string;
    predictedPositive: boolean;
    explanation: string;
    topFeatures: { feature: string; value: string | number; contribution: number }[];
  }[];
};
