import Link from "next/link";
import { loadReport } from "@/lib/loadReport";
import { DOMAINS } from "@/lib/domains";
import UploadFlow from "@/components/UploadFlow";
import styles from "./home.module.css";

const STEPS = [
  { title: "CSV 올리기", desc: "예측하고 싶은 결과가 담긴 표를 올려요." },
  { title: "맞힐 컬럼 고르기", desc: "결과가 담긴 컬럼을 하나 골라요." },
  { title: "판단 근거 읽기", desc: "어떤 정보가 예측을 얼마나 밀었는지 문장으로 봐요." },
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
            <details className={styles.finePrint}>
              <summary>업로드 전에 알아두세요</summary>
              <p>
                이진분류(결과가 두 가지인) 데이터의 학습용 CSV를 올려주세요. 정답(타겟)
                컬럼이 없는 test.csv는 분석할 수 없어요.
                <br />
                파일은 5MB·5만 행 이하, 값 종류가 너무 많은 컬럼·긴 텍스트·날짜 컬럼은
                자동으로 제외해요.
                <br />
                서버가 쉬고 있었다면 처음 응답까지 최대 1분 걸릴 수 있어요.
              </p>
            </details>
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
              <span className={styles.windowTitle}>Titanic · 케이스 하나</span>
            </div>
            <div className={styles.windowBody}>
              <div className={styles.pane}>
                <span className={styles.paneLabel}>입력된 데이터 한 줄</span>
                <div className={styles.chips}>
                  <span className={styles.chip}>나이 38세</span>
                  <span className={styles.chip}>여성</span>
                  <span className={styles.chip}>1등석</span>
                  <span className={styles.chip}>요금 £113</span>
                </div>
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
