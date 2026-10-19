"use client";

import { useState } from "react";
import { isRegression, type ShapReport } from "@/lib/types";
import { fmtNum } from "@/lib/reportSummary";
import { columnDesc } from "@/lib/columnGlossary";
import { WIDE, wideX } from "@/lib/chartFrame";
import { DistributionCard } from "./DistributionChart";
import { PdpCell, pdpAxis, pdpAxisNote } from "./PartialDependenceChart";
import InfoTip from "./InfoTip";
import SaveImageButton from "./SaveImageButton";
import styles from "./report.module.css";

type Dep = NonNullable<ShapReport["dependence"]>["features"][number];

const WIDTH = WIDE.width;
const HEIGHT = 200;
const M = { top: 10, right: WIDE.right, bottom: 28, left: WIDE.left };
const PW = WIDTH - M.left - M.right;
const PH = HEIGHT - M.top - M.bottom;
// literal colours - see DistributionChart (html-to-image capture)
const DOT = "#1d9e75";
const AXIS = "#b9b8b2";

// deterministic 0..1 "random" per point index, so the jitter doesn't move on
// every re-render
const jitter = (i: number) => ((i * 9301 + 49297) % 233280) / 233280;

// x = the feature's value, y = that row's SHAP contribution; one dot per row.
// Categorical features get one column per category with the dots spread a
// little sideways so they don't stack into a single line.
function DependencePlot({
  dep,
  regression,
  xRange,
  categories,
}: {
  dep: Dep;
  regression: boolean;
  xRange?: [number, number];
  categories?: string[];
}) {
  const ys = dep.shap;
  const lo = Math.min(0, ...ys);
  const hi = Math.max(0, ...ys);
  const pad = (hi - lo || 1) * 0.06;
  const [ylo, yhi] = [lo - pad, hi + pad];
  const y = (v: number) => M.top + (1 - (v - ylo) / (yhi - ylo)) * PH;
  const fmtY = (v: number) => (regression ? fmtNum(v) : `${(v * 100).toFixed(1)}%p`);

  let xOf: (v: string | number | null, i: number) => number | null;
  let xLabels: { x: number; text: string }[];
  if (categories) {
    const band = PW / categories.length;
    const idx = new Map(categories.map((c, i) => [c, i]));
    const other = idx.get("기타");
    xOf = (v, i) => {
      const k = idx.get(String(v)) ?? other;
      return k === undefined ? null : M.left + band * (k + 0.5) + (jitter(i) - 0.5) * band * 0.5;
    };
    xLabels = categories.map((c, k) => ({ x: M.left + band * (k + 0.5), text: c }));
  } else {
    const [xlo, xhi] = xRange!;
    const toX = wideX(xRange!);
    xOf = (v) => (typeof v === "number" ? toX(v) : null);
    xLabels = [
      { x: M.left, text: fmtNum(xlo) },
      { x: M.left + PW, text: fmtNum(xhi) },
    ];
  }

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={styles.pdpSvg} role="img" aria-label="SHAP 의존도">
      {[yhi - pad, 0, ylo + pad].map((t, k) => (
        <g key={k}>
          <line
            x1={M.left}
            x2={WIDTH - M.right}
            y1={y(t)}
            y2={y(t)}
            stroke={AXIS}
            strokeWidth={1}
            strokeDasharray={t === 0 ? "4 3" : undefined}
            opacity={t === 0 ? 1 : 0.5}
          />
          <text x={M.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="#6b6a64">
            {t === 0 ? "0" : fmtY(t)}
          </text>
        </g>
      ))}
      {dep.values.map((v, i) => {
        const cx = xOf(v, i);
        return cx === null ? null : (
          <circle key={i} cx={cx} cy={y(ys[i])} r={2.6} fill={DOT} opacity={0.55} />
        );
      })}
      {xLabels.map((l, k) => (
        <text
          key={k}
          x={l.x}
          y={HEIGHT - 8}
          textAnchor={categories ? "middle" : k === 0 ? "start" : "end"}
          fontSize={11}
          fill="#6b6a64"
        >
          {l.text.length > 14 ? `${l.text.slice(0, 13)}…` : l.text}
        </text>
      ))}
    </svg>
  );
}

// a few-valued numeric column (0/1) still has a numeric PDP line - draw it
// on the same wide frame as everything else, spanning its own values
function pdpNumberRange(pdp: NonNullable<ShapReport["partialDependence"]>[number]) {
  const vs = pdp.points.map((p) => p.value).filter((v): v is number => typeof v === "number");
  return vs.length ? ([Math.min(...vs), Math.max(...vs)] as [number, number]) : undefined;
}

