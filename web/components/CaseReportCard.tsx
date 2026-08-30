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

const TOP_N = 5;

// Split on a period followed by whitespace — a real sentence break. A decimal
// like "0.120" is "digit . digit" (no space after the dot), so it's untouched.
function toSentences(text: string): string[] {
  return text.split(/(?<=\.)\s+/).filter(Boolean);
}

function strengthWord(contribution: number): string {
  const a = Math.abs(contribution);
  if (a >= 0.15) return "강하게";
  if (a >= 0.05) return "어느 정도";
  return "약간";
}

// Plain-language note for a case the model got wrong, based on how far its
// probability sat from the 50% decision line.
function whyWrongText(predConfidencePct: number, distFrom50: number): string {
  if (distFrom50 <= 0.05) {
    return `이 예측은 확률이 50%에 아주 가까워서(${predConfidencePct}%), 경계선에서 반대로 뒤집힌 경우예요.`;
  }
  if (distFrom50 >= 0.2) {
    return `이 모델은 꽤 확신했지만(${predConfidencePct}%) 실제로는 예측이 빗나갔어요 — 이 케이스가 모델이 잘 다루지 못하는 패턴일 수 있어요.`;
  }
  return `이 예측은 확신도가 중간 정도(${predConfidencePct}%)였는데 빗나갔어요. 근거가 뚜렷하지 않은 케이스였던 것 같아요.`;
}

export default function CaseReportCard({
  case: c,
  domain,
  positiveLabel,
  negativeLabel,
  baseValue,
}: Props) {
  const [showNumbers, setShowNumbers] = useState(false);
  const [factorQuery, setFactorQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

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

  const showWhyWrong = showActual && c.isCorrect === false && c.probaPositive !== undefined;
  const predConfidence = positive ? c.probaPositive! : 1 - c.probaPositive!;

  const factors = c.topFeatures;
  const query = factorQuery.trim().toLowerCase();
  const filtered = query
    ? factors.filter((f) => f.feature.toLowerCase().includes(query))
    : factors;
  const visible = query || expanded ? filtered : filtered.slice(0, TOP_N);
  const hiddenCount = factors.length - TOP_N;

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

      <div className={styles.explanation}>
        {toSentences(c.explanation).map((s, i) => (
          <p key={i}>{s}</p>
        ))}
      </div>

      {showWhyWrong && (
        <p className={styles.whyWrong}>
          {whyWrongText(
            Math.round(predConfidence * 100),
            Math.abs(c.probaPositive! - 0.5),
          )}
        </p>
      )}

      {showBaseline && (
        <p className={styles.baseline}>
          이 모델이 기본적으로 보는 &lsquo;{posText}&rsquo; 확률은{" "}
          {pct(baseValue!)}인데, 이 케이스의 요인들을 반영하면{" "}
          <b>{pct(c.probaPositive!)}</b>가 됩니다.{" "}
          {c.probaPositive! >= 0.5 ? "50%를 넘어" : "50%에 못 미쳐"} &lsquo;
          {outcome}&rsquo;으로 예측했어요. 상위 {TOP_N}개 외에도 여러 요인이 조금씩
          반영된 값이에요.
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

      {factors.length > TOP_N && (
        <input
          className={styles.factorSearch}
          type="search"
          placeholder={`요인 이름으로 검색 (전체 ${factors.length}개)`}
          value={factorQuery}
          onChange={(e) => setFactorQuery(e.target.value)}
        />
      )}

      <ul className={styles.contribList}>
        {visible.length === 0 ? (
          <li className={styles.contribRow}>
            <span className={styles.contribFeature}>일치하는 요인 없음</span>
          </li>
        ) : (
          visible.map((f) => {
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
          })
        )}
      </ul>

      {!query && hiddenCount > 0 && (
        <button
          type="button"
          className={styles.moreFactorsBtn}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "접기" : `다른 요인 ${hiddenCount}개 더 보기`}
        </button>
      )}
    </article>
  );
}
