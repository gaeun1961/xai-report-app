"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { loadReport } from "@/lib/loadReport";
import { findDomain } from "@/lib/domains";
import FeatureImportanceChart from "@/components/FeatureImportanceChart";
import CaseSelector from "@/components/CaseSelector";
import CaseReportCard from "@/components/CaseReportCard";
import CorrelationMatrix from "@/components/CorrelationMatrix";
import styles from "@/components/report.module.css";

type Tab = "model" | "data";

export default function ReportPage() {
  const { domain } = useParams<{ domain: string }>();
  const meta = findDomain(domain);
  const report = loadReport(domain);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("model");

  const heading = meta?.title ?? domain;
  const hasCorr = !!report?.correlations;

  return (
    <main className={styles.report}>
      <h1 className={styles.h1}>{heading} 리포트</h1>

      <div className={styles.tabs}>
        <button
          type="button"
          onClick={() => setTab("model")}
          className={`${styles.tab} ${tab === "model" ? styles.tabActive : ""}`}
        >
          모델 설명
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

      {!report ? (
        <p className={styles.guide}>
          이 도메인의 리포트 데이터는 아직 준비 중이에요. 곧 추가될 예정입니다.
        </p>
      ) : tab === "data" && report.correlations ? (
        <CorrelationMatrix data={report.correlations} domain={domain} />
      ) : (
        <ModelBody
          report={report}
          domain={domain}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      )}
    </main>
  );
}

type BodyProps = {
  report: NonNullable<ReturnType<typeof loadReport>>;
  domain: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

function ModelBody({ report, domain, selectedId, onSelect }: BodyProps) {
  const selected =
    report.cases.find((c) => c.id === selectedId) ?? report.cases[0];
  const { positiveLabel, negativeLabel } = report;

  const CHART_LIMIT = 15;
  const importanceOrder = report.featureImportance.map((f) => f.feature);

  return (
    <>
      <p className={styles.guide}>
        이 리포트는 AI가 왜 이렇게 예측했는지 보여줍니다.
        <br />각 요인이 예측을 어느 쪽으로, 얼마나 강하게 밀었는지 문장으로 풀어서
        설명해요.
        <br />원래 숫자가 궁금하면 케이스별 리포트에서 “숫자로 보기”를 누르면
        됩니다.
      </p>

      <div className={styles.reportGrid}>
        <div className={styles.reportCol}>
          <section className={styles.section}>
            <h2 className={styles.h2}>전체 정확도</h2>
            <div className={styles.accuracyRow}>
              <p className={styles.accuracy}>
                {(report.modelAccuracy * 100).toFixed(1)}%
              </p>
              {report.modelQuality && (
                <span
                  className={`${styles.qualityBadge} ${
                    report.modelQuality.verdict === "good"
                      ? styles.qualityGood
                      : styles.qualityWeak
                  }`}
                >
                  {report.modelQuality.verdict === "good" ? "양호" : "주의"}
                </span>
              )}
            </div>
            {report.modelQuality && (
              <p className={styles.qualityMessage}>
                {report.modelQuality.message} (다수 클래스로만 찍었을 때 정확도{" "}
                {(report.modelQuality.baselineAccuracy * 100).toFixed(1)}%)
              </p>
            )}
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>특성 중요도</h2>
            <FeatureImportanceChart
              items={report.featureImportance.slice(0, CHART_LIMIT)}
              domain={domain}
            />
          </section>
        </div>

        <div className={styles.reportCol}>
          <section className={styles.section}>
            <h2 className={styles.h2}>케이스별 리포트</h2>
            <CaseSelector
              cases={report.cases}
              selectedId={selected.id}
              onSelect={onSelect}
              positiveLabel={positiveLabel}
              negativeLabel={negativeLabel}
            />
            <CaseReportCard
              case={selected}
              domain={domain}
              positiveLabel={positiveLabel}
              negativeLabel={negativeLabel}
              baseValue={report.baseValue}
              importanceOrder={importanceOrder}
              chartLimit={CHART_LIMIT}
            />
          </section>
        </div>
      </div>
    </>
  );
}
