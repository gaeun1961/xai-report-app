import { loadReport } from "@/lib/loadReport";
import { DOMAINS } from "@/lib/domains";
import DomainCard from "@/components/DomainCard";
import UploadFlow from "@/components/UploadFlow";
import styles from "@/components/report.module.css";

export default function Home() {
  return (
    <main className={styles.landing}>
      <h1 className={styles.h1}>모델 설명 리포트</h1>
      <p className={styles.lead}>
        학습된 분류 모델이 왜 그렇게 예측했는지, SHAP 기여도를 자연어 리포트로
        보여줍니다.
      </p>

      <section className={styles.section}>
        <h2 className={`${styles.h2} ${styles.h2Accent}`}>
          내 CSV로 바로 분석하기
        </h2>
        <p className={styles.sectionNote}>
          이진분류(예측하려는 결과가 두 가지인) 데이터의 CSV 파일을 올리면,
          실시간으로 모델을 학습하고 분석 결과를 보여드려요.
          <br />
          파일은 5MB·5만 행 이하여야 해요. 값 종류가 너무 많은 컬럼·긴 텍스트·날짜
          컬럼은 자동으로 제외하고 분석해요.
        </p>
        <UploadFlow />
      </section>

      <section className={styles.about}>
        <div className={styles.aboutBlock}>
          <p>
            <strong>AI 모델은 결과만 주고 이유는 잘 설명하지 않습니다.</strong>
          </p>
          <p>
            “이 고객은 이탈”, “이 직원은 퇴사” 같은 판정은 내놓지만, 어떤 정보를
            근거로 그렇게 봤는지는 블랙박스로 남습니다.
          </p>
          <p>중요한 의사결정에 쓰려면 그 근거를 확인할 수 있어야 합니다.</p>
        </div>
        <div className={styles.aboutBlock}>
          <p>
            <strong>SHAP</strong>은 하나의 예측을 “각 입력 특성이 결과를 얼마나,
            어느 방향으로 밀었는지”로 분해하는 기법입니다.
          </p>
          <p>
            이 리포트는 그 값을 사람이 읽을 수 있는 문장으로 풀어, 모델의 판단
            과정을 그대로 보여줍니다.
          </p>
        </div>
      </section>

      <h2 className={styles.h2}>또는 예시로 체험하기</h2>
      <div className={styles.cardGrid}>
        {DOMAINS.map((d) => {
          const report = loadReport(d.slug);
          return (
            <DomainCard
              key={d.slug}
              href={`/report/${d.slug}`}
              title={d.title}
              description={d.description}
              accuracy={report?.modelAccuracy}
              verdict={report?.modelQuality?.verdict}
            />
          );
        })}
      </div>
    </main>
  );
}
