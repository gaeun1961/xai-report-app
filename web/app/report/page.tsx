"use client";

import { useState } from "react";
import Link from "next/link";
import { loadReport } from "@/lib/loadReport";
import FeatureImportanceChart from "@/components/FeatureImportanceChart";
import CaseSelector from "@/components/CaseSelector";
import CaseReportCard from "@/components/CaseReportCard";
import styles from "@/components/report.module.css";

const report = loadReport("titanic");

export default function ReportPage() {
  const [selectedId, setSelectedId] = useState(report.cases[0].id);
  const selected =
    report.cases.find((c) => c.id === selectedId) ?? report.cases[0];

  // No blanket default: when a report has no preset labels, CaseReportCard
  // falls back to each case's raw `prediction` value so uploaded-CSV data
  // keeps its own wording.
  const { positiveLabel, negativeLabel } = report;

  return (
    <main className={styles.report}>
      <Link href="/" className={styles.back}>
        ← 홈으로
      </Link>

      <h1 className={styles.h1}>Titanic 생존 예측 리포트</h1>

      <p className={styles.guide}>
        이 리포트는 AI가 왜 이렇게 예측했는지 보여줍니다. 각 요인이 예측을 어느
        쪽으로, 얼마나 강하게 밀었는지 문장으로 풀어서 설명해요. 원래 숫자가
        궁금하면 케이스별 리포트에서 “숫자로 보기”를 누르면 됩니다.
      </p>

      <section className={styles.section}>
        <h2 className={styles.h2}>전체 정확도</h2>
        <p className={styles.accuracy}>
          {(report.modelAccuracy * 100).toFixed(1)}%
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>특성 중요도</h2>
        <FeatureImportanceChart items={report.featureImportance} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>케이스별 리포트</h2>
        <CaseSelector
          ids={report.cases.map((c) => c.id)}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <CaseReportCard
          case={selected}
          positiveLabel={positiveLabel}
          negativeLabel={negativeLabel}
        />
      </section>
    </main>
  );
}
