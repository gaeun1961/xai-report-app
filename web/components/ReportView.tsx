"use client";

import { useEffect, useMemo, useState } from "react";
import type { ShapReport } from "@/lib/types";
import { buildOverallSummary, explainAccuracy } from "@/lib/reportSummary";
import { getValueLabel, setValueLabel } from "@/lib/valueLabels";
import { registerUploadGlossary } from "@/lib/columnGlossary";
import { featureTendencies } from "@/lib/featureTendency";
import FeatureImportanceChart from "./FeatureImportanceChart";
import PartialDependenceChart from "./PartialDependenceChart";
import CaseSelector from "./CaseSelector";
import CaseReportCard from "./CaseReportCard";
import WhatIfPanel from "./WhatIfPanel";
import ModelComparePanel from "./ModelComparePanel";
import CorrelationMatrix from "./CorrelationMatrix";
import CopySummaryButton from "./CopySummaryButton";
import SaveImageButton from "./SaveImageButton";
import InfoTip from "./InfoTip";
import styles from "./report.module.css";

type Tab = "summary" | "cases" | "data";

type Props = {
  report: ShapReport;
  domain: string;
  // this report's own id in upload history + a display name - only present
  // when ReportView is rendered from /my/[id] (an uploaded CSV, not a
  // preset), which is also the only case report.analysisId is ever set.
  // Needed so ModelComparePanel can build a /my/compare?a=...&b=... link.
  reportId?: string;
  reportLabel?: string;
};

export default function ReportView({ report, domain, reportId, reportLabel }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("summary");
  const hasCorr = !!report.correlations;

  // Only an uploaded CSV (no curated preset labels) can have a user-typed
  // value label. Detected via report.targetColumn rather than `!findDomain
  // (domain)`: the static preset JSON files never carry that field, while
  // every analyze.py response always does — unlike a domain-string check,
  // this can't misfire when someone uploads a file literally named
  // "titanic.csv" (whose domain then equals the preset's own slug). Starts
  // empty on both server and first client render (avoids a hydration
  // mismatch), then loads from localStorage right after mount.
  const { targetColumn, positiveRaw, negativeRaw } = report;
  const isUpload = targetColumn !== undefined;
  const [overrides, setOverrides] = useState<{ pos?: string; neg?: string }>({});

  // registered synchronously (not in an effect) so it's in place before any
  // child below reads columnDesc() during this same render — no flash of a
  // missing tooltip. Map.set is idempotent, so re-running this every render
  // (including React's dev double-invoke) is harmless.
  registerUploadGlossary(domain, report.columnGlossary);

  useEffect(() => {
    if (!isUpload || !targetColumn) return;
    setOverrides({
      pos: positiveRaw !== undefined ? getValueLabel(targetColumn, positiveRaw) : undefined,
      neg: negativeRaw !== undefined ? getValueLabel(targetColumn, negativeRaw) : undefined,
    });
  }, [isUpload, targetColumn, positiveRaw, negativeRaw]);

  const effectiveReport = useMemo(
    () =>
      overrides.pos || overrides.neg
        ? {
            ...report,
            positiveLabel: overrides.pos ?? report.positiveLabel,
            negativeLabel: overrides.neg ?? report.negativeLabel,
          }
        : report,
    [report, overrides],
  );

  function saveLabel(which: "pos" | "neg", label: string) {
    const raw = which === "pos" ? positiveRaw : negativeRaw;
    if (!targetColumn || raw === undefined) return;
    setValueLabel(targetColumn, raw, label);
    setOverrides((prev) => ({ ...prev, [which]: label.trim() || undefined }));
  }

  // drops both saved names so the AI guess (or the plain "Column=raw"
  // fallback if there was none) shows again — no console needed
  function resetLabels() {
    if (!targetColumn) return;
    if (positiveRaw !== undefined) setValueLabel(targetColumn, positiveRaw, "");
    if (negativeRaw !== undefined) setValueLabel(targetColumn, negativeRaw, "");
    setOverrides({});
  }

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
        <SummaryBody
          report={effectiveReport}
          domain={domain}
          selectedId={selectedId}
          reportId={reportId}
          reportLabel={reportLabel}
          valueEditor={
            isUpload && targetColumn && positiveRaw !== undefined && negativeRaw !== undefined
              ? {
                  targetColumn,
                  positiveRaw,
                  negativeRaw,
                  positiveLabel: effectiveReport.positiveLabel ?? positiveRaw,
                  negativeLabel: effectiveReport.negativeLabel ?? negativeRaw,
                  // only still a live (unedited) suggestion while no saved
                  // override exists — once the user edits it, it's their
                  // own label, not Claude's guess anymore
                  positiveSuggested: !!report.labelSuggested && !overrides.pos,
                  negativeSuggested: !!report.labelSuggested && !overrides.neg,
                  onSave: saveLabel,
                  hasSaved: !!(overrides.pos || overrides.neg),
                  // the backend only tries a guess for bare numeric codes —
                  // so numeric values with no guess means the call failed
                  suggestFailed:
                    !report.labelSuggested &&
                    !Number.isNaN(Number(positiveRaw)) &&
                    !Number.isNaN(Number(negativeRaw)),
                  onReset: resetLabels,
                }
              : undefined
          }
        />
      )}
      {tab === "cases" && (
        <CasesBody
          report={effectiveReport}
          domain={domain}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      )}
      {tab === "data" && report.correlations && (
        <div className={styles.reportCol} id="report-data">
          <SaveImageButton targetId="report-data" fileName={`${domain}-데이터분석`} />
          <CorrelationMatrix
            data={report.correlations}
            domain={domain}
            missingness={report.missingness}
            suspectZeros={report.suspectZeros}
            outliers={report.outliers}
            outliersExcludedColumns={report.outliersExcludedColumns}
          />
        </div>
      )}
    </>
  );
}

