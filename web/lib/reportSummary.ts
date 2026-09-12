// Builds the "총평" paragraph and the clipboard prompt text purely from data
// already present in a loaded ShapReport — no new LLM calls.
import type { ShapReport } from "./types";
import { columnDesc } from "./columnGlossary";

const STRONG_CORR = 0.6;
const NOTABLE_PCT = 0.05;

function label(domain: string, column: string): string {
  return columnDesc(domain, column) ?? column;
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
  const top = report.featureImportance.slice(0, 3).map((f) => label(domain, f.feature));
  if (top.length === 0) return null;
  return `예측에 가장 큰 영향을 준 요인은 ${top.join(", ")}예요.`;
}

function correlationSentence(report: ShapReport, domain: string): string | null {
  const data = report.correlations;
  if (!data) return null;
  const { columns, matrix } = data;
  let best: { i: number; j: number; v: number } | null = null;
  for (let i = 0; i < columns.length; i++) {
    for (let j = i + 1; j < columns.length; j++) {
      const v = matrix[i][j];
      if (Math.abs(v) >= STRONG_CORR && (!best || Math.abs(v) > Math.abs(best.v))) {
        best = { i, j, v };
      }
    }
  }
  if (!best) return null;
  const a = label(domain, columns[best.i]);
  const b = label(domain, columns[best.j]);
  return `'${a}'와 '${b}' 사이에 강한 상관관계(r=${best.v.toFixed(2)})가 있어 다중공선성에 주의가 필요해요.`;
}

function dataQualitySentence(report: ShapReport, domain: string): string | null {
  const notes: string[] = [];

  const badMissing = report.missingness?.filter((m) => m.missingPct >= NOTABLE_PCT) ?? [];
  if (badMissing.length > 0) {
    const names = badMissing.slice(0, 2).map((m) => label(domain, m.column));
    notes.push(`${names.join(", ")} 등에 결측치가 있어요`);
  }

  const badOutlier = report.outliers?.filter((o) => o.outlierPct >= NOTABLE_PCT) ?? [];
  if (badOutlier.length > 0) {
    const names = badOutlier.slice(0, 2).map((o) => label(domain, o.column));
    notes.push(`${names.join(", ")}에 이상치가 있어요`);
  }

  if (notes.length === 0) return null;
  return `${notes.join(", ")}.`;
}

// Conditional sentences only — a data shape with nothing notable yields [].
export function buildOverallSummary(report: ShapReport, domain: string): string[] {
  return [
    verdictSentence(report),
    topFeaturesSentence(report, domain),
    correlationSentence(report, domain),
    dataQualitySentence(report, domain),
  ].filter((s): s is string => !!s);
}

export function buildCopyText(
  report: ShapReport,
  domain: string,
  selectedCase?: ShapReport["cases"][number],
): string {
  const lines: string[] = [];

  lines.push("# XAI 리포트 요약");
  lines.push("");

  const summary = buildOverallSummary(report, domain);
  if (summary.length > 0) {
    lines.push(...summary);
    lines.push("");
  }

  lines.push(`- 전체 정확도: ${(report.modelAccuracy * 100).toFixed(1)}%`);
  lines.push("- 특성 중요도 상위:");
  report.featureImportance.slice(0, 5).forEach((f, i) => {
    lines.push(`  ${i + 1}. ${label(domain, f.feature)}`);
  });

  if (selectedCase) {
    lines.push("");
    lines.push("## 선택한 케이스 설명");
    lines.push(selectedCase.explanation);
  }

  lines.push("");
  lines.push("이 분석 결과에 대해 궁금한 점을 물어봐도 좋아요.");

  return lines.join("\n");
}
