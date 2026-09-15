// Whether a feature's own value tends to push predictions toward the
// positive or negative class — e.g. "Sex=1 usually pushes toward '생존'".
// Just aggregating the sign of each case's SHAP contribution doesn't work
// for a binary/ordinal feature: roughly half the rows have the "high" value
// (pushing one way) and half have the "low" value (pushing the other way),
// so raw sign counts always look like a 50/50 split regardless of how
// clear the real relationship is. Correlating the feature's value against
// its contribution captures the actual direction instead. Only meaningful
// for numeric values (categorical columns keep their original string in
// topFeatures, e.g. "male" — no natural order to correlate against, so
// those are skipped rather than guessed at).
import type { ShapReport } from "./types";

const MIN_CASES_FOR_TENDENCY = 3;
const STRONG_R = 0.5;

function pearsonR(pairs: { value: number; contribution: number }[]): number | null {
  const n = pairs.length;
  const meanV = pairs.reduce((s, p) => s + p.value, 0) / n;
  const meanC = pairs.reduce((s, p) => s + p.contribution, 0) / n;
  let cov = 0;
  let varV = 0;
  let varC = 0;
  for (const { value, contribution } of pairs) {
    const dv = value - meanV;
    const dc = contribution - meanC;
    cov += dv * dc;
    varV += dv * dv;
    varC += dc * dc;
  }
  if (varV === 0 || varC === 0) return null; // constant value or contribution — no direction to report
  return cov / Math.sqrt(varV * varC);
}

export function featureTendencies(report: ShapReport): Record<string, string> {
  const pos = report.positiveLabel ?? "양성";
  const neg = report.negativeLabel ?? "음성";
  const pairsByFeature = new Map<string, { value: number; contribution: number }[]>();

  for (const c of report.cases) {
    for (const f of c.topFeatures) {
      if (typeof f.value !== "number") continue; // categorical string values aren't orderable
      const list = pairsByFeature.get(f.feature) ?? [];
      list.push({ value: f.value, contribution: f.contribution });
      pairsByFeature.set(f.feature, list);
    }
  }

  const result: Record<string, string> = {};
  for (const [feature, pairs] of pairsByFeature) {
    if (pairs.length < MIN_CASES_FOR_TENDENCY) continue;
    const r = pearsonR(pairs);
    if (r === null) continue;

    if (r >= STRONG_R) {
      result[feature] = `값이 클수록 대체로 '${pos}' 쪽으로 작용하는 경향이 있어요 (상관계수 ${r.toFixed(2)}).`;
    } else if (r <= -STRONG_R) {
      result[feature] = `값이 클수록 대체로 '${neg}' 쪽으로 작용하는 경향이 있어요 (상관계수 ${r.toFixed(2)}).`;
    } else {
      result[feature] = `이 요인은 값과 작용 방향의 관계가 뚜렷하지 않아요.`;
    }
  }
  return result;
}
