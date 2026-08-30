"use client";

import { useState } from "react";
import type { ShapReport } from "@/lib/types";
import styles from "./report.module.css";

type Props = {
  cases: ShapReport["cases"];
  selectedId: string;
  onSelect: (id: string) => void;
  positiveLabel?: string;
  negativeLabel?: string;
};

type Filter = "all" | "pos" | "neg";

export default function CaseSelector({
  cases,
  selectedId,
  onSelect,
  positiveLabel,
  negativeLabel,
}: Props) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const query = q.trim();

  const shown = cases.filter((c) => {
    if (query && !c.id.includes(query)) return false;
    if (filter === "pos" && !c.predictedPositive) return false;
    if (filter === "neg" && c.predictedPositive) return false;
    return true;
  });

  const posText = positiveLabel ?? "양성";
  const negText = negativeLabel ?? "음성";

  return (
    <div className={styles.selectorWrap}>
      <input
        className={styles.selectorSearch}
        type="search"
        inputMode="numeric"
        placeholder={`케이스 ID 검색 (${cases.length}개)`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <p className={styles.selectorHint}>
        숫자를 입력하면 그 숫자가 <b>포함된</b> 케이스 ID를 모두 찾아요 (예:{" "}
        <code>62</code> → #762, #1062)
      </p>

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

      <div className={styles.selector}>
        {shown.length === 0 ? (
          <span className={styles.selectorEmpty}>일치하는 케이스 없음</span>
        ) : (
          shown.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className={`${styles.selectorBtn} ${
                c.id === selectedId ? styles.selectorBtnActive : ""
              }`}
            >
              #{c.id}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
