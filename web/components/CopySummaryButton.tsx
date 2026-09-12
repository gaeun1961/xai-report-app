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
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildCopyText(report, domain, selectedCase));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard permission denied or unsupported — nothing to recover from
    }
  }

  return (
    <div className={styles.copyBtnRow}>
      <button type="button" className={styles.copyBtn} onClick={handleCopy}>
        {copied ? "복사됐어요 ✓" : "결과 복사하기"}
      </button>
    </div>
  );
}
