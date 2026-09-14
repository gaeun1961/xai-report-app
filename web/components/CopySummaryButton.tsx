"use client";

import { useState } from "react";
import type { ShapReport } from "@/lib/types";
import { buildCopyText } from "@/lib/reportSummary";
import styles from "./report.module.css";

type Props = {
  report: ShapReport;
  domain: string;
  selectedCase?: ShapReport["cases"][number];
};

export default function CopySummaryButton({ report, domain, selectedCase }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  function openPreview() {
    setText(buildCopyText(report, domain, selectedCase));
    setCopied(false);
    setOpen(true);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard permission denied or unsupported — nothing to recover from
    }
  }

  return (
    <div className={styles.copyBtnRow}>
      <button type="button" className={styles.copyBtn} onClick={openPreview}>
        결과 복사하기
      </button>

      {open && (
        <div className={styles.copyModalOverlay} onClick={() => setOpen(false)}>
          <div
            className={styles.copyModalBox}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className={styles.copyModalHead}>
              <span>복사할 내용 — 직접 수정할 수 있어요</span>
              <button type="button" className={styles.toggleBtn} onClick={() => setOpen(false)}>
                닫기
              </button>
            </div>
            <textarea
              className={styles.copyModalTextarea}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className={styles.copyModalActions}>
              <button type="button" className={styles.copyBtn} onClick={handleCopy}>
                {copied ? "복사됐어요 ✓" : "이 내용 복사하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
