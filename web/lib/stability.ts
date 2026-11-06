// "설명 안정성": does the feature-importance ranking survive re-training on a
// different 80% subsample with a different seed? Numbers come from
// common.summarize_stability (backend /stability, or baked into presets).
import type { ShapReport } from "./types";

export type Stability = NonNullable<ShapReport["explanationStability"]>;
export type StabilityLevel = "high" | "medium" | "low";

// Set from the measured distribution (5 runs, top-5, mean over 10 run pairs):
//   Titanic 0.92 / ρ0.94, Telco 0.92 / ρ0.99, heart.csv 0.86 / ρ0.97  -> high
//   HR 0.72 / ρ0.94, Telco under upload caps 0.78 / ρ0.96              -> medium
//   synthetic regression, 9 of 12 features pure noise 0.74 / ρ0.80   -> low
// i.e. high = what the steadiest real datasets reach; low = below every real
// dataset measured (on average 1.5+ of the top 5 swap out between runs, or
// the full ranking barely correlates).
export const STABILITY_HIGH = { overlap: 0.85, corr: 0.9 };
export const STABILITY_LOW = { overlap: 0.7, corr: 0.8 };

export function stabilityLevel(s: Stability): StabilityLevel {
  if (s.topKOverlap < STABILITY_LOW.overlap || s.rankCorr < STABILITY_LOW.corr) return "low";
  if (s.topKOverlap >= STABILITY_HIGH.overlap && s.rankCorr >= STABILITY_HIGH.corr) return "high";
  return "medium";
}

export const STABILITY_LABEL: Record<StabilityLevel, string> = {
  high: "높음",
  medium: "보통",
  low: "낮음",
};

// shown once each on the card (tooltip / small note) and in the copy text
export const STABILITY_BASIS_NOTE =
  "프리셋 3종과 참고 데이터의 실측으로 잡은 경험적 기준이에요. 통계적으로 검증된 기준은 아니라서 참고용으로 봐주세요.";
export const STABILITY_SAMPLE_NOTE =
  "빠르게 계산하려고 SHAP은 200행 기준으로 5번 다시 학습해 비교해요. 위 특성 중요도는 더 많은 행으로 계산해서 수치가 조금 다를 수 있어요.";

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function stabilityEvidence(s: Stability): string {
  return (
    `데이터 ${pct(s.sampleFrac)}씩 뽑아 ${s.runs}번 다시 학습 · ` +
    `상위 ${s.topK}개 일치율 평균 ${pct(s.topKOverlap)} (최저 ${pct(s.topKOverlapMin)}) · ` +
    `순위 상관 ${s.rankCorr.toFixed(2)} (최저 ${s.rankCorrMin.toFixed(2)})`
  );
}

// corrPair: the strongest correlated pair worth flagging, already labeled
export function stabilitySentence(s: Stability, corrPair?: [string, string]): string {
  const base = {
    high: `데이터를 바꿔 다시 학습해도 상위 ${s.topK}개 요인이 거의 그대로라, 특성 중요도 순위를 믿고 읽어도 돼요.`,
    medium: `상위 요인 대부분은 유지되지만 일부 순위는 데이터에 따라 바뀔 수 있어요. 비슷한 순위끼리의 차이는 크게 해석하지 마세요.`,
    low: `데이터가 조금만 바뀌어도 상위 요인이 달라져요. 순위 하나하나보다 큰 경향 위주로 읽어주세요.`,
  }[stabilityLevel(s)];
  return corrPair
    ? `${base} '${corrPair[0]}'-'${corrPair[1]}'처럼 서로 강하게 연관된 특성은 기여도가 나뉘어 보일 수 있어요.`
    : base;
}
