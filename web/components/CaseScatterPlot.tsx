"use client";

import { useEffect, useMemo, useState } from "react";
import type { ShapReport } from "@/lib/types";
import { previewGeometry } from "@/lib/scatterPreview";
import styles from "./report.module.css";

// narrower viewport = fewer real pixels per SVG unit, so a touch target needs
// more units there to stay reachable — not a pixel-exact 44px target (the
// chart is too dense for that everywhere), but meaningfully bigger
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}

type CaseItem = ShapReport["cases"][number];

// a What-if result for one case: where the model now puts it (P(positive))
export type ScatterPreview = { caseId: string; proba: number };

// literal colours (not CSS classes): the ring/arrow sit on an SVG that
// "이미지로 저장" isn't involved with, but a literal keeps the contrast
// numbers below exact. #1e3a5f vs white 11.5:1, vs the green dot 3.4:1,
// vs the amber dot 3.6:1 - all >= 3:1 (non-text contrast)
const PREVIEW_COLOR = "#1e3a5f";
const RING_R = 7.5;

type Props = {
  cases: CaseItem[];
  noById: Map<string, number>;
  selectedId: string;
  onSelect: (id: string) => void;
  positiveLabel: string;
  negativeLabel: string;
  // "값 바꿔서 다시 예측해보기" result for the selected case; drawn as a ring
  // with an arrow from the case's own dot, which stays where it is
  preview?: ScatterPreview | null;
};

