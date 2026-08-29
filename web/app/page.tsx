import { loadReport } from "@/lib/loadReport";
import DomainCard from "@/components/DomainCard";
import styles from "@/components/report.module.css";

const titanic = loadReport("titanic");

export default function Home() {
  return (
    <main className={styles.landing}>
      <h1 className={styles.h1}>모델 설명 리포트</h1>
      <p className={styles.lead}>
        학습된 분류 모델이 왜 그렇게 예측했는지, SHAP 기여도를 자연어 리포트로
        보여줍니다.
      </p>

      <h2 className={styles.h2}>예시 리포트</h2>
      <DomainCard
        href="/report"
        title="Titanic 생존 예측"
        description="승객 정보로 생존 여부를 예측하는 모델의 특성 중요도와 케이스별 근거"
        accuracy={titanic.modelAccuracy}
      />

      <p className={styles.note}>CSV 업로드로 내 데이터 분석하기 — 다음 주 업데이트 예정</p>
    </main>
  );
}
