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
