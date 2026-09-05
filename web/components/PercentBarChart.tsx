"use client";

import { useState } from "react";
import { columnDesc } from "@/lib/columnGlossary";
import GlossaryTerm from "./GlossaryTerm";
import styles from "./report.module.css";

export type PercentBarItem = { label: string; value: number };

type Props = {
  items: PercentBarItem[];
  domain: string;
  collapsedCount?: number;
  // how to render the number next to each bar — defaults to a raw 0–1 value
  // (feature importance); pass e.g. `(v) => `${(v*100).toFixed(1)}%`` for a share
  valueFormat?: (v: number) => string;
};

// fixed 0–1 domain (not each report's own max) so a bar's length means the
// same thing across rows and across domains, not just "biggest here"
const AXIS_TICKS = [0, 0.25, 0.5, 0.75, 1];

export default function PercentBarChart({
  items,
  domain,
  collapsedCount = 8,
  valueFormat = (v) => v.toFixed(3),
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const sorted = [...items].sort((a, b) => b.value - a.value);
  const hidden = sorted.length - collapsedCount;
  const visible = expanded ? sorted : sorted.slice(0, collapsedCount);

  return (
    <>
      <div className={styles.chartAxisRow}>
        <span />
        <div className={styles.chartAxisTrack}>
          {AXIS_TICKS.map((t) => (
            <span
              key={t}
              className={styles.chartAxisTick}
              style={{
                left: `${t * 100}%`,
                transform:
                  t === 0 ? "none" : t === 1 ? "translateX(-100%)" : "translateX(-50%)",
              }}
            >
              {Math.round(t * 100)}%
            </span>
          ))}
        </div>
        <span />
      </div>

      <ul className={styles.chart}>
        {visible.map(({ label, value }) => (
          <li key={label} className={styles.chartRow}>
            <span className={styles.chartLabel}>
              <GlossaryTerm term={label} desc={columnDesc(domain, label)} />
            </span>
            <span className={styles.chartTrack}>
              <span
                className={styles.chartBar}
                style={{ width: `${Math.min(value, 1) * 100}%` }}
              />
            </span>
            <span className={styles.chartValue}>{valueFormat(value)}</span>
          </li>
        ))}
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
