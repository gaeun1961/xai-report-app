import Link from "next/link";
import { loadReport } from "@/lib/loadReport";
import { DOMAINS } from "@/lib/domains";
import UploadFlow from "@/components/UploadFlow";
import InfoTip from "@/components/InfoTip";
import styles from "./home.module.css";

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
          <p className={styles.eyebrow}>왜 필요한가요</p>
          <div className={styles.about}>
            <div>
              <p>
                <strong>AI 모델은 결과만 주고 이유는 잘 설명하지 않습니다.</strong>
              </p>
              <p>
                &ldquo;이 고객은 이탈&rdquo;, &ldquo;이 직원은 퇴사&rdquo; 같은 판정은
                내놓지만, 어떤 정보를 근거로 그렇게 봤는지는 블랙박스로 남습니다.
              </p>
              <p>중요한 의사결정에 쓰려면 그 근거를 확인할 수 있어야 합니다.</p>
            </div>
            <div>
              <p>
                먼저 업로드하신 데이터로 <strong>baseline 모델</strong>을{" "}
                <InfoTip text="baseline은 **'빠르게 만든 기본 모델'**이에요. 최고 성능을 내는 게 목표가 아니라, **이 데이터로 대략 어떤 판단을 내리고 왜 그런 판단을 하는지 보여주는 게 목적**이에요. 그래서 정확도가 아주 높지 않게 나올 수도 있는데, 그것도 자연스러운 결과예요. 이미 직접 만든 모델이 있다면, **같은 학습 데이터를 올려서 이 baseline의 판단과 비교**해보는 용도로도 쓸 수 있어요." />{" "}
                학습시키고, <strong>SHAP</strong>으로 그 모델의 판단 근거를 분석해드려요.
              </p>
              <p>
                SHAP은 하나의 예측을 &ldquo;각 입력 특성이 결과를 얼마나, 어느
                방향으로 밀었는지&rdquo;로 분해하는 기법입니다.
              </p>
              <p>
                이 리포트는 그 값을 사람이 읽을 수 있는 문장으로 풀어, 모델의 판단
                과정을 그대로 보여줍니다.
              </p>
            </div>
          </div>
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
