"use client";

import { useRef, useState } from "react";
import styles from "./report.module.css";

type Props = {
  onFile: (file: File) => void;
  fileName?: string;
};

export default function FileDropzone({ onFile, fileName }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFile(file);
  };

  return (
    <div
      className={`${styles.dropzone} ${dragOver ? styles.dropzoneActive : ""}`}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      role="button"
      tabIndex={0}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
      <svg
        className={styles.dropzoneIcon}
        width="30"
        height="30"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
        <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
      </svg>

      {fileName ? (
        <p className={styles.dropzoneFile}>{fileName}</p>
      ) : (
        <>
          <p className={styles.dropzoneTitle}>
            CSV 파일을 여기로 끌어다 놓으세요
          </p>
          <p className={styles.dropzoneHint}>또는 클릭해서 파일 선택 (최대 5MB)</p>
        </>
      )}
    </div>
  );
}
