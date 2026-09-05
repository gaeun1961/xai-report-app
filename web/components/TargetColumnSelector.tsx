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
  return (
    <div className={styles.targetList}>
      {columns.map((col) => {
        const recommended = col.uniqueCount === 2;
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
              {recommended && (
                <span className={styles.targetBadge}>추천</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
