"use client";

import { useMemo, useState } from "react";
import type { ShapReport } from "@/lib/types";
import { caseScopeText, HELD_OUT_NOTE } from "@/lib/reportSummary";
import CaseScatterPlot, { type ScatterPreview } from "./CaseScatterPlot";
import RegressionScatterPlot from "./RegressionScatterPlot";
import InfoTip from "./InfoTip";
import styles from "./report.module.css";

type Props = {
  cases: ShapReport["cases"];
  selectedId: string;
  onSelect: (id: string) => void;
  positiveLabel?: string;
  negativeLabel?: string;
  caseStats?: ShapReport["caseStats"];
  // the upload's total row count (absent on presets) - for "전체 N행 중 …"
  totalRows?: number;
  // What-if result of the selected case, shown on the classification scatter
  preview?: ScatterPreview | null;
};

type Filter = "all" | "pos" | "neg";

const clampPct = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

function RegressionCaseList({
  cases,
  selectedId,
  onSelect,
  caseStats,
  totalRows,
}: Pick<Props, "cases" | "selectedId" | "onSelect" | "caseStats" | "totalRows">) {
  const [onlyLarge, setOnlyLarge] = useState(false);
  const shown = cases
    .map((c, i) => ({ c, no: i + 1 }))
    .filter(({ c }) => !onlyLarge || c.isCorrect === false);

  return (
    <div className={styles.selectorWrap}>
      {caseStats && (
        <p className={styles.selectorStats}>
          {caseScopeText(caseStats, totalRows)} · 오차가 큰 케이스{" "}
          <b>{caseStats.wrong.toLocaleString()}개</b>{" "}
          <InfoTip
            text={`여기 뜨는 개수는 지금 화면에 불러온 케이스 수가 아니라, 이 리포트가 분석한 데이터 전체를 기준으로 셌어요.${
              caseStats.heldOut ? ` ${HELD_OUT_NOTE}` : ""
            } '오차가 큰' 케이스는 예측값과 실제값의 차이(절댓값)가 다른 케이스들에 비해 유독 큰 경우예요.`}
          />
        </p>
      )}
      <div className={styles.selectorFilter}>
        {(
          [
            [false, `전체 (${cases.length})`],
            [true, "오차가 큰 케이스만"],
          ] as [boolean, string][]
        ).map(([key, label]) => (
          <button
            key={label}
            type="button"
            onClick={() => setOnlyLarge(key)}
            className={`${styles.filterBtn} ${
              onlyLarge === key ? styles.filterBtnActive : ""
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={styles.selectorCount}>{shown.length}개 표시</div>
      <RegressionScatterPlot
        cases={shown.map(({ c }) => c)}
        noById={new Map(shown.map(({ c, no }) => [c.id, no]))}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    </div>
  );
}

export default function CaseSelector(props: Props) {
  return props.cases.some((c) => c.predictedValue !== undefined) ? (
    <RegressionCaseList {...props} />
  ) : (
    <ClassificationCaseSelector {...props} />
  );
}

function ClassificationCaseSelector({
  cases,
  selectedId,
  onSelect,
  positiveLabel,
  negativeLabel,
  caseStats,
  totalRows,
  preview,
}: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [minC, setMinC] = useState(0);
  const [maxC, setMaxC] = useState(100);
  const lo = Math.min(minC, maxC);
  const hi = Math.max(minC, maxC);

  // stable 1-based number per case (position in the example set)
  const noById = useMemo(
    () => new Map(cases.map((c, i) => [c.id, i + 1])),
    [cases],
  );

  const shown = cases.filter((c) => {
    if (filter === "pos" && !c.predictedPositive) return false;
    if (filter === "neg" && c.predictedPositive) return false;
    if (c.probaPositive !== undefined) {
      const p = c.probaPositive * 100;
      if (p < lo || p > hi) return false;
    }
    return true;
  });

  const posText = positiveLabel ?? "양성";
  const negText = negativeLabel ?? "음성";
  const rangeActive = lo > 0 || hi < 100;

  return (
    <div className={styles.selectorWrap}>
      {caseStats && (
        <p className={styles.selectorStats}>
          {caseScopeText(caseStats, totalRows)} · 예측이 틀린 케이스{" "}
          <b>{caseStats.wrong.toLocaleString()}개</b> · 확신도 애매한(40~60%) 케이스{" "}
          <b>{caseStats.borderline.toLocaleString()}개</b>{" "}
          <InfoTip
            text={`여기 뜨는 개수는 지금 화면에 불러온 케이스 카드 수가 아니라, 이 리포트가 분석한 데이터 전체를 기준으로 셌어요.${
              caseStats.heldOut ? ` ${HELD_OUT_NOTE}` : ""
            } 카드로 직접 확인하려면 아래 필터와 확률 범위를 활용하세요.`}
          />
        </p>
      )}
      <div className={styles.selectorFilter}>
        {(
          [
            ["all", `전체 (${cases.length})`],
            ["pos", `예측: ${posText}`],
            ["neg", `예측: ${negText}`],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`${styles.filterBtn} ${
              filter === key ? styles.filterBtnActive : ""
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={styles.rangeRow}>
        <span className={styles.rangeLabel}>
          양성 확률{" "}
          <InfoTip
            text={`AI가 "이 사람은 ${posText}일 것 같아!"라고 얼마나 자신 있게 생각했는지를 숫자(%)로 나타낸 거예요. **100%에 가까울수록 AI가 아주 확신**했다는 뜻이고, **50%에 가까울수록** 동전 던지기처럼 **AI도 헷갈려했다**는 뜻이에요. 숫자 범위를 45~55%처럼 좁게 만들면, AI가 헷갈려했던 애매한 경우들만 골라 볼 수 있어요 — 그런 경우는 AI가 틀릴 확률도 더 높아요.`}
          />
        </span>
        <input
          className={styles.rangeInput}
          type="number"
          min={0}
          max={100}
          value={minC}
          onChange={(e) => setMinC(clampPct(+e.target.value))}
          aria-label="양성 확률 최소 %"
        />
        <span>~</span>
        <input
          className={styles.rangeInput}
          type="number"
          min={0}
          max={100}
          value={maxC}
          onChange={(e) => setMaxC(clampPct(+e.target.value))}
          aria-label="양성 확률 최대 %"
        />
        <span>%</span>
        {rangeActive && (
          <button
            type="button"
            className={styles.rangeReset}
            onClick={() => {
              setMinC(0);
              setMaxC(100);
            }}
          >
            초기화
          </button>
        )}
      </div>
      <div className={styles.selectorCount}>{shown.length}개 표시</div>

      <CaseScatterPlot
        cases={shown}
        noById={noById}
        selectedId={selectedId}
        onSelect={onSelect}
        positiveLabel={posText}
        negativeLabel={negText}
        preview={preview}
      />
    </div>
  );
}
