export type ShapReport = {
  domain: string;
  modelAccuracy: number;
  // Human-friendly names for the two outcomes. Presets fill these with nice
  // Korean labels ("생존"/"사망"); for an arbitrary uploaded CSV they fall
  // back to the target column's own values. Optional so old JSON still loads.
  positiveLabel?: string;
  negativeLabel?: string;
  // True when positiveLabel/negativeLabel came from a Gemini guess at what
  // the target column's raw values mean (backend/routers/label_suggest.py),
  // rather than a plain "Column=raw" fallback — still just a pre-filled
  // default the user can overwrite via the inline editor, never settled.
  labelSuggested?: boolean;
  // Same idea, for feature columns: one-line descriptions the backend
  // guessed from each column's name + a few sample values, keyed by column
  // name. Only ever populated for uploads (presets already have curated
  // descriptions in columnGlossary.ts) — empty object when no suggestion
  // was available (no API key, call failed, ...), never missing.
  columnGlossary?: Record<string, string>;
  columnGlossarySuggested?: boolean;
  // Numeric columns where 0 looks like a "not measured" placeholder (far
  // below the column's other values) rather than a real value — invisible to
  // `missingness` since 0 isn't NaN. A hint only: nothing was imputed or
  // excluded. lowerFence is the cutoff the non-zero values put 0 below.
  suspectZeros?: {
    column: string;
    zeroCount: number;
    zeroPct: number;
    lowerFence: number;
  }[];
  // Upload row counts (presets don't set these — their JSON predates this
  // field and there's no upload CSV to count). totalRows is the file as
  // uploaded; sampledRows is how many of those rows SHAP actually explained
  // (common.sample_for_shap caps it on a large file) — equal to totalRows
  // on anything under that cap, which is the common case.
  totalRows?: number;
  sampledRows?: number;
  // Counts over the whole pool cases are drawn from (common.sample_for_shap's
  // output — up to SHAP_MAX_ROWS rows) — NOT just the cases actually loaded
  // as cards. "borderline" is 40-60% predicted probability, the same
  // threshold the case_focus="borderline" option already uses elsewhere.
  caseStats?: { total: number; wrong: number; borderline: number };
  // The target column name and its two raw CSV values, regardless of
  // override — lets the UI build a persistent value->meaning mapping (e.g.
  // "Survived"+"1" -> a user-typed "생존") and reuse it across uploads.
  // Optional so old JSON still loads.
  targetColumn?: string;
  positiveRaw?: string;
  negativeRaw?: string;
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
  // Per-numeric-column IQR-outlier stats — five-number summary, whisker
  // bounds, and a capped sample of the actual outlier values, so the
  // frontend can draw a real box plot. Optional so old JSON still loads.
  outliers?: {
    column: string;
    outlierCount: number;
    outlierPct: number;
    min: number;
    q1: number;
    median: number;
    q3: number;
    max: number;
    whiskerLow: number;
    whiskerHigh: number;
    outlierSample: number[];
  }[];
  // Numeric columns left out of `outliers` because they have at most 2
  // distinct values (a box plot can't show anything meaningful for those).
  // Optional so old JSON still loads.
  outliersExcludedColumns?: string[];
  featureImportance: { feature: string; importance: number }[];
  // Same shape as featureImportance, recomputed over only the wrong
  // predictions. Absent when the model got everything right (caseStats.wrong === 0).
  wrongFeatureImportance?: { feature: string; importance: number }[];
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
    // every column from the originally uploaded row (including ones the
    // model itself dropped, like ID/name columns) — lets the UI label a
    // case by any attribute, not just modeling features. Optional so old
    // JSON still loads.
    raw?: Record<string, string | number | null>;
  }[];
};
