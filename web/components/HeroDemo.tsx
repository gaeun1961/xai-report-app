"use client";

import { useState } from "react";
import styles from "@/app/home.module.css";

// real rows from the Titanic preset (Sex decoded from its 0/1 code); the
// highlighted one is the case the demo explains (row id 759, 79% "survived" -
// a held-out case in titanic.json)
const SHEET_HEAD = ["Pclass", "Sex", "Age", "sibsp", "Parch", "Fare"];
const SHEET_ROWS = [
  { hit: false, cells: [3, "male", 39, 1, 5, 31.275] },
  { hit: false, cells: [3, "male", 28, 3, 1, 25.4667] },
  { hit: false, cells: [1, "female", 58, 0, 0, 146.5208] },
  { hit: true, cells: [1, "female", 33, 0, 0, 86.5] },
];

// real Titanic feature importance, drawn on the same fixed 0-100% axis the
// report's chart uses (so bar length = the value itself, not "longest = full")
const FACTORS = [
  { name: "Sex", value: 0.134 },
  { name: "Pclass", value: 0.059 },
  { name: "Fare", value: 0.041 },
];

// One looping CSS timeline (9s): the row lights up, the explanation slides
// in, the bars grow one by one, the verdict lands, then everything resets.
// Without motion (reduced-motion, or CSS animations off) every element sits
// in its final state, so the still frame is the finished explanation.
export default function HeroDemo() {
  const [paused, setPaused] = useState(false);

  return (
    <figure className={styles.demo} data-paused={paused || undefined}>
      <div className={styles.demoHead}>
        <span className={styles.demoFile}>titanic.csv</span>
        <button
          type="button"
          className={styles.demoPause}
          aria-pressed={paused}
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? "재생" : "일시정지"}
        </button>
      </div>

      <div className={styles.sheetWrap}>
        <table className={styles.sheet}>
          <thead>
            <tr className={styles.sheetHead}>
              <th aria-label="행 번호" />
              {SHEET_HEAD.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SHEET_ROWS.map((r, i) => (
              <tr key={i} className={r.hit ? styles.sheetHit : undefined}>
                <th scope="row">{i + 2}</th>
                {r.cells.map((v, j) => (
                  <td key={j} className={typeof v === "string" ? styles.sheetText : undefined}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.demoResult}>
        <p className={styles.verdict}>
          모델은 이 케이스를 <strong>&lsquo;생존&rsquo;</strong>으로 예측했어요
          <span className={styles.demoConfidence}>
            <b>79%</b> 확신도
          </span>
        </p>
        <div className={styles.bars}>
          {FACTORS.map((f, i) => (
            <div key={f.name} className={styles.barRow}>
              <span>{f.name}</span>
              <span className={styles.barTrack}>
                <i
                  className={styles.barFill}
                  style={{ width: `${f.value * 100}%`, animationDelay: `${i * 0.35}s` }}
                />
              </span>
              <span className={styles.barVal}>{f.value.toFixed(3)}</span>
            </div>
          ))}
        </div>
      </div>

      <figcaption className={styles.demoCaption}>
        초록색 행 한 명을 모델이 어떻게 판단했는지, 어떤 정보가 예측을 밀었는지 보여줘요
      </figcaption>
    </figure>
  );
}
