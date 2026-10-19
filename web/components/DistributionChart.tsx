import type { ShapReport } from "@/lib/types";
import { fmtNum } from "@/lib/reportSummary";
import { WIDE, wideX } from "@/lib/chartFrame";
import { columnDesc, isSuggestedDesc } from "@/lib/columnGlossary";
import GlossaryTerm from "./GlossaryTerm";
import styles from "./report.module.css";

export type Distribution = NonNullable<ShapReport["distributions"]>[number];

// SVG bars get literal colours (globals.css --accent, and --text-muted at
// 45% over white): "이미지로 저장" (html-to-image) drew class-styled SVG
// rects black, while the same classes render fine on screen
const BAR_POS = "#1d9e75";
const BAR_NEG = "#bdbcb9";

const WIDTH = 280;
const HEIGHT = 70;
const PAD = 4;

// When the report is classification, each bar is split by outcome: the
// positive class stacked on the negative one. Stacked (not two overlaid
// semi-transparent histograms) because with an imbalanced target the small
// class disappears under the big one when overlaid.
type Split = { posLabel: string; negLabel: string } | undefined;

function Legend({ split }: { split: NonNullable<Split> }) {
  return (
    <div className={styles.distLegend}>
      <span>
        <i className={styles.distSwatchPos} /> {split.posLabel}
      </span>
      <span>
        <i className={styles.distSwatchNeg} /> {split.negLabel}
      </span>
    </div>
  );
}

// One column's distribution. `xRange` lets a caller line a numeric histogram
// up with another chart's x axis (the feature detail tab); by default the
// histogram spans its own bin edges.
export function DistributionCard({
  dist,
  domain,
  split,
  xRange,
  showTitle = true,
}: {
  dist: Distribution;
  domain: string;
  split?: Split;
  // given = draw on the feature detail tab's shared wide frame (lib/chartFrame)
  xRange?: [number, number];
  showTitle?: boolean;
}) {
  const byClass = split ? dist.byClass : undefined;
  return (
    <div className={styles.pdpCell}>
      {showTitle && (
        <span className={styles.chartLabel}>
          <GlossaryTerm
            term={dist.feature}
            desc={columnDesc(domain, dist.feature)}
            suggested={isSuggestedDesc(domain, dist.feature)}
          />
        </span>
      )}
      {dist.kind === "numeric" ? (
        <Histogram dist={dist} byClass={byClass} xRange={xRange} />
      ) : (
        <CategoryCounts dist={dist} byClass={byClass} />
      )}
      {dist.missing > 0 && (
        <p className={styles.sectionNote}>결측 {dist.missing.toLocaleString()}개는 빼고 그렸어요</p>
      )}
    </div>
  );
}

function Histogram({
  dist,
  byClass,
  xRange,
}: {
  dist: Distribution;
  byClass?: number[][];
  xRange?: [number, number];
}) {
  const edges = dist.edges ?? [];
  const [lo, hi] = xRange ?? [edges[0], edges[edges.length - 1]];
  const width = xRange ? WIDE.width : WIDTH;
  const height = xRange ? 110 : HEIGHT;
  const x = xRange ? wideX(xRange) : (v: number) => PAD + ((v - lo) / (hi - lo || 1)) * (WIDTH - PAD * 2);
  const max = Math.max(1, ...dist.counts);
  const h = (c: number) => (c / max) * (height - PAD * 2);
  return (
    <>
      <svg viewBox={`0 0 ${width} ${height}`} className={styles.pdpSvg} role="img">
        {dist.counts.map((c, i) => {
          const x0 = x(edges[i]);
          const w = Math.max(0.5, x(edges[i + 1]) - x0 - 1);
          // negative class from the baseline up, positive stacked on top
          const neg = byClass ? byClass[0][i] : c;
          const pos = byClass ? byClass[1][i] : 0;
          const base = height - PAD;
          return (
            <g key={i}>
              <title>
                {`${fmtNum(edges[i])}~${fmtNum(edges[i + 1])}: ${c.toLocaleString()}개`}
              </title>
              <rect
                x={x0}
                y={base - h(neg)}
                width={w}
                height={h(neg)}
                fill={byClass ? BAR_NEG : BAR_POS}
              />
              {byClass && (
                <rect x={x0} y={base - h(neg) - h(pos)} width={w} height={h(pos)} fill={BAR_POS} />
              )}
            </g>
          );
        })}
      </svg>
      {xRange ? (
        <WideAxisLabels lo={lo} hi={hi} />
      ) : (
        <div className={styles.pdpAxis}>
          <span>{fmtNum(lo)}</span>
          <span>{fmtNum(hi)}</span>
        </div>
      )}
    </>
  );
}

// min/max labels placed under the wide frame's plot area (not the card edge)
export function WideAxisLabels({ lo, hi }: { lo: number; hi: number }) {
  return (
    <div
      className={styles.pdpAxis}
      style={{
        marginLeft: `${(WIDE.left / WIDE.width) * 100}%`,
        marginRight: `${(WIDE.right / WIDE.width) * 100}%`,
      }}
    >
      <span>{fmtNum(lo)}</span>
      <span>{fmtNum(hi)}</span>
    </div>
  );
}

function CategoryCounts({ dist, byClass }: { dist: Distribution; byClass?: number[][] }) {
  const max = Math.max(1, ...dist.counts);
  return (
    <ul className={styles.pdpBars}>
      {(dist.labels ?? []).map((label, i) => {
        const c = dist.counts[i];
        return (
          <li key={String(label)} className={styles.pdpBarRow}>
            <span className={styles.pdpBarLabel} title={String(label)}>
              {label}
            </span>
            <span className={styles.pdpBarTrack}>
              {byClass ? (
                <>
                  <i
                    className={`${styles.pdpBarFill} ${styles.distBarNeg}`}
                    style={{ width: `${(byClass[0][i] / max) * 100}%` }}
                  />
                  <i
                    className={`${styles.pdpBarFill} ${styles.distBarPos}`}
                    style={{ left: `${(byClass[0][i] / max) * 100}%`, width: `${(byClass[1][i] / max) * 100}%` }}
                  />
                </>
              ) : (
                <i className={styles.pdpBarFill} style={{ width: `${(c / max) * 100}%` }} />
              )}
            </span>
            <span className={styles.pdpBarValue}>{c.toLocaleString()}</span>
          </li>
        );
      })}
    </ul>
  );
}

// Every feature's card, in feature-importance order
export default function DistributionGrid({
  report,
  domain,
}: {
  report: ShapReport;
  domain: string;
}) {
  const dists = report.distributions ?? [];
  const order = new Map(report.featureImportance.map((f, i) => [f.feature, i]));
  const sorted = [...dists].sort(
    (a, b) => (order.get(a.feature) ?? 999) - (order.get(b.feature) ?? 999),
  );
  const split: Split =
    report.taskType !== "regression" && dists[0]?.byClass
      ? {
          posLabel: report.positiveLabel ?? "양성",
          negLabel: report.negativeLabel ?? "음성",
        }
      : undefined;
  return (
    <>
      {split && <Legend split={split} />}
      <div className={styles.pdpGrid}>
        {sorted.map((d) => (
          <DistributionCard key={d.feature} dist={d} domain={domain} split={split} />
        ))}
      </div>
    </>
  );
}
