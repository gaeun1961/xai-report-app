import type { ShapReport } from "@/lib/types";
import styles from "./report.module.css";

type Props = { items: ShapReport["featureImportance"] };

export default function FeatureImportanceChart({ items }: Props) {
  const sorted = [...items].sort((a, b) => b.importance - a.importance);
  const max = sorted[0]?.importance ?? 1;

  return (
    <ul className={styles.chart}>
      {sorted.map(({ feature, importance }) => (
        <li key={feature} className={styles.chartRow}>
          <span className={styles.chartLabel}>{feature}</span>
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
  );
}
