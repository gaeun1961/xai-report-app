"use client";

import { useState } from "react";
import type { ShapReport } from "@/lib/types";
import { buildOverallSummary, explainAccuracy } from "@/lib/reportSummary";
import FeatureImportanceChart from "./FeatureImportanceChart";
import CaseSelector from "./CaseSelector";
import CaseReportCard from "./CaseReportCard";
import CorrelationMatrix from "./CorrelationMatrix";
import CopySummaryButton from "./CopySummaryButton";
import InfoTip from "./InfoTip";
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
      <div className={styles.guideRow}>
        <p className={styles.guide}>
          이 리포트는 AI가 왜 이렇게 예측했는지 보여줍니다.
          <br />각 요인이 예측을 어느 쪽으로, 얼마나 강하게 밀었는지 문장으로 풀어서
          설명해요.
          <br />원래 숫자가 궁금하면 케이스 탐색 탭에서 “숫자로 보기”를 누르면
          됩니다.
          <br />“결과 복사하기”를 누르면 이 리포트 내용을 요약해서 복사할 수 있어요.
          ChatGPT 같은 AI 챗봇에 붙여넣으면 이어서 질문할 수 있어요.
        </p>
        <CopySummaryButton report={report} domain={domain} selectedCase={selectedCase} />
      </div>

      <section className={styles.cardSection}>
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

      <section className={styles.cardSection}>
        <h2 className={styles.h2}>
          특성 중요도{" "}
          <InfoTip text="요리할 때 어떤 재료가 맛을 가장 많이 좌우하는지 궁금할 때가 있죠? 이 그래프가 딱 그거예요. **막대가 길수록, 그 항목이 AI의 예측 결과를 정하는 데 더 큰 힘을 썼다**는 뜻이에요. 막대가 짧으면 그 항목은 예측에 별로 영향을 못 준 거예요." />
        </h2>
        <FeatureImportanceChart items={report.featureImportance} domain={domain} />
      </section>

      {overallSummary.length > 0 && (
        <section className={styles.cardSection}>
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
  const selectedIndex = report.cases.findIndex((c) => c.id === selectedId);
  const selected = selectedIndex >= 0 ? report.cases[selectedIndex] : null;
  const { positiveLabel, negativeLabel } = report;
  const [labelColumn, setLabelColumn] = useState("");

  const CHART_LIMIT = 15;
  const importanceOrder = report.featureImportance.map((f) => f.feature);
  const rawColumns = Object.keys(report.cases[0]?.raw ?? {});

  const labelValue = labelColumn && selected?.raw?.[labelColumn];
  const fallbackName =
    labelValue !== undefined && labelValue !== null && labelValue !== ""
      ? String(labelValue)
      : `케이스 ${selectedIndex + 1}`;

  return (
    <div className={styles.reportCol}>
      <section className={styles.cardSection}>
        {rawColumns.length > 0 && (
          <label className={styles.sectionNote}>
            케이스 이름 기준 컬럼{" "}
            <select
              value={labelColumn}
              onChange={(e) => setLabelColumn(e.target.value)}
              aria-label="케이스 이름 기준 컬럼"
            >
              <option value="">번호 (케이스 1, 2, ...)</option>
              {rawColumns.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
          </label>
        )}
        <CaseSelector
          cases={report.cases}
          selectedId={selectedId ?? ""}
          onSelect={onSelect}
          positiveLabel={positiveLabel}
          negativeLabel={negativeLabel}
        />
      </section>

      {selected ? (
        <CaseReportCard
          case={selected}
          domain={domain}
          positiveLabel={positiveLabel}
          negativeLabel={negativeLabel}
          baseValue={report.baseValue}
          importanceOrder={importanceOrder}
          chartLimit={CHART_LIMIT}
          caseNo={selectedIndex + 1}
          fallbackName={fallbackName}
        />
      ) : (
        <p className={styles.selectorEmpty}>
          위 산점도에서 점을 클릭하면 케이스 상세를 볼 수 있어요.
        </p>
      )}
    </div>
  );
}
