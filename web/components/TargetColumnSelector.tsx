"use client";

import type { ColumnInfo } from "@/lib/api";
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
  // a binary column (exactly 2 distinct values) is the only thing the backend
  // accepts as a target, so those go first — no scrolling past 30 columns to
  // find them; the rest follow under a divider
  const recommended = columns.filter((c) => c.uniqueCount === 2);
  const others = columns.filter((c) => c.uniqueCount !== 2);

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
          {col.uniqueCount === 2 && <span className={styles.targetBadge}>추천</span>}
        </span>
      </button>
    );
  }

  return (
    <div className={styles.targetList}>
      {recommended.map(item)}
      {recommended.length > 0 && others.length > 0 && (
        <p className={styles.sectionNote}>
          그 외 컬럼 — 고유값이 2개가 아니면 타겟으로 쓸 수 없어요
        </p>
      )}
      {others.map(item)}
    </div>
  );
}
