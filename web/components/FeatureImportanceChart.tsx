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

export default function FeatureImportanceChart({
  items,
  domain,
  collapsedCount = 8,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const sorted = [...items].sort((a, b) => b.importance - a.importance);
  const max = sorted[0]?.importance ?? 1;
  const hidden = sorted.length - collapsedCount;
  const visible = expanded ? sorted : sorted.slice(0, collapsedCount);

  return (
    <>
      <ul className={styles.chart}>
        {visible.map(({ feature, importance }) => (
          <li key={feature} className={styles.chartRow}>
            <span className={styles.chartLabel}>
              <GlossaryTerm term={feature} desc={columnDesc(domain, feature)} />
            </span>
            <span className={styles.chartTrack}>
              <span
                className={styles.chartBar}
                style={{ width: `${(importance / max) * 100}%` }}
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
