import type { ShapReport } from "@/lib/types";
import styles from "./report.module.css";

type Props = { case: ShapReport["cases"][number] };

export default function CaseReportCard({ case: c }: Props) {
  const positive = c.prediction === "Yes";

  return (
    <article className={styles.card}>
      <header className={styles.cardHead}>
        <span className={styles.caseId}>케이스 #{c.id}</span>
        <span
          className={`${styles.badge} ${positive ? styles.badgeYes : styles.badgeNo}`}
        >
          예측: {c.prediction}
        </span>
      </header>

      <p className={styles.explanation}>{c.explanation}</p>

      <ul className={styles.contribList}>
        {c.topFeatures.map((f) => {
          const up = f.contribution >= 0;
          return (
            <li key={f.feature} className={styles.contribRow}>
              <span className={styles.contribFeature}>
                {f.feature} = {f.value}
              </span>
              <span
                className={`${styles.contribValue} ${up ? styles.up : styles.down}`}
              >
                {up ? "+" : ""}
                {f.contribution.toFixed(3)}
              </span>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
