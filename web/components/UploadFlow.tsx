"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FileDropzone from "@/components/FileDropzone";
import TargetColumnSelector from "@/components/TargetColumnSelector";
import { fetchColumns, analyzeCsv, type CaseFocus, type ColumnInfo } from "@/lib/api";
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

  async function handleAnalyze() {
    if (!file || !target) return;
    setError(null);
    setStep("analyzing");
    try {
      const result = await analyzeCsv(file, target, nCases, caseFocus);
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
            {rowCount !== null && ` 총 ${rowCount.toLocaleString()}개 행이에요.`}
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
          <p className={styles.sectionNote}>
            최대 100개까지 괜찮아요. 개수를 늘리는 것보다 아래 &lsquo;케이스 선정
            기준&rsquo;을 바꾸는 게 알짜 케이스를 보기엔 더 좋아요.
          </p>
          <label className={styles.sectionNote}>
            어떤 케이스를 위주로 볼까요{" "}
            <select
              className={styles.select}
              value={caseFocus}
              onChange={(e) => setCaseFocus(e.target.value as CaseFocus)}
              aria-label="케이스 선정 기준"
            >
              <option value="balanced">균형있게 (기본)</option>
              <option value="wrong">예측이 틀린 케이스 위주</option>
              <option value="borderline">확신도 애매한(40~60%) 케이스 위주</option>
            </select>
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
    </>
  );
}
