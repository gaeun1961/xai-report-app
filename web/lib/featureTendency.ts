// Whether a feature's own value tends to push predictions toward the
// positive or negative class — e.g. "여성인 경우 '생존' 확률이 높아요".
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
import { columnDesc, columnValueLabel } from "./columnGlossary";

const MIN_CASES_FOR_TENDENCY = 3;
const STRONG_R = 0.5;

// Korean subject particle (이/가), chosen by whether the noun's last
// syllable has a trailing consonant (batchim) - e.g. "나이" -> "가", "혈압"
// -> "이". Plain Hangul-unicode math, not a grammar engine; non-Hangul input
// (numbers, English column names) just falls back to "가".
function subjectParticle(noun: string): "이" | "가" {
  const last = noun.trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return "가";
  return code % 28 === 0 ? "가" : "이";
}

// "환자의 나이" -> "나이" (strips one leading "X의 " possessive); a
// description with no such prefix (e.g. "혈중 콜레스테롤 수치") is used as-is.
// Deliberately this simple - not a phrase parser, just enough to keep the
// glossary's own wording from reading like "환자의 나이가 클수록".
function coreNoun(desc: string): string {
  return desc.trim().replace(/^\S+의\s+/, "");
}

// InfoTip splits a line before " -" as an aside-dash marker, which would
// otherwise chop a negative coefficient like "(상관계수 -0.97)" into two
// lines at the minus sign — the proper Unicode minus (U+2212) sidesteps
// that collision and reads correctly either way.
function formatR(r: number): string {
  const abs = Math.abs(r).toFixed(2);
  return r < 0 ? `−${abs}` : abs;
}

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

export function featureTendencies(
  report: ShapReport,
  domain: string,
): Record<string, string> {
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

    if (Math.abs(r) < STRONG_R) {
      result[feature] = `이 요인은 값과 작용 방향의 관계가 뚜렷하지 않아요.`;
      continue;
    }

    // for a binary column with a curated "N=라벨" glossary entry (presets
    // only — an uploaded CSV has no such mapping), name the actual value
    // instead of the more abstract "값이 클수록"
    const distinct = [...new Set(pairs.map((p) => p.value))];
    let decodedLabel: string | undefined;
    if (distinct.length === 2) {
      const hi = Math.max(...distinct);
      const lo = Math.min(...distinct);
      const posValue = r > 0 ? hi : lo;
      decodedLabel = columnValueLabel(domain, feature, posValue);
    }

    if (decodedLabel) {
      result[feature] =
        `${decodedLabel}인 경우 '${pos}' 확률이 높아요.\n(상관계수 ${formatR(r)})`;
    } else {
      // an ordered numeric column (Age, MonthlyIncome, ...) reads better as
      // "나이가 클수록" than the generic "값이 클수록" once we know what the
      // column actually is; subjectParticle("값") happens to already return
      // "이", so the no-description case reproduces today's wording exactly.
      const desc = columnDesc(domain, feature);
      const subject = desc ? coreNoun(desc) : "값";
      const target = r >= STRONG_R ? pos : neg;
      result[feature] =
        `${subject}${subjectParticle(subject)} 클수록\n대체로 '${target}' 쪽으로 작용하는 경향이 있어요.\n(상관계수 ${formatR(r)})`;
    }
  }
  return result;
}
