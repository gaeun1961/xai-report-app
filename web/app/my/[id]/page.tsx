"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  getUploadHistoryEntry,
  loadUploadReport,
  renameUploadReport,
} from "@/lib/uploadHistory";
import ReportView from "@/components/ReportView";
import type { ShapReport } from "@/lib/types";
import styles from "@/components/report.module.css";

export default function MyReportPage() {
  const { id } = useParams<{ id: string }>();
  // starts null/empty on both server and first client render (avoids a
  // hydration mismatch), then loads from localStorage right after mount.
  const [report, setReport] = useState<ShapReport | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  useEffect(() => {
    setReport(loadUploadReport(id));
    setName(getUploadHistoryEntry(id)?.fileName ?? null);
    setChecked(true);
  }, [id]);

  function saveName() {
    const trimmed = nameDraft.trim();
    if (trimmed) {
      renameUploadReport(id, trimmed);
      setName(trimmed);
    }
    setEditingName(false);
  }

  return (
    <main className={styles.report}>
      {editingName ? (
        <input
          className={styles.caseNameInput}
          value={nameDraft}
          autoFocus
          maxLength={60}
          aria-label="리포트 이름 수정"
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveName();
            if (e.key === "Escape") setEditingName(false);
          }}
        />
      ) : (
        <h1 className={styles.h1}>
          <span className={styles.caseId}>
            {name ?? report?.domain ?? "내 분석"} 리포트
            {name && (
              <button
                type="button"
                className={styles.caseNameEditBtn}
                aria-label="리포트 이름 수정"
                onClick={() => {
                  setNameDraft(name);
                  setEditingName(true);
                }}
              >
                ✎
              </button>
            )}
          </span>
        </h1>
      )}

      {!checked ? null : !report ? (
        <p className={styles.guide}>
          이 분석 기록을 찾을 수 없어요. 다른 브라우저/기기에서 분석한 기록은
          이 기기에 저장되지 않아요.
        </p>
      ) : (
        <ReportView report={report} domain={report.domain} />
      )}
    </main>
  );
}
