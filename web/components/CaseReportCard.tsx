"use client";

import { useState } from "react";
import type { ShapReport } from "@/lib/types";
import { columnDesc } from "@/lib/columnGlossary";
import GlossaryTerm from "./GlossaryTerm";
import styles from "./report.module.css";

type Props = {
  case: ShapReport["cases"][number];
  domain: string;
  positiveLabel?: string;
  negativeLabel?: string;
  baseValue?: number;
};

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
  baseValue,
}: Props) {
  const [showNumbers, setShowNumbers] = useState(false);
  const positive = c.predictedPositive;
  // Fall back to the CSV's own predicted value when no preset label is given.
  const posText = positiveLabel ?? c.prediction;
  const negText = negativeLabel ?? c.prediction;
  const outcome = positive ? posText : negText;

  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const showBaseline =
    baseValue !== undefined && c.probaPositive !== undefined;

  const showActual = c.actualLabel !== undefined && c.isCorrect !== undefined;
  const actualText = c.actualPositive
    ? (positiveLabel ?? c.actualLabel)
    : (negativeLabel ?? c.actualLabel);

  return (
    <article className={styles.card}>
      <header className={styles.cardHead}>
        <span className={styles.caseId}>케이스 #{c.id}</span>
        <div className={styles.badges}>
          <span
            className={`${styles.badge} ${positive ? styles.badgeYes : styles.badgeNo}`}
          >
            예측: {outcome}
          </span>
          {showActual && (
            <span
              className={`${styles.badge} ${
                c.isCorrect ? styles.badgeActualOk : styles.badgeActualBad
              }`}
            >
              {c.isCorrect ? "✓ 적중" : "✗ 빗나감"} · 실제: {actualText}
            </span>
          )}
        </div>
      </header>

      <p className={styles.explanation}>{c.explanation}</p>

      {showBaseline && (
        <p className={styles.baseline}>
          이 모델이 기본적으로 보는 &lsquo;{posText}&rsquo; 확률은{" "}
          {pct(baseValue!)}인데, 이 케이스의 요인들을 반영하면{" "}
          <b>{pct(c.probaPositive!)}</b>가 됩니다.{" "}
          {c.probaPositive! >= 0.5 ? "50%를 넘어" : "50%에 못 미쳐"} &lsquo;
          {outcome}&rsquo;으로 예측했어요. 위 {c.topFeatures.length}개 외에도 여러
          요인이 조금씩 반영된 값이에요.
        </p>
      )}

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
                    <GlossaryTerm
                      term={f.feature}
                      desc={columnDesc(domain, f.feature)}
                      className={styles.contribName}
                    />{" "}
                    = {f.value}
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
                  <GlossaryTerm
                    term={f.feature}
                    desc={columnDesc(domain, f.feature)}
                    className={styles.contribName}
                  />{" "}
                  <span className={styles.nowrap}>({f.value})</span>{" "}
                  <span className={styles.nowrap}>
                    &mdash;{" "}
                    <b className={up ? styles.up : styles.down}>{dir}</b>
                    &nbsp;예측&nbsp;쪽으로
                  </span>{" "}
                  <span className={styles.nowrap}>
                    {strengthWord(f.contribution)}&nbsp;작용했어요
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </article>
  );
}
