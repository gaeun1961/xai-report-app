"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/app/home.module.css";

const STEPS = [
  { title: "CSV 올리기", desc: "예측하고 싶은 결과가 담긴 표를 올려요." },
  { title: "맞힐 컬럼 고르기", desc: "결과가 담긴 컬럼을 하나 골라요." },
  { title: "판단 근거 읽기", desc: "어떤 정보가 예측을 얼마나 밀었는지 문장으로 봐요." },
];

// what the column picker shows for the Titanic file. The target really is
// spelled "2urvived" in that Kaggle export; unique counts are the file's own
const COLUMNS = [
  { name: "2urvived", note: "생존 여부", unique: 2, recommended: true, picked: true },
  { name: "Sex", unique: 2, recommended: true },
  { name: "Pclass", unique: 3 },
  { name: "Embarked", unique: 3 },
];

// case 759 in titanic.json: its top three contributions, worded with the
// case card's own thresholds (>= 0.15 강하게, >= 0.05 어느 정도)
const REASONS = [
  { feature: "Sex", value: "1, 여성", strength: "강하게" },
  { feature: "Fare", value: "86.5", strength: "어느 정도" },
  { feature: "Pclass", value: "1, 1등석", strength: "어느 정도" },
];

function Visual({ step }: { step: number }) {
  if (step === 0) {
    return (
      <div className={styles.storyDrop}>
        <span className={styles.storyFile}>titanic.csv</span>
        <span className={styles.storyDropText}>CSV 파일을 여기로 끌어다 놓으세요</span>
      </div>
    );
  }
  if (step === 1) {
    return (
      <ul className={styles.storyColumns}>
        {COLUMNS.map((c) => (
          <li key={c.name} className={c.picked ? styles.storyColumnPicked : undefined}>
            <span className={styles.storyColumnName}>
              {c.name}
              {c.note && <span className={styles.storyColumnNote}>{c.note}</span>}
            </span>
            <span className={styles.storyColumnMeta}>
              고유값 {c.unique}개
              {c.recommended && <span className={styles.storyBadge}>분류 추천</span>}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className={styles.storyReport}>
      <p className={styles.storyVerdict}>
        모델은 이 케이스를 <strong>&lsquo;생존&rsquo;</strong>으로 예측했어요 (확신도 79%).
      </p>
      <ul className={styles.storyReasons}>
        {REASONS.map((r) => (
          <li key={r.feature}>
            <b>{r.feature}</b> ({r.value}): <strong>생존</strong> 쪽으로 {r.strength}{" "}
            작용했어요
          </li>
        ))}
      </ul>
    </div>
  );
}

// Scroll story: on wide screens the step texts scroll past a sticky stage,
// and whichever step crosses the middle of the viewport is the one the stage
// shows (scrolling back up rewinds it). On narrow screens each step simply
// carries its own picture under its text. Without JS the first step shows.
export default function HowItWorks() {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step));
        }
      },
      // a thin band across the middle of the viewport
      { rootMargin: "-45% 0px -45% 0px" },
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
              <Visual step={i} />
            </div>
          </li>
        ))}
      </ol>

      <div className={styles.storyStage}>
        {STEPS.map((s, i) => (
          <div key={s.title} className={styles.storyPanel} data-active={active === i || undefined}>
            <Visual step={i} />
          </div>
        ))}
      </div>
    </div>
  );
}