export default function FeatureDetailTab({ report, domain }: { report: ShapReport; domain: string }) {
  const regression = isRegression(report);
  const features = report.featureImportance.map((f) => f.feature);
  const [feature, setFeature] = useState(features[0]);

  const dist = report.distributions?.find((d) => d.feature === feature);
  const pdp = report.partialDependence?.find((e) => e.feature === feature);
  const dep = report.dependence?.features.find((f) => f.feature === feature);
  const axis = report.partialDependence?.length ? pdpAxis(report.partialDependence) : undefined;

  // continuous numeric -> all three charts share one x range. A column with
  // only a few values (0/1 flags, small codes) is drawn like a category, the
  // same way its distribution is: the dependence dots spread per value
  // instead of piling into two vertical lines at the axis ends.
  const numeric = dist
    ? dist.kind === "numeric"
    : dep
      ? dep.values.some((v) => typeof v === "number")
      : typeof pdp?.points[0].value === "number";
  const nums: number[] = [];
  if (numeric) {
    if (dist?.kind === "numeric" && dist.edges) nums.push(dist.edges[0], dist.edges[dist.edges.length - 1]);
    pdp?.points.forEach((p) => typeof p.value === "number" && nums.push(p.value));
    dep?.values.forEach((v) => typeof v === "number" && nums.push(v));
  }
  const xRange: [number, number] | undefined = nums.length ? [Math.min(...nums), Math.max(...nums)] : undefined;
  // categorical: the distribution's category order (most common first), so
  // the dependence columns read in the same order as the rows above
  const categories = !numeric
    ? ((dist?.labels?.map(String) ?? [...new Set(dep?.values.map(String) ?? [])]) as string[])
    : undefined;
  const split =
    !regression && dist?.byClass
      ? { posLabel: report.positiveLabel ?? "양성", negLabel: report.negativeLabel ?? "음성" }
      : undefined;
  const label = columnDesc(domain, feature);

  return (
    <div className={styles.reportCol} id="report-feature">
      <div className={styles.dataRelToc} data-no-capture>
        <label className={styles.sectionNote}>
          특성{" "}
          <select
            className={styles.select}
            value={feature}
            onChange={(e) => setFeature(e.target.value)}
            aria-label="자세히 볼 특성"
          >
            {features.map((f, i) => (
              <option key={f} value={f}>
                {i + 1}. {f}
                {columnDesc(domain, f) ? ` (${columnDesc(domain, f)})` : ""}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.dataRelTocEnd}>
          <SaveImageButton targetId="report-feature" fileName={`${domain}-${feature}`} />
        </div>
      </div>

      <p className={styles.dataRelIntro}>
        <b>{feature}</b>
        {label ? ` (${label})` : ""} — 특성 중요도 {features.indexOf(feature) + 1}위.{" "}
        {numeric ? "세 그래프의 가로축(특성값 범위)이 같아서 위아래로 비교할 수 있어요." : "세 그래프 모두 같은 카테고리 순서예요."}
      </p>

      <section className={styles.cardSection}>
        <h2 className={styles.h2}>
          1. 분포{" "}
          <InfoTip text="이 특성의 값이 데이터에 어떻게 퍼져 있는지예요. 값이 드문 구간에서는 아래 두 그래프도 근거가 적다는 뜻이에요." />
        </h2>
        {dist ? (
          <DistributionCard
            dist={dist}
            domain={domain}
            split={split}
            xRange={dist.kind === "numeric" ? xRange : undefined}
            showTitle={false}
          />
        ) : (
          <p className={styles.sectionNote}>이 리포트엔 분포 데이터가 없어요 (예전에 만든 분석이에요).</p>
        )}
      </section>

      <section className={styles.cardSection}>
        <h2 className={styles.h2}>
          2. 평균적인 효과 (부분의존도){" "}
          <InfoTip text="다른 조건은 그대로 두고 이 특성 값만 바꿨을 때, **전체 데이터에서 평균적으로** 예측이 어떻게 움직이는지예요." />
        </h2>
        {pdp && axis ? (
          <>
            {numeric && <p className={styles.sectionNote}>{pdpAxisNote(axis, regression)}</p>}
            <PdpCell
              entry={pdp}
              domain={domain}
              regression={regression}
              axis={axis}
              xRange={numeric ? xRange : pdpNumberRange(pdp)}
              categoryOrder={categories}
              showTitle={false}
            />
          </>
        ) : (
          <p className={styles.sectionNote}>부분의존도는 중요도 상위 6개 특성만 계산해요.</p>
        )}
      </section>

      <section className={styles.cardSection}>
        <h2 className={styles.h2}>
          3. 케이스별 영향 (SHAP 의존도){" "}
          <InfoTip
            text={`**점 하나가 케이스 하나**예요. 가로는 그 케이스의 이 특성 값, 세로는 이 특성이 그 케이스의 예측을 ${
              regression ? "얼마나 올리거나(위) 내렸는지(아래)" : "몇 %p 올리거나(위) 내렸는지(아래)"
            }예요. 위의 부분의존도가 **평균**이라면, 이건 **케이스마다** 따로 본 거라서 같은 값이어도 점이 위아래로 퍼질 수 있어요 — 다른 특성과 함께 작용한다는 신호예요. 다만 상관이 강한 특성끼리는 기여도를 나눠 가지고, 이 그래프는 인과관계를 뜻하지 않아요.`}
          />
        </h2>
        {dep ? (
          <>
            <div className={styles.pdpCell}>
              <DependencePlot dep={dep} regression={regression} xRange={xRange} categories={categories} />
            </div>
            <p className={styles.sectionNote}>
              {dep.values.length.toLocaleString()}개 케이스 (학습에 쓰지 않은 행부터) · 점선 위는{" "}
              {regression ? "예측값을 올린" : "예측 확률을 올린"} 경우, 아래는 내린 경우예요.
            </p>
          </>
        ) : (
          <p className={styles.sectionNote}>
            {report.dependence
              ? "SHAP 의존도는 중요도 상위 10개 특성만 담아요."
              : "이 리포트엔 SHAP 의존도 데이터가 없어요 (예전에 만든 분석이에요)."}
          </p>
        )}
      </section>
    </div>
  );
}