type ValueEditorProps = {
  targetColumn: string;
  positiveRaw: string;
  negativeRaw: string;
  positiveLabel: string;
  negativeLabel: string;
  positiveSuggested: boolean;
  negativeSuggested: boolean;
  onSave: (which: "pos" | "neg", label: string) => void;
  hasSaved: boolean;
  suggestFailed: boolean;
  onReset: () => void;
};

function ValueLabelChip({
  fallback,
  suggested,
  onSave,
}: {
  fallback: string;
  suggested?: boolean;
  onSave: (label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fallback);

  // blur fires even when nothing was typed (click the pencil, then click
  // away) — only persisting on an actual change keeps that from silently
  // freezing a live AI suggestion into a permanent "user-edited" override
  function save() {
    if (draft.trim() !== fallback.trim()) onSave(draft);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        className={styles.caseNameInput}
        value={draft}
        autoFocus
        maxLength={30}
        aria-label="값 이름 수정"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }
  return (
    <span className={styles.caseId}>
      {fallback}
      {suggested && <em className={styles.soon}>AI 추정</em>}
      <button
        type="button"
        className={styles.caseNameEditBtn}
        aria-label="값 이름 수정"
        onClick={() => {
          setDraft(fallback);
          setEditing(true);
        }}
      >
        ✎
      </button>
    </span>
  );
}

function SummaryBody({
  report,
  domain,
  selectedId,
  reportId,
  reportLabel,
  valueEditor,
}: {
  report: ShapReport;
  domain: string;
  selectedId: string | null;
  reportId?: string;
  reportLabel?: string;
  valueEditor?: ValueEditorProps;
}) {
  const { positiveLabel, negativeLabel } = report;
  const selectedCase = selectedId
    ? report.cases.find((c) => c.id === selectedId)
    : undefined;
  const overallSummary = buildOverallSummary(report, domain);
  const tendencies = useMemo(() => featureTendencies(report, domain), [report, domain]);

  return (
    <div className={styles.reportCol} id="report-summary">
      <div className={styles.guideRow} data-no-capture>
        <p className={styles.guide}>
          이 리포트는 AI가 왜 이렇게 예측했는지 보여줍니다.
          <br />각 요인이 예측을 어느 쪽으로, 얼마나 강하게 밀었는지 문장으로 풀어서
          설명해요.
          <br />원래 숫자가 궁금하면 케이스 탐색 탭에서 “숫자로 보기”를 누르면
          됩니다.
          <br />“결과 복사하기”를 누르면 이 리포트 내용을 요약해서 복사할 수 있어요.
          ChatGPT 같은 AI 챗봇에 붙여넣으면 이어서 질문할 수 있어요.
          {report.totalRows !== undefined && (
            <>
              <br />
              {report.sampledRows !== undefined &&
              report.sampledRows < report.totalRows
                ? `전체 데이터 ${report.totalRows.toLocaleString()}개 행 중 ${report.sampledRows.toLocaleString()}개를 샘플로 살펴봐요.`
                : `전체 데이터 ${report.totalRows.toLocaleString()}개 행을 모두 살펴봤어요.`}
            </>
          )}
        </p>
        <div className={styles.saveBtnCol}>
          <CopySummaryButton report={report} domain={domain} selectedCase={selectedCase} />
          <SaveImageButton targetId="report-summary" fileName={`${domain}-리포트`} />
        </div>
      </div>

      {valueEditor && (
        <section className={styles.cardSection}>
          <h2 className={styles.h2}>
            예측값 이름 설정{" "}
            <InfoTip
              text={
                valueEditor.positiveSuggested || valueEditor.negativeSuggested
                  ? `'${valueEditor.positiveRaw}', '${valueEditor.negativeRaw}' 값의 의미를 AI가 추측해서 미리 채워뒀어요 (틀릴 수 있으니 꼭 확인해주세요). 이름을 수정하면 이 브라우저에 저장되고, 같은 이름의 타겟 컬럼('${valueEditor.targetColumn}')을 쓰는 다른 CSV를 올릴 때도 자동으로 재사용돼요.`
                  : `업로드한 데이터엔 '${valueEditor.positiveRaw}', '${valueEditor.negativeRaw}' 같은 원본 값만 있고 그게 무슨 뜻인지는 데이터에 없어서 자동으로 알 수 없어요. 여기서 이름을 정해두면 이 브라우저에 저장되고, 같은 이름의 타겟 컬럼('${valueEditor.targetColumn}')을 쓰는 다른 CSV를 올릴 때도 자동으로 재사용돼요.`
              }
            />
          </h2>
          <div className={styles.valueLabelGrid}>
            <span className={styles.sectionNote}>
              {valueEditor.targetColumn} = {valueEditor.positiveRaw}:
            </span>
            <ValueLabelChip
              fallback={valueEditor.positiveLabel}
              suggested={valueEditor.positiveSuggested}
              onSave={(label) => valueEditor.onSave("pos", label)}
            />
            <span className={styles.sectionNote}>
              {valueEditor.targetColumn} = {valueEditor.negativeRaw}:
            </span>
            <ValueLabelChip
              fallback={valueEditor.negativeLabel}
              suggested={valueEditor.negativeSuggested}
              onSave={(label) => valueEditor.onSave("neg", label)}
            />
          </div>
          {valueEditor.suggestFailed && (
            <p className={styles.sectionNote}>
              AI 추정을 불러오지 못했어요 (서버 사용 한도 초과 등일 수 있어요). 직접
              입력하거나, 잠시 뒤 같은 파일을 다시 올리면 다시 시도해요.
            </p>
          )}
          {valueEditor.hasSaved && (
            <button
              type="button"
              className={styles.toggleBtn}
              onClick={valueEditor.onReset}
            >
              저장한 이름 지우기 (AI 추정/기본값으로 되돌리기)
            </button>
          )}
        </section>
      )}

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
        {report.caseStats && (
          <p className={styles.sectionNote}>
            분석한 전체 {report.caseStats.total.toLocaleString()}개 중 · 예측이 틀린 케이스{" "}
            <b>{report.caseStats.wrong.toLocaleString()}개</b> · 확신도 애매한(40~60%) 케이스{" "}
            <b>{report.caseStats.borderline.toLocaleString()}개</b>
          </p>
        )}
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
          <InfoTip text="요리할 때 어떤 재료가 맛을 가장 많이 좌우하는지 궁금할 때가 있죠? 이 그래프가 딱 그거예요. **막대가 길수록, 그 항목이 AI의 예측 결과를 정하는 데 더 큰 힘을 썼다**는 뜻이에요. 막대가 짧으면 그 항목은 예측에 별로 영향을 못 준 거예요. 옆에 작은 물음표가 있는 항목은 어느 방향으로 작용하는 경향이 있는지도 볼 수 있어요 — 텍스트(범주형) 값을 가진 항목은 순서가 없어서 경향을 계산할 수 없어 물음표가 없어요." />
        </h2>
        {valueEditor && report.columnGlossarySuggested === false && (
          <p className={styles.sectionNote}>
            컬럼 설명(AI 추정)을 불러오지 못했어요. 컬럼 옆 연필(✎)로 직접 써넣을 수
            있고, 잠시 뒤 같은 파일을 다시 올리면 다시 시도해요.
          </p>
        )}
        <FeatureImportanceChart
          items={report.featureImportance}
          domain={domain}
          tooltips={tendencies}
        />
      </section>

      {report.partialDependence && report.partialDependence.length > 0 && (
        <section className={styles.cardSection}>
          <h2 className={styles.h2}>
            특성값에 따른 예측 확률 변화{" "}
            <InfoTip text="위 특성 중요도 상위 항목들을 대상으로, **그 값이 바뀌면 다른 조건은 그대로 두고 평균적으로 예측 확률이 어떻게 움직이는지** 계산한 거예요. 선이 우상향하면 값이 클수록, 우하향하면 값이 작을수록 예측을 밀어준다는 뜻이에요." />
          </h2>
          <PartialDependenceChart items={report.partialDependence} domain={domain} />
        </section>
      )}

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

      {report.analysisId && reportId && (
        <ModelComparePanel
          analysisId={report.analysisId}
          reportId={reportId}
          reportLabel={reportLabel ?? domain}
        />
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
              className={styles.select}
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
          caseStats={report.caseStats}
        />
      </section>

      {report.wrongFeatureImportance && report.wrongFeatureImportance.length > 0 && (
        <section className={styles.cardSection}>
          <h2 className={styles.h2}>
            오답 케이스 기준 특성 중요도{" "}
            <InfoTip text="전체 특성 중요도와 다르게, **예측이 틀린 케이스들만 모아서** 다시 계산한 순위예요. 전체 기준으로는 안 중요했던 항목이 여기서 상위권이라면, 그 항목이 모델을 헷갈리게 하고 있을 가능성이 있어요." />
          </h2>
          {report.caseStats && (
            <p className={styles.sectionNote}>
              예측이 틀린 케이스 <b>{report.caseStats.wrong.toLocaleString()}개</b> 기준으로
              계산했어요.
            </p>
          )}
          <FeatureImportanceChart items={report.wrongFeatureImportance} domain={domain} />
        </section>
      )}

      {selected ? (
        <>
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
          {report.analysisId && selected.raw && (
            <WhatIfPanel
              analysisId={report.analysisId}
              domain={domain}
              rawRow={selected.raw}
              topFeatures={selected.topFeatures}
              positiveLabel={positiveLabel}
              negativeLabel={negativeLabel}
            />
          )}
        </>
      ) : (
        <p className={styles.selectorEmpty}>
          위 산점도에서 점을 클릭하면 케이스 상세를 볼 수 있어요.
        </p>
      )}
    </div>
  );
}
