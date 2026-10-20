"use client";

import { suggestedTask, type ColumnInfo } from "@/lib/api";
import styles from "./report.module.css";

type Props = {
  columns: ColumnInfo[];
  value: string | null;
  onChange: (name: string) => void;
};

export default function TargetColumnSelector({
  columns,
  value,
  onChange,
}: Props) {
  // columns the backend can take as a target (binary -> classification,
  // many-valued numeric -> regression) go first — no scrolling past 30
  // columns to find them; the rest follow under a divider
  const recommended = columns.filter((c) => suggestedTask(c) !== null);
  const others = columns.filter((c) => suggestedTask(c) === null);

  function item(col: ColumnInfo) {
    return (
      <button
        key={col.name}
        type="button"
        onClick={() => onChange(col.name)}
        className={`${styles.targetItem} ${
          value === col.name ? styles.targetItemActive : ""
        }`}
      >
        <span className={styles.targetName}>{col.name}</span>
        <span className={styles.targetMeta}>
          고유값 {col.uniqueCount}개
          {suggestedTask(col) && (
            <span
              className={`${styles.targetBadge} ${
                suggestedTask(col) === "classification"
                  ? styles.targetBadgeClass
                  : styles.targetBadgeReg
              }`}
            >
              {suggestedTask(col) === "classification" ? "분류 추천" : "회귀 추천"}
            </span>
          )}
        </span>
      </button>
    );
  }

  return (
    <div className={styles.targetList}>
      {recommended.map(item)}
      {recommended.length > 0 && others.length > 0 && (
        <p className={styles.sectionNote}>
          그 외 컬럼 — 고유값이 2개가 아니고 숫자형도 아니면 타겟으로 쓰기 어려워요
        </p>
      )}
      {others.map(item)}
    </div>
  );
}
