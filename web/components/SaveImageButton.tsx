"use client";

import { useState } from "react";
import { toPng } from "html-to-image";
import styles from "./report.module.css";

type Props = {
  // id of the element to capture
  targetId: string;
  fileName: string;
};

// Saves the summary tab as one PNG. Anything marked data-no-capture (the
// guide text, the buttons themselves) is left out, so the image is just the
// report content — ready to paste into a doc or portfolio.
export default function SaveImageButton({ targetId, fileName }: Props) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function save() {
    const node = document.getElementById(targetId);
    if (!node) return;
    setBusy(true);
    setFailed(false);
    try {
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        filter: (n) => !(n instanceof HTMLElement && n.dataset.noCapture !== undefined),
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${fileName}.png`;
      a.click();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.copyBtnRow} data-no-capture>
      <button type="button" className={styles.copyBtn} onClick={save} disabled={busy}>
        {busy ? "이미지 만드는 중..." : "이미지로 저장"}
      </button>
      {failed && <span className={styles.sectionNote}>이미지를 만들지 못했어요.</span>}
    </div>
  );
}
