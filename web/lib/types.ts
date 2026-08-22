export type ShapReport = {
  domain: string;
  modelAccuracy: number;
  featureImportance: { feature: string; importance: number }[];
  cases: {
    id: string;
    prediction: string;
    explanation: string;
    topFeatures: { feature: string; value: string | number; contribution: number }[];
  }[];
};
