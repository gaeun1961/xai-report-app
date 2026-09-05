"use client";

import { useState } from "react";
import type { ShapReport } from "@/lib/types";
import { columnDesc } from "@/lib/columnGlossary";
import GlossaryTerm from "./GlossaryTerm";
import styles from "./report.module.css";

type OutlierItem = NonNullable<ShapReport["outliers"]>[number];

type Props = {
  items: OutlierItem[];
  domain: string;
  collapsedCount?: number;
};

// each row is scaled to its OWN min–max (unlike the percent charts, these
// columns have unrelated units/ranges — there's no shared "absolute" scale
// that would mean anything across e.g. tenure and MonthlyCharges)
const DOT_CAP = 20;

export default function OutlierBoxPlot({
  items,
  domain,
  collapsedCount = 8,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const sorted = [...items].sort((a, b) => b.outlierPct - a.outlierPct);
  const hidden = sorted.length - collapsedCount;
  const visible = expanded ? sorted : sorted.slice(0, collapsedCount);

  return (
    <>
      <div className={styles.scatterLegend}>
        <span className={styles.scatterLegendItem}>
          <i className={styles.boxPlotLegendBox} />
          사분위범위(IQR)
        </span>
        <span className={styles.scatterLegendItem}>
          <i className={styles.boxPlotLegendMedian} />
          중앙값
        </span>
        <span className={styles.scatterLegendItem}>
          <i className={`${styles.scatterDotIcon} ${styles.boxPlotLegendDot}`} />
          이상치
        </span>
      </div>

      <ul className={styles.chart}>
        {visible.map((it) => {
          const range = it.max - it.min || 1;
          const pct = (v: number) =>
            Math.min(100, Math.max(0, ((v - it.min) / range) * 100));
          const shown = it.outlierSample.slice(0, DOT_CAP);
          const hiddenDots = it.outlierSample.length - shown.length;

          return (
            <li key={it.column} className={styles.chartRow}>
              <span className={styles.chartLabel}>
                <GlossaryTerm term={it.column} desc={columnDesc(domain, it.column)} />
              </span>
              <span
                className={styles.boxPlotTrack}
                title={`min ${it.min} · Q1 ${it.q1} · 중앙값 ${it.median} · Q3 ${it.q3} · max ${it.max}${
                  hiddenDots > 0 ? ` · 이상치 ${it.outlierSample.length}개 중 ${shown.length}개만 표시` : ""
                }`}
              >
                <span
                  className={styles.boxPlotWhisker}
                  style={{
                    left: `${pct(it.whiskerLow)}%`,
                    width: `${Math.max(pct(it.whiskerHigh) - pct(it.whiskerLow), 0)}%`,
                  }}
                />
                <span
                  className={styles.boxPlotBox}
                  style={{
                    left: `${pct(it.q1)}%`,
                    width: `${Math.max(pct(it.q3) - pct(it.q1), 1.5)}%`,
                  }}
                />
                <span
                  className={styles.boxPlotMedian}
                  style={{ left: `${pct(it.median)}%` }}
                />
                {shown.map((v, i) => (
                  <span
                    key={i}
                    className={styles.boxPlotDot}
                    style={{ left: `${pct(v)}%` }}
                  />
                ))}
              </span>
              <span className={styles.chartValue}>
                {(it.outlierPct * 100).toFixed(1)}%
              </span>
            </li>
          );
        })}
      </ul>

      {hidden > 0 && (
        <button
          type="button"
          className={styles.moreFactorsBtn}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "접기" : `나머지 ${hidden}개 더 보기`}
        </button>
      )}
    </>
  );
}
