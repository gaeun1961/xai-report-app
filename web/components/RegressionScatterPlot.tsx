"use client";

import { useMemo, useState } from "react";
import type { ShapReport } from "@/lib/types";
import { fmtNum, fmtSigned } from "@/lib/reportSummary";
import { useIsMobile } from "./CaseScatterPlot";
import styles from "./report.module.css";

type CaseItem = ShapReport["cases"][number];

type Props = {
  cases: CaseItem[];
  noById: Map<string, number>;
  selectedId: string;
  onSelect: (id: string) => void;
};

// Regression counterpart of CaseScatterPlot: x = predicted, y = actual, so a
// perfect prediction sits on the y=x diagonal and the distance from it is the
// error. Both axes carry data, so none of the classification plot's beeswarm
// packing is needed - only its hit targets, tooltip and styling are shared.
const WIDTH = 640;
const HEIGHT = 300;
const MARGIN = { top: 12, right: 16, bottom: 36, left: 52 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;
const TICKS = 5;
const DOT_R = 3.6;
const DOT_R_SELECTED = 5.8;

export default function RegressionScatterPlot({ cases, noById, selectedId, onSelect }: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const hitR = isMobile ? 14 : 9;

  // one shared domain for both axes (padded 5%) so the diagonal really is y=x
  const { lo, hi, x, y, ticks } = useMemo(() => {
    const vals = cases.flatMap((c) => [c.predictedValue ?? 0, c.actualValue ?? 0]);
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    if (!(max > min)) {
      min -= 1;
      max += 1;
    }
    const pad = (max - min) * 0.05;
    const lo = min - pad;
    const hi = max + pad;
    return {
      lo,
      hi,
      x: (v: number) => MARGIN.left + ((v - lo) / (hi - lo)) * PLOT_W,
      y: (v: number) => MARGIN.top + (1 - (v - lo) / (hi - lo)) * PLOT_H,
      ticks: Array.from({ length: TICKS }, (_, i) => lo + ((hi - lo) * i) / (TICKS - 1)),
    };
  }, [cases]);

  if (cases.length === 0) {
    return <p className={styles.selectorEmpty}>일치하는 케이스 없음</p>;
  }

  // selected point drawn last so it sits on top
  const ordered = [...cases].sort((a) => (a.id === selectedId ? 1 : -1));
  const hovered = hoverId ? cases.find((c) => c.id === hoverId) : undefined;

  return (
    <div className={styles.scatterWrap}>
      <div className={styles.scatterLegend}>
        <span className={styles.scatterLegendItem}>
          <i className={`${styles.scatterDotIcon} ${styles.scatterDotOk}`} />
          오차 작음
        </span>
        <span className={styles.scatterLegendItem}>
          <i className={`${styles.scatterDotIcon} ${styles.scatterDotWrong}`} />
          오차 큼
        </span>
        <span className={styles.scatterLegendItem}>점선 = 완벽한 예측 (예측값 = 실제값)</span>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className={styles.scatter}
        role="img"
        aria-label="케이스별 예측값-실제값 산점도"
        onMouseLeave={() => setHoverId(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={y(t)}
              y2={y(t)}
              className={styles.scatterAxisLine}
            />
            <text
              x={MARGIN.left - 6}
              y={y(t)}
              className={styles.scatterTick}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {fmtNum(t)}
            </text>
            <text
              x={x(t)}
              y={HEIGHT - 18}
              className={styles.scatterTick}
              textAnchor="middle"
            >
              {fmtNum(t)}
            </text>
          </g>
        ))}
        <text x={MARGIN.left + PLOT_W / 2} y={HEIGHT - 3} className={styles.scatterAxisLabel} textAnchor="middle">
          예측값
        </text>
        <text
          x={12}
          y={MARGIN.top + PLOT_H / 2}
          className={styles.scatterAxisLabel}
          textAnchor="middle"
          transform={`rotate(-90 12 ${MARGIN.top + PLOT_H / 2})`}
        >
          실제값
        </text>

        <line x1={x(lo)} y1={y(lo)} x2={x(hi)} y2={y(hi)} className={styles.scatterAxisMid} />

        {/* each dot's error as a vertical stem to the diagonal */}
        {cases.map((c) => (
          <line
            key={`stem-${c.id}`}
            x1={x(c.predictedValue ?? 0)}
            x2={x(c.predictedValue ?? 0)}
            y1={y(c.actualValue ?? 0)}
            y2={y(c.predictedValue ?? 0)}
            className={styles.scatterAxisLine}
            style={{ stroke: "var(--text-muted)", opacity: 0.45 }}
          />
        ))}

        {ordered.map((c) => {
          const cx = x(c.predictedValue ?? 0);
          const cy = y(c.actualValue ?? 0);
          const selected = c.id === selectedId;
          return (
            <g key={c.id}>
              <circle
                cx={cx}
                cy={cy}
                r={hitR}
                fill="transparent"
                className={styles.scatterHit}
                onClick={() => onSelect(selected ? "" : c.id)}
                onMouseEnter={() => setHoverId(c.id)}
              />
              <circle
                cx={cx}
                cy={cy}
                r={selected ? DOT_R_SELECTED : DOT_R}
                className={`${styles.scatterDot} ${
                  c.isCorrect === false ? styles.scatterDotWrong : styles.scatterDotOk
                } ${selected ? styles.scatterDotSelected : ""}`}
                style={{ pointerEvents: "none" }}
              />
            </g>
          );
        })}
      </svg>

      {hovered && (
        <div
          className={styles.scatterTooltip}
          style={{
            left: `${(x(hovered.predictedValue ?? 0) / WIDTH) * 100}%`,
            top: `${(y(hovered.actualValue ?? 0) / HEIGHT) * 100}%`,
          }}
        >
          <b>케이스 {noById.get(hovered.id)}</b>
          <span>예측: {fmtNum(hovered.predictedValue ?? 0)}</span>
          <span>
            실제: {fmtNum(hovered.actualValue ?? 0)} · 오차 {fmtSigned(hovered.residual ?? 0)}
            {hovered.isCorrect === false ? " · 큼" : ""}
          </span>
        </div>
      )}
    </div>
  );
}
