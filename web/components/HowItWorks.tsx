import styles from "./report.module.css";

// Three code-drawn icons (no image files, no new colors — strokes/fills use
// the same green/ivory tokens as the rest of the app) so a first-time visitor
// can see the flow at a glance before reading any text.
const STEPS = [
  {
    title: "CSV 올리기",
    desc: "예측하고 싶은 결과가 담긴 표(CSV 파일)를 올려요.",
    icon: (
      <>
        <path d="M18 8h20l10 10v38a2 2 0 0 1-2 2H18a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z" />
        <path d="M38 8v10h10" />
        <path d="M32 46V32m0 0-6 6m6-6 6 6" />
      </>
    ),
  },
  {
    title: "맞히고 싶은 컬럼 고르기",
    desc: "결과가 담긴 컬럼(예: 생존 여부, 이탈 여부)을 하나 골라요.",
    icon: (
      <>
        <rect x="8" y="12" width="48" height="40" rx="4" />
        <path d="M8 24h48M8 36h48M24 12v40M40 12v40" />
        <rect x="40" y="12" width="16" height="40" rx="2" className={styles.stepFill} />
      </>
    ),
  },
  {
    title: "AI의 판단 근거 보기",
    desc: "어떤 정보가 예측을 얼마나 밀었는지 문장과 그래프로 풀어줘요.",
    icon: (
      <>
        <path d="M8 14h30M8 26h44M8 38h20" strokeWidth="6" strokeLinecap="round" />
        <path d="M44 42h8a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4h-4l-6 4v-4h-2a4 4 0 0 1-4-4v-6a4 4 0 0 1 4-4Z" className={styles.stepFill} />
      </>
    ),
  },
];

export default function HowItWorks() {
  return (
    <section className={styles.cardSection}>
      <h2 className={styles.h2}>이렇게 사용해요</h2>
      <ol className={styles.stepsRow}>
        {STEPS.map((s, i) => (
          <li key={s.title} className={styles.stepItem}>
            <svg
              viewBox="0 0 64 64"
              className={styles.stepIcon}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              {s.icon}
            </svg>
            <span className={styles.stepNum}>{i + 1}</span>
            <strong className={styles.stepTitle}>{s.title}</strong>
            <span className={styles.sectionNote}>{s.desc}</span>
            {i < STEPS.length - 1 && (
              <span className={styles.stepArrow} aria-hidden>
                →
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
