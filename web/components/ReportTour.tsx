"use client";

import { useEffect, useRef, useState } from "react";
import type { ShapReport } from "@/lib/types";
import { STABILITY_LABEL, stabilityLevel } from "@/lib/stability";
import styles from "@/app/home.module.css";

const STEPS = [
  {
    title: "믿을 만한가",
    desc: "정확도와 함께, 다시 학습해도 근거 순위가 같은지(설명 안정성)를 먼저 알려줘요.",
  },
  {
    title: "케이스 탐색",
    desc: "맞힌 케이스와 틀린 케이스를 한눈에 보고, 궁금한 사람을 골라 판단 근거를 봐요.",
  },
  {
    title: "데이터 점검",
    desc: "모델과 별개로, 데이터 자체의 결측치와 이상치를 함께 짚어줘요.",
  },
];

const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;

// stage 1: the summary tab's two trust answers
function Trust({ report }: { report: ShapReport }) {
  const q = report.modelQuality;
  const s = report.explanationStability;
  return (
    <div className={styles.tourCard}>
      <div className={styles.tourTrust}>
        <div>
          <span className={styles.tourLabel}>전체 정확도</span>
          <span className={styles.tourFigure}>{pct(report.modelAccuracy)}</span>
          {q?.baselineAccuracy !== undefined && (
            <span className={styles.tourNote}>
              전부 한쪽으로 찍으면 {pct(q.baselineAccuracy, 0)}
            </span>
          )}
        </div>
        {s && (
          <div>
            <span className={styles.tourLabel}>설명 안정성</span>
            <span className={styles.tourFigure}>{STABILITY_LABEL[stabilityLevel(s)]}</span>
            <span className={styles.tourNote}>
              {s.runs}번 다시 학습해도 상위 {s.topK}개 요인 {pct(s.topKOverlap, 0)} 일치
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// stage 2: the case scatter, its real cases (x = actual outcome, y = the
// model's probability), wrong ones in amber
function Cases({ report }: { report: ShapReport }) {
  const W = 320;
  const H = 180;
  const groups = [false, true].map((actual) => report.cases.filter((c) => c.actualPositive === actual));
  const wrong = report.caseStats?.wrong;
  return (
    <div className={styles.tourCard}>
      <svg viewBox={`0 0 ${W} ${H + 24}`} className={styles.tourScatter} role="img"
        aria-label={`케이스 ${report.cases.length}개의 예측 확률 산점도, 틀린 케이스는 주황색`}>
        <line x1={28} x2={W} y1={H / 2} y2={H / 2} className={styles.tourMid} />
        <text x={0} y={H / 2 + 4} className={styles.tourAxis}>
          50%
        </text>
        {groups.map((g, gi) =>
          g.map((c, i) => {
            const cx = W * (gi === 0 ? 0.25 : 0.75) + (i - (g.length - 1) / 2) * 9;
            const cy = 8 + (1 - (c.probaPositive ?? 0.5)) * (H - 16);
            return (
              <circle
                key={c.id}
                cx={cx}
                cy={cy}
                r={4.5}
                className={c.isCorrect ? styles.tourDotOk : styles.tourDotWrong}
                style={{ transitionDelay: `${(gi * g.length + i) * 18}ms` }}
              />
            );
          }),
        )}
        <text x={W * 0.25} y={H + 18} textAnchor="middle" className={styles.tourAxis}>
          실제: {report.negativeLabel}
        </text>
        <text x={W * 0.75} y={H + 18} textAnchor="middle" className={styles.tourAxis}>
          실제: {report.positiveLabel}
        </text>
      </svg>
      {wrong !== undefined && report.caseStats && (
        <span className={styles.tourNote}>
          점 하나가 한 사람이고, 높을수록 &lsquo;{report.positiveLabel}&rsquo; 확률이 높아요. 주황색은 모델이
          틀린 경우예요. 학습에 쓰지 않은 {report.caseStats.total.toLocaleString()}명 중 틀린 {wrong}명만
          따로 골라볼 수 있어요.
        </span>
      )}
    </div>
  );
}

// stage 3: the data tab's quality checks, the worst columns first
function Quality({ report }: { report: ShapReport }) {
  const rows = [
    ...(report.outliers ?? [])
      .filter((o) => o.outlierPct > 0)
      .sort((a, b) => b.outlierPct - a.outlierPct)
      .slice(0, 3)
      .map((o) => ({ column: o.column, kind: "이상치", v: o.outlierPct })),
    ...(report.missingness ?? [])
      .filter((m) => m.missingCount > 0)
      .sort((a, b) => b.missingPct - a.missingPct)
      .slice(0, 1)
      .map((m) => ({ column: m.column, kind: "결측", v: m.missingPct })),
  ];
  return (
    <div className={styles.tourCard}>
      <ul className={styles.tourQuality}>
        {rows.map((r, i) => (
          <li key={r.column + r.kind}>
            <span className={styles.tourQualityName}>
              {r.column} <span className={styles.tourNote}>{r.kind}</span>
            </span>
            <span className={styles.barTrack}>
              <i
                className={styles.barFill}
                // same 0-100% axis as the report, so a tiny share stays tiny
                style={{ width: `${Math.max(r.v * 100, 0.8)}%`, transitionDelay: `${150 + i * 120}ms` }}
              />
            </span>
            <span className={styles.barVal}>{pct(r.v)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Visual({ step, report }: { step: number; report: ShapReport }) {
  if (step === 0) return <Trust report={report} />;
  if (step === 1) return <Cases report={report} />;
  return <Quality report={report} />;
}

// Scroll tour of the report: on wide screens the step texts scroll past a
// sticky stage, and whichever step's text is level with the stage is the one
// it shows (scrolling back up rewinds it). On narrow screens each step simply
// carries its own picture under its text. Without JS the first step shows.
export default function ReportTour({ report }: { report: ShapReport }) {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step));
        }
      },
      // a band from just under the sticky stage's top (120px) to mid-screen:
      // the step whose text is level with the stage is the active one
      { rootMargin: "-120px 0px -55% 0px" },
    );
    stepRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className={styles.story}>
      <ol className={styles.storySteps}>
        {STEPS.map((s, i) => (
          <li
            key={s.title}
            ref={(el) => {
              stepRefs.current[i] = el;
            }}
            data-step={i}
            className={active === i ? styles.storyStepActive : undefined}
            aria-current={active === i ? "step" : undefined}
          >
            <span className={styles.stepNum}>0{i + 1}</span>
            <strong className={styles.stepTitle}>{s.title}</strong>
            <span className={styles.stepDesc}>{s.desc}</span>
            <div className={styles.storyInline}>
              <Visual step={i} report={report} />
            </div>
          </li>
        ))}
      </ol>

      <div className={styles.storyStage}>
        {STEPS.map((s, i) => (
          <div key={s.title} className={styles.storyPanel} data-active={active === i || undefined}>
            <Visual step={i} report={report} />
          </div>
        ))}
      </div>
    </div>
  );
}
