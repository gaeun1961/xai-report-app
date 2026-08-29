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

  return (
    <main className={styles.report}>
      <Link href="/" className={styles.back}>
        ← 홈으로
      </Link>

      <h1 className={styles.h1}>Titanic 생존 예측 리포트</h1>

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
        <CaseReportCard case={selected} />
      </section>
    </main>
  );
}
