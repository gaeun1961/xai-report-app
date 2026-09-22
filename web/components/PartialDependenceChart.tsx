import type { ShapReport } from "@/lib/types";
import { columnDesc, isSuggestedDesc } from "@/lib/columnGlossary";
import GlossaryTerm from "./GlossaryTerm";
import styles from "./report.module.css";

type Props = {
  items: NonNullable<ShapReport["partialDependence"]>;
  domain: string;
};

const WIDTH = 280;
const HEIGHT = 90;
const PAD = 8;

function formatValue(v: number | string): string {
  return typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : v;
}

export default function PartialDependenceChart({ items, domain }: Props) {
  return (
    <div className={styles.pdpGrid}>
      {items.map((entry) => {
        const n = entry.points.length;
        const probas = entry.points.map((p) => p.proba);
        const min = Math.min(...probas);
        const max = Math.max(...probas);
        const range = max - min || 1;
        const x = (i: number) => PAD + (i / (n - 1 || 1)) * (WIDTH - PAD * 2);
        const y = (p: number) => HEIGHT - PAD - ((p - min) / range) * (HEIGHT - PAD * 2);
        // categories have no inherent order, so connecting them with a line
        // would imply a trend that isn't there - dots only for those
        const isCategorical = typeof entry.points[0].value === "string";
        const path = isCategorical
          ? ""
          : entry.points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.proba)}`).join(" ");

        return (
          <div key={entry.feature} className={styles.pdpCell}>
            <span className={styles.chartLabel}>
              <GlossaryTerm
                term={entry.feature}
                desc={columnDesc(domain, entry.feature)}
                suggested={isSuggestedDesc(domain, entry.feature)}
              />
            </span>
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={styles.pdpSvg}>
              <path d={path} className={styles.pdpLine} fill="none" />
              {entry.points.map((p, i) => (
                <circle key={i} cx={x(i)} cy={y(p.proba)} r={2.5} className={styles.pdpDot} />
              ))}
            </svg>
            {isCategorical ? (
              <div className={styles.pdpCatLegend}>
                {entry.points.map((p, i) => (
                  <span key={i}>
                    {p.value} {(p.proba * 100).toFixed(0)}%
                  </span>
                ))}
              </div>
            ) : (
              <div className={styles.pdpAxis}>
                <span>{formatValue(entry.points[0].value)}</span>
                <span>{formatValue(entry.points[n - 1].value)}</span>
              </div>
            )}
            <p className={styles.sectionNote}>
              예측 확률 {(min * 100).toFixed(0)}%~{(max * 100).toFixed(0)}% 사이에서 움직여요
            </p>
          </div>
        );
      })}
    </div>
  );
}
