"use client";

import { useParams } from "next/navigation";
import { loadReport } from "@/lib/loadReport";
import { findDomain } from "@/lib/domains";
import ReportView from "@/components/ReportView";
import styles from "@/components/report.module.css";

export default function ReportPage() {
  const { domain } = useParams<{ domain: string }>();
  const meta = findDomain(domain);
  const report = loadReport(domain);
  const heading = meta?.title ?? domain;

  return (
    <main className={styles.report}>
      <h1 className={styles.h1}>{heading} 리포트</h1>

      {!report ? (
        <p className={styles.guide}>
          이 도메인의 리포트 데이터는 아직 준비 중이에요. 곧 추가될 예정입니다.
        </p>
      ) : (
        <ReportView report={report} domain={domain} />
      )}
    </main>
  );
}
