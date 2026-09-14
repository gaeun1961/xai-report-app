"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { loadUploadReport } from "@/lib/uploadHistory";
import ReportView from "@/components/ReportView";
import type { ShapReport } from "@/lib/types";
import styles from "@/components/report.module.css";

export default function MyReportPage() {
  const { id } = useParams<{ id: string }>();
  // starts null on both server and first client render (avoids a hydration
  // mismatch), then loads from localStorage right after mount.
  const [report, setReport] = useState<ShapReport | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setReport(loadUploadReport(id));
    setChecked(true);
  }, [id]);

  return (
    <main className={styles.report}>
      <h1 className={styles.h1}>{report?.domain ?? "내 분석"} 리포트</h1>

      {!checked ? null : !report ? (
        <p className={styles.guide}>
          이 분석 기록을 찾을 수 없어요. 다른 브라우저/기기에서 분석한 기록은
          이 기기에 저장되지 않아요.
        </p>
      ) : (
        <ReportView report={report} domain={report.domain} />
      )}
    </main>
  );
}
