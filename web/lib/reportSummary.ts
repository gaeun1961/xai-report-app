// Builds the on-screen "총평" paragraph and the fuller clipboard report text,
// purely from data already present in a loaded ShapReport — no new LLM calls.
import type { ShapReport } from "./types";
import { columnDesc } from "./columnGlossary";

const STRONG_CORR = 0.6;
const CORR_SENTENCE_LIMIT = 2;
const CORR_LIST_LIMIT = 5;

function label(domain: string, column: string): string {
  return columnDesc(domain, column) ?? column;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

// 라고 / 이라고 by whether the word's last Hangul char has a final consonant
export function irago(w: string): string {
  const ch = w.charCodeAt(w.length - 1);
  const batchim = ch >= 0xac00 && ch <= 0xd7a3 && (ch - 0xac00) % 28 !== 0;
  return batchim ? "이라고" : "라고";
}

// Plain-language "is this model any good" explanation, built from the numbers
// alone (same branching as common._judge_model_quality).
export function explainAccuracy(
  acc: number,
  baseline: number,
  verdict: "good" | "fair" | "weak",
  posLabel: string,
  negLabel: string,
  minorityRecall: number | undefined,
  minorityLabel: string | undefined,
): string[] {
  const a = Math.round(acc * 100);
  const b = Math.round(baseline * 100);
  const gap = a - b;
  // the rarer class in the data (backend computed it from the true labels).
  // The more common one is whatever's left.
  const minority = minorityLabel ?? negLabel;
  const majority = minority === posLabel ? negLabel : posLabel;
  const rec =
    minorityRecall !== undefined ? Math.round(minorityRecall * 100) : null;

  const line1 = `이 데이터는 실제 결과가 '${majority}'인 경우가 ${b}%로 더 많아요.`;
  const line2 = `그래서 아무 근거 없이 전부 '${majority}'${irago(majority)}만 찍어도 ${b}%는 맞는 셈이라, 모델은 최소한 이보다는 나아야 의미가 있어요.`;

  let line3: string;
  if (verdict === "good") {
    line3 = `이 모델의 정확도 ${a}%는 그 기준보다 ${gap}%p 높고, '${posLabel}'·'${negLabel}' 어느 쪽도 한쪽으로 몰아 찍지 않고 예측해요.`;
  } else if (verdict === "fair") {
    const recPart = rec !== null ? ` 실제 '${minority}' 중 ${rec}%를 잡아내요` : "";
    line3 = `이 모델의 정확도 ${a}%는 그 기준과 비슷하지만(${
      gap >= 0 ? "+" : ""
    }${gap}%p), 대신 놓치면 안 되는 '${minority}'에 집중해요 —${recPart}. 그게 목적이면 쓸만해요.`;
  } else if (a < b) {
    line3 = `이 모델의 정확도 ${a}%는 그 기준보다 오히려 ${b - a}%p 낮은 데다, 수가 적은 '${minority}'도 거의 못 맞혀서 쓸 이유가 없어요.`;
  } else {
    line3 = `이 모델의 정확도 ${a}%는 기준과 큰 차이가 없고, 수가 적은 '${minority}' 쪽은 거의 못 맞혀요.`;
  }
  return [line1, line2, line3];
}

function verdictSentence(report: ShapReport): string | null {
  const q = report.modelQuality;
  if (!q) return null;
  const acc = Math.round(report.modelAccuracy * 100);
  const base = Math.round(q.baselineAccuracy * 100);
  const pos = report.positiveLabel ?? "양성";
  const neg = report.negativeLabel ?? "음성";
  const minority = q.minorityLabel ?? neg;

  if (q.verdict === "good") {
    return `모델 품질은 양호해요 — 정확도 ${acc}%로 다수결 기준(${base}%)보다 나으면서, '${pos}'·'${neg}' 양쪽을 고르게 예측해요.`;
  }
  if (q.verdict === "fair") {
    return `모델 품질은 참고할 만해요 — 정확도(${acc}%)는 기준(${base}%)과 비슷하지만, 놓치면 안 되는 '${minority}'는 잘 잡아내요.`;
  }
  return `모델 품질은 주의가 필요해요 — 정확도(${acc}%)가 다수결 기준(${base}%)보다 낫지 않아요.`;
}

function topFeaturesSentence(report: ShapReport, domain: string): string | null {
  const top = report.featureImportance.slice(0, 3);
  if (top.length === 0) return null;
  const parts = top.map((f) => `${label(domain, f.feature)}(${f.importance.toFixed(3)})`);
  return `예측에 가장 큰 영향을 준 요인은 ${parts.join(", ")} 순이에요.`;
}

// strong pairs (upper triangle only), strongest first
function strongCorrPairs(report: ShapReport): { i: number; j: number; v: number }[] {
  const data = report.correlations;
  if (!data) return [];
  const { columns, matrix } = data;
  const pairs: { i: number; j: number; v: number }[] = [];
  for (let i = 0; i < columns.length; i++) {
    for (let j = i + 1; j < columns.length; j++) {
      const v = matrix[i][j];
      if (Math.abs(v) >= STRONG_CORR) pairs.push({ i, j, v });
    }
  }
  return pairs.sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
}

function correlationSentence(report: ShapReport, domain: string): string | null {
  const pairs = strongCorrPairs(report);
  if (pairs.length === 0) return null;
  const columns = report.correlations!.columns;
  const parts = pairs
    .slice(0, CORR_SENTENCE_LIMIT)
    .map((p) => `'${label(domain, columns[p.i])}'-'${label(domain, columns[p.j])}'(r=${p.v.toFixed(2)})`);
  const more = pairs.length > CORR_SENTENCE_LIMIT ? ` 등 ${pairs.length}쌍` : "";
  return `${parts.join(", ")}${more} 사이에 강한 상관관계가 있어 다중공선성에 주의가 필요해요.`;
}

function dataQualitySentence(report: ShapReport, domain: string): string | null {
  const notes: string[] = [];

  const missing = (report.missingness ?? []).filter((m) => m.missingCount > 0);
  if (missing.length > 0) {
    const top = missing
      .slice()
      .sort((a, b) => b.missingPct - a.missingPct)
      .slice(0, 2)
      .map((m) => `${label(domain, m.column)}(${pct(m.missingPct)})`);
    const more = missing.length > 2 ? ` 등 ${missing.length}개 컬럼` : "";
    notes.push(`${top.join(", ")}${more}에 결측치가 있어요`);
  }

  const outlier = (report.outliers ?? []).filter((o) => o.outlierCount > 0);
  if (outlier.length > 0) {
    const top = outlier
      .slice()
      .sort((a, b) => b.outlierPct - a.outlierPct)
      .slice(0, 2)
      .map((o) => `${label(domain, o.column)}(${pct(o.outlierPct)})`);
    const more = outlier.length > 2 ? ` 등 ${outlier.length}개 컬럼` : "";
    notes.push(`${top.join(", ")}${more}에 이상치가 있어요`);
  }

  if (notes.length === 0) return null;
  return `${notes.join(", ")}.`;
}

const MIN_WRONG_FOR_PATTERN = 3;
const LOW_CONF_THRESHOLD = 0.6; // predicted-class confidence at/below this counts as "low"
const HIGH_CONF_THRESHOLD = 0.8;

// Looks for a common thread across the model's mistakes: were they mostly
// close calls (confidence near 50%), or cases the model was confident about
// and still got wrong (a pattern it hasn't learned)? Also flags a single
// factor that dominates the #1 spot across those mistakes. Needs at least
// MIN_WRONG_FOR_PATTERN wrong cases — with fewer, "대부분" would overclaim
// from a sample too small to call a pattern.
function wrongCasesSentence(report: ShapReport, domain: string): string | null {
  const wrong = report.cases.filter(
    (c) => c.isCorrect === false && c.probaPositive !== undefined,
  );
  if (wrong.length < MIN_WRONG_FOR_PATTERN) return null;

  const confidences = wrong.map((c) =>
    c.predictedPositive ? c.probaPositive! : 1 - c.probaPositive!,
  );
  const lowConfCount = confidences.filter((p) => p <= LOW_CONF_THRESHOLD).length;
  const highConfCount = confidences.filter((p) => p >= HIGH_CONF_THRESHOLD).length;

  const topFeatureCounts = new Map<string, number>();
  for (const c of wrong) {
    const top = c.topFeatures[0]?.feature;
    if (top) topFeatureCounts.set(top, (topFeatureCounts.get(top) ?? 0) + 1);
  }
  let topFeature: string | null = null;
  let topFeatureCount = 0;
  for (const [f, n] of topFeatureCounts) {
    if (n > topFeatureCount) {
      topFeature = f;
      topFeatureCount = n;
    }
  }

  const sentences: string[] = [];
  if (lowConfCount / wrong.length >= 0.6) {
    sentences.push(
      `빗나간 케이스(${wrong.length}개) 중 대부분은 확신도가 낮았어요 — 애매한 경계선에서 반대로 뒤집힌 경우가 많아요.`,
    );
  } else if (highConfCount / wrong.length >= 0.4) {
    sentences.push(
      `빗나간 케이스(${wrong.length}개) 중 ${highConfCount}개는 모델이 확신했는데도 틀렸어요 — 이런 패턴은 모델이 아직 잘 다루지 못하는 것 같아요.`,
    );
  }

  if (topFeature && topFeatureCount / wrong.length >= 0.5) {
    sentences.push(
      `빗나간 케이스는 대부분 '${label(domain, topFeature)}' 요인이 가장 크게 작용했어요.`,
    );
  }

  return sentences.length > 0 ? sentences.join(" ") : null;
}

// Conditional sentences only — a report with nothing notable yields [].
export function buildOverallSummary(report: ShapReport, domain: string): string[] {
  return [
    verdictSentence(report),
    topFeaturesSentence(report, domain),
    correlationSentence(report, domain),
    dataQualitySentence(report, domain),
    wrongCasesSentence(report, domain),
  ].filter((s): s is string => !!s);
}

// ---- clipboard report text — a fuller export than the on-screen 총평
// (full accuracy reasoning, full missingness/outlier/correlation lists), so
// copying isn't just re-copying what's already visible on screen.

function featureImportanceLines(report: ShapReport, domain: string): string[] {
  // full list, not the top-N the on-screen chart caps at — this text is meant
  // to be pasted elsewhere (e.g. to an LLM) where completeness beats brevity
  return report.featureImportance.map(
    (f, i) => `${i + 1}. ${label(domain, f.feature)} — ${f.importance.toFixed(3)}`,
  );
}

function suspectZerosLines(report: ShapReport, domain: string): string[] {
  const items = report.suspectZeros ?? [];
  return items.map(
    (z) =>
      `- ${label(domain, z.column)}: 0이 ${z.zeroCount}건 (${pct(z.zeroPct)}), 다른 값은 대부분 ${Math.round(z.lowerFence).toLocaleString()} 이상`,
  );
}

function missingnessLines(report: ShapReport, domain: string): string[] {
  const items = (report.missingness ?? []).filter((m) => m.missingCount > 0);
  if (items.length === 0) return ["결측치 없음"];
  return items
    .slice()
    .sort((a, b) => b.missingPct - a.missingPct)
    .map((m) => `- ${label(domain, m.column)}: ${m.missingCount}건 (${pct(m.missingPct)})`);
}

function outlierLines(report: ShapReport, domain: string): string[] {
  const items = (report.outliers ?? []).filter((o) => o.outlierCount > 0);
  if (items.length === 0) return ["이상치 없음"];
  return items
    .slice()
    .sort((a, b) => b.outlierPct - a.outlierPct)
    .map((o) => `- ${label(domain, o.column)}: ${o.outlierCount}건 (${pct(o.outlierPct)})`);
}

function correlationLines(report: ShapReport, domain: string): string[] {
  const pairs = strongCorrPairs(report).slice(0, CORR_LIST_LIMIT);
  if (pairs.length === 0) return [];
  const columns = report.correlations!.columns;
  return pairs.map(
    (p) => `- ${label(domain, columns[p.i])} ↔ ${label(domain, columns[p.j])}: r=${p.v.toFixed(2)}`,
  );
}

export function buildCopyText(
  report: ShapReport,
  domain: string,
  selectedCase?: ShapReport["cases"][number],
): string {
  const { positiveLabel, negativeLabel } = report;
  const lines: string[] = [
    "# XAI 리포트 요약",
    "",
    "아래는 SHAP 기반 XAI 분석 리포트입니다. 이 내용을 참고해서 제가 질문하면 답변해주세요.",
  ];

  const summary = buildOverallSummary(report, domain);
  if (summary.length > 0) {
    lines.push("", "## 총평", ...summary);
  }

  lines.push("", "## 정확도", `전체 정확도: ${pct(report.modelAccuracy)}`);
  if (report.caseStats) {
    const { total, wrong, borderline } = report.caseStats;
    lines.push(
      `분석한 전체 케이스: ${total}개 (예측이 틀린 케이스 ${wrong}개, 확신도 애매한(40~60%) 케이스 ${borderline}개)`,
    );
  }
  if (report.modelQuality) {
    lines.push(
      ...explainAccuracy(
        report.modelAccuracy,
        report.modelQuality.baselineAccuracy,
        report.modelQuality.verdict,
        positiveLabel ?? "양성",
        negativeLabel ?? "음성",
        report.modelQuality.minorityRecall,
        report.modelQuality.minorityLabel,
      ),
    );
  }

  lines.push("", "## 특성 중요도", ...featureImportanceLines(report, domain));

  const corrLines = correlationLines(report, domain);
  if (corrLines.length > 0) {
    lines.push("", "## 숫자형 컬럼 강한 상관관계", ...corrLines);
  }

  if (report.missingness?.length) {
    lines.push("", "## 결측치", ...missingnessLines(report, domain));
  }

  if (report.outliers?.length) {
    lines.push("", "## 이상치", ...outlierLines(report, domain));
  }

  if (report.suspectZeros?.length) {
    lines.push("", "## 숨은 결측 의심 (0으로 기록됨)", ...suspectZerosLines(report, domain));
  }

  if (selectedCase) {
    lines.push("", "## 선택한 케이스 설명", selectedCase.explanation);
  }

  return lines.join("\n");
}
