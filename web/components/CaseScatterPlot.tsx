"use client";

import type { ShapReport } from "@/lib/types";
import styles from "./report.module.css";

type CaseItem = ShapReport["cases"][number];

type Props = {
  cases: CaseItem[];
  noById: Map<string, number>;
  selectedId: string;
  onSelect: (id: string) => void;
  positiveLabel: string;
  negativeLabel: string;
};

const WIDTH = 640;
const HEIGHT = 300;
const MARGIN = { top: 16, right: 16, bottom: 40, left: 40 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;
const NEG_X = MARGIN.left + PLOT_W * 0.25;
const POS_X = MARGIN.left + PLOT_W * 0.75;
const JITTER = PLOT_W * 0.14;
const Y_TICKS = [0, 0.25, 0.5, 0.75, 1];

// deterministic -1..1 jitter from the case id, so points stay put across
// re-renders/filter changes instead of reshuffling every time.
function jitterFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 1000) / 1000) * 2 - 1;
}

export default function CaseScatterPlot({
  cases,
  noById,
  selectedId,
  onSelect,
  positiveLabel,
  negativeLabel,
}: Props) {
  if (cases.length === 0) {
    return <p className={styles.selectorEmpty}>일치하는 케이스 없음</p>;
  }

  // draw the selected point last so it sits on top of any overlapping dots
  const ordered = [...cases].sort((a) => (a.id === selectedId ? 1 : -1));

  return (
    <div className={styles.scatterWrap}>
      <div className={styles.scatterLegend}>
        <span className={styles.scatterLegendItem}>
          <i className={`${styles.scatterDotIcon} ${styles.scatterDotOk}`} />
          맞음
        </span>
        <span className={styles.scatterLegendItem}>
          <i className={`${styles.scatterDotIcon} ${styles.scatterDotWrong}`} />
          틀림
        </span>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className={styles.scatter}
        role="img"
        aria-label="케이스별 확신도-정답 산점도"
      >
        {Y_TICKS.map((t) => {
          const y = MARGIN.top + (1 - t) * PLOT_H;
          return (
            <g key={t}>
              <line
                x1={MARGIN.left}
                x2={WIDTH - MARGIN.right}
                y1={y}
                y2={y}
                className={t === 0.5 ? styles.scatterAxisMid : styles.scatterAxisLine}
              />
              <text
                x={MARGIN.left - 6}
                y={y}
                className={styles.scatterTick}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {Math.round(t * 100)}%
              </text>
            </g>
          );
        })}

        <text
          x={NEG_X}
          y={HEIGHT - 12}
          className={styles.scatterAxisLabel}
          textAnchor="middle"
        >
          실제: {negativeLabel}
        </text>
        <text
          x={POS_X}
          y={HEIGHT - 12}
          className={styles.scatterAxisLabel}
          textAnchor="middle"
        >
          실제: {positiveLabel}
        </text>

        {ordered.map((c) => {
          const bandX = c.actualPositive ? POS_X : NEG_X;
          const x = bandX + jitterFor(c.id) * JITTER;
          const proba = c.probaPositive ?? (c.predictedPositive ? 0.75 : 0.25);
          const y = MARGIN.top + (1 - proba) * PLOT_H;
          const selected = c.id === selectedId;
          return (
            <circle
              key={c.id}
              cx={x}
              cy={y}
              r={selected ? 8 : 5}
              className={`${styles.scatterDot} ${
                c.isCorrect === false ? styles.scatterDotWrong : styles.scatterDotOk
              } ${selected ? styles.scatterDotSelected : ""}`}
              onClick={() => onSelect(c.id)}
            >
              <title>
                {`케이스 ${noById.get(c.id)} · 예측 ${
                  c.predictedPositive ? positiveLabel : negativeLabel
                } (${Math.round((c.probaPositive ?? 0) * 100)}%) · 실제 ${
                  c.actualPositive ? positiveLabel : negativeLabel
                }${c.isCorrect === false ? " · 틀림" : ""}`}
              </title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
}
