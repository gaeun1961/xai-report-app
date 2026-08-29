import { loadReport } from "@/lib/loadReport";
import { DOMAINS } from "@/lib/domains";
import DomainCard from "@/components/DomainCard";
import styles from "@/components/report.module.css";

export default function Home() {
  return (
    <main className={styles.landing}>
      <h1 className={styles.h1}>모델 설명 리포트</h1>
      <p className={styles.lead}>
        학습된 분류 모델이 왜 그렇게 예측했는지, SHAP 기여도를 자연어 리포트로
        보여줍니다.
      </p>

      <h2 className={styles.h2}>예시 리포트</h2>
      {DOMAINS.map((d) => {
        const report = loadReport(d.slug);
        return (
          <DomainCard
            key={d.slug}
            href={`/report/${d.slug}`}
            title={d.title}
            description={d.description}
            accuracy={report?.modelAccuracy}
          />
        );
      })}

      <p className={styles.note}>
        CSV 업로드로 내 데이터 분석하기 — 다음 주 업데이트 예정
      </p>
    </main>
  );
}
