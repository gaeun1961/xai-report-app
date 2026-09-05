"use client";

import { useState } from "react";
import type { ShapReport } from "@/lib/types";
import { columnDesc } from "@/lib/columnGlossary";
import GlossaryTerm from "./GlossaryTerm";
import styles from "./report.module.css";

type Props = {
  items: ShapReport["featureImportance"];
  domain: string;
  collapsedCount?: number;
};

// fixed 0–1 domain (not each report's own max) so a bar's length means the
// same thing across features and across domains, not just "biggest here"
const AXIS_TICKS = [0, 0.25, 0.5, 0.75, 1];

export default function FeatureImportanceChart({
  items,
  domain,
  collapsedCount = 8,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const sorted = [...items].sort((a, b) => b.importance - a.importance);
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
        {visible.map(({ feature, importance }) => (
          <li key={feature} className={styles.chartRow}>
            <span className={styles.chartLabel}>
              <GlossaryTerm term={feature} desc={columnDesc(domain, feature)} />
            </span>
            <span className={styles.chartTrack}>
              <span
                className={styles.chartBar}
                style={{ width: `${Math.min(importance, 1) * 100}%` }}
              />
            </span>
            <span className={styles.chartValue}>{importance.toFixed(3)}</span>
          </li>
        ))}
      </ul>

      {hidden > 0 && (
        <button
          type="button"
          className={styles.moreFactorsBtn}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "접기" : `나머지 특성 ${hidden}개 더 보기`}
        </button>
      )}
    </>
  );
}
