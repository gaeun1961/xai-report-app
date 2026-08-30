"use client";

import { useState } from "react";
import styles from "./report.module.css";

type Props = {
  ids: string[];
  selectedId: string;
  onSelect: (id: string) => void;
};

export default function CaseSelector({ ids, selectedId, onSelect }: Props) {
  const [q, setQ] = useState("");
  const query = q.trim();
  const shown = query ? ids.filter((id) => id.includes(query)) : ids;

  return (
    <div className={styles.selectorWrap}>
      <input
        className={styles.selectorSearch}
        type="search"
        inputMode="numeric"
        placeholder={`케이스 ID 검색 (${ids.length}개)`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className={styles.selector}>
        {shown.length === 0 ? (
          <span className={styles.selectorEmpty}>일치하는 케이스 없음</span>
        ) : (
          shown.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={`${styles.selectorBtn} ${
                id === selectedId ? styles.selectorBtnActive : ""
              }`}
            >
              #{id}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
