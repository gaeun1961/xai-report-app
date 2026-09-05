"use client";

import { useState } from "react";
import FileDropzone from "@/components/FileDropzone";
import TargetColumnSelector from "@/components/TargetColumnSelector";
import ReportView from "@/components/ReportView";
import { fetchColumns, analyzeCsv, type ColumnInfo } from "@/lib/api";
import type { ShapReport } from "@/lib/types";
import styles from "@/components/report.module.css";

type Step = "upload" | "target" | "analyzing" | "done";

export default function UploadPage() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [target, setTarget] = useState<string | null>(null);
  const [report, setReport] = useState<ShapReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(f: File) {
    setError(null);
    setFile(f);
    setTarget(null);
    setStep("upload");
    try {
      const cols = await fetchColumns(f);
      setColumns(cols);
      setStep("target");
    } catch (e) {
      setError(e instanceof Error ? e.message : "컬럼을 읽는 중 문제가 발생했어요.");
    }
  }

  async function handleAnalyze() {
    if (!file || !target) return;
    setError(null);
    setStep("analyzing");
    try {
      const result = await analyzeCsv(file, target);
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
    <main className={styles.report}>
      <h1 className={styles.h1}>CSV 업로드로 내 데이터 분석하기</h1>
      <p className={styles.guide}>
        직접 가진 CSV 파일을 올리면, 예시 리포트와 같은 방식으로 실시간으로
        모델을 학습하고 분석 결과를 보여드려요.
        <br />
        이진분류(예측하려는 결과가 두 가지인) 데이터만 지원하고, 파일은 5MB·5만
        행 이하여야 해요. 값 종류가 너무 많은 컬럼·긴 텍스트·날짜 컬럼은 자동으로
        제외하고 분석해요.
      </p>

      {error && <p className={styles.errorBox}>{error}</p>}

      {step !== "done" && (
        <FileDropzone onFile={handleFile} fileName={file?.name} />
      )}

      {(step === "target" || step === "analyzing") && (
        <section className={styles.section}>
          <h2 className={styles.h2}>타겟 컬럼 선택</h2>
          <p className={styles.sectionNote}>
            예측하려는 결과가 담긴 컬럼을 선택하세요. 고유값이 2개인 컬럼을
            추천해요.
          </p>
          <TargetColumnSelector
            columns={columns}
            value={target}
            onChange={setTarget}
          />
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
        </section>
      )}

      {step === "done" && report && (
        <>
          <button type="button" className={styles.toggleBtn} onClick={reset}>
            다른 파일 분석하기
          </button>
          <ReportView report={report} domain={report.domain} />
        </>
      )}
    </main>
  );
}
