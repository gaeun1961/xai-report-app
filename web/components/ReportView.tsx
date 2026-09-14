"use client";

import { useState } from "react";
import type { ShapReport } from "@/lib/types";
import { buildOverallSummary, explainAccuracy } from "@/lib/reportSummary";
import FeatureImportanceChart from "./FeatureImportanceChart";
import CaseSelector from "./CaseSelector";
import CaseReportCard from "./CaseReportCard";
import CorrelationMatrix from "./CorrelationMatrix";
import CopySummaryButton from "./CopySummaryButton";
import styles from "./report.module.css";

type Tab = "summary" | "cases" | "data";

type Props = {
  report: ShapReport;
  domain: string;
};

export default function ReportView({ report, domain }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("summary");
  const hasCorr = !!report.correlations;

  return (
    <>
      <div className={styles.tabs}>
        <button
          type="button"
          onClick={() => setTab("summary")}
          className={`${styles.tab} ${tab === "summary" ? styles.tabActive : ""}`}
        >
          요약
        </button>
        <button
          type="button"
          onClick={() => setTab("cases")}
          className={`${styles.tab} ${tab === "cases" ? styles.tabActive : ""}`}
        >
          케이스 탐색
        </button>
        <button
          type="button"
          onClick={() => hasCorr && setTab("data")}
          disabled={!hasCorr}
          className={`${styles.tab} ${tab === "data" ? styles.tabActive : ""} ${
            hasCorr ? "" : styles.tabDisabled
          }`}
        >
          데이터 관계
          {!hasCorr && <em className={styles.soon}>준비 중</em>}
        </button>
      </div>

      {tab === "summary" && (
        <SummaryBody report={report} domain={domain} selectedId={selectedId} />
      )}
      {tab === "cases" && (
        <CasesBody
          report={report}
          domain={domain}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      )}
      {tab === "data" && report.correlations && (
        <CorrelationMatrix
          data={report.correlations}
          domain={domain}
          missingness={report.missingness}
          outliers={report.outliers}
          outliersExcludedColumns={report.outliersExcludedColumns}
        />
      )}
    </>
  );
}

function SummaryBody({
  report,
  domain,
  selectedId,
}: {
  report: ShapReport;
  domain: string;
  selectedId: string | null;
}) {
  const { positiveLabel, negativeLabel } = report;
  const selectedCase = selectedId
    ? report.cases.find((c) => c.id === selectedId)
    : undefined;
  const overallSummary = buildOverallSummary(report, domain);

  return (
    <div className={styles.reportCol}>
      <CopySummaryButton report={report} domain={domain} selectedCase={selectedCase} />

      <p className={styles.guide}>
        이 리포트는 AI가 왜 이렇게 예측했는지 보여줍니다.
        <br />각 요인이 예측을 어느 쪽으로, 얼마나 강하게 밀었는지 문장으로 풀어서
        설명해요.
        <br />원래 숫자가 궁금하면 케이스 탐색 탭에서 “숫자로 보기”를 누르면
        됩니다.
      </p>

      <section className={styles.section}>
        <h2 className={styles.h2}>전체 정확도</h2>
        <div className={styles.accuracyRow}>
          <p className={styles.accuracy}>
            {(report.modelAccuracy * 100).toFixed(1)}%
          </p>
          {report.modelQuality && (
            <span
              className={`${styles.qualityBadge} ${
                {
                  good: styles.qualityGood,
                  fair: styles.qualityFair,
                  weak: styles.qualityWeak,
                }[report.modelQuality.verdict]
              }`}
            >
              {
                { good: "양호", fair: "참고", weak: "주의" }[
                  report.modelQuality.verdict
                ]
              }
            </span>
          )}
        </div>
        {report.modelQuality && (
          <div className={styles.qualityMessage}>
            {explainAccuracy(
              report.modelAccuracy,
              report.modelQuality.baselineAccuracy,
              report.modelQuality.verdict,
              positiveLabel ?? "양성",
              negativeLabel ?? "음성",
              report.modelQuality.minorityRecall,
              report.modelQuality.minorityLabel,
            ).map((s, i) => (
              <p key={i}>{s}</p>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>특성 중요도</h2>
        <p className={styles.sectionNote}>
          막대가 길수록 그 특성이 예측을 평균적으로 더 크게 움직였다는 뜻이에요.
        </p>
        <FeatureImportanceChart items={report.featureImportance} domain={domain} />
      </section>

      {overallSummary.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.h2}>총평</h2>
          <div className={styles.qualityMessage}>
            {overallSummary.map((s, i) => (
              <p key={i}>{s}</p>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

type CasesBodyProps = {
  report: ShapReport;
  domain: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

function CasesBody({ report, domain, selectedId, onSelect }: CasesBodyProps) {
  const selectedIndex = Math.max(
    0,
    report.cases.findIndex((c) => c.id === selectedId),
  );
  const selected = report.cases[selectedIndex] ?? report.cases[0];
  const { positiveLabel, negativeLabel } = report;

  const CHART_LIMIT = 15;
  const importanceOrder = report.featureImportance.map((f) => f.feature);

  return (
    <div className={styles.reportCol}>
      <section className={styles.section}>
        <CaseSelector
          cases={report.cases}
          selectedId={selected.id}
          onSelect={onSelect}
          positiveLabel={positiveLabel}
          negativeLabel={negativeLabel}
        />
      </section>

      <section className={styles.section}>
        <CaseReportCard
          case={selected}
          domain={domain}
          positiveLabel={positiveLabel}
          negativeLabel={negativeLabel}
          baseValue={report.baseValue}
          importanceOrder={importanceOrder}
          chartLimit={CHART_LIMIT}
          caseNo={selectedIndex + 1}
        />
      </section>
    </div>
  );
}
