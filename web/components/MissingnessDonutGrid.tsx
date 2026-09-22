"use client";

import { useState } from "react";
import { columnDesc, isSuggestedDesc } from "@/lib/columnGlossary";
import GlossaryTerm from "./GlossaryTerm";
import styles from "./report.module.css";

export type DonutItem = { label: string; value: number; count?: number }; // value: 0–1 share

type Props = {
  items: DonutItem[];
  domain: string;
  collapsedCount?: number;
};

const R = 26;
const CIRC = 2 * Math.PI * R;

export default function MissingnessDonutGrid({
  items,
  domain,
  collapsedCount = 12,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const sorted = [...items].sort((a, b) => b.value - a.value);
  const hidden = sorted.length - collapsedCount;
  const visible = expanded ? sorted : sorted.slice(0, collapsedCount);

  return (
    <>
      <div className={styles.donutGrid}>
        {visible.map((it) => {
          const pct = Math.min(1, it.value);
          const filled = pct * CIRC;
          const sev = pct >= 0.3 ? "High" : pct >= 0.1 ? "Mid" : "Low";
          const displayPct = (it.value * 100).toFixed(1);
          // stroke-linecap: round still draws a visible dot for a zero-length
          // dash, so a column that displays "0.0%" must skip the arc entirely
          // rather than rely on dasharray math to hide it
          const hasArc = parseFloat(displayPct) > 0;

          return (
            <div key={it.label} className={styles.donutCell}>
              <svg viewBox="0 0 64 64" className={styles.donutSvg}>
                <circle cx={32} cy={32} r={R} className={styles.donutTrack} />
                {hasArc && (
                  <circle
                    cx={32}
                    cy={32}
                    r={R}
                    className={`${styles.donutFill} ${styles[`donut${sev}`]}`}
                    style={{ strokeDasharray: `${filled} ${CIRC - filled}` }}
                    transform="rotate(-90 32 32)"
                  />
                )}
                <text
                  x={32}
                  y={37}
                  textAnchor="middle"
                  className={`${styles.donutText} ${styles[`donutText${sev}`]}`}
                >
                  {displayPct}%
                </text>
              </svg>
              <GlossaryTerm
                term={it.label}
                desc={columnDesc(domain, it.label)}
                suggested={isSuggestedDesc(domain, it.label)}
                className={styles.donutLabel}
              />
              {it.count !== undefined && (
                <span className={styles.donutCount}>{it.count.toLocaleString()}개</span>
              )}
            </div>
          );
        })}
      </div>

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
