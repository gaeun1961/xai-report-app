// Re-picking cases on screen from the report's `candidates` block. The
// picking rules stay in the backend (common._rank_case_indices*): it sends,
// per focus, every candidate in ranking order, and this only takes the first
// N - no selection logic is duplicated here.
import type { ShapReport } from "./types";

type Case = ShapReport["cases"][number];
export type CaseFocus = "balanced" | "wrong" | "borderline";

export function focusOptions(report: ShapReport): CaseFocus[] {
  return Object.keys(report.candidates?.order ?? {}) as CaseFocus[];
}

// one candidate row -> the same case shape the backend returns. Its top
// features' values/SHAP live in `dependence` (rows 0..count-1 are the
// candidates), the other features in `candidates.rest`.
function buildCase(report: ShapReport, i: number): Case {
  const cand = report.candidates!;
  const dep = report.dependence!;
  const id = dep.ids[i];
  const topFeatures = [...dep.features, ...cand.rest]
    .map((f) => ({ feature: f.feature, value: f.values[i] as string | number, contribution: f.shap[i] }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  // no full CSV row for a re-picked case - its feature values are enough for
  // What-if (which only reads model features)
  const raw = Object.fromEntries(topFeatures.map((f) => [f.feature, f.value]));

  if (cand.predicted) {
    const residual = cand.predicted[i] - cand.actual[i];
    return {
      id,
      predictedValue: cand.predicted[i],
      actualValue: cand.actual[i],
      residual: Math.round(residual * 1e4) / 1e4,
      isCorrect: !cand.large![i],
      explanation: "",
      topFeatures,
      raw,
    };
  }
  const predictedPositive = cand.pred![i] === 1;
  const actualPositive = cand.actual[i] === 1;
  const proba = cand.proba![i];
  const posRaw = report.positiveRaw ?? "1";
  const negRaw = report.negativeRaw ?? "0";
  const label = predictedPositive ? (report.positiveLabel ?? posRaw) : (report.negativeLabel ?? negRaw);
  const confidence = Math.round((predictedPositive ? proba : 1 - proba) * 100);
  return {
    id,
    prediction: predictedPositive ? posRaw : negRaw,
    predictedPositive,
    probaPositive: proba,
    actualLabel: actualPositive ? posRaw : negRaw,
    actualPositive,
    isCorrect: predictedPositive === actualPositive,
    // same sentence the backend writes (export_report_json)
    explanation: `모델은 이 케이스를 '${label}'(으)로 예측했습니다 (확신도 ${confidence}%).`,
    topFeatures,
    raw,
  };
}

// The first `n` cases for `focus`. Cases the report already carries are
// reused as-is (they have the full CSV row for the case-name column).
export function pickCases(report: ShapReport, focus: CaseFocus, n: number): Case[] {
  const order = report.candidates?.order[focus];
  if (!order || !report.dependence) return report.cases;
  const known = new Map(report.cases.map((c) => [c.id, c]));
  return order.slice(0, n).map((i) => known.get(report.dependence!.ids[i]) ?? buildCase(report, i));
}
