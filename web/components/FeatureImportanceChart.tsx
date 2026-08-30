import type { ShapReport } from "@/lib/types";
import { columnDesc } from "@/lib/columnGlossary";
import GlossaryTerm from "./GlossaryTerm";
import styles from "./report.module.css";

type Props = {
  items: ShapReport["featureImportance"];
  domain: string;
};

export default function FeatureImportanceChart({ items, domain }: Props) {
  const sorted = [...items].sort((a, b) => b.importance - a.importance);
  const max = sorted[0]?.importance ?? 1;

  return (
    <ul className={styles.chart}>
      {sorted.map(({ feature, importance }) => (
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
  );
}
