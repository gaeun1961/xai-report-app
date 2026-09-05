"use client";

import { Fragment, useRef, useState } from "react";
import type { ShapReport } from "@/lib/types";
import { columnDesc } from "@/lib/columnGlossary";
import PercentBarChart from "./PercentBarChart";
import OutlierBoxPlot from "./OutlierBoxPlot";
import styles from "./report.module.css";

type Props = {
  data: NonNullable<ShapReport["correlations"]>;
  domain: string;
  missingness?: ShapReport["missingness"];
  outliers?: ShapReport["outliers"];
};

// ".52" / "-.31" — drop the leading zero, it's always |v| <= 1
const fmt = (v: number) =>
  v.toFixed(2).replace(/^(-?)0\./, "$1.").replace("1.00", "1");

const pctFmt = (v: number) => `${(v * 100).toFixed(1)}%`;

const STRONG = 0.6;

export default function CorrelationMatrix({
  data,
  domain,
  missingness,
  outliers,
}: Props) {
  const { columns, matrix } = data;
  const n = columns.length;
  const label = (c: string) => columnDesc(domain, c) ?? c;
  const [focused, setFocused] = useState<string | null>(null);
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // strong pairs (upper triangle), strongest first, capped
  const strongPairs = matrix
    .flatMap((row, i) =>
      row
        .slice(i + 1)
        .map((v, k) => ({ i, j: i + 1 + k, v }))
        .filter((p) => Math.abs(p.v) >= STRONG),
    )
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
    .slice(0, 5);

  function focusPair(i: number, j: number) {
    const key = `${i}-${j}`;
    setFocused(key);
    cellRefs.current
      .get(key)
      ?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }

  return (
    <>
      <section className={styles.section}>
        <h2 className={styles.h2}>숫자형 컬럼 관계</h2>
        <p className={styles.sectionNote}>
          모델과는 무관하게, 데이터 안에서 두 컬럼이 얼마나 같이 움직이는지
          보여줘요. 진한 색일수록, 굵은 테두리 칸일수록 강한 관계예요.
        </p>

        {strongPairs.length > 0 && (
          <div className={styles.corrChipRow}>
            {strongPairs.map(({ i, j, v }) => (
              <button
                key={`chip-${i}-${j}`}
                type="button"
                className={styles.corrChip}
                onClick={() => focusPair(i, j)}
              >
                {label(columns[i])} ↔ {label(columns[j])} · {v.toFixed(2)}
              </button>
            ))}
          </div>
        )}

        <div className={styles.corrWrap}>
          <div
            className={styles.corrGrid}
            style={{
              gridTemplateColumns: `minmax(96px, auto) repeat(${n}, minmax(40px, 1fr))`,
            }}
          >
            <div className={styles.corrCorner} />
            {columns.map((c) => (
              <div
                key={`h-${c}`}
                className={styles.corrColHead}
                title={columnDesc(domain, c) ?? c}
              >
                <span>{c}</span>
              </div>
            ))}

            {matrix.map((row, i) => (
              <Fragment key={`row-${i}`}>
                <div
                  className={styles.corrRowHead}
                  title={columnDesc(domain, columns[i]) ?? columns[i]}
                >
                  {columns[i]}
                </div>
                {row.map((v, j) => {
                  const mag = Math.min(1, Math.abs(v));
                  const pct = Math.round(mag * 85);
                  const bg =
                    i === j
                      ? "var(--border)"
                      : v >= 0
                        ? `color-mix(in srgb, var(--accent) ${pct}%, transparent)`
                        : `color-mix(in srgb, #b45309 ${pct}%, transparent)`;
                  const strong = i !== j && mag >= STRONG;
                  const key = `${i}-${j}`;
                  return (
                    <div
                      key={`cell-${i}-${j}`}
                      ref={(el) => {
                        if (el) cellRefs.current.set(key, el);
                      }}
                      className={`${styles.corrCell} ${
                        strong
                          ? v >= 0
                            ? styles.corrCellStrongPos
                            : styles.corrCellStrongNeg
                          : ""
                      } ${focused === key ? styles.corrCellFocused : ""}`}
                      style={{ background: bg, color: mag > 0.5 ? "#fff" : undefined }}
                      title={`${columns[i]} ↔ ${columns[j]}: ${v.toFixed(2)}`}
                    >
                      {i === j ? "" : fmt(v)}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </section>

      {(!!missingness?.length || !!outliers?.length) && (
        <section className={styles.section}>
          <h2 className={styles.h2}>결측치·이상치</h2>

          {!!outliers?.length && (
            <div className={styles.reportCol}>
              <h3 className={styles.h2}>이상치</h3>
              <p className={styles.sectionNote}>
                숫자형 컬럼의 값 분포예요. 상자는 사분위범위(중간 50%), 선은
                중앙값, 점은 그 범위를 크게 벗어난 이상치예요.
              </p>
              <OutlierBoxPlot items={outliers} domain={domain} />
            </div>
          )}

          {!!missingness?.length && (
            <div className={styles.reportCol}>
              <h3 className={styles.h2}>결측치</h3>
              {missingness.every((m) => m.missingCount === 0) ? (
                <p className={styles.sectionNote}>
                  이 데이터셋엔 결측치가 없어요 ✓
                </p>
              ) : (
                <>
                  <p className={styles.sectionNote}>
                    컬럼별로 값이 비어 있던 비율이에요. 모델은 숫자는 중간값,
                    범주는 &quot;결측&quot;이라는 값으로 채워서 학습했어요.
                  </p>
                  <PercentBarChart
                    items={missingness.map((m) => ({
                      label: m.column,
                      value: m.missingPct,
                    }))}
                    domain={domain}
                    valueFormat={pctFmt}
                  />
                </>
              )}
            </div>
          )}
        </section>
      )}
    </>
  );
}
