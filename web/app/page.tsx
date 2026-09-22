import Link from "next/link";
import { loadReport } from "@/lib/loadReport";
import { DOMAINS } from "@/lib/domains";
import UploadFlow from "@/components/UploadFlow";
import styles from "./home.module.css";

const USE_CASES = [
  {
    title: "모델 배포 전 점검",
    desc: "특정 컬럼에 과도하게 의존하거나, 말이 안 되는 근거로 예측하고 있진 않은지 배포 전에 확인해요.",
  },
  {
    title: "판단 근거를 설명해야 할 때",
    desc: "“왜 이 고객을 이탈로 예측했나요?” 같은 질문에 숫자가 아니라 문장으로 바로 답할 수 있어요.",
  },
  {
    title: "데이터 품질을 빠르게 훑어볼 때",
    desc: "결측치·이상치는 물론, 0으로 기록된 숨은 결측까지 업로드 한 번으로 확인해요.",
  },
  {
    title: "이미 만든 모델과 비교할 때",
    desc: "같은 학습 데이터를 올려서, 직접 만든 모델의 판단이 baseline과 얼마나 다른지 견줘볼 수 있어요.",
  },
];

const STEPS = [
  { title: "CSV 올리기", desc: "예측하고 싶은 결과가 담긴 표를 올려요." },
  { title: "맞힐 컬럼 고르기", desc: "결과가 담긴 컬럼을 하나 골라요." },
  { title: "판단 근거 읽기", desc: "어떤 정보가 예측을 얼마나 밀었는지 문장으로 봐요." },
];

// real rows from the Titanic preset (Sex decoded from its 0/1 code); the
// highlighted one is the case the mock explains (row id 215, 79% "survived")
const SHEET_HEAD = ["Pclass", "Sex", "Age", "sibsp", "Parch", "Fare"];
const SHEET_ROWS = [
  { hit: false, cells: [3, "male", 39, 1, 5, 31.275] },
  { hit: false, cells: [3, "male", 28, 3, 1, 25.4667] },
  { hit: false, cells: [1, "female", 58, 0, 0, 146.5208] },
  { hit: true, cells: [1, "female", 31, 1, 0, 113.275] },
];

// real Titanic feature importance, drawn on the same fixed 0-100% axis the
// report's chart uses (so bar length = the value itself, not "longest = full")
const FACTORS = [
  { name: "Sex", value: 0.134 },
  { name: "Pclass", value: 0.059 },
  { name: "Fare", value: 0.041 },
];

export default function Home() {
  return (
    <div className={styles.bg}>
      <main className={styles.page}>
        <nav className={styles.nav}>
          <span className={styles.brand}>모델 설명 리포트</span>
          <a href="#examples" className={styles.navLink}>
            예시 보기
          </a>
        </nav>

        <section id="upload" className={styles.hero}>
          <h1 className={styles.title}>
            AI가 왜 그렇게 판단했는지,
            <br />
            <span className={styles.titleAccent}>문장으로 읽어보세요</span>
          </h1>
          <p className={styles.sub}>
            CSV 하나만 올리면 모델을 학습하고, 예측마다 그 근거를 풀어서 보여줘요.
          </p>

          <div className={styles.action}>
            <UploadFlow />
            <p className={styles.finePrint}>
            정답(타겟) 컬럼이 있는 학습용 CSV · 5MB · 5만 행 이하
            <br />
            결과가 두 가지(예: 생존/사망)인 데이터만 가능해요 · 서버가 쉬고 있으면
            첫 응답에 최대 1분 걸려요
          </p>
          </div>
        </section>

        <section className={styles.section}>
          <p className={styles.eyebrow}>이럴 때 써보세요</p>
          <ul className={styles.useCases}>
            {USE_CASES.map((u) => (
              <li key={u.title}>
                <strong className={styles.stepTitle}>{u.title}</strong>
                <span className={styles.stepDesc}>{u.desc}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.section}>
          <p className={styles.eyebrow}>이렇게 사용해요</p>
          <ol className={styles.steps}>
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className={styles.stepNum}>0{i + 1}</span>
                <strong className={styles.stepTitle}>{s.title}</strong>
                <span className={styles.stepDesc}>{s.desc}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.section}>
          <p className={styles.eyebrow}>이런 결과를 받아요</p>
          <div className={styles.window}>
            <div className={styles.windowBar}>
              <i className={styles.dot} />
              <i className={styles.dot} />
              <i className={styles.dot} />
              <span className={styles.windowTitle}>titanic.csv</span>
            </div>
            <div className={styles.windowBody}>
              <div className={styles.pane}>
                <span className={styles.paneLabel}>입력된 데이터 (CSV 파일)</span>
                <div className={styles.sheetWrap}>
                  <table className={styles.sheet}>
                    <thead>
                      <tr className={styles.sheetLetters}>
                        <th />
                        {SHEET_HEAD.map((_, i) => (
                          <th key={i}>{String.fromCharCode(65 + i)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className={styles.sheetHead}>
                        <th>1</th>
                        {SHEET_HEAD.map((h) => (
                          <td key={h}>{h}</td>
                        ))}
                      </tr>
                      {SHEET_ROWS.map((r, i) => (
                        <tr key={i} className={r.hit ? styles.sheetHit : undefined}>
                          <th>{i + 2}</th>
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
                <span className={styles.paneNote}>초록색 행 하나를 모델이 예측해요</span>
              </div>
              <div className={styles.pane}>
                <span className={styles.paneLabel}>리포트가 보여주는 것 · 특성 중요도</span>
                <p className={styles.verdict}>
                  모델은 이 케이스를 <strong>&lsquo;생존&rsquo;</strong>으로 예측했어요
                  (확신도 79%).
                </p>
                <div className={styles.bars}>
                  {FACTORS.map((f) => (
                    <div key={f.name} className={styles.barRow}>
                      <span>{f.name}</span>
                      <span className={styles.barTrack}>
                        <i className={styles.barFill} style={{ width: `${f.value * 100}%` }} />
                      </span>
                      <span className={styles.barVal}>{f.value.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="examples" className={styles.section}>
          <p className={styles.eyebrow}>예시로 먼저 살펴보기</p>
          <div className={styles.examples}>
            {DOMAINS.map((d) => {
              const acc = loadReport(d.slug)?.modelAccuracy;
              return (
                <Link key={d.slug} href={`/report/${d.slug}`} className={styles.exampleRow}>
                  <span>
                    <span className={styles.exampleName}>{d.title}</span>
                    <span className={styles.exampleDesc}>{d.description}</span>
                  </span>
                  <span className={styles.exampleAcc}>
                    {acc === undefined ? "-" : `${(acc * 100).toFixed(1)}%`}
                    <span className={styles.exampleAccLabel}>정확도</span>
                  </span>
                  <span className={styles.exampleArrow} aria-hidden>
                    →
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
