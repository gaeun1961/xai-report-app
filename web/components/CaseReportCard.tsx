"use client";

import { useState } from "react";
import type { ShapReport } from "@/lib/types";
import { columnDesc } from "@/lib/columnGlossary";
import styles from "./report.module.css";

type Props = {
  case: ShapReport["cases"][number];
  domain: string;
  positiveLabel?: string;
  negativeLabel?: string;
};

function FeatureName({ domain, name }: { domain: string; name: string }) {
  const desc = columnDesc(domain, name);
  return desc ? (
    <b className={`${styles.contribName} ${styles.hasDesc}`} title={desc}>
      {name}
    </b>
  ) : (
    <b className={styles.contribName}>{name}</b>
  );
}

function strengthWord(contribution: number): string {
  const a = Math.abs(contribution);
  if (a >= 0.15) return "강하게";
  if (a >= 0.05) return "어느 정도";
  return "약간";
}

export default function CaseReportCard({
  case: c,
  domain,
  positiveLabel,
  negativeLabel,
}: Props) {
  const [showNumbers, setShowNumbers] = useState(false);
  const positive = c.predictedPositive;
  // Fall back to the CSV's own predicted value when no preset label is given.
  const posText = positiveLabel ?? c.prediction;
  const negText = negativeLabel ?? c.prediction;
  const outcome = positive ? posText : negText;

  return (
    <article className={styles.card}>
      <header className={styles.cardHead}>
        <span className={styles.caseId}>케이스 #{c.id}</span>
        <span
          className={`${styles.badge} ${positive ? styles.badgeYes : styles.badgeNo}`}
        >
          예측: {outcome}
        </span>
      </header>

      <p className={styles.explanation}>{c.explanation}</p>

      <div className={styles.contribHead}>
        <span>각 요인이 예측에 준 영향</span>
        <button
          type="button"
          className={styles.toggleBtn}
          onClick={() => setShowNumbers((v) => !v)}
        >
          {showNumbers ? "문장으로 보기" : "숫자로 보기"}
        </button>
      </div>

      <ul className={styles.contribList}>
        {c.topFeatures.map((f) => {
          const up = f.contribution >= 0;
          const dir = up ? posText : negText;
          return (
            <li key={f.feature} className={styles.contribRow}>
              {showNumbers ? (
                <>
                  <span className={styles.contribFeature}>
                    <FeatureName domain={domain} name={f.feature} /> = {f.value}
                  </span>
                  <span
                    className={`${styles.contribValue} ${up ? styles.up : styles.down}`}
                  >
                    {up ? "+" : ""}
                    {f.contribution.toFixed(3)}
                  </span>
                </>
              ) : (
                <span className={styles.contribSentence}>
                  <FeatureName domain={domain} name={f.feature} />
                  <span className={styles.contribVal}> ({f.value})</span> —{" "}
                  <b className={up ? styles.up : styles.down}>{dir}</b> 예측 쪽으로{" "}
                  {strengthWord(f.contribution)} 작용했어요
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </article>
  );
}
