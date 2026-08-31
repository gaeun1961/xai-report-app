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

// 라고 / 이라고 by whether the word's last Hangul char has a final consonant
function irago(w: string): string {
  const ch = w.charCodeAt(w.length - 1);
  const batchim = ch >= 0xac00 && ch <= 0xd7a3 && (ch - 0xac00) % 28 !== 0;
  return batchim ? "이라고" : "라고";
}

// Plain-language "is this model any good" explanation, built from the numbers
// alone (same branching as common._judge_model_quality).
function explainAccuracy(
  acc: number,
  baseline: number,
  verdict: "good" | "fair" | "weak",
  posLabel: string,
  negLabel: string,
  minorityRecall: number | undefined,
  minorityLabel: string | undefined,
): string[] {
  const a = Math.round(acc * 100);
  const b = Math.round(baseline * 100);
  const gap = a - b;
  // the rarer class in the data (backend computed it from the true labels).
  // The more common one is whatever's left.
  const minority = minorityLabel ?? negLabel;
  const majority = minority === posLabel ? negLabel : posLabel;
  const rec =
    minorityRecall !== undefined ? Math.round(minorityRecall * 100) : null;

  const line1 = `이 데이터는 실제 결과가 '${majority}'인 경우가 ${b}%로 더 많아요.`;
  const line2 = `그래서 아무 근거 없이 전부 '${majority}'${irago(majority)}만 찍어도 ${b}%는 맞는 셈이라, 모델은 최소한 이보다는 나아야 의미가 있어요.`;

  let line3: string;
  if (verdict === "good") {
    line3 = `이 모델의 정확도 ${a}%는 그 기준보다 ${gap}%p 높고, '${posLabel}'·'${negLabel}' 어느 쪽도 한쪽으로 몰아 찍지 않고 예측해요.`;
  } else if (verdict === "fair") {
    const recPart = rec !== null ? ` 실제 '${minority}' 중 ${rec}%를 잡아내요` : "";
    line3 = `이 모델의 정확도 ${a}%는 그 기준과 비슷하지만(${
      gap >= 0 ? "+" : ""
    }${gap}%p), 대신 놓치면 안 되는 '${minority}'에 집중해요 —${recPart}. 그게 목적이면 쓸만해요.`;
  } else if (a < b) {
    line3 = `이 모델의 정확도 ${a}%는 그 기준보다 오히려 ${b - a}%p 낮은 데다, 수가 적은 '${minority}'도 거의 못 맞혀서 쓸 이유가 없어요.`;
  } else {
    line3 = `이 모델의 정확도 ${a}%는 기준과 큰 차이가 없고, 수가 적은 '${minority}' 쪽은 거의 못 맞혀요.`;
  }
  return [line1, line2, line3];
}

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
  const selectedIndex = Math.max(
    0,
    report.cases.findIndex((c) => c.id === selectedId),
  );
  const selected = report.cases[selectedIndex] ?? report.cases[0];
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
              막대가 길수록 그 특성이 예측을 평균적으로 더 크게 움직였다는
              뜻이에요.
            </p>
            <FeatureImportanceChart
              items={report.featureImportance}
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
              caseNo={selectedIndex + 1}
            />
          </section>
        </div>
      </div>
    </>
  );
}
