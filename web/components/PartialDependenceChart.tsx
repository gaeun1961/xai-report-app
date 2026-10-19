import type { ShapReport } from "@/lib/types";
import { fmtNum } from "@/lib/reportSummary";
import { WIDE, wideX } from "@/lib/chartFrame";
import { WideAxisLabels } from "./DistributionChart";
import { columnDesc, isSuggestedDesc } from "@/lib/columnGlossary";
import GlossaryTerm from "./GlossaryTerm";
import styles from "./report.module.css";

export type PdpEntry = NonNullable<ShapReport["partialDependence"]>[number];
type Point = PdpEntry["points"][number];
export type PdpAxis = { lo: number; hi: number };

const WIDTH = 280;
const HEIGHT = 90;
const PAD = 8;
// literal colours: "이미지로 저장" (html-to-image) dropped class-styled SVG
// strokes and drew fills black (globals.css --accent)
const LINE = "#1d9e75";

function formatValue(v: number | string): string {
  return typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : v;
}

// One vertical axis for every PDP card of the report (summary tab and the
// feature detail tab alike): each card used to stretch its own min-max to
// the full height, so a 10%p effect looked as big as a 17%p one.
export function pdpAxis(items: PdpEntry[]): PdpAxis {
  const all = items.flatMap((e) => e.points.map((p) => p.proba));
  return { lo: Math.min(...all), hi: Math.max(...all) };
}

// Categories have no order, so no connecting line: one row per category with
// its name, a bar (or a marker) and the number - the name sits next to its
// own value instead of in a separate legend.
// Classification: bar from 0 on a fixed 0-100% axis.
// Regression: predictions have no natural zero (and can be negative), so a
// marker on the report-wide axis instead of a bar.
function CategoryBars({
  points,
  regression,
  axis,
}: {
  points: Point[];
  regression?: boolean;
  axis: PdpAxis;
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

// One feature's PDP card. `xRange` places a numeric feature's points by value
// on a caller-given axis (the feature detail tab lines it up with the
// distribution and dependence plots); by default it spans the PDP grid.
export function PdpCell({
  entry,
  domain,
  regression,
  axis,
  xRange,
  categoryOrder,
  showTitle = true,
}: {
  entry: PdpEntry;
  domain: string;
  regression?: boolean;
  axis: PdpAxis;
  xRange?: [number, number];
  // categorical rows in this order (the feature detail tab passes the
  // distribution's), unknown categories last
  categoryOrder?: string[];
  showTitle?: boolean;
}) {
  const probas = entry.points.map((p) => p.proba);
  const min = Math.min(...probas);
  const max = Math.max(...probas);
  const isCategorical = typeof entry.points[0].value === "string";
  const values = entry.points.map((p) => Number(p.value));
  const [xlo, xhi] = xRange ?? [values[0], values[values.length - 1]];
  // xRange given = the feature detail tab's shared wide frame
  const width = xRange ? WIDE.width : WIDTH;
  const height = xRange ? 140 : HEIGHT;
  const x = xRange ? wideX(xRange) : (v: number) => PAD + ((v - xlo) / (xhi - xlo || 1)) * (WIDTH - PAD * 2);
  const y = (p: number) => height - PAD - ((p - axis.lo) / (axis.hi - axis.lo || 1)) * (height - PAD * 2);
  const path = entry.points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(values[i])} ${y(p.proba)}`)
    .join(" ");

  return (
    <div className={styles.pdpCell}>
      {showTitle && (
        <span className={styles.chartLabel}>
          <GlossaryTerm
            term={entry.feature}
            desc={columnDesc(domain, entry.feature)}
            suggested={isSuggestedDesc(domain, entry.feature)}
          />
        </span>
      )}
      {isCategorical ? (
        <CategoryBars
          points={
            categoryOrder
              ? [...entry.points].sort((a, b) => {
                  const ia = categoryOrder.indexOf(String(a.value));
                  const ib = categoryOrder.indexOf(String(b.value));
                  return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
                })
              : entry.points
          }
          regression={regression}
          axis={axis}
        />
      ) : (
        <>
          <svg viewBox={`0 0 ${width} ${height}`} className={styles.pdpSvg}>
            <path d={path} stroke={LINE} strokeWidth={2} fill="none" />
            {entry.points.map((p, i) => (
              <circle key={i} cx={x(values[i])} cy={y(p.proba)} r={2.5} fill={LINE} />
            ))}
          </svg>
          {xRange ? (
            <WideAxisLabels lo={xlo} hi={xhi} />
          ) : (
            <div className={styles.pdpAxis}>
              <span>{formatValue(entry.points[0].value)}</span>
              <span>{formatValue(entry.points[entry.points.length - 1].value)}</span>
            </div>
          )}
        </>
      )}
      <p className={styles.sectionNote}>
        {regression
          ? `예측값 ${fmtNum(min)}~${fmtNum(max)} 사이에서 움직여요`
          : `예측 확률 ${(min * 100).toFixed(0)}%~${(max * 100).toFixed(0)}% 사이에서 움직여요`}
      </p>
    </div>
  );
}

export function pdpAxisNote(axis: PdpAxis, regression?: boolean): string {
  return regression
    ? `선 그래프의 세로 축은 모든 카드가 같아요 (예측값 ${fmtNum(axis.lo)}~${fmtNum(axis.hi)}).`
    : `선 그래프의 세로 축은 모든 카드가 같아요 (예측 확률 ${(axis.lo * 100).toFixed(0)}%~${(axis.hi * 100).toFixed(0)}%).`;
}

type Props = {
  items: PdpEntry[];
  domain: string;
  // regression: the y value is a predicted number, not a probability
  regression?: boolean;
};

export default function PartialDependenceChart({ items, domain, regression }: Props) {
  const axis = pdpAxis(items);
  return (
    <>
      <p className={styles.sectionNote}>{pdpAxisNote(axis, regression)}</p>
      <div className={styles.pdpGrid}>
        {items.map((entry) => (
          <PdpCell key={entry.feature} entry={entry} domain={domain} regression={regression} axis={axis} />
        ))}
      </div>
    </>
  );
}