const WIDTH = 640;
const HEIGHT = 190;
const MARGIN = { top: 10, right: 16, bottom: 24, left: 34 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;
const NEG_X = MARGIN.left + PLOT_W * 0.25;
const POS_X = MARGIN.left + PLOT_W * 0.75;
const Y_TICKS = [0, 0.25, 0.5, 0.75, 1];
const DOT_R = 3.2;
const DOT_R_SELECTED = 5.5;

// Beeswarm packing: points that land close together vertically get nudged
// sideways just far enough to stop touching, instead of the old random-ish
// jitter (which could still leave same-confidence cases overlapping and
// unclickable). Greedy: process in y order, try offset 0 first, then
// alternating +/- steps outward, and take the first spot that doesn't
// collide with anything already placed.
//
// maxOffset caps how far any point can be pushed sideways: with e.g. the
// "borderline" case-focus filter, dozens of points can land at nearly the
// same y (all near 50%), and without a cap the search pushes them out
// indefinitely — past the SVG's viewBox, where they're clipped and simply
// don't render. Past the cap, points scale down and pack tighter (allowing
// a little overlap) instead of disappearing.
function packBeeswarm(
  points: { id: string; y: number }[],
  maxOffset: number,
): Map<string, number> {
  const desiredMinDist = DOT_R_SELECTED * 2 + 1;
  const desiredStep = desiredMinDist * 0.9;
  const scale =
    points.length > 0
      ? Math.min(1, maxOffset / (desiredStep * points.length))
      : 1;
  const step = desiredStep * scale;
  const minDist = desiredMinDist * scale;
  const order = [...points].sort((a, b) => a.y - b.y);
  const placed: { x: number; y: number }[] = [];
  const offsetById = new Map<string, number>();

  for (const p of order) {
    let chosen = 0;
    let found = false;
    for (let k = 0; k <= order.length && !found; k++) {
      const candidates = k === 0 ? [0] : [k * step, -k * step];
      for (const cand of candidates) {
        const collides = placed.some(
          (q) => Math.hypot(q.x - cand, q.y - p.y) < minDist,
        );
        if (!collides) {
          chosen = cand;
          found = true;
          break;
        }
      }
    }
    placed.push({ x: chosen, y: p.y });
    offsetById.set(p.id, chosen);
  }
  return offsetById;
}

// ring at the new prediction + an arrow from the original dot to its edge
function PreviewMarker({
  geo,
  onHover,
}: {
  geo: NonNullable<ReturnType<typeof previewGeometry>>;
  onHover: (on: boolean) => void;
}) {
  const { from, to } = geo;
  const dy = to.y - from.y;
  const far = Math.abs(dy) > RING_R + DOT_R_SELECTED + 2; // room for an arrow
  // stop the arrow at the ring's edge so the head isn't hidden under it
  const endY = to.y - Math.sign(dy) * (RING_R + 1);
  return (
    <g>
      {far && (
        <line
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={endY}
          stroke={PREVIEW_COLOR}
          strokeWidth={1.6}
          markerEnd="url(#whatif-arrow)"
          pointerEvents="none"
        />
      )}
      {/* white halo under the ring so it stays readable over other dots */}
      <circle cx={to.x} cy={to.y} r={RING_R} fill="none" stroke="#fff" strokeWidth={5} pointerEvents="none" />
      <circle
        cx={to.x}
        cy={to.y}
        r={RING_R}
        fill="none"
        stroke={PREVIEW_COLOR}
        strokeWidth={2.4}
        pointerEvents="none"
      />
      <circle
        cx={to.x}
        cy={to.y}
        r={RING_R + 5}
        fill="transparent"
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
      >
        <title>값 바꾼 예측</title>
      </circle>
    </g>
  );
}

export default function CaseScatterPlot({
  cases,
  noById,
  selectedId,
  onSelect,
  positiveLabel,
  negativeLabel,
  preview,
}: Props) {
  const positions = useMemo(() => {
    const withY = cases.map((c) => ({
      id: c.id,
      actualPositive: c.actualPositive,
      y:
        MARGIN.top +
        (1 - (c.probaPositive ?? (c.predictedPositive ? 0.75 : 0.25))) * PLOT_H,
    }));
    const neg = withY.filter((c) => !c.actualPositive);
    const pos = withY.filter((c) => c.actualPositive);
    // each class's band is centered a quarter of the plot width from either
    // edge/midpoint, so that distance (minus a little padding) is the most
    // a point can move before it'd overlap the axis or the other class
    const maxOffset = PLOT_W * 0.25 - 8;
    const negOffsets = packBeeswarm(neg, maxOffset);
    const posOffsets = packBeeswarm(pos, maxOffset);

    const result = new Map<string, { x: number; y: number }>();
    for (const c of withY) {
      const offset = (c.actualPositive ? posOffsets : negOffsets).get(c.id) ?? 0;
      result.set(c.id, { x: (c.actualPositive ? POS_X : NEG_X) + offset, y: c.y });
    }
    return result;
  }, [cases]);

  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hoverPreview, setHoverPreview] = useState(false);
  const isMobile = useIsMobile();
  const hitR = isMobile ? 14 : 9;
  const hitRSelected = isMobile ? 16 : 11;

  if (cases.length === 0) {
    return <p className={styles.selectorEmpty}>일치하는 케이스 없음</p>;
  }

  // draw the selected point last so it sits on top of any overlapping dots
  const ordered = [...cases].sort((a) => (a.id === selectedId ? 1 : -1));
  const hovered = hoverId ? cases.find((c) => c.id === hoverId) : undefined;
  const hoverPos = hoverId ? positions.get(hoverId) : undefined;
  const previewGeo = previewGeometry({
    positions,
    preview,
    plot: { marginTop: MARGIN.top, plotH: PLOT_H },
  });

  return (
    <div className={styles.scatterWrap}>
      <div className={styles.scatterLegend}>
        <span className={styles.scatterLegendItem}>
          <i className={`${styles.scatterDotIcon} ${styles.scatterDotOk}`} />
          맞음
        </span>
        <span className={styles.scatterLegendItem}>
          <i className={`${styles.scatterDotIcon} ${styles.scatterDotWrong}`} />
          틀림
        </span>
        {previewGeo && (
          <span className={styles.scatterLegendItem}>
            <i className={styles.scatterRingIcon} />
            값 바꾼 예측
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className={styles.scatter}
        role="img"
        aria-label="케이스별 확신도-정답 산점도"
        onMouseLeave={() => {
          setHoverId(null);
          setHoverPreview(false);
        }}
      >
        <defs>
          <marker
            id="whatif-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={PREVIEW_COLOR} />
          </marker>
        </defs>
        {Y_TICKS.map((t) => {
          const y = MARGIN.top + (1 - t) * PLOT_H;
          return (
            <g key={t}>
              <line
                x1={MARGIN.left}
                x2={WIDTH - MARGIN.right}
                y1={y}
                y2={y}
                className={t === 0.5 ? styles.scatterAxisMid : styles.scatterAxisLine}
              />
              <text
                x={MARGIN.left - 6}
                y={y}
                className={styles.scatterTick}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {Math.round(t * 100)}%
              </text>
            </g>
          );
        })}

        <text
          x={NEG_X}
          y={HEIGHT - 8}
          className={styles.scatterAxisLabel}
          textAnchor="middle"
        >
          실제: {negativeLabel}
        </text>
        <text
          x={POS_X}
          y={HEIGHT - 8}
          className={styles.scatterAxisLabel}
          textAnchor="middle"
        >
          실제: {positiveLabel}
        </text>

        {ordered.map((c) => {
          const pos = positions.get(c.id);
          if (!pos) return null;
          const selected = c.id === selectedId;
          return (
            <g key={c.id}>
              {/* invisible, larger hit target — all interaction lives here so
                  the tiny visible dot never has to be the precise click target */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={selected ? hitRSelected : hitR}
                fill="transparent"
                className={styles.scatterHit}
                onClick={() => onSelect(selected ? "" : c.id)}
                onMouseEnter={() => setHoverId(c.id)}
              />
              <circle
                cx={pos.x}
                cy={pos.y}
                r={selected ? DOT_R_SELECTED : DOT_R}
                className={`${styles.scatterDot} ${
                  c.isCorrect === false ? styles.scatterDotWrong : styles.scatterDotOk
                } ${selected ? styles.scatterDotSelected : ""}`}
                style={{ pointerEvents: "none" }}
              />
            </g>
          );
        })}
        {previewGeo && <PreviewMarker geo={previewGeo} onHover={setHoverPreview} />}
      </svg>

      {previewGeo && preview && hoverPreview && (
        <div
          className={styles.scatterTooltip}
          style={{
            left: `${(previewGeo.to.x / WIDTH) * 100}%`,
            top: `${(previewGeo.to.y / HEIGHT) * 100}%`,
          }}
        >
          <b>값 바꾼 예측</b>
          <span>
            예측: {preview.proba >= 0.5 ? positiveLabel : negativeLabel} (
            {Math.round(preview.proba * 100)}%)
          </span>
          <span>원래 예측에서 이동한 위치예요</span>
        </div>
      )}

      {hovered && hoverPos && (
        <div
          className={styles.scatterTooltip}
          style={{
            left: `${(hoverPos.x / WIDTH) * 100}%`,
            top: `${(hoverPos.y / HEIGHT) * 100}%`,
          }}
        >
          <b>케이스 {noById.get(hovered.id)}</b>
          <span>
            예측: {hovered.predictedPositive ? positiveLabel : negativeLabel} (
            {Math.round((hovered.probaPositive ?? 0) * 100)}%)
          </span>
          <span>
            실제: {hovered.actualPositive ? positiveLabel : negativeLabel}
            {hovered.isCorrect === false ? " · 틀림" : ""}
          </span>
        </div>
      )}
    </div>
  );
}
