"use client";

import { useMemo, useState } from "react";
import type { ShapReport } from "@/lib/types";
import CaseScatterPlot from "./CaseScatterPlot";
import styles from "./report.module.css";

type Props = {
  cases: ShapReport["cases"];
  selectedId: string;
  onSelect: (id: string) => void;
  positiveLabel?: string;
  negativeLabel?: string;
};

type Filter = "all" | "pos" | "neg";

const clampPct = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

export default function CaseSelector({
  cases,
  selectedId,
  onSelect,
  positiveLabel,
  negativeLabel,
}: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [minC, setMinC] = useState(0);
  const [maxC, setMaxC] = useState(100);
  const lo = Math.min(minC, maxC);
  const hi = Math.max(minC, maxC);

  // stable 1-based number per case (position in the example set)
  const noById = useMemo(
    () => new Map(cases.map((c, i) => [c.id, i + 1])),
    [cases],
  );

  const shown = cases.filter((c) => {
    if (filter === "pos" && !c.predictedPositive) return false;
    if (filter === "neg" && c.predictedPositive) return false;
    if (c.probaPositive !== undefined) {
      const p = c.probaPositive * 100;
      if (p < lo || p > hi) return false;
    }
    return true;
  });

  const posText = positiveLabel ?? "양성";
  const negText = negativeLabel ?? "음성";
  const rangeActive = lo > 0 || hi < 100;

  return (
    <div className={styles.selectorWrap}>
      <div className={styles.selectorFilter}>
        {(
          [
            ["all", `전체 (${cases.length})`],
            ["pos", `예측: ${posText}`],
            ["neg", `예측: ${negText}`],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`${styles.filterBtn} ${
              filter === key ? styles.filterBtnActive : ""
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={styles.rangeRow}>
        <span className={styles.rangeLabel}>양성 확률</span>
        <input
          className={styles.rangeInput}
          type="number"
          min={0}
          max={100}
          value={minC}
          onChange={(e) => setMinC(clampPct(+e.target.value))}
          aria-label="양성 확률 최소 %"
        />
        <span>~</span>
        <input
          className={styles.rangeInput}
          type="number"
          min={0}
          max={100}
          value={maxC}
          onChange={(e) => setMaxC(clampPct(+e.target.value))}
          aria-label="양성 확률 최대 %"
        />
        <span>%</span>
        {rangeActive && (
          <button
            type="button"
            className={styles.rangeReset}
            onClick={() => {
              setMinC(0);
              setMaxC(100);
            }}
          >
            초기화
          </button>
        )}
      </div>
      <p className={styles.selectorHint}>
        범위를 45~55%처럼 좁히면 모델이 애매해한 케이스만 볼 수 있어요.
        <br />이 구간은 모델이 확신이 없는 케이스라, 적중률이 낮은 편이에요.
      </p>

      <div className={styles.selectorCount}>{shown.length}개 표시</div>

      <CaseScatterPlot
        cases={shown}
        noById={noById}
        selectedId={selectedId}
        onSelect={onSelect}
        positiveLabel={posText}
        negativeLabel={negText}
      />
    </div>
  );
}
