"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FileDropzone from "@/components/FileDropzone";
import TargetColumnSelector from "@/components/TargetColumnSelector";
import {
  fetchColumns,
  analyzeCsv,
  suggestedTask,
  taskProblem,
  type CaseFocus,
  type ColumnInfo,
  type TaskType,
} from "@/lib/api";
import { saveUploadReport } from "@/lib/uploadHistory";
import styles from "@/components/report.module.css";

type Step = "upload" | "target" | "analyzing";

export default function UploadFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [taskType, setTaskType] = useState<TaskType>("classification");
  const [nCases, setNCases] = useState(30);
  const [caseFocus, setCaseFocus] = useState<CaseFocus>("balanced");
  const [error, setError] = useState<string | null>(null);
  const [loadingColumns, setLoadingColumns] = useState(false);

  async function handleFile(f: File) {
    setError(null);
    setFile(f);
    setTarget(null);
    setStep("upload");
    setLoadingColumns(true);
    try {
      const { columns: cols, rowCount: rows } = await fetchColumns(f);
      setColumns(cols);
      setRowCount(rows);
      setStep("target");
    } catch (e) {
      setError(e instanceof Error ? e.message : "컬럼을 읽는 중 문제가 발생했어요.");
    } finally {
      setLoadingColumns(false);
    }
  }

  // picking a column pre-selects the task type it fits (binary -> 분류,
  // many-valued numeric -> 회귀); the user can still flip it afterwards
  function handleTarget(name: string) {
    setTarget(name);
    const col = columns.find((c) => c.name === name);
    const suggested = col && suggestedTask(col);
    if (suggested) setTaskType(suggested);
  }

  // "borderline" (40-60% confidence) has no regression meaning
  const effectiveFocus: CaseFocus =
    taskType === "regression" && caseFocus === "borderline" ? "balanced" : caseFocus;
  // cases only come from the ~20% of rows held out from training (see
  // common.train_model), so a small file can't fill 100 case cards
  const maxCases =
    rowCount !== null ? Math.max(1, Math.min(100, Math.ceil(rowCount * 0.2))) : 100;
  const targetCol = columns.find((c) => c.name === target);
  const problem = targetCol ? taskProblem(targetCol, taskType) : null;

  async function handleAnalyze() {
    if (!file || !target) return;
    setError(null);
    setStep("analyzing");
    try {
      const result = await analyzeCsv(file, target, Math.min(nCases, maxCases), effectiveFocus, taskType);
      const id = saveUploadReport(result, file.name);
      router.push(`/my/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석 중 문제가 발생했어요.");
      setStep("target");
    }
  }

  return (
    <>
      {error && <p className={styles.errorBox}>{error}</p>}

      <FileDropzone onFile={handleFile} fileName={file?.name} />

      {loadingColumns && (
        <p className={styles.sectionNote}>
          컬럼을 불러오는 중이에요. 서버가 잠들어 있으면 깨우는 데 1분 정도 걸릴 수
          있어요.
        </p>
      )}

      {(step === "target" || step === "analyzing") && (
        <div className={styles.section}>
          <h3 className={styles.h2}>타겟 컬럼 선택</h3>
          <p className={styles.sectionNote}>
            예측하려는 결과가 담긴 컬럼을 선택하세요. 고유값이 2개인 컬럼은
            분류(예: 합격/불합격)로, 고유값이 많은 숫자 컬럼은 회귀(예: 가격,
            점수)로 추천해요.
            {rowCount !== null && ` 총 ${rowCount.toLocaleString()}개 행이에요.`}
          </p>
          <TargetColumnSelector
            columns={columns}
            value={target}
            onChange={handleTarget}
          />
          {target && (
            <div className={styles.section}>
              <p className={styles.sectionNote}>어떤 분석을 할까요</p>
              <div className={styles.selectorFilter}>
                {(
                  [
                    ["classification", "분류 (두 가지 중 어느 쪽일지)"],
                    ["regression", "회귀 (숫자 값이 얼마일지)"],
                  ] as [TaskType, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTaskType(key)}
                    className={`${styles.filterBtn} ${
                      taskType === key ? styles.filterBtnActive : ""
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {problem && <p className={styles.errorBox}>{problem}</p>}
            </div>
          )}
          <label className={styles.sectionNote}>
            살펴볼 케이스 개수{" "}
            <input
              type="number"
              min={1}
              max={maxCases}
              value={Math.min(nCases, maxCases)}
              onChange={(e) =>
                setNCases(Math.max(1, Math.min(maxCases, Number(e.target.value) || 1)))
              }
              className={styles.rangeInput}
              aria-label="살펴볼 케이스 개수"
            />
          </label>
          <p className={styles.sectionNote}>
            케이스는 모델이 학습에 쓰지 않은 행(약 20%) 중에서 골라서, 이 파일은
            최대 {maxCases}개까지 볼 수 있어요. 개수를 늘리는 것보다 아래 &lsquo;케이스 선정
            기준&rsquo;을 바꾸는 게 알짜 케이스를 보기엔 더 좋아요.
          </p>
          <label className={styles.sectionNote}>
            어떤 케이스를 위주로 볼까요{" "}
            <select
              className={styles.select}
              value={effectiveFocus}
              onChange={(e) => setCaseFocus(e.target.value as CaseFocus)}
              aria-label="케이스 선정 기준"
            >
              <option value="balanced">균형있게 (기본)</option>
              <option value="wrong">
                {taskType === "regression" ? "오차가 큰 케이스 위주" : "예측이 틀린 케이스 위주"}
              </option>
              {taskType === "classification" && (
                <option value="borderline">확신도 애매한(40~60%) 케이스 위주</option>
              )}
            </select>
          </label>
          <button
            type="button"
            className={styles.toggleBtn}
            disabled={!target || !!problem || step === "analyzing"}
            onClick={handleAnalyze}
          >
            {step === "analyzing" ? "분석 중..." : "분석 시작"}
          </button>
          {step === "analyzing" && (
            <p className={styles.sectionNote}>
              서버가 잠들어 있으면 깨우는 데 1분 정도, 분석에 1~3분이 더 걸릴 수
              있어요.
            </p>
          )}
        </div>
      )}
    </>
  );
}
