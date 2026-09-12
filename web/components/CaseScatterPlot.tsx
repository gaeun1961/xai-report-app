"use client";

import { useMemo } from "react";
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
const HEIGHT = 190;
const MARGIN = { top: 10, right: 16, bottom: 24, left: 34 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;
const NEG_X = MARGIN.left + PLOT_W * 0.25;
const POS_X = MARGIN.left + PLOT_W * 0.75;
const Y_TICKS = [0, 0.25, 0.5, 0.75, 1];
const DOT_R = 3.2;
const DOT_R_SELECTED = 5.5;

// Beeswarm packing: points that land close together vertically get nudged
// sideways just far enough to stop touching, instead of the old random-ish
// jitter (which could still leave same-confidence cases overlapping and
// unclickable). Greedy: process in y order, try offset 0 first, then
// alternating +/- steps outward, and take the first spot that doesn't
// collide with anything already placed.
function packBeeswarm(points: { id: string; y: number }[]): Map<string, number> {
  const minDist = DOT_R_SELECTED * 2 + 1;
  const step = minDist * 0.9;
  const order = [...points].sort((a, b) => a.y - b.y);
  const placed: { x: number; y: number }[] = [];
  const offsetById = new Map<string, number>();

  for (const p of order) {
    let chosen = 0;
    let found = false;
    for (let k = 0; k <= order.length && !found; k++) {
      const candidates = k === 0 ? [0] : [k * step, -k * step];
      for (const cand of candidates) {
        const collides = placed.some(
          (q) => Math.hypot(q.x - cand, q.y - p.y) < minDist,
        );
        if (!collides) {
          chosen = cand;
          found = true;
          break;
        }
      }
    }
    placed.push({ x: chosen, y: p.y });
    offsetById.set(p.id, chosen);
  }
  return offsetById;
}

export default function CaseScatterPlot({
  cases,
  noById,
  selectedId,
  onSelect,
  positiveLabel,
  negativeLabel,
}: Props) {
  const positions = useMemo(() => {
    const withY = cases.map((c) => ({
      id: c.id,
      actualPositive: c.actualPositive,
      y:
        MARGIN.top +
        (1 - (c.probaPositive ?? (c.predictedPositive ? 0.75 : 0.25))) * PLOT_H,
    }));
    const neg = withY.filter((c) => !c.actualPositive);
    const pos = withY.filter((c) => c.actualPositive);
    const negOffsets = packBeeswarm(neg);
    const posOffsets = packBeeswarm(pos);

    const result = new Map<string, { x: number; y: number }>();
    for (const c of withY) {
      const offset = (c.actualPositive ? posOffsets : negOffsets).get(c.id) ?? 0;
      result.set(c.id, { x: (c.actualPositive ? POS_X : NEG_X) + offset, y: c.y });
    }
    return result;
  }, [cases]);

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
          y={HEIGHT - 8}
          className={styles.scatterAxisLabel}
          textAnchor="middle"
        >
          실제: {negativeLabel}
        </text>
        <text
          x={POS_X}
          y={HEIGHT - 8}
          className={styles.scatterAxisLabel}
          textAnchor="middle"
        >
          실제: {positiveLabel}
        </text>

        {ordered.map((c) => {
          const pos = positions.get(c.id);
          if (!pos) return null;
          const selected = c.id === selectedId;
          return (
            <circle
              key={c.id}
              cx={pos.x}
              cy={pos.y}
              r={selected ? DOT_R_SELECTED : DOT_R}
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
