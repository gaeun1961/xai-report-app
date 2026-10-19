import type { ShapReport } from "@/lib/types";
import { fmtNum } from "@/lib/reportSummary";
import { columnDesc, isSuggestedDesc } from "@/lib/columnGlossary";
import GlossaryTerm from "./GlossaryTerm";
import styles from "./report.module.css";

type Props = {
  items: NonNullable<ShapReport["partialDependence"]>;
  domain: string;
  // regression: the y value is a predicted number, not a probability
  regression?: boolean;
};

const WIDTH = 280;
const HEIGHT = 90;
const PAD = 8;

function formatValue(v: number | string): string {
  return typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : v;
}

type Point = { value: number | string; proba: number };

// Categories have no order, so no connecting line: one row per category with
// its name, a bar (or a marker) and the number - the name sits next to its
// own value instead of in a separate legend.
// Classification: bar from 0 on a fixed 0-100% axis, so a 7%p and a 15%p
// spread look different across cards (not each card's own min-max).
// Regression: predictions have no natural zero (and can be negative), so a
// marker on an axis shared by every PDP card of the report instead of a bar.
function CategoryBars({
  points,
  regression,
  axis,
}: {
  points: Point[];
  regression?: boolean;
  axis: { lo: number; hi: number };
}) {
  const pos = (v: number) =>
    regression ? ((v - axis.lo) / (axis.hi - axis.lo || 1)) * 100 : Math.min(1, Math.max(0, v)) * 100;
  return (
    <>
      <ul className={styles.pdpBars}>
        {points.map((p) => (
          <li key={String(p.value)} className={styles.pdpBarRow}>
            <span className={styles.pdpBarLabel} title={String(p.value)}>
              {p.value}
            </span>
            <span className={styles.pdpBarTrack}>
              {regression ? (
                <i className={styles.pdpBarMarker} style={{ left: `${pos(p.proba)}%` }} />
              ) : (
                <i className={styles.pdpBarFill} style={{ width: `${pos(p.proba)}%` }} />
              )}
            </span>
            <span className={styles.pdpBarValue}>
              {regression ? fmtNum(p.proba) : `${(p.proba * 100).toFixed(0)}%`}
            </span>
          </li>
        ))}
      </ul>
      <div className={`${styles.pdpAxis} ${styles.pdpBarAxis}`}>
        <span>{regression ? fmtNum(axis.lo) : "0%"}</span>
        <span>{regression ? fmtNum(axis.hi) : "100%"}</span>
      </div>
    </>
  );
}

export default function PartialDependenceChart({ items, domain, regression }: Props) {
  // regression marker axis: every PDP value in the report, so categories
  // read against the same scale on every card
  const all = items.flatMap((e) => e.points.map((p) => p.proba));
  const axis = { lo: Math.min(...all), hi: Math.max(...all) };

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
        // would imply a trend that isn't there - bars per category instead
        const isCategorical = typeof entry.points[0].value === "string";
        const path = entry.points
          .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.proba)}`)
          .join(" ");

        return (
          <div key={entry.feature} className={styles.pdpCell}>
            <span className={styles.chartLabel}>
              <GlossaryTerm
                term={entry.feature}
                desc={columnDesc(domain, entry.feature)}
                suggested={isSuggestedDesc(domain, entry.feature)}
              />
            </span>
            {isCategorical ? (
              <CategoryBars points={entry.points} regression={regression} axis={axis} />
            ) : (
              <>
                <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={styles.pdpSvg}>
                  <path d={path} className={styles.pdpLine} fill="none" />
                  {entry.points.map((p, i) => (
                    <circle key={i} cx={x(i)} cy={y(p.proba)} r={2.5} className={styles.pdpDot} />
                  ))}
                </svg>
                <div className={styles.pdpAxis}>
                  <span>{formatValue(entry.points[0].value)}</span>
                  <span>{formatValue(entry.points[n - 1].value)}</span>
                </div>
              </>
            )}
            <p className={styles.sectionNote}>
              {regression
                ? `예측값 ${fmtNum(min)}~${fmtNum(max)} 사이에서 움직여요`
                : `예측 확률 ${(min * 100).toFixed(0)}%~${(max * 100).toFixed(0)}% 사이에서 움직여요`}
            </p>
          </div>
        );
      })}
    </div>
  );
}
