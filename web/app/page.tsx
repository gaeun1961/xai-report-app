import { loadReport } from "@/lib/loadReport";
import { DOMAINS } from "@/lib/domains";
import DomainCard from "@/components/DomainCard";
import UploadFlow from "@/components/UploadFlow";
import InfoTip from "@/components/InfoTip";
import styles from "@/components/report.module.css";

export default function Home() {
  return (
    <main className={styles.landing}>
      <h1 className={styles.h1}>모델 설명 리포트</h1>
      <p className={styles.lead}>
        내 데이터로, AI가 왜 그렇게 판단했는지 알려드려요.
      </p>

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
            먼저 업로드하신 데이터로 <strong>baseline 모델</strong>을{" "}
            <InfoTip text="baseline은 '빠르게 만든 기본 모델'이에요. 최고 성능을 내는 게 목표가 아니라, 이 데이터로 대략 어떤 판단을 내리고 왜 그런 판단을 하는지 보여주는 게 목적이에요. 그래서 정확도가 아주 높지 않게 나올 수도 있는데, 그것도 자연스러운 결과예요. 이미 직접 만든 모델이 있다면, 같은 학습 데이터를 올려서 이 baseline의 판단과 비교해보는 용도로도 쓸 수 있어요." />{" "}
            학습시키고, SHAP으로 그 모델의 판단 근거를 분석해드려요.
          </p>
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
          <br />
          정답(타겟) 컬럼이 포함된 학습용 데이터(train 파일)를 올려주세요.
          test.csv처럼 정답이 없는 파일은 분석할 수 없어요.
        </p>
        <UploadFlow />
      </section>

      <section className={styles.examplesSection}>
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
      </section>
    </main>
  );
}
