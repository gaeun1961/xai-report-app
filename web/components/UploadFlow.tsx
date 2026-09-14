"use client";

import { useState } from "react";
import FileDropzone from "@/components/FileDropzone";
import TargetColumnSelector from "@/components/TargetColumnSelector";
import ReportView from "@/components/ReportView";
import { fetchColumns, analyzeCsv, type ColumnInfo } from "@/lib/api";
import type { ShapReport } from "@/lib/types";
import styles from "@/components/report.module.css";

type Step = "upload" | "target" | "analyzing" | "done";

export default function UploadFlow() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [target, setTarget] = useState<string | null>(null);
  const [nCases, setNCases] = useState(30);
  const [report, setReport] = useState<ShapReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingColumns, setLoadingColumns] = useState(false);

  async function handleFile(f: File) {
    setError(null);
    setFile(f);
    setTarget(null);
    setStep("upload");
    setLoadingColumns(true);
    try {
      const cols = await fetchColumns(f);
      setColumns(cols);
      setStep("target");
    } catch (e) {
      setError(e instanceof Error ? e.message : "컬럼을 읽는 중 문제가 발생했어요.");
    } finally {
      setLoadingColumns(false);
    }
  }

  async function handleAnalyze() {
    if (!file || !target) return;
    setError(null);
    setStep("analyzing");
    try {
      const result = await analyzeCsv(file, target, nCases);
      setReport(result);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석 중 문제가 발생했어요.");
      setStep("target");
    }
  }

  function reset() {
    setStep("upload");
    setFile(null);
    setColumns([]);
    setTarget(null);
    setReport(null);
    setError(null);
  }

  return (
    <>
      {error && <p className={styles.errorBox}>{error}</p>}

      {step !== "done" && (
        <FileDropzone onFile={handleFile} fileName={file?.name} />
      )}

      {loadingColumns && (
        <p className={styles.sectionNote}>
          컬럼을 불러오는 중이에요. 서버를 깨우는 중일 수 있어서 처음 요청은
          최대 1분 정도 걸릴 수 있어요.
        </p>
      )}

      {(step === "target" || step === "analyzing") && (
        <div className={styles.section}>
          <h3 className={styles.h2}>타겟 컬럼 선택</h3>
          <p className={styles.sectionNote}>
            예측하려는 결과가 담긴 컬럼을 선택하세요. 고유값이 2개인 컬럼을
            추천해요.
          </p>
          <TargetColumnSelector
            columns={columns}
            value={target}
            onChange={setTarget}
          />
          <label className={styles.sectionNote}>
            살펴볼 케이스 개수{" "}
            <input
              type="number"
              min={1}
              max={100}
              value={nCases}
              onChange={(e) =>
                setNCases(Math.max(1, Math.min(100, Number(e.target.value) || 1)))
              }
              className={styles.rangeInput}
              aria-label="살펴볼 케이스 개수"
            />
          </label>
          <button
            type="button"
            className={styles.toggleBtn}
            disabled={!target || step === "analyzing"}
            onClick={handleAnalyze}
          >
            {step === "analyzing" ? "분석 중..." : "분석 시작"}
          </button>
          {step === "analyzing" && (
            <p className={styles.sectionNote}>
              서버를 깨우는 중이에요. 처음 요청은 최대 1분 정도 걸릴 수 있어요.
            </p>
          )}
        </div>
      )}

      {step === "done" && report && (
        <>
          <button type="button" className={styles.toggleBtn} onClick={reset}>
            다른 파일 분석하기
          </button>
          <ReportView report={report} domain={report.domain} />
        </>
      )}
    </>
  );
}
