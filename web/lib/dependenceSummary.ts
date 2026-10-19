// One-sentence reading of a SHAP dependence plot ("그래서 뭐?"). Pure and
// import-free so it can be unit-tested with plain Node (lib/*.test.mjs).
// Means are over the points handed in - the plotted rows (<=300) - not over
// the whole dataset.

export type DependenceInput = {
  values: (number | string | null)[];
  // contributions as stored: probability share (x100 = %p) for
  // classification, target units for regression
  shap: number[];
  regression: boolean;
  // categorical / few-valued features: the plot's category order. Absent =
  // a continuous numeric feature.
  categories?: string[];
  // how to show a category in the sentence (e.g. decode 1 -> "1(여성)")
  labelOf?: (category: string) => string;
  // number formatting for target units and raw feature values
  fmt: (n: number) => string;
};

const MIN_GROUP = 3;

const sign = (n: number) => (n >= 0 ? "+" : "−");

// "+6.8%p" for classification, "+12.3" (target units) for regression
function amount(mean: number, regression: boolean, fmt: (n: number) => string): string {
  return regression
    ? `${sign(mean)}${fmt(Math.abs(mean))}`
    : `${sign(mean)}${(Math.abs(mean) * 100).toFixed(1)}%p`;
}

// connective ("올리고") or final ("올려요") form
function verb(mean: number, last: boolean): string {
  if (mean >= 0) return last ? "올려요" : "올리고";
  return last ? "내려요" : "내리고";
}

function lead(regression: boolean): string {
  return regression ? "예측값을" : "예측 확률을";
}

function clause(subject: string, mean: number, regression: boolean, fmt: (n: number) => string, last: boolean, first: boolean): string {
  const target = first ? `${lead(regression)} ` : "";
  return `${subject}는 ${target}평균 ${amount(mean, regression, fmt)} ${verb(mean, last)}`;
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

// Returns null whenever there's nothing trustworthy to say (no points, one
// group too small, no spread in the values) - the caller then shows no
// sentence at all rather than a hollow one.
export function summarizeDependence(input: DependenceInput): string | null {
  const { values, shap, regression, categories, labelOf = (c) => c, fmt } = input;
  const n = Math.min(values.length, shap.length);
  if (n === 0) return null;

  if (categories) {
    const known = new Set(categories);
    const hasOther = known.has("기타");
    const groups = new Map<string, number[]>();
    for (let i = 0; i < n; i++) {
      const v = values[i];
      if (v === null) continue;
      const key = known.has(String(v)) ? String(v) : hasOther ? "기타" : null;
      if (key === null) continue;
      groups.set(key, [...(groups.get(key) ?? []), shap[i]]);
    }
    // category order breaks ties, so the sentence is stable
    const stats = categories
      .filter((c) => (groups.get(c)?.length ?? 0) >= MIN_GROUP)
      .map((c) => ({ c, m: mean(groups.get(c)!) }));
    if (stats.length === 0) return null;
    const sorted = [...stats].sort((a, b) => b.m - a.m);
    const top = sorted[0];
    const bottom = sorted[sorted.length - 1];
    if (top === bottom) {
      return `${clause(`${labelOf(top.c)}인 케이스`, top.m, regression, fmt, true, true)}.`;
    }
    return `${clause(`${labelOf(top.c)}인 케이스`, top.m, regression, fmt, false, true)}, ${clause(`${labelOf(bottom.c)}인 케이스`, bottom.m, regression, fmt, true, false)}.`;
  }

  // continuous: the largest third of the values vs the smallest third
  const pts: { v: number; s: number }[] = [];
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (typeof v === "number") pts.push({ v, s: shap[i] });
  }
  if (pts.length < MIN_GROUP * 2) return null;
  pts.sort((a, b) => a.v - b.v);
  const k = Math.floor(pts.length / 3);
  const low = pts.slice(0, k);
  const high = pts.slice(pts.length - k);
  // all-equal values, or a "small" third that reaches into the "large" one
  if (low[low.length - 1].v >= high[0].v) return null;
  const hi = clause(`값이 큰 쪽(${fmt(high[0].v)} 이상)인 케이스`, mean(high.map((p) => p.s)), regression, fmt, false, true);
  const lo = clause(`값이 작은 쪽(${fmt(low[low.length - 1].v)} 이하)인 케이스`, mean(low.map((p) => p.s)), regression, fmt, true, false);
  return `${hi}, ${lo}.`;
}
