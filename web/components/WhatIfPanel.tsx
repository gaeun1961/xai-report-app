"use client";

import { useState } from "react";
import { whatIf, type WhatIfResult } from "@/lib/api";
import { columnDesc, isSuggestedDesc } from "@/lib/columnGlossary";
import GlossaryTerm from "./GlossaryTerm";
import InfoTip from "./InfoTip";
import styles from "./report.module.css";

type Props = {
  analysisId: string;
  domain: string;
  rawRow: Record<string, unknown>;
  // same case.topFeatures the main explanation uses - only the numeric ones
  // are editable here (categorical value-swapping isn't supported yet, see
  // backend/routers/analyze.py's /whatif)
  topFeatures: { feature: string; value: unknown }[];
  positiveLabel?: string;
  negativeLabel?: string;
};

// keeps the form to a manageable size - the same cap the case card's chart
// uses for "top" vs "the rest"
const EDIT_LIMIT = 10;

export default function WhatIfPanel({
  analysisId,
  domain,
  rawRow,
  topFeatures,
  positiveLabel,
  negativeLabel,
}: Props) {
  const numericFeatures = topFeatures
    .filter((f) => typeof f.value === "number")
    .slice(0, EDIT_LIMIT);

  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (numericFeatures.length === 0) return null;

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const row = { ...rawRow, ...overrides };
      setResult(await whatIf(analysisId, row));
    } catch (e) {
      setError(e instanceof Error ? e.message : "다시 예측하는 중 문제가 발생했어요.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setOverrides({});
    setResult(null);
    setError(null);
  }

  const changed = Object.keys(overrides).length > 0;

  return (
    <section className={styles.cardSection}>
      <h2 className={styles.h2}>
        값 바꿔서 다시 예측해보기{" "}
        <InfoTip text="이 케이스의 숫자형 특성값을 직접 바꿔보면, 그 값 기준으로 모델이 다시 예측하고 어떤 요인이 얼마나 영향을 줬는지 새로 계산해줘요. 원래 케이스 설명은 그대로 남아있고, 이 결과만 따로 보여줘요." />
      </h2>

      <div className={styles.whatIfGrid}>
        {numericFeatures.map((f) => (
          <label key={f.feature} className={styles.whatIfField}>
            <GlossaryTerm
              term={f.feature}
              desc={columnDesc(domain, f.feature)}
              suggested={isSuggestedDesc(domain, f.feature)}
            />
            <input
              type="number"
              className={styles.whatIfInput}
              value={overrides[f.feature] ?? (f.value as number)}
              onChange={(e) => {
                const v = e.target.value === "" ? NaN : Number(e.target.value);
                setOverrides((prev) => ({ ...prev, [f.feature]: v }));
              }}
            />
          </label>
        ))}
      </div>

      <div className={styles.badges}>
        <button
          type="button"
          className={styles.toggleBtn}
          onClick={run}
          disabled={loading}
        >
          {loading ? "다시 예측하는 중..." : "다시 예측하기"}
        </button>
        {changed && (
          <button type="button" className={styles.toggleBtn} onClick={reset}>
            초기화
          </button>
        )}
      </div>

      {error && <p className={styles.sectionNote}>{error}</p>}

      {result && (
        <div className={styles.baseline}>
          <p>
            바뀐 값 기준으로는 <b>&lsquo;{result.predictionDisplay}&rsquo;</b>로
            예측돼요 (확신도{" "}
            {Math.round(
              (result.predictedPositive
                ? result.probaPositive
                : 1 - result.probaPositive) * 100,
            )}
            %).
          </p>
          <ul className={styles.contribList}>
            {result.topFeatures.slice(0, 5).map((f) => {
              const up = f.contribution >= 0;
              const dir = up ? positiveLabel ?? result.prediction : negativeLabel ?? result.prediction;
              return (
                <li key={f.feature} className={styles.contribRow}>
                  <div className={styles.contribMain}>
                    <span className={styles.contribFeature}>
                      <GlossaryTerm
                        term={f.feature}
                        desc={columnDesc(domain, f.feature)}
                        suggested={isSuggestedDesc(domain, f.feature)}
                        className={styles.contribName}
                      />{" "}
                      = {f.value ?? "-"}
                    </span>
                    <span className={`${styles.contribValue} ${up ? styles.up : styles.down}`}>
                      {up ? "+" : ""}
                      {f.contribution.toFixed(3)} ({dir} 쪽)
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
