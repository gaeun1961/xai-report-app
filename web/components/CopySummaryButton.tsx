"use client";

import { useEffect, useRef, useState } from "react";
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
  const [copyFailed, setCopyFailed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // native <dialog>: showModal() brings Esc-to-close, a focus trap and the
  // ::backdrop for free
  useEffect(() => {
    if (open) dialogRef.current?.showModal();
  }, [open]);

  function openPreview() {
    setText(buildCopyText(report, domain, selectedCase));
    setCopied(false);
    setCopyFailed(false);
    setOpen(true);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard permission denied or unsupported: say so, the text stays
      // in the box to copy by hand
      setCopyFailed(true);
    }
  }

  return (
    <div className={styles.copyBtnRow}>
      <button type="button" className={styles.copyBtn} onClick={openPreview}>
        결과 복사하기
      </button>

      {open && (
        <dialog
          ref={dialogRef}
          className={styles.copyModalBox}
          aria-labelledby="copy-modal-title"
          onClose={() => setOpen(false)}
          // a click on the backdrop lands on the <dialog> itself
          onClick={(e) => {
            if (e.target === e.currentTarget) dialogRef.current?.close();
          }}
        >
          <div className={styles.copyModalHead}>
            <span id="copy-modal-title">복사할 내용 (직접 수정할 수 있어요)</span>
            <button
              type="button"
              className={styles.toggleBtn}
              onClick={() => dialogRef.current?.close()}
            >
              닫기
            </button>
          </div>
          <textarea
            className={styles.copyModalTextarea}
            value={text}
            aria-label="복사할 내용"
            onChange={(e) => setText(e.target.value)}
          />
          <div className={styles.copyModalActions}>
            <span className={styles.sectionNote} aria-live="polite">
              {copyFailed ? "복사하지 못했어요. 위 내용을 직접 선택해서 복사해 주세요." : ""}
            </span>
            <button type="button" className={styles.copyBtn} onClick={handleCopy}>
              {copied ? "복사됐어요 ✓" : "이 내용 복사하기"}
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
}
