"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DOMAINS } from "@/lib/domains";
import {
  HISTORY_CHANGED_EVENT,
  deleteUploadReport,
  formatSavedAt,
  listUploadHistory,
  type UploadHistoryEntry,
} from "@/lib/uploadHistory";
import styles from "./sidebar.module.css";

// Preset ids are namespaced ("preset:titanic") so they can share the same
// compare-selection list as upload history ids (which are plain timestamps)
// without ever colliding, and so /my/compare can tell the two apart.
const presetCompareId = (slug: string) => `preset:${slug}`;

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  // starts empty on both server and first client render (avoids a hydration
  // mismatch), then loads from localStorage right after mount — again on
  // route change (a just-saved upload), and again on HISTORY_CHANGED_EVENT
  // (a rename on the report page you're already viewing, so the route
  // doesn't change but the label in this list still needs to update).
  const [history, setHistory] = useState<UploadHistoryEntry[]>([]);
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    const refresh = () => setHistory(listUploadHistory());
    refresh();
    window.addEventListener(HISTORY_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(HISTORY_CHANGED_EVENT, refresh);
  }, [pathname]);

  function exitCompareMode() {
    setCompareMode(false);
    setSelected([]);
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return prev; // cap at 2 — ignore further picks
      return [...prev, id];
    });
  }

  function goCompare() {
    if (selected.length !== 2) return;
    const [a, b] = selected;
    router.push(`/my/compare?a=${a}&b=${b}`);
    exitCompareMode();
  }

  function handleDelete(id: string, fileName: string) {
    if (!window.confirm(`"${fileName}" 분석 기록을 삭제할까요?`)) return;
    deleteUploadReport(id);
    if (pathname === `/my/${id}`) router.push("/");
  }

  return (
    <aside className={styles.sidebar}>
      <Link href="/" className={styles.brand}>
        모델 설명 리포트
      </Link>

      <nav className={styles.nav}>
        <span className={styles.navHeading}>
          예시 데이터
          {!compareMode && (
            <button
              type="button"
              className={styles.compareToggle}
              onClick={() => setCompareMode(true)}
            >
              비교
            </button>
          )}
        </span>

        {compareMode && (
          <div className={styles.compareBar}>
            <span className={styles.compareCount}>{selected.length}/2 선택</span>
            <button
              type="button"
              className={styles.compareGoBtn}
              disabled={selected.length !== 2}
              onClick={goCompare}
            >
              비교하기
            </button>
            <button type="button" className={styles.compareCancelBtn} onClick={exitCompareMode}>
              취소
            </button>
          </div>
        )}

        {DOMAINS.map((d) => {
          const compareId = presetCompareId(d.slug);
          if (compareMode) {
            return (
              <label key={d.slug} className={styles.item}>
                <input
                  type="checkbox"
                  className={styles.compareCheckbox}
                  checked={selected.includes(compareId)}
                  onChange={() => toggleSelected(compareId)}
                  disabled={!selected.includes(compareId) && selected.length >= 2}
                />
                {d.label}
              </label>
            );
          }
          const href = `/report/${d.slug}`;
          const active = pathname === href;
          return (
            <Link
              key={d.slug}
              href={href}
              className={`${styles.item} ${active ? styles.itemActive : ""}`}
              aria-current={active ? "page" : undefined}
            >
              {d.label}
            </Link>
          );
        })}
      </nav>

      {history.length > 0 && (
        <nav className={`${styles.nav} ${styles.navDivider}`}>
          <span className={styles.navHeading}>내 분석 기록</span>

          {history.map((h) => {
            const label = `${h.fileName} · ${formatSavedAt(h.savedAt)}`;
            if (compareMode) {
              return (
                <label key={h.id} className={styles.item}>
                  <input
                    type="checkbox"
                    className={styles.compareCheckbox}
                    checked={selected.includes(h.id)}
                    onChange={() => toggleSelected(h.id)}
                    disabled={!selected.includes(h.id) && selected.length >= 2}
                  />
                  {label}
                </label>
              );
            }
            const href = `/my/${h.id}`;
            const active = pathname === href;
            return (
              <div key={h.id} className={styles.historyRow}>
                <Link
                  href={href}
                  className={`${styles.item} ${active ? styles.itemActive : ""}`}
                  aria-current={active ? "page" : undefined}
                  title={label}
                >
                  {label}
                </Link>
                <button
                  type="button"
                  className={styles.historyDeleteBtn}
                  aria-label={`${h.fileName} 분석 기록 삭제`}
                  onClick={() => handleDelete(h.id, h.fileName)}
                >
                  ×
                </button>
              </div>
            );
          })}
        </nav>
      )}
    </aside>
  );
}
